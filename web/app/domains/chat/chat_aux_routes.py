"""Endpoints auxiliares do chat do inspetor."""

from __future__ import annotations

import os
import tempfile
import uuid
from typing import Annotated

from fastapi import Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.domains.chat.app_context import logger
from app.domains.chat.chat_service import obter_mensagens_laudo_payload, processar_upload_documento
from app.domains.chat.core_helpers import resposta_json_ok
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.normalization import normalizar_tipo_template
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.chat.schemas import DadosFeedback, DadosPDF
from app.domains.chat.session_helpers import exigir_csrf, laudo_id_sessao
from app.domains.chat.template_helpers import selecionar_template_ativo_para_tipo
from app.domains.chat.media_helpers import safe_remove_file
from app.shared.database import Laudo, TemplateLaudo, Usuario, obter_banco
from app.shared.security import exigir_inspetor
from nucleo.gerador_laudos import GeradorLaudos
from nucleo.template_editor_word import (
    MODO_EDITOR_RICO,
    documento_editor_padrao,
    estilo_editor_padrao,
    normalizar_modo_editor,
)
from nucleo.template_laudos import gerar_preview_pdf_template

roteador_chat_aux = APIRouter()
RESPOSTA_LAUDO_NAO_ENCONTRADO = {404: {"description": "Laudo não encontrado."}}


async def obter_mensagens_laudo(
    laudo_id: int,
    request: Request,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=80, ge=20, le=200),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    return await obter_mensagens_laudo_payload(
        laudo_id=laudo_id,
        request=request,
        cursor=int(cursor) if cursor is not None else None,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )


async def rota_pdf(
    request: Request,
    dados: DadosPDF,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    nome_arquivo = f"Laudo_Tarielia_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo)

    laudo_id_candidato = dados.laudo_id or laudo_id_sessao(request)
    laudo: Laudo | None = None
    if laudo_id_candidato:
        laudo = obter_laudo_do_inspetor(banco, int(laudo_id_candidato), usuario)

    template_ativo: TemplateLaudo | None = None
    dados_formulario_laudo = laudo.dados_formulario if laudo and isinstance(laudo.dados_formulario, dict) else {}
    if dados_formulario_laudo:
        template_ativo = selecionar_template_ativo_para_tipo(
            banco,
            empresa_id=usuario.empresa_id,
            tipo_template=normalizar_tipo_template(str(getattr(laudo, "tipo_template", ""))),
        )

    try:
        if template_ativo:
            try:
                modo_editor = normalizar_modo_editor(getattr(template_ativo, "modo_editor", None))
                if modo_editor == MODO_EDITOR_RICO:
                    import app.domains.chat.chat as chat_facade

                    pdf_template = await chat_facade.gerar_pdf_editor_rico_bytes(
                        documento_editor_json=template_ativo.documento_editor_json or documento_editor_padrao(),
                        estilo_json=template_ativo.estilo_json or estilo_editor_padrao(),
                        assets_json=template_ativo.assets_json or [],
                        dados_formulario=dados_formulario_laudo,
                    )
                else:
                    pdf_template = gerar_preview_pdf_template(
                        caminho_pdf_base=template_ativo.arquivo_pdf_base,
                        mapeamento_campos=template_ativo.mapeamento_campos_json or {},
                        dados_formulario=dados_formulario_laudo,
                    )
                with open(caminho_pdf, "wb") as arquivo_saida:
                    arquivo_saida.write(pdf_template)
                return FileResponse(
                    path=caminho_pdf,
                    filename=f"Laudo_{template_ativo.codigo_template}_v{template_ativo.versao}.pdf",
                    media_type="application/pdf",
                    background=BackgroundTask(safe_remove_file, caminho_pdf),
                )
            except Exception:
                logger.warning(
                    "Falha ao gerar PDF pelo template ativo. Aplicando fallback legacy. | empresa_id=%s | usuario_id=%s | laudo_id=%s | template_id=%s",
                    usuario.empresa_id,
                    usuario.id,
                    laudo.id if laudo else None,
                    template_ativo.id,
                    exc_info=True,
                )

        GeradorLaudos.gerar_pdf_inspecao(
            dados=dados.model_dump(),
            caminho_saida=caminho_pdf,
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
        )

        return FileResponse(
            path=caminho_pdf,
            filename="laudo_art_wf.pdf",
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, caminho_pdf),
        )
    except Exception:
        logger.error("Falha ao gerar PDF.", exc_info=True)
        safe_remove_file(caminho_pdf)
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao gerar o PDF."},
        )


async def rota_upload_doc(
    request: Request,
    arquivo: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    payload, status_code = await processar_upload_documento(
        arquivo=arquivo,
        usuario=usuario,
        banco=banco,
    )
    return resposta_json_ok(payload, status_code=status_code)


async def rota_feedback(
    request: Request,
    dados: DadosFeedback,
    usuario: Usuario = Depends(exigir_inspetor),
):
    exigir_csrf(request)

    logger.info(
        "Feedback recebido | tipo=%s | usuario_id=%s | trecho='%.80s'",
        dados.tipo,
        usuario.id,
        dados.trecho,
    )

    return resposta_json_ok({"ok": True})


roteador_chat_aux.add_api_route(
    "/api/laudo/{laudo_id}/mensagens",
    obter_mensagens_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_chat_aux.add_api_route(
    "/api/gerar_pdf",
    rota_pdf,
    methods=["POST"],
    responses={
        200: {
            "description": "PDF gerado para o laudo.",
            "content": {"application/pdf": {}},
        },
        500: {"description": "Falha ao gerar o PDF."},
    },
)
roteador_chat_aux.add_api_route(
    "/api/upload_doc",
    rota_upload_doc,
    methods=["POST"],
    responses={
        400: {"description": "Multipart inválido ou corpo malformado."},
        413: {"description": "Arquivo muito grande."},
        415: {"description": "Tipo de arquivo não suportado."},
        422: {"description": "Não foi possível extrair texto do documento."},
        501: {"description": "Parser do tipo de documento indisponível."},
    },
)
roteador_chat_aux.add_api_route("/api/feedback", rota_feedback, methods=["POST"])

registrar_feedback = rota_feedback


__all__ = [
    "RESPOSTA_LAUDO_NAO_ENCONTRADO",
    "obter_mensagens_laudo",
    "registrar_feedback",
    "rota_feedback",
    "rota_pdf",
    "rota_upload_doc",
    "roteador_chat_aux",
]
