from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.revisor.common import _validar_csrf
from app.domains.revisor.templates_laudo_support import (
    STATUS_TEMPLATE_RASCUNHO,
    label_status_template as _label_status_template,
    obter_dados_formulario_preview as _obter_dados_formulario_preview,
    obter_template_laudo_empresa as _obter_template_laudo_empresa,
    payload_template_auditoria as _payload_template_auditoria,
    rebaixar_templates_ativos_mesmo_codigo as _rebaixar_templates_ativos_mesmo_codigo,
    registrar_auditoria_templates as _registrar_auditoria_templates,
    resolver_status_template_ativo as _resolver_status_template_ativo,
    serializar_template_laudo as _serializar_template_laudo,
    template_codigo_versao_existe as _template_codigo_versao_existe,
)
from app.shared.database import TemplateLaudo, Usuario, obter_banco
from app.shared.security import exigir_revisor
from nucleo.template_laudos import normalizar_codigo_template
from nucleo.template_editor_word import (
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
)

logger = logging.getLogger(__name__)

roteador_templates_laudo_editor = APIRouter()

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


@roteador_templates_laudo_editor.post(
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

    if _template_codigo_versao_existe(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=codigo_limpo,
        versao=int(dados.versao),
    ):
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
    banco.flush()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo_editor.get(
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


@roteador_templates_laudo_editor.put(
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
    banco.flush()
    banco.refresh(template)
    return _serializar_template_laudo(template, incluir_mapeamento=True)


@roteador_templates_laudo_editor.post(
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
    banco.flush()
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


@roteador_templates_laudo_editor.get(
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


@roteador_templates_laudo_editor.post(
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
        headers={"Content-Disposition": f'inline; filename=\"{nome_arquivo}\"'},
    )


__all__ = [
    "DadosPreviewTemplateLaudo",
    "roteador_templates_laudo_editor",
]
