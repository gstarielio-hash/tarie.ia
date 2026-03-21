from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.domains.revisor.common import _validar_csrf
from app.domains.revisor.templates_laudo_support import (
    STATUS_TEMPLATE_ATIVO,
    STATUS_TEMPLATE_LEGADO,
    STATUS_TEMPLATE_RASCUNHO,
    desmarcar_bases_recomendadas_mesmo_codigo as _desmarcar_bases_recomendadas_mesmo_codigo,
    label_status_template as _label_status_template,
    listar_templates_ativos_mesmo_codigo as _listar_templates_ativos_mesmo_codigo,
    listar_templates_mesmo_codigo_empresa as _listar_templates_mesmo_codigo_empresa,
    marcar_template_status as _marcar_template_status,
    normalizar_status_template,
    obter_template_laudo_empresa as _obter_template_laudo_empresa,
    obter_templates_lote_empresa as _obter_templates_lote_empresa,
    payload_template_auditoria as _payload_template_auditoria,
    proxima_versao_template_codigo as _proxima_versao_template_codigo,
    registrar_auditoria_templates as _registrar_auditoria_templates,
    remover_assets_fisicos_template as _remover_assets_fisicos_template,
    resumir_templates_auditoria as _resumir_templates_auditoria,
    selecionar_base_recomendada_grupo as _selecionar_base_recomendada_grupo,
    serializar_template_laudo as _serializar_template_laudo,
)
from app.shared.database import TemplateLaudo, Usuario, obter_banco
from app.shared.security import exigir_revisor
from nucleo.template_editor_word import (
    MODO_EDITOR_RICO,
    documento_editor_padrao,
    estilo_editor_padrao,
    gerar_pdf_editor_rico_bytes,
    normalizar_modo_editor,
    salvar_snapshot_editor_como_pdf_base,
)

logger = logging.getLogger(__name__)

roteador_templates_laudo_management = APIRouter()

RESPOSTAS_CSRF_INVALIDO = {
    403: {"description": "Token CSRF inválido."},
}
RESPOSTAS_TEMPLATE_NAO_ENCONTRADO = {
    404: {"description": "Template não encontrado."},
}
RESPOSTAS_PROCESSAMENTO_TEMPLATE = {
    500: {"description": "Falha ao processar ou renderizar o template."},
}


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


@roteador_templates_laudo_management.post(
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


@roteador_templates_laudo_management.post(
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

    ativos_mesmo_codigo = _listar_templates_ativos_mesmo_codigo(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
        template_id_excluir=int(template.id),
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
    banco.flush()

    return {"ok": True, "template_id": template.id, "status": "publicado"}


@roteador_templates_laudo_management.post(
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
    templates_mesmo_codigo = _listar_templates_mesmo_codigo_empresa(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
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
        banco.flush()
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
    banco.flush()
    banco.refresh(template)
    return {
        "ok": True,
        "template_id": int(template.id),
        "codigo_template": str(template.codigo_template or ""),
        "status": "promovido",
        "base_recomendada_fixa": True,
        "base_recomendada_origem": "manual",
    }


@roteador_templates_laudo_management.delete(
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
    templates_mesmo_codigo = _listar_templates_mesmo_codigo_empresa(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
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
    banco.flush()
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


@roteador_templates_laudo_management.patch(
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
    banco.flush()
    banco.refresh(template)
    return {
        "ok": True,
        "template_id": template.id,
        "status_template": template.status_template,
        "ativo": bool(template.ativo),
    }


@roteador_templates_laudo_management.post(
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
    banco.flush()
    return {
        "ok": True,
        "template_ids": [int(item.id) for item in templates_lote],
        "total": len(templates_lote),
        "status_template": status_alvo,
    }


@roteador_templates_laudo_management.post(
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
    banco.flush()
    return {
        "ok": True,
        "template_ids": ids_excluidos,
        "total": len(ids_excluidos),
        "status": "excluido",
    }


@roteador_templates_laudo_management.post(
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
    nova_versao = _proxima_versao_template_codigo(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=str(template.codigo_template or ""),
        versao_atual=int(template.versao or 1),
    )
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
    banco.flush()
    banco.refresh(clone)
    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(clone, incluir_mapeamento=True),
    )


__all__ = [
    "DadosAtualizarStatusTemplate",
    "DadosAtualizarStatusTemplateLote",
    "DadosExcluirTemplateLote",
    "roteador_templates_laudo_management",
]
