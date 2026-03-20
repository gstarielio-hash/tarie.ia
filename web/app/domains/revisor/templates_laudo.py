from __future__ import annotations

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Annotated, Any

from sqlalchemy import case, func
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.chat.request_parsing_helpers import BoolFormEstrito
from app.domains.revisor.common import _contexto_base, _obter_laudo_empresa, _validar_csrf
from app.domains.revisor.templates_laudo_diff import gerar_diff_templates
from app.shared.database import Laudo, RegistroAuditoriaEmpresa, StatusRevisao, TemplateLaudo, Usuario, obter_banco
from app.shared.security import exigir_revisor
from nucleo.template_laudos import (
    gerar_preview_pdf_template,
    mapeamento_cbmgo_padrao,
    normalizar_codigo_template,
    normalizar_mapeamento_campos,
    salvar_pdf_template_base,
)
from nucleo.template_editor_word import (
    MODO_EDITOR_LEGADO,
    MODO_EDITOR_RICO,
    documento_editor_padrao,
    estilo_editor_padrao,
    gerar_pdf_base_placeholder_editor,
    gerar_pdf_editor_rico_bytes,
    normalizar_documento_editor,
    normalizar_modo_editor,
    normalizar_estilo_editor,
    obter_asset_editor_por_id,
    salvar_asset_editor_template,
    salvar_snapshot_editor_como_pdf_base,
)

logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory="templates")
roteador_templates_laudo = APIRouter()

STATUS_TEMPLATE_RASCUNHO = "rascunho"
STATUS_TEMPLATE_EM_TESTE = "em_teste"
STATUS_TEMPLATE_ATIVO = "ativo"
STATUS_TEMPLATE_LEGADO = "legado"
STATUS_TEMPLATE_ARQUIVADO = "arquivado"

STATUS_TEMPLATE_VALIDOS = {
    STATUS_TEMPLATE_RASCUNHO,
    STATUS_TEMPLATE_EM_TESTE,
    STATUS_TEMPLATE_ATIVO,
    STATUS_TEMPLATE_LEGADO,
    STATUS_TEMPLATE_ARQUIVADO,
}

STATUS_TEMPLATE_LABELS = {
    STATUS_TEMPLATE_RASCUNHO: "Rascunho",
    STATUS_TEMPLATE_EM_TESTE: "Em teste",
    STATUS_TEMPLATE_ATIVO: "Ativo",
    STATUS_TEMPLATE_LEGADO: "Legado",
    STATUS_TEMPLATE_ARQUIVADO: "Arquivado",
}

PORTAL_AUDITORIA_TEMPLATES = "revisao_templates"

RESPOSTAS_CSRF_INVALIDO = {
    403: {"description": "Token CSRF inválido."},
}
RESPOSTAS_TEMPLATE_NAO_ENCONTRADO = {
    404: {"description": "Template não encontrado."},
}
RESPOSTAS_TEMPLATE_EDITOR_INVALIDO = {
    409: {"description": "Template não está no modo editor rico ou já existe conflito de versão."},
}
RESPOSTAS_MULTIPART_INVALIDO = {
    400: {"description": "Corpo da requisição inválido ou payload malformado."},
}
RESPOSTAS_PROCESSAMENTO_TEMPLATE = {
    500: {"description": "Falha ao processar ou renderizar o template."},
}
RESPOSTA_OK_PDF = {
    200: {
        "description": "Arquivo PDF gerado com sucesso.",
        "content": {"application/pdf": {}},
    },
}
RESPOSTA_OK_ASSET_EDITOR = {
    200: {
        "description": "Asset do template retornado com sucesso.",
        "content": {
            "image/png": {},
            "image/jpeg": {},
            "image/webp": {},
            "application/octet-stream": {},
        },
    },
}


class DadosPreviewTemplateLaudo(BaseModel):
    laudo_id: int | None = Field(default=None, ge=1)
    dados_formulario: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


class DadosCriarTemplateEditor(BaseModel):
    nome: str = Field(..., min_length=3, max_length=180)
    codigo_template: str = Field(..., min_length=2, max_length=80)
    versao: int = Field(default=1, ge=1, le=500)
    observacoes: str = Field(default="", max_length=4000)
    origem_modo: str = Field(default="a4", pattern="^(a4|pdf_base)$")
    ativo: StrictBool = False
    status_template: str = Field(default=STATUS_TEMPLATE_RASCUNHO, pattern="^(rascunho|em_teste|ativo|legado|arquivado)$")

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosSalvarTemplateEditor(BaseModel):
    nome: str | None = Field(default=None, min_length=3, max_length=180)
    observacoes: str | None = Field(default=None, max_length=4000)
    documento_editor_json: dict[str, Any]
    estilo_json: dict[str, Any] | None = None

    model_config = ConfigDict(extra="ignore")


class DadosAtualizarStatusTemplate(BaseModel):
    status_template: str = Field(..., pattern="^(rascunho|em_teste|ativo|legado|arquivado)$")

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosAtualizarStatusTemplateLote(BaseModel):
    template_ids: list[int] = Field(..., min_length=1, max_length=100)
    status_template: str = Field(..., pattern="^(rascunho|em_teste|ativo|legado|arquivado)$")

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosExcluirTemplateLote(BaseModel):
    template_ids: list[int] = Field(..., min_length=1, max_length=100)

    model_config = ConfigDict(extra="ignore")


def normalizar_status_template(valor: Any, *, fallback: str = STATUS_TEMPLATE_RASCUNHO) -> str:
    texto = str(valor or "").strip().lower()
    if texto in STATUS_TEMPLATE_VALIDOS:
        return texto
    return fallback


def _resolver_status_template_ativo(
    status_template: Any,
    *,
    ativo: bool,
) -> tuple[str, bool]:
    status_normalizado = normalizar_status_template(status_template)
    ativo_normalizado = bool(ativo) or status_normalizado == STATUS_TEMPLATE_ATIVO
    if ativo_normalizado:
        return STATUS_TEMPLATE_ATIVO, True
    return status_normalizado, False


def _rebaixar_templates_ativos_mesmo_codigo(
    banco: Session,
    *,
    empresa_id: int,
    codigo_template: str,
    template_id_excluir: int | None = None,
) -> None:
    ativos_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == empresa_id,
            TemplateLaudo.codigo_template == codigo_template,
            TemplateLaudo.ativo.is_(True),
        )
        .all()
    )
    for item in ativos_mesmo_codigo:
        if template_id_excluir is not None and int(item.id) == int(template_id_excluir):
            continue
        item.ativo = False
        if normalizar_status_template(getattr(item, "status_template", None)) == STATUS_TEMPLATE_ATIVO:
            item.status_template = STATUS_TEMPLATE_LEGADO


def _desmarcar_bases_recomendadas_mesmo_codigo(
    banco: Session,
    *,
    empresa_id: int,
    codigo_template: str,
    template_id_excluir: int | None = None,
) -> list[TemplateLaudo]:
    bases_fixas_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == empresa_id,
            TemplateLaudo.codigo_template == codigo_template,
            TemplateLaudo.base_recomendada_fixa.is_(True),
        )
        .all()
    )
    bases_desmarcadas: list[TemplateLaudo] = []
    for item in bases_fixas_mesmo_codigo:
        if template_id_excluir is not None and int(item.id) == int(template_id_excluir):
            continue
        item.base_recomendada_fixa = False
        bases_desmarcadas.append(item)
    return bases_desmarcadas


def _coletar_metricas_uso_templates(
    banco: Session,
    *,
    empresa_id: int,
) -> dict[str, dict[str, Any]]:
    registros = (
        banco.query(
            Laudo.tipo_template,
            func.count(Laudo.id),
            func.sum(case((Laudo.status_revisao == StatusRevisao.RASCUNHO.value, 1), else_=0)),
            func.sum(case((Laudo.status_revisao == StatusRevisao.AGUARDANDO.value, 1), else_=0)),
            func.max(Laudo.atualizado_em),
        )
        .filter(Laudo.empresa_id == empresa_id)
        .group_by(Laudo.tipo_template)
        .all()
    )
    metricas: dict[str, dict[str, Any]] = {}
    for codigo_template, total, em_campo, aguardando, ultima_utilizacao_em in registros:
        codigo = str(codigo_template or "").strip()
        if not codigo:
            continue
        metricas[codigo] = {
            "uso_total": int(total or 0),
            "uso_em_campo": int(em_campo or 0),
            "uso_aguardando": int(aguardando or 0),
            "ultima_utilizacao_em": ultima_utilizacao_em.isoformat() if ultima_utilizacao_em else None,
        }
    return metricas


def _prioridade_base_recomendada(payload: dict[str, Any]) -> tuple[int, int, int, int]:
    status_template = normalizar_status_template(
        payload.get("status_template"),
        fallback=STATUS_TEMPLATE_ATIVO if bool(payload.get("ativo")) else STATUS_TEMPLATE_RASCUNHO,
    )
    prioridade_status = {
        STATUS_TEMPLATE_ATIVO: 50,
        STATUS_TEMPLATE_EM_TESTE: 40,
        STATUS_TEMPLATE_RASCUNHO: 30,
        STATUS_TEMPLATE_LEGADO: 20,
        STATUS_TEMPLATE_ARQUIVADO: 10,
    }.get(status_template, 0)
    bonus_modo = 1 if bool(payload.get("is_editor_rico")) else 0
    return (
        prioridade_status,
        int(payload.get("versao") or 0),
        bonus_modo,
        int(payload.get("id") or 0),
    )


def _motivo_base_recomendada(payload: dict[str, Any]) -> str:
    if bool(payload.get("base_recomendada_fixa")):
        return "Base promovida manualmente pela mesa"
    status_template = normalizar_status_template(
        payload.get("status_template"),
        fallback=STATUS_TEMPLATE_ATIVO if bool(payload.get("ativo")) else STATUS_TEMPLATE_RASCUNHO,
    )
    if status_template == STATUS_TEMPLATE_ATIVO:
        return "Versão ativa em operação"
    if status_template == STATUS_TEMPLATE_EM_TESTE:
        return "Versão em teste mais madura"
    if status_template == STATUS_TEMPLATE_RASCUNHO:
        return "Rascunho mais recente do grupo"
    if status_template == STATUS_TEMPLATE_LEGADO:
        return "Legado mais recente para referência"
    return "Última versão arquivada disponível"


def _selecionar_base_recomendada_grupo(grupo_ordenado: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    bases_fixas = [item for item in grupo_ordenado if bool(item.get("base_recomendada_fixa"))]
    if bases_fixas:
        recomendada_manual = sorted(
            bases_fixas,
            key=lambda item: (
                int(item.get("versao") or 0),
                int(item.get("id") or 0),
            ),
            reverse=True,
        )[0]
        return recomendada_manual, "manual"
    return max(grupo_ordenado, key=_prioridade_base_recomendada), "automatica"


def _obter_template_laudo_empresa(
    banco: Session,
    *,
    template_id: int,
    empresa_id: int,
) -> TemplateLaudo:
    template = banco.get(TemplateLaudo, template_id)
    if not template or template.empresa_id != empresa_id:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    return template


def _normalizar_ids_lote_template(ids_brutos: list[int] | tuple[int, ...] | None) -> list[int]:
    ids_normalizados: list[int] = []
    vistos: set[int] = set()
    for valor in ids_brutos or []:
        try:
            template_id = int(valor)
        except (TypeError, ValueError):
            continue
        if template_id < 1 or template_id in vistos:
            continue
        vistos.add(template_id)
        ids_normalizados.append(template_id)
    if not ids_normalizados:
        raise HTTPException(status_code=400, detail="Selecione ao menos um template válido.")
    return ids_normalizados


def _obter_templates_lote_empresa(
    banco: Session,
    *,
    template_ids: list[int],
    empresa_id: int,
) -> list[TemplateLaudo]:
    ids_normalizados = _normalizar_ids_lote_template(template_ids)
    templates_por_id = {
        int(item.id): item
        for item in (
            banco.query(TemplateLaudo)
            .filter(
                TemplateLaudo.empresa_id == empresa_id,
                TemplateLaudo.id.in_(ids_normalizados),
            )
            .all()
        )
    }
    if len(templates_por_id) != len(ids_normalizados):
        raise HTTPException(status_code=404, detail="Um ou mais templates não foram encontrados.")
    return [templates_por_id[item_id] for item_id in ids_normalizados]


def _remover_assets_fisicos_template(template: TemplateLaudo) -> None:
    assets = template.assets_json if isinstance(template.assets_json, list) else []
    for item in assets:
        if not isinstance(item, dict):
            continue
        caminho = Path(str(item.get("path") or "")).expanduser().resolve()
        try:
            if caminho.is_file():
                caminho.unlink()
        except Exception:
            logger.warning(
                "Falha ao remover asset físico do template | template_id=%s path=%s",
                template.id,
                str(caminho),
                exc_info=True,
            )


def _serializar_template_laudo(item: TemplateLaudo, incluir_mapeamento: bool = False) -> dict[str, Any]:
    modo_editor = normalizar_modo_editor(getattr(item, "modo_editor", None))
    assets = item.assets_json if isinstance(getattr(item, "assets_json", None), list) else []
    status_template = normalizar_status_template(
        getattr(item, "status_template", None),
        fallback=(
            STATUS_TEMPLATE_ATIVO
            if bool(getattr(item, "ativo", False))
            else STATUS_TEMPLATE_RASCUNHO
        ),
    )
    payload: dict[str, Any] = {
        "id": item.id,
        "nome": item.nome,
        "codigo_template": item.codigo_template,
        "versao": item.versao,
        "ativo": bool(item.ativo),
        "base_recomendada_fixa": bool(getattr(item, "base_recomendada_fixa", False)),
        "status_template": status_template,
        "status_template_label": STATUS_TEMPLATE_LABELS.get(status_template, "Rascunho"),
        "modo_editor": modo_editor,
        "is_editor_rico": modo_editor == MODO_EDITOR_RICO,
        "possui_documento_editor": bool(getattr(item, "documento_editor_json", None)),
        "total_assets": len(assets),
        "observacoes": item.observacoes or "",
        "criado_em": item.criado_em.isoformat() if item.criado_em else None,
        "atualizado_em": item.atualizado_em.isoformat() if item.atualizado_em else None,
        "criado_por_id": item.criado_por_id,
    }
    if incluir_mapeamento:
        payload["mapeamento_campos_json"] = item.mapeamento_campos_json or {}
        payload["documento_editor_json"] = item.documento_editor_json or {}
        payload["estilo_json"] = item.estilo_json or {}
        payload["assets_json"] = assets
    return payload


def _label_status_template(valor: Any) -> str:
    status_normalizado = normalizar_status_template(valor)
    return STATUS_TEMPLATE_LABELS.get(status_normalizado, "Rascunho")


def _resumir_texto_auditoria_templates(texto: Any, *, limite: int = 220) -> str:
    resumo = " ".join(str(texto or "").split()).strip()
    if not resumo:
        return ""
    if len(resumo) <= limite:
        return resumo
    return resumo[: max(0, limite - 1)].rstrip() + "…"


def _payload_template_auditoria(item: TemplateLaudo) -> dict[str, Any]:
    return {
        "template_id": int(item.id) if getattr(item, "id", None) else None,
        "nome": str(item.nome or ""),
        "codigo_template": str(item.codigo_template or ""),
        "versao": int(item.versao or 1),
        "status_template": normalizar_status_template(getattr(item, "status_template", None)),
        "status_template_label": _label_status_template(getattr(item, "status_template", None)),
        "ativo": bool(getattr(item, "ativo", False)),
        "base_recomendada_fixa": bool(getattr(item, "base_recomendada_fixa", False)),
        "modo_editor": normalizar_modo_editor(getattr(item, "modo_editor", None)),
    }


def _resumir_templates_auditoria(templates_lote: list[TemplateLaudo], *, limite: int = 4) -> str:
    itens: list[str] = []
    for item in templates_lote[:limite]:
        codigo = str(item.codigo_template or "").strip() or "template"
        itens.append(f"{codigo} v{int(item.versao or 1)}")
    if not itens:
        return "nenhum template"
    if len(templates_lote) > limite:
        itens.append(f"+{len(templates_lote) - limite}")
    return ", ".join(itens)


def _registrar_auditoria_templates(
    banco: Session,
    *,
    usuario: Usuario,
    acao: str,
    resumo: str,
    detalhe: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    registro = RegistroAuditoriaEmpresa(
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id) if getattr(usuario, "id", None) else None,
        portal=PORTAL_AUDITORIA_TEMPLATES,
        acao=str(acao or "acao").strip()[:80],
        resumo=_resumir_texto_auditoria_templates(resumo, limite=220) or "Ação registrada na biblioteca de templates",
        detalhe=_resumir_texto_auditoria_templates(detalhe, limite=1200) or None,
        payload_json=payload or None,
    )
    banco.add(registro)


def _listar_auditoria_templates(
    banco: Session,
    *,
    empresa_id: int,
    limite: int = 12,
) -> list[RegistroAuditoriaEmpresa]:
    return (
        banco.query(RegistroAuditoriaEmpresa)
        .filter(
            RegistroAuditoriaEmpresa.empresa_id == int(empresa_id),
            RegistroAuditoriaEmpresa.portal == PORTAL_AUDITORIA_TEMPLATES,
        )
        .order_by(RegistroAuditoriaEmpresa.criado_em.desc(), RegistroAuditoriaEmpresa.id.desc())
        .limit(max(1, min(int(limite or 12), 50)))
        .all()
    )


def _serializar_registro_auditoria_templates(registro: RegistroAuditoriaEmpresa) -> dict[str, Any]:
    criado_em = getattr(registro, "criado_em", None)
    ator = getattr(registro, "ator_usuario", None)
    return {
        "id": int(registro.id),
        "acao": str(registro.acao or ""),
        "portal": str(registro.portal or PORTAL_AUDITORIA_TEMPLATES),
        "resumo": str(registro.resumo or ""),
        "detalhe": str(registro.detalhe or ""),
        "payload": registro.payload_json or {},
        "criado_em": criado_em.isoformat() if criado_em else "",
        "criado_em_label": (criado_em.astimezone().strftime("%d/%m/%Y %H:%M") if criado_em else "Agora"),
        "ator_usuario_id": int(registro.ator_usuario_id) if registro.ator_usuario_id else None,
        "ator_nome": getattr(ator, "nome", None) or getattr(ator, "nome_completo", None) or "Sistema",
    }


def _enriquecer_versionamento_templates(itens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grupos: dict[str, list[dict[str, Any]]] = {}
    for item in itens:
        codigo = str(item.get("codigo_template") or "").strip()
        if not codigo:
            continue
        grupos.setdefault(codigo, []).append(item)

    for codigo, grupo in grupos.items():
        grupo_ordenado = sorted(
            grupo,
            key=lambda item: (
                int(item.get("versao") or 0),
                int(item.get("id") or 0),
            ),
            reverse=True,
        )
        recomendado, origem_recomendacao = _selecionar_base_recomendada_grupo(grupo_ordenado)
        ativo = next((item for item in grupo_ordenado if bool(item.get("ativo"))), None)
        versao_mais_recente = grupo_ordenado[0] if grupo_ordenado else None
        total_word = sum(1 for item in grupo_ordenado if bool(item.get("is_editor_rico")))
        total_pdf = max(0, len(grupo_ordenado) - total_word)
        versoes_disponiveis = [int(item.get("versao") or 0) for item in grupo_ordenado]

        for ordem, item in enumerate(grupo_ordenado, start=1):
            item["grupo_codigo_template"] = codigo
            item["grupo_total_versoes"] = len(grupo_ordenado)
            item["grupo_total_word"] = total_word
            item["grupo_total_pdf"] = total_pdf
            item["grupo_ordem_versao"] = ordem
            item["grupo_versoes_disponiveis"] = versoes_disponiveis
            item["grupo_versao_mais_recente"] = int(versao_mais_recente.get("versao") or 0) if versao_mais_recente else int(item.get("versao") or 0)
            item["grupo_template_ativo_id"] = int(ativo.get("id") or 0) if ativo else None
            item["grupo_template_ativo_versao"] = int(ativo.get("versao") or 0) if ativo else None
            item["grupo_base_recomendada_id"] = int(recomendado.get("id") or 0) if recomendado else int(item.get("id") or 0)
            item["grupo_base_recomendada_versao"] = int(recomendado.get("versao") or 0) if recomendado else int(item.get("versao") or 0)
            item["grupo_base_recomendada_origem"] = origem_recomendacao
            item["grupo_base_recomendada_fixa"] = bool(recomendado.get("base_recomendada_fixa"))
            item["is_base_recomendada"] = int(item.get("id") or 0) == int(recomendado.get("id") or 0)
            item["base_recomendada_origem"] = origem_recomendacao if item["is_base_recomendada"] else None
            item["base_recomendada_motivo"] = _motivo_base_recomendada(recomendado if item["is_base_recomendada"] else recomendado)
    return itens


def _obter_dados_formulario_preview(
    *,
    banco: Session,
    usuario: Usuario,
    dados: DadosPreviewTemplateLaudo,
) -> dict[str, Any]:
    dados_formulario: dict[str, Any] = {}
    if dados.laudo_id:
        laudo = _obter_laudo_empresa(banco, dados.laudo_id, usuario.empresa_id)
        dados_formulario = laudo.dados_formulario or {}
    elif isinstance(dados.dados_formulario, dict):
        dados_formulario = dados.dados_formulario
    if not dados_formulario and env_str("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1":
        return {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Seed Schemathesis",
                "local_inspecao": "Planta Seed",
            },
            "resumo_executivo": "Preview reduzido para contrato automatizado.",
        }
    return dados_formulario


def _contexto_templates_padrao(request: Request, usuario: Usuario) -> dict[str, Any]:
    contexto = _contexto_base(request)
    contexto.update(
        {
            "usuario": usuario,
            "mapeamento_cbmgo_padrao_json": json.dumps(
                mapeamento_cbmgo_padrao(),
                ensure_ascii=False,
                indent=2,
            ),
            "dados_preview_exemplo_json": json.dumps(
                {
                    "informacoes_gerais": {
                        "responsavel_pela_inspecao": "Nome do Inspetor",
                        "data_inspecao": datetime.now().strftime("%d/%m/%Y"),
                        "local_inspecao": "Unidade Industrial",
                    },
                    "resumo_executivo": "Resumo técnico preliminar da inspeção.",
                    "trrf_observacoes": "Observações TRRF para validação da mesa.",
                },
                ensure_ascii=False,
                indent=2,
            ),
        }
    )
    return contexto


def _marcar_template_status(
    banco: Session,
    *,
    template: TemplateLaudo,
    status_template: str,
) -> None:
    status_normalizado = normalizar_status_template(status_template)
    if status_normalizado == STATUS_TEMPLATE_ATIVO:
        _rebaixar_templates_ativos_mesmo_codigo(
            banco,
            empresa_id=int(template.empresa_id),
            codigo_template=str(template.codigo_template),
            template_id_excluir=int(template.id) if template.id else None,
        )
        template.ativo = True
        template.status_template = STATUS_TEMPLATE_ATIVO
        return

    template.ativo = False
    template.status_template = status_normalizado


@roteador_templates_laudo.get("/templates-laudo", response_class=HTMLResponse)
async def tela_templates_laudo(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
):
    contexto = _contexto_templates_padrao(request, usuario)
    return templates.TemplateResponse(request, "revisor_templates_biblioteca.html", contexto)


@roteador_templates_laudo.get("/templates-laudo/editor", response_class=HTMLResponse)
async def tela_editor_templates_laudo(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
):
    contexto = _contexto_templates_padrao(request, usuario)
    return templates.TemplateResponse(request, "revisor_templates_editor_word.html", contexto)


@roteador_templates_laudo.get("/api/templates-laudo")
async def listar_templates_laudo(
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    templates_db = (
        banco.query(TemplateLaudo)
        .filter(TemplateLaudo.empresa_id == usuario.empresa_id)
        .order_by(
            TemplateLaudo.codigo_template.asc(),
            TemplateLaudo.versao.desc(),
            TemplateLaudo.id.desc(),
        )
        .all()
    )
    metricas_uso = _coletar_metricas_uso_templates(
        banco,
        empresa_id=int(usuario.empresa_id),
    )
    itens = []
    for item in templates_db:
        payload = _serializar_template_laudo(item)
        payload.update(metricas_uso.get(str(item.codigo_template), {
            "uso_total": 0,
            "uso_em_campo": 0,
            "uso_aguardando": 0,
            "ultima_utilizacao_em": None,
        }))
        itens.append(payload)

    _enriquecer_versionamento_templates(itens)
    return {"itens": itens}


@roteador_templates_laudo.get("/api/templates-laudo/auditoria")
async def listar_auditoria_templates_laudo(
    limite: int = Query(default=12, ge=1, le=50),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    itens = [
        _serializar_registro_auditoria_templates(item)
        for item in _listar_auditoria_templates(
            banco,
            empresa_id=int(usuario.empresa_id),
            limite=limite,
        )
    ]
    return {"itens": itens}


@roteador_templates_laudo.post(
    "/api/templates-laudo/editor",
    status_code=201,
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        409: {"description": "Já existe template com este código e versão."},
    },
)
async def criar_template_editor_laudo(
    dados: DadosCriarTemplateEditor,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    codigo_limpo = normalizar_codigo_template(dados.codigo_template)
    nome_limpo = str(dados.nome or "").strip()[:180]
    observacoes_limpas = str(dados.observacoes or "").strip()

    if not nome_limpo:
        raise HTTPException(status_code=400, detail="Nome do template é obrigatório.")

    duplicado = (
        banco.query(TemplateLaudo.id)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == codigo_limpo,
            TemplateLaudo.versao == int(dados.versao),
        )
        .first()
    )
    if duplicado:
        raise HTTPException(status_code=409, detail="Já existe template com este código e versão.")

    status_template, ativo_template = _resolver_status_template_ativo(
        dados.status_template,
        ativo=bool(dados.ativo),
    )
    if ativo_template:
        _rebaixar_templates_ativos_mesmo_codigo(
            banco,
            empresa_id=int(usuario.empresa_id),
            codigo_template=codigo_limpo,
        )

    estilo = estilo_editor_padrao()
    estilo["origem_modo"] = str(dados.origem_modo or "a4")

    caminho_placeholder = gerar_pdf_base_placeholder_editor(
        empresa_id=usuario.empresa_id,
        codigo_template=codigo_limpo,
        versao=int(dados.versao),
        titulo=nome_limpo,
    )

    template = TemplateLaudo(
        empresa_id=usuario.empresa_id,
        criado_por_id=usuario.id,
        nome=nome_limpo,
        codigo_template=codigo_limpo,
        versao=int(dados.versao),
        ativo=ativo_template,
        modo_editor=MODO_EDITOR_RICO,
        status_template=status_template,
        arquivo_pdf_base=caminho_placeholder,
        mapeamento_campos_json={},
        documento_editor_json=documento_editor_padrao(),
        assets_json=[],
        estilo_json=estilo,
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.flush()
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_criado_word",
        resumo=f"Template Word {template.codigo_template} v{template.versao} criado na biblioteca.",
        detalhe=f"{template.nome} entrou como {_label_status_template(template.status_template).lower()} para edição no workspace Word.",
        payload={
            **_payload_template_auditoria(template),
            "origem": "editor_word",
        },
    )
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo.get(
    "/api/templates-laudo/editor/{template_id:int}",
    responses={
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_TEMPLATE_EDITOR_INVALIDO,
    },
)
async def detalhar_template_editor_laudo(
    template_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    if normalizar_modo_editor(getattr(template, "modo_editor", None)) != MODO_EDITOR_RICO:
        raise HTTPException(status_code=409, detail="Template não está no modo editor rico.")

    return _serializar_template_laudo(template, incluir_mapeamento=True)


@roteador_templates_laudo.put(
    "/api/templates-laudo/editor/{template_id:int}",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_TEMPLATE_EDITOR_INVALIDO,
        **RESPOSTAS_MULTIPART_INVALIDO,
    },
)
async def salvar_template_editor_laudo(
    template_id: int,
    dados: DadosSalvarTemplateEditor,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    if normalizar_modo_editor(getattr(template, "modo_editor", None)) != MODO_EDITOR_RICO:
        raise HTTPException(status_code=409, detail="Template não está no modo editor rico.")

    try:
        documento_normalizado = normalizar_documento_editor(dados.documento_editor_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    estilo_normalizado = normalizar_estilo_editor(dados.estilo_json or template.estilo_json)

    if dados.nome is not None:
        nome_limpo = str(dados.nome or "").strip()[:180]
        if not nome_limpo:
            raise HTTPException(status_code=400, detail="Nome do template não pode ficar vazio.")
        template.nome = nome_limpo

    if dados.observacoes is not None:
        template.observacoes = str(dados.observacoes or "").strip()[:4000] or None

    template.documento_editor_json = documento_normalizado
    template.estilo_json = estilo_normalizado
    template.modo_editor = MODO_EDITOR_RICO
    banco.commit()
    banco.refresh(template)
    return _serializar_template_laudo(template, incluir_mapeamento=True)


@roteador_templates_laudo.post(
    "/api/templates-laudo/editor/{template_id:int}/assets",
    status_code=201,
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_TEMPLATE_EDITOR_INVALIDO,
        **RESPOSTAS_MULTIPART_INVALIDO,
    },
)
async def upload_asset_template_editor_laudo(
    template_id: int,
    request: Request,
    arquivo: UploadFile = File(...),
    csrf_token: str = Form(default=""),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    if normalizar_modo_editor(getattr(template, "modo_editor", None)) != MODO_EDITOR_RICO:
        raise HTTPException(status_code=409, detail="Template não está no modo editor rico.")

    conteudo = await arquivo.read()
    try:
        asset = salvar_asset_editor_template(
            empresa_id=usuario.empresa_id,
            template_id=template.id,
            filename=str(arquivo.filename or "imagem"),
            mime_type=str(arquivo.content_type or ""),
            conteudo=conteudo,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assets_existentes = template.assets_json if isinstance(template.assets_json, list) else []
    template.assets_json = [*assets_existentes, asset]
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content={
            "ok": True,
            "asset": {
                **asset,
                "preview_url": f"/revisao/api/templates-laudo/editor/{template.id}/assets/{asset['id']}",
                "src": f"asset://{asset['id']}",
            },
            "template_id": template.id,
        },
    )


@roteador_templates_laudo.get(
    "/api/templates-laudo/editor/{template_id:int}/assets/{asset_id}",
    responses={
        **RESPOSTA_OK_ASSET_EDITOR,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_TEMPLATE_EDITOR_INVALIDO,
    },
)
async def baixar_asset_template_editor_laudo(
    template_id: int,
    asset_id: str,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    if normalizar_modo_editor(getattr(template, "modo_editor", None)) != MODO_EDITOR_RICO:
        raise HTTPException(status_code=409, detail="Template não está no modo editor rico.")

    asset = obter_asset_editor_por_id(template.assets_json or [], asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset não encontrado.")

    caminho_asset = str(asset.get("path") or "").strip()
    if not caminho_asset:
        raise HTTPException(status_code=404, detail="Asset inválido.")

    return FileResponse(
        path=caminho_asset,
        filename=str(asset.get("filename") or f"asset_{asset_id}"),
        media_type=str(asset.get("mime_type") or "application/octet-stream"),
    )


@roteador_templates_laudo.post(
    "/api/templates-laudo/editor/{template_id:int}/preview",
    responses={
        **RESPOSTA_OK_PDF,
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_TEMPLATE_EDITOR_INVALIDO,
        **RESPOSTAS_PROCESSAMENTO_TEMPLATE,
    },
)
async def preview_template_editor_laudo(
    template_id: int,
    dados: DadosPreviewTemplateLaudo,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    if normalizar_modo_editor(getattr(template, "modo_editor", None)) != MODO_EDITOR_RICO:
        raise HTTPException(status_code=409, detail="Template não está no modo editor rico.")

    dados_formulario = _obter_dados_formulario_preview(
        banco=banco,
        usuario=usuario,
        dados=dados,
    )

    try:
        if env_str("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1":
            pdf_preview = Path(template.arquivo_pdf_base).read_bytes()
        else:
            pdf_preview = await gerar_pdf_editor_rico_bytes(
                documento_editor_json=template.documento_editor_json or documento_editor_padrao(),
                estilo_json=template.estilo_json or estilo_editor_padrao(),
                assets_json=template.assets_json or [],
                dados_formulario=dados_formulario or {},
            )
    except Exception:
        logger.error(
            "Falha no preview do editor rico | template_id=%s empresa_id=%s",
            template.id,
            usuario.empresa_id,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Falha ao gerar preview do editor rico.")

    nome_arquivo = f"preview_editor_{template.codigo_template}_v{template.versao}.pdf"
    return Response(
        content=pdf_preview,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'},
    )


@roteador_templates_laudo.post(
    "/api/templates-laudo/editor/{template_id:int}/publicar",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_PROCESSAMENTO_TEMPLATE,
    },
)
async def publicar_template_editor_laudo(
    template_id: int,
    request: Request,
    csrf_token: str = Form(default=""),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    return await publicar_template_laudo(
        template_id=template_id,
        request=request,
        csrf_token=csrf_token,
        usuario=usuario,
        banco=banco,
    )


@roteador_templates_laudo.get(
    "/api/templates-laudo/{template_id:int}",
    responses=RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
)
async def detalhar_template_laudo(
    template_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    return _serializar_template_laudo(template, incluir_mapeamento=True)


@roteador_templates_laudo.delete(
    "/api/templates-laudo/{template_id:int}",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def excluir_template_laudo(
    template_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    payload_template = _payload_template_auditoria(template)
    _remover_assets_fisicos_template(template)
    banco.delete(template)
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_excluido",
        resumo=f"Template {template.codigo_template} v{template.versao} excluído da biblioteca.",
        detalhe=f"{template.nome} foi removido manualmente da biblioteca de templates.",
        payload=payload_template,
    )
    banco.commit()
    return {"ok": True, "template_id": template_id, "status": "excluido"}


@roteador_templates_laudo.get(
    "/api/templates-laudo/{template_id:int}/arquivo-base",
    responses={
        **RESPOSTA_OK_PDF,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def baixar_pdf_base_template_laudo(
    template_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    return FileResponse(
        path=template.arquivo_pdf_base,
        filename=f"template_{template.codigo_template}_v{template.versao}.pdf",
        media_type="application/pdf",
    )


@roteador_templates_laudo.post(
    "/api/templates-laudo/upload",
    status_code=201,
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_MULTIPART_INVALIDO,
        409: {"description": "Já existe template com este código e versão."},
    },
)
async def upload_template_laudo(
    request: Request,
    nome: str = Form(...),
    codigo_template: str = Form(...),
    versao: int = Form(default=1),
    observacoes: str = Form(default=""),
    mapeamento_campos_json: str = Form(default=""),
    ativo: Annotated[BoolFormEstrito, Form()] = False,
    status_template: str = Form(default=STATUS_TEMPLATE_RASCUNHO),
    csrf_token: str = Form(default=""),
    arquivo_base: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    nome_limpo = str(nome or "").strip()[:180]
    codigo_bruto = str(codigo_template or "").strip()
    codigo_limpo = normalizar_codigo_template(codigo_template)
    observacoes_limpas = str(observacoes or "").strip()

    if not nome_limpo:
        raise HTTPException(status_code=400, detail="Nome do template é obrigatório.")
    if not codigo_bruto:
        raise HTTPException(status_code=400, detail="Código do template é obrigatório.")
    if versao < 1:
        raise HTTPException(status_code=400, detail="Versão deve ser maior ou igual a 1.")

    nome_arquivo = str(arquivo_base.filename or "").strip().lower()
    if not nome_arquivo.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF.")

    mapeamento_payload: dict[str, Any] = {}
    if mapeamento_campos_json.strip():
        try:
            bruto = json.loads(mapeamento_campos_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="mapeamento_campos_json inválido.") from exc
        if not isinstance(bruto, dict):
            raise HTTPException(status_code=400, detail="mapeamento_campos_json deve ser um objeto JSON.")
        mapeamento_payload = normalizar_mapeamento_campos(bruto)
    elif codigo_limpo in {"cbmgo", "cbmgo_cmar", "checklist_cbmgo"}:
        mapeamento_payload = mapeamento_cbmgo_padrao()

    duplicado = (
        banco.query(TemplateLaudo.id)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == codigo_limpo,
            TemplateLaudo.versao == versao,
        )
        .first()
    )
    if duplicado:
        raise HTTPException(status_code=409, detail="Já existe template com este código e versão.")

    arquivo_bytes = await arquivo_base.read()
    try:
        caminho_pdf_base = salvar_pdf_template_base(
            arquivo_bytes,
            empresa_id=usuario.empresa_id,
            codigo_template=codigo_limpo,
            versao=versao,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    status_template_limpo, ativo_limpo = _resolver_status_template_ativo(
        status_template,
        ativo=bool(ativo),
    )
    if ativo_limpo:
        _rebaixar_templates_ativos_mesmo_codigo(
            banco,
            empresa_id=int(usuario.empresa_id),
            codigo_template=codigo_limpo,
        )

    template = TemplateLaudo(
        empresa_id=usuario.empresa_id,
        criado_por_id=usuario.id,
        nome=nome_limpo,
        codigo_template=codigo_limpo,
        versao=versao,
        ativo=ativo_limpo,
        modo_editor=MODO_EDITOR_LEGADO,
        status_template=status_template_limpo,
        arquivo_pdf_base=caminho_pdf_base,
        mapeamento_campos_json=mapeamento_payload,
        documento_editor_json=None,
        assets_json=[],
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.flush()
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_importado_pdf",
        resumo=f"Template PDF {template.codigo_template} v{template.versao} importado para a biblioteca.",
        detalhe=f"{template.nome} entrou como {_label_status_template(template.status_template).lower()} a partir de um PDF base.",
        payload={
            **_payload_template_auditoria(template),
            "origem": "upload_pdf_base",
        },
    )
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo.post(
    "/api/templates-laudo/{template_id:int}/publicar",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_PROCESSAMENTO_TEMPLATE,
    },
)
async def publicar_template_laudo(
    template_id: int,
    request: Request,
    csrf_token: str = Form(default=""),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    modo_editor = normalizar_modo_editor(getattr(template, "modo_editor", None))
    if modo_editor == MODO_EDITOR_RICO:
        try:
            pdf_snapshot = await gerar_pdf_editor_rico_bytes(
                documento_editor_json=template.documento_editor_json or documento_editor_padrao(),
                estilo_json=template.estilo_json or estilo_editor_padrao(),
                assets_json=template.assets_json or [],
                dados_formulario={},
            )
            caminho_snapshot = salvar_snapshot_editor_como_pdf_base(
                pdf_bytes=pdf_snapshot,
                empresa_id=usuario.empresa_id,
                codigo_template=str(template.codigo_template or ""),
                versao=int(template.versao or 1),
            )
            template.arquivo_pdf_base = caminho_snapshot
        except Exception as exc:
            logger.error(
                "Falha ao publicar snapshot do editor rico | template_id=%s empresa_id=%s",
                template.id,
                usuario.empresa_id,
                exc_info=True,
            )
            raise HTTPException(
                status_code=500,
                detail=f"Falha ao gerar snapshot PDF do template: {exc}",
            ) from exc

    ativos_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == template.codigo_template,
            TemplateLaudo.ativo.is_(True),
            TemplateLaudo.id != template.id,
        )
        .all()
    )
    ativos_rebaixados_payload = [_payload_template_auditoria(item) for item in ativos_mesmo_codigo]
    for item in ativos_mesmo_codigo:
        item.ativo = False
        if normalizar_status_template(getattr(item, "status_template", None)) == STATUS_TEMPLATE_ATIVO:
            item.status_template = STATUS_TEMPLATE_LEGADO

    template.ativo = True
    template.status_template = STATUS_TEMPLATE_ATIVO
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_publicado",
        resumo=f"Template {template.codigo_template} v{template.versao} publicado como versão ativa.",
        detalhe=(
            f"{template.nome} virou a versão operacional da biblioteca."
            + (f" Versões anteriores rebaixadas: {len(ativos_rebaixados_payload)}." if ativos_rebaixados_payload else "")
        ),
        payload={
            **_payload_template_auditoria(template),
            "ativos_rebaixados": ativos_rebaixados_payload,
            "total_ativos_rebaixados": len(ativos_rebaixados_payload),
        },
    )
    banco.commit()

    return {"ok": True, "template_id": template.id, "status": "publicado"}


@roteador_templates_laudo.post(
    "/api/templates-laudo/{template_id:int}/base-recomendada",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def promover_template_como_base_recomendada(
    template_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    templates_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == template.codigo_template,
        )
        .order_by(TemplateLaudo.versao.desc(), TemplateLaudo.id.desc())
        .all()
    )
    payloads_antes = [_serializar_template_laudo(item) for item in templates_mesmo_codigo]
    payloads_auditoria_antes = [_payload_template_auditoria(item) for item in templates_mesmo_codigo]
    base_antes, origem_antes = _selecionar_base_recomendada_grupo(payloads_antes)
    base_antes_payload = next(
        (item for item in payloads_auditoria_antes if int(item["template_id"] or 0) == int(base_antes.get("id") or 0)),
        None,
    )
    bases_fixas_rebaixadas_payload = [
        _payload_template_auditoria(item)
        for item in templates_mesmo_codigo
        if bool(getattr(item, "base_recomendada_fixa", False)) and int(item.id) != int(template.id)
    ]

    bases_fixas_rebaixadas = _desmarcar_bases_recomendadas_mesmo_codigo(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
        template_id_excluir=int(template.id),
    )
    ja_era_base_fixa = bool(getattr(template, "base_recomendada_fixa", False))
    template.base_recomendada_fixa = True

    if ja_era_base_fixa and not bases_fixas_rebaixadas and int(base_antes.get("id") or 0) == int(template.id):
        banco.commit()
        banco.refresh(template)
        return {
            "ok": True,
            "template_id": int(template.id),
            "codigo_template": str(template.codigo_template or ""),
            "status": "inalterado",
            "base_recomendada_fixa": True,
            "base_recomendada_origem": "manual",
        }

    payload_template = _payload_template_auditoria(template)
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_base_recomendada_promovida",
        resumo=f"Template {template.codigo_template} v{template.versao} promovido como base recomendada.",
        detalhe=(
            f"{template.nome} foi fixado manualmente como referência do código {template.codigo_template}."
            + (
                f" Base anterior: {base_antes.get('codigo_template', template.codigo_template)} v{int(base_antes.get('versao') or 1)} ({origem_antes})."
                if base_antes
                else ""
            )
            + (f" Bases fixas anteriores removidas: {len(bases_fixas_rebaixadas)}." if bases_fixas_rebaixadas else "")
        ),
        payload={
            "template_recomendado": payload_template,
            "base_anterior": base_antes_payload,
            "base_anterior_origem": origem_antes,
            "bases_fixas_rebaixadas": bases_fixas_rebaixadas_payload,
            "total_bases_fixas_rebaixadas": len(bases_fixas_rebaixadas),
        },
    )
    banco.commit()
    banco.refresh(template)
    return {
        "ok": True,
        "template_id": int(template.id),
        "codigo_template": str(template.codigo_template or ""),
        "status": "promovido",
        "base_recomendada_fixa": True,
        "base_recomendada_origem": "manual",
    }


@roteador_templates_laudo.delete(
    "/api/templates-laudo/{template_id:int}/base-recomendada",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def restaurar_base_recomendada_automatica(
    template_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    templates_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == template.codigo_template,
        )
        .order_by(TemplateLaudo.versao.desc(), TemplateLaudo.id.desc())
        .all()
    )
    payloads_antes = [_serializar_template_laudo(item) for item in templates_mesmo_codigo]
    payloads_auditoria_antes = [_payload_template_auditoria(item) for item in templates_mesmo_codigo]
    base_antes, origem_antes = _selecionar_base_recomendada_grupo(payloads_antes)
    base_antes_payload = next(
        (item for item in payloads_auditoria_antes if int(item["template_id"] or 0) == int(base_antes.get("id") or 0)),
        None,
    )
    bases_fixas_antes = [
        _payload_template_auditoria(item)
        for item in templates_mesmo_codigo
        if bool(getattr(item, "base_recomendada_fixa", False))
    ]
    if not bases_fixas_antes:
        return {
            "ok": True,
            "template_id": int(template.id),
            "codigo_template": str(template.codigo_template or ""),
            "status": "inalterado",
            "base_recomendada_origem": origem_antes,
            "grupo_base_recomendada_id": int(base_antes.get("id") or template.id),
        }

    _desmarcar_bases_recomendadas_mesmo_codigo(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
        template_id_excluir=None,
    )
    payloads_depois = [_serializar_template_laudo(item) for item in templates_mesmo_codigo]
    payloads_auditoria_depois = [_payload_template_auditoria(item) for item in templates_mesmo_codigo]
    base_depois, origem_depois = _selecionar_base_recomendada_grupo(payloads_depois)
    base_depois_payload = next(
        (item for item in payloads_auditoria_depois if int(item["template_id"] or 0) == int(base_depois.get("id") or 0)),
        None,
    )
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_base_recomendada_automatica_restaurada",
        resumo=f"Base recomendada automática restaurada para {template.codigo_template}.",
        detalhe=(
            f"A fixação manual do código {template.codigo_template} foi removida."
            + (
                f" Base anterior: {base_antes.get('codigo_template', template.codigo_template)} v{int(base_antes.get('versao') or 1)} ({origem_antes})."
                if base_antes
                else ""
            )
            + (
                f" Nova referência: {base_depois.get('codigo_template', template.codigo_template)} v{int(base_depois.get('versao') or 1)} ({origem_depois})."
                if base_depois
                else ""
            )
        ),
        payload={
            "template_solicitacao": _payload_template_auditoria(template),
            "base_anterior": base_antes_payload,
            "base_anterior_origem": origem_antes,
            "bases_fixas_removidas": bases_fixas_antes,
            "total_bases_fixas_removidas": len(bases_fixas_antes),
            "base_recomendada_atual": base_depois_payload,
            "base_recomendada_atual_origem": origem_depois,
        },
    )
    banco.commit()
    banco.refresh(template)
    return {
        "ok": True,
        "template_id": int(template.id),
        "codigo_template": str(template.codigo_template or ""),
        "status": "automatico",
        "base_recomendada_origem": origem_depois,
        "grupo_base_recomendada_id": int(base_depois.get("id") or template.id),
        "grupo_base_recomendada_versao": int(base_depois.get("versao") or template.versao),
    }


@roteador_templates_laudo.patch(
    "/api/templates-laudo/{template_id:int}/status",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def atualizar_status_template_laudo(
    template_id: int,
    dados: DadosAtualizarStatusTemplate,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    estado_antes = _payload_template_auditoria(template)
    _marcar_template_status(
        banco,
        template=template,
        status_template=dados.status_template,
    )
    estado_depois = _payload_template_auditoria(template)
    if (
        estado_antes["status_template"] != estado_depois["status_template"]
        or bool(estado_antes["ativo"]) != bool(estado_depois["ativo"])
    ):
        _registrar_auditoria_templates(
            banco,
            usuario=usuario,
            acao="template_status_alterado",
            resumo=(
                f"Ciclo do template {template.codigo_template} v{template.versao} "
                f"atualizado para {_label_status_template(template.status_template)}."
            ),
            detalhe=(
                f"{template.nome} saiu de "
                f"{_label_status_template(estado_antes['status_template']).lower()} "
                f"para {_label_status_template(template.status_template).lower()}."
            ),
            payload={
                "template_antes": estado_antes,
                "template_depois": estado_depois,
            },
        )
    banco.commit()
    banco.refresh(template)
    return {
        "ok": True,
        "template_id": template.id,
        "status_template": template.status_template,
        "ativo": bool(template.ativo),
    }


@roteador_templates_laudo.post(
    "/api/templates-laudo/lote/status",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        404: {"description": "Um ou mais templates não foram encontrados."},
        409: {"description": "Ação em lote inválida para o ciclo solicitado."},
    },
)
async def atualizar_status_template_laudo_em_lote(
    dados: DadosAtualizarStatusTemplateLote,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    status_alvo = normalizar_status_template(dados.status_template)
    if status_alvo == STATUS_TEMPLATE_ATIVO:
        raise HTTPException(
            status_code=409,
            detail="Use a ativação individual para publicar uma versão como ativa.",
        )

    templates_lote = _obter_templates_lote_empresa(
        banco,
        template_ids=dados.template_ids,
        empresa_id=int(usuario.empresa_id),
    )
    estados_antes = [_payload_template_auditoria(item) for item in templates_lote]
    for template in templates_lote:
        _marcar_template_status(
            banco,
            template=template,
            status_template=status_alvo,
        )
    estados_depois = [_payload_template_auditoria(item) for item in templates_lote]
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_status_lote_alterado",
        resumo=f"{len(templates_lote)} template(s) movido(s) para {_label_status_template(status_alvo).lower()} na biblioteca.",
        detalhe=f"Ação em lote aplicada em {_resumir_templates_auditoria(templates_lote)}.",
        payload={
            "status_destino": status_alvo,
            "status_destino_label": _label_status_template(status_alvo),
            "template_ids": [int(item.id) for item in templates_lote],
            "templates_antes": estados_antes,
            "templates_depois": estados_depois,
            "total": len(templates_lote),
        },
    )
    banco.commit()
    return {
        "ok": True,
        "template_ids": [int(item.id) for item in templates_lote],
        "total": len(templates_lote),
        "status_template": status_alvo,
    }


@roteador_templates_laudo.post(
    "/api/templates-laudo/lote/excluir",
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        404: {"description": "Um ou mais templates não foram encontrados."},
        409: {"description": "A seleção contém templates ativos."},
    },
)
async def excluir_template_laudo_em_lote(
    dados: DadosExcluirTemplateLote,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    templates_lote = _obter_templates_lote_empresa(
        banco,
        template_ids=dados.template_ids,
        empresa_id=int(usuario.empresa_id),
    )
    ativos = [item for item in templates_lote if bool(item.ativo)]
    if ativos:
        raise HTTPException(
            status_code=409,
            detail="A seleção contém template ativo. Arquive ou troque a versão ativa antes de excluir em lote.",
        )

    payload_templates = [_payload_template_auditoria(item) for item in templates_lote]
    ids_excluidos = [int(item.id) for item in templates_lote]
    for template in templates_lote:
        _remover_assets_fisicos_template(template)
        banco.delete(template)
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_excluido_lote",
        resumo=f"{len(ids_excluidos)} template(s) excluído(s) em lote da biblioteca.",
        detalhe=f"Remoção aplicada em {_resumir_templates_auditoria(templates_lote)}.",
        payload={
            "template_ids": ids_excluidos,
            "templates": payload_templates,
            "total": len(ids_excluidos),
        },
    )
    banco.commit()
    return {
        "ok": True,
        "template_ids": ids_excluidos,
        "total": len(ids_excluidos),
        "status": "excluido",
    }


@roteador_templates_laudo.post(
    "/api/templates-laudo/{template_id:int}/clonar",
    status_code=201,
    responses={
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
    },
)
async def clonar_template_laudo(
    template_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    maior_versao = (
        banco.query(func.max(TemplateLaudo.versao))
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == template.codigo_template,
        )
        .scalar()
    )
    nova_versao = max(int(template.versao or 1) + 1, int(maior_versao or 0) + 1)
    clone = TemplateLaudo(
        empresa_id=template.empresa_id,
        criado_por_id=usuario.id,
        nome=str(template.nome or "").strip()[:180],
        codigo_template=str(template.codigo_template or "").strip(),
        versao=nova_versao,
        ativo=False,
        base_recomendada_fixa=False,
        status_template=STATUS_TEMPLATE_RASCUNHO,
        modo_editor=normalizar_modo_editor(getattr(template, "modo_editor", None)),
        arquivo_pdf_base=str(template.arquivo_pdf_base or ""),
        mapeamento_campos_json=dict(template.mapeamento_campos_json or {}),
        documento_editor_json=json.loads(json.dumps(template.documento_editor_json or {})) if template.documento_editor_json else None,
        assets_json=json.loads(json.dumps(template.assets_json or [])),
        estilo_json=json.loads(json.dumps(template.estilo_json or {})) if template.estilo_json else None,
        observacoes=((str(template.observacoes or "").strip() + " | Clonado para nova revisão.")[:4000] or None),
    )
    banco.add(clone)
    banco.flush()
    _registrar_auditoria_templates(
        banco,
        usuario=usuario,
        acao="template_clonado",
        resumo=f"Nova versão clonada para {clone.codigo_template} v{clone.versao}.",
        detalhe=f"{template.nome} gerou uma nova revisão pronta para ajustes na biblioteca.",
        payload={
            "template_origem": _payload_template_auditoria(template),
            "template_clone": _payload_template_auditoria(clone),
        },
    )
    banco.commit()
    banco.refresh(clone)
    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(clone, incluir_mapeamento=True),
    )


@roteador_templates_laudo.get(
    "/api/templates-laudo/diff",
    responses={
        400: {"description": "Comparação inválida."},
        404: {"description": "Template não encontrado."},
        409: {"description": "Os templates não pertencem ao mesmo código."},
    },
)
async def comparar_versoes_template_laudo(
    base_id: int = Query(..., ge=1),
    comparado_id: int = Query(..., ge=1),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if int(base_id) == int(comparado_id):
        raise HTTPException(status_code=400, detail="Selecione duas versões diferentes para comparar.")

    template_base = _obter_template_laudo_empresa(
        banco,
        template_id=base_id,
        empresa_id=usuario.empresa_id,
    )
    template_comparado = _obter_template_laudo_empresa(
        banco,
        template_id=comparado_id,
        empresa_id=usuario.empresa_id,
    )
    if str(template_base.codigo_template or "").strip() != str(template_comparado.codigo_template or "").strip():
        raise HTTPException(
            status_code=409,
            detail="A comparação só está disponível para versões do mesmo código de template.",
        )

    payload_diff = gerar_diff_templates(template_base, template_comparado)
    return {
        "ok": True,
        "base": _serializar_template_laudo(template_base, incluir_mapeamento=False),
        "comparado": _serializar_template_laudo(template_comparado, incluir_mapeamento=False),
        **payload_diff,
    }


@roteador_templates_laudo.post(
    "/api/templates-laudo/{template_id:int}/preview",
    responses={
        **RESPOSTA_OK_PDF,
        **RESPOSTAS_CSRF_INVALIDO,
        **RESPOSTAS_TEMPLATE_NAO_ENCONTRADO,
        **RESPOSTAS_MULTIPART_INVALIDO,
        **RESPOSTAS_PROCESSAMENTO_TEMPLATE,
    },
)
async def preview_template_laudo(
    template_id: int,
    dados: DadosPreviewTemplateLaudo,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    dados_formulario = _obter_dados_formulario_preview(
        banco=banco,
        usuario=usuario,
        dados=dados,
    )

    if not dados_formulario:
        raise HTTPException(
            status_code=400,
            detail="Envie dados_formulario ou um laudo_id com estrutura preenchida.",
        )

    try:
        if env_str("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1":
            pdf_preview = Path(template.arquivo_pdf_base).read_bytes()
        else:
            modo_editor = normalizar_modo_editor(getattr(template, "modo_editor", None))
            if modo_editor == MODO_EDITOR_RICO:
                pdf_preview = await gerar_pdf_editor_rico_bytes(
                    documento_editor_json=template.documento_editor_json or documento_editor_padrao(),
                    estilo_json=template.estilo_json or estilo_editor_padrao(),
                    assets_json=template.assets_json or [],
                    dados_formulario=dados_formulario,
                )
            else:
                pdf_preview = gerar_preview_pdf_template(
                    caminho_pdf_base=template.arquivo_pdf_base,
                    mapeamento_campos=template.mapeamento_campos_json or {},
                    dados_formulario=dados_formulario,
                )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception:
        logger.error(
            "Falha ao gerar preview do template | template_id=%s | empresa_id=%s",
            template.id,
            usuario.empresa_id,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Falha ao gerar preview do template.")

    nome_arquivo = f"preview_template_{template.codigo_template}_v{template.versao}.pdf"
    return Response(
        content=pdf_preview,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'},
    )


__all__ = [
    "roteador_templates_laudo",
]
