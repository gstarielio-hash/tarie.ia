from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.chat.request_parsing_helpers import BoolFormEstrito
from app.domains.revisor.common import _validar_csrf
from app.domains.revisor.templates_laudo_editor_routes import (
    DadosPreviewTemplateLaudo,
    roteador_templates_laudo_editor,
)
from app.domains.revisor.templates_laudo_management_routes import (
    roteador_templates_laudo_management,
)
from app.domains.revisor.templates_laudo_diff import gerar_diff_templates
from app.domains.revisor.templates_laudo_support import (
    STATUS_TEMPLATE_RASCUNHO,
    contexto_templates_padrao as _contexto_templates_padrao,
    label_status_template as _label_status_template,
    listar_auditoria_templates_serializada as _listar_auditoria_templates_serializada,
    listar_catalogo_templates_empresa as _listar_catalogo_templates_empresa,
    obter_dados_formulario_preview as _obter_dados_formulario_preview,
    obter_template_laudo_empresa as _obter_template_laudo_empresa,
    payload_template_auditoria as _payload_template_auditoria,
    rebaixar_templates_ativos_mesmo_codigo as _rebaixar_templates_ativos_mesmo_codigo,
    registrar_auditoria_templates as _registrar_auditoria_templates,
    remover_assets_fisicos_template as _remover_assets_fisicos_template,
    resolver_status_template_ativo as _resolver_status_template_ativo,
    serializar_template_laudo as _serializar_template_laudo,
    template_codigo_versao_existe as _template_codigo_versao_existe,
)
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
    gerar_pdf_editor_rico_bytes,
    normalizar_modo_editor,
)

logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory="templates")
roteador_templates_laudo = APIRouter()
roteador_templates_laudo.include_router(roteador_templates_laudo_editor)
roteador_templates_laudo.include_router(roteador_templates_laudo_management)

RESPOSTAS_CSRF_INVALIDO = {
    403: {"description": "Token CSRF inválido."},
}
RESPOSTAS_TEMPLATE_NAO_ENCONTRADO = {
    404: {"description": "Template não encontrado."},
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
    return {"itens": _listar_catalogo_templates_empresa(banco, empresa_id=int(usuario.empresa_id))}


@roteador_templates_laudo.get("/api/templates-laudo/auditoria")
async def listar_auditoria_templates_laudo(
    limite: int = Query(default=12, ge=1, le=50),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    return {"itens": _listar_auditoria_templates_serializada(banco, empresa_id=int(usuario.empresa_id), limite=limite)}


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
    banco.flush()
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

    if _template_codigo_versao_existe(
        banco,
        empresa_id=int(usuario.empresa_id),
        codigo_template=codigo_limpo,
        versao=int(versao),
    ):
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
    banco.flush()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
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
