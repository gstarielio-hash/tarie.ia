from __future__ import annotations

import json
import logging
from pathlib import Path
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
    ativo: bool = False

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosSalvarTemplateEditor(BaseModel):
    nome: str | None = Field(default=None, min_length=3, max_length=180)
    observacoes: str | None = Field(default=None, max_length=4000)
    documento_editor_json: dict[str, Any]
    estilo_json: dict[str, Any] | None = None

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
    modo_editor = normalizar_modo_editor(getattr(item, "modo_editor", None))
    assets = item.assets_json if isinstance(getattr(item, "assets_json", None), list) else []
    payload: dict[str, Any] = {
        "id": item.id,
        "nome": item.nome,
        "codigo_template": item.codigo_template,
        "versao": item.versao,
        "ativo": bool(item.ativo),
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

    return {"itens": [_serializar_template_laudo(item) for item in templates_db]}


@roteador_templates_laudo.post("/api/templates-laudo/editor")
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

    if bool(dados.ativo):
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
        ativo=bool(dados.ativo),
        modo_editor=MODO_EDITOR_RICO,
        arquivo_pdf_base=caminho_placeholder,
        mapeamento_campos_json={},
        documento_editor_json=documento_editor_padrao(),
        assets_json=[],
        estilo_json=estilo,
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo.get("/api/templates-laudo/editor/{template_id:int}")
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


@roteador_templates_laudo.put("/api/templates-laudo/editor/{template_id:int}")
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


@roteador_templates_laudo.post("/api/templates-laudo/editor/{template_id:int}/assets")
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


@roteador_templates_laudo.get("/api/templates-laudo/editor/{template_id:int}/assets/{asset_id}")
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


@roteador_templates_laudo.post("/api/templates-laudo/editor/{template_id:int}/preview")
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


@roteador_templates_laudo.post("/api/templates-laudo/editor/{template_id:int}/publicar")
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


@roteador_templates_laudo.get("/api/templates-laudo/{template_id:int}")
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


@roteador_templates_laudo.delete("/api/templates-laudo/{template_id:int}")
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

    # Limpeza opcional de assets físicos do editor rico.
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

    banco.delete(template)
    banco.commit()
    return {"ok": True, "template_id": template_id, "status": "excluido"}


@roteador_templates_laudo.get("/api/templates-laudo/{template_id:int}/arquivo-base")
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
        modo_editor=MODO_EDITOR_LEGADO,
        arquivo_pdf_base=caminho_pdf_base,
        mapeamento_campos_json=mapeamento_payload,
        documento_editor_json=None,
        assets_json=[],
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_templates_laudo.post("/api/templates-laudo/{template_id:int}/publicar")
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
    for item in ativos_mesmo_codigo:
        item.ativo = False

    template.ativo = True
    banco.commit()

    return {"ok": True, "template_id": template.id, "status": "publicado"}


@roteador_templates_laudo.post("/api/templates-laudo/{template_id:int}/preview")
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
