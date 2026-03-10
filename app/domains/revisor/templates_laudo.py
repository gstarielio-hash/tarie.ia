from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.domains.revisor.common import _contexto_base, _obter_laudo_empresa, _validar_csrf
from app.shared.database import TemplateLaudo, Usuario, obter_banco
from app.shared.security import exigir_revisor
from nucleo.template_laudos import (
    gerar_preview_pdf_template,
    mapeamento_cbmgo_padrao,
    normalizar_codigo_template,
    normalizar_mapeamento_campos,
    salvar_pdf_template_base,
)

logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory="templates")
roteador_templates_laudo = APIRouter()


class DadosPreviewTemplateLaudo(BaseModel):
    laudo_id: int | None = Field(default=None, ge=1)
    dados_formulario: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


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


def _serializar_template_laudo(item: TemplateLaudo, incluir_mapeamento: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": item.id,
        "nome": item.nome,
        "codigo_template": item.codigo_template,
        "versao": item.versao,
        "ativo": bool(item.ativo),
        "observacoes": item.observacoes or "",
        "criado_em": item.criado_em.isoformat() if item.criado_em else None,
        "atualizado_em": item.atualizado_em.isoformat() if item.atualizado_em else None,
        "criado_por_id": item.criado_por_id,
    }
    if incluir_mapeamento:
        payload["mapeamento_campos_json"] = item.mapeamento_campos_json or {}
    return payload


@roteador_templates_laudo.get("/templates-laudo", response_class=HTMLResponse)
async def tela_templates_laudo(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
):
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
    return templates.TemplateResponse(request, "revisor_templates_laudo.html", contexto)


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

    return {"itens": [_serializar_template_laudo(item) for item in templates_db]}


@roteador_templates_laudo.get("/api/templates-laudo/{template_id}")
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


@roteador_templates_laudo.get("/api/templates-laudo/{template_id}/arquivo-base")
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


@roteador_templates_laudo.post("/api/templates-laudo/upload")
async def upload_template_laudo(
    request: Request,
    nome: str = Form(...),
    codigo_template: str = Form(...),
    versao: int = Form(default=1),
    observacoes: str = Form(default=""),
    mapeamento_campos_json: str = Form(default=""),
    ativo: bool = Form(default=False),
    csrf_token: str = Form(default=""),
    arquivo_base: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    nome_limpo = str(nome or "").strip()[:180]
    codigo_limpo = normalizar_codigo_template(codigo_template)
    observacoes_limpas = str(observacoes or "").strip()

    if not nome_limpo:
        raise HTTPException(status_code=400, detail="Nome do template é obrigatório.")
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

    if ativo:
        ativos_mesmo_codigo = (
            banco.query(TemplateLaudo)
            .filter(
                TemplateLaudo.empresa_id == usuario.empresa_id,
                TemplateLaudo.codigo_template == codigo_limpo,
                TemplateLaudo.ativo.is_(True),
            )
            .all()
        )
        for item in ativos_mesmo_codigo:
            item.ativo = False

    template = TemplateLaudo(
        empresa_id=usuario.empresa_id,
        criado_por_id=usuario.id,
        nome=nome_limpo,
        codigo_template=codigo_limpo,
        versao=versao,
        ativo=bool(ativo),
        arquivo_pdf_base=caminho_pdf_base,
        mapeamento_campos_json=mapeamento_payload,
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo.post("/api/templates-laudo/{template_id}/publicar")
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
    for item in ativos_mesmo_codigo:
        item.ativo = False

    template.ativo = True
    banco.commit()

    return {"ok": True, "template_id": template.id, "status": "publicado"}


@roteador_templates_laudo.post("/api/templates-laudo/{template_id}/preview")
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

    dados_formulario: dict[str, Any] = {}
    if dados.laudo_id:
        laudo = _obter_laudo_empresa(banco, dados.laudo_id, usuario.empresa_id)
        dados_formulario = laudo.dados_formulario or {}
    elif isinstance(dados.dados_formulario, dict):
        dados_formulario = dados.dados_formulario

    if not dados_formulario:
        raise HTTPException(
            status_code=400,
            detail="Envie dados_formulario ou um laudo_id com estrutura preenchida.",
        )

    try:
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
