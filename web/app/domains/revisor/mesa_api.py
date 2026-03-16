from __future__ import annotations

import os
from typing import Annotated, Literal

from fastapi import Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.domains.chat.media_helpers import safe_remove_file
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.revisor.base import (
    DadosPendenciaMesa,
    DadosRespostaChat,
    DadosWhisper,
    RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
    logger,
    roteador_revisor,
)
from app.domains.revisor.common import _validar_csrf
from app.domains.revisor.realtime import (
    notificar_inspetor_sse,
    notificar_whisper_resposta_revisor,
)
from app.domains.revisor.service import (
    atualizar_pendencia_mesa_revisor_status,
    avaliar_laudo_revisor,
    carregar_anexo_mesa_revisor,
    carregar_historico_chat_revisor,
    carregar_laudo_completo_revisor,
    carregar_pacote_mesa_laudo_revisor,
    gerar_exportacao_pacote_mesa_laudo_pdf,
    marcar_whispers_lidos_revisor,
    registrar_resposta_chat_com_anexo_revisor,
    registrar_resposta_chat_revisor,
    registrar_whisper_resposta_revisor,
    validar_parametros_pacote_mesa,
)
from app.shared.database import Usuario, obter_banco
from app.shared.security import exigir_revisor


@roteador_revisor.post(
    "/api/laudo/{laudo_id}/avaliar",
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
        400: {"description": "Requisição inválida para avaliação."},
        403: {"description": "CSRF inválido."},
    },
)
async def avaliar_laudo(
    laudo_id: int,
    request: Request,
    acao: Literal["aprovar", "rejeitar"] = Form(...),
    motivo: str = Form(default=""),
    csrf_token: str = Form(default=""),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    resposta_api = bool(request.headers.get("X-CSRF-Token"))
    modo_schemathesis = resposta_api and os.getenv("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1"
    token_csrf = str(csrf_token or "").strip() or request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token_csrf):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    resultado = avaliar_laudo_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        revisor_id=usuario.id,
        revisor_nome=usuario.nome,
        acao=acao,
        motivo=motivo,
        resposta_api=resposta_api,
        modo_schemathesis=bool(modo_schemathesis),
    )

    if not resultado.modo_schemathesis:
        await notificar_inspetor_sse(
            inspetor_id=resultado.inspetor_id,
            laudo_id=resultado.laudo_id,
            tipo="mensagem_eng",
            texto=resultado.texto_notificacao_inspetor,
            mensagem_id=resultado.mensagem_id,
            de_usuario_id=usuario.id,
            de_nome=usuario.nome,
        )

    if resposta_api:
        return JSONResponse(
            {
                "success": True,
                "laudo_id": resultado.laudo_id,
                "acao": resultado.acao,
                "status_revisao": resultado.status_revisao,
                "motivo": resultado.motivo,
            }
        )

    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post(
    "/api/whisper/responder",
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
        400: {"description": "Destinatário inválido para o laudo."},
        403: {"description": "CSRF inválido."},
    },
)
async def whisper_responder(
    dados: DadosWhisper,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    resultado = registrar_whisper_resposta_revisor(
        banco,
        laudo_id=dados.laudo_id,
        empresa_id=usuario.empresa_id,
        revisor_id=usuario.id,
        mensagem=dados.mensagem,
        destinatario_id=dados.destinatario_id,
        referencia_mensagem_id=int(dados.referencia_mensagem_id or 0) or None,
    )

    await notificar_whisper_resposta_revisor(
        empresa_id=usuario.empresa_id,
        destinatario_id=resultado.destinatario_id,
        laudo_id=resultado.laudo_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
        mensagem_id=resultado.mensagem_id,
        referencia_mensagem_id=resultado.referencia_mensagem_id,
        preview=resultado.preview,
    )

    await notificar_inspetor_sse(
        inspetor_id=resultado.destinatario_id,
        laudo_id=resultado.laudo_id,
        tipo="whisper_eng",
        texto=str(dados.mensagem or "").strip(),
        mensagem_id=resultado.mensagem_id,
        referencia_mensagem_id=resultado.referencia_mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    logger.info(
        "Whisper enviado | laudo=%s | revisor=%s | destinatario_id=%s",
        dados.laudo_id,
        usuario.nome,
        resultado.destinatario_id,
    )
    return JSONResponse({"success": True, "destinatario_id": resultado.destinatario_id})


@roteador_revisor.post(
    "/api/laudo/{laudo_id}/responder",
    responses={**RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR, 400: {"description": "Mensagem inválida."}},
)
async def responder_chat_campo(
    laudo_id: int,
    dados: DadosRespostaChat,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    resultado = registrar_resposta_chat_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        revisor_id=usuario.id,
        texto=dados.texto,
        referencia_mensagem_id=int(dados.referencia_mensagem_id or 0) or None,
        revisor_nome=usuario.nome,
    )

    await notificar_inspetor_sse(
        inspetor_id=resultado.inspetor_id,
        laudo_id=resultado.laudo_id,
        tipo="mensagem_eng",
        texto=resultado.texto_notificacao,
        mensagem_id=resultado.mensagem_id,
        referencia_mensagem_id=resultado.referencia_mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    return JSONResponse({"success": True})


@roteador_revisor.post(
    "/api/laudo/{laudo_id}/responder-anexo",
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
        400: {"description": "Upload inválido."},
        413: {"description": "Arquivo acima do limite."},
        415: {"description": "Tipo de arquivo não suportado."},
    },
)
async def responder_chat_campo_com_anexo(
    laudo_id: int,
    request: Request,
    arquivo: UploadFile = File(...),
    texto: str = Form(default=""),
    referencia_mensagem_id: Annotated[InteiroOpcionalNullish, Form()] = None,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    conteudo_arquivo = await arquivo.read()
    resultado = registrar_resposta_chat_com_anexo_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        revisor_id=usuario.id,
        nome_arquivo=str(arquivo.filename or "anexo_mesa"),
        mime_type=str(arquivo.content_type or ""),
        conteudo_arquivo=conteudo_arquivo,
        texto=texto,
        referencia_mensagem_id=int(referencia_mensagem_id or 0) or None,
    )

    await notificar_inspetor_sse(
        inspetor_id=resultado.inspetor_id,
        laudo_id=resultado.laudo_id,
        tipo="mensagem_eng",
        texto=resultado.texto_notificacao,
        mensagem_id=resultado.mensagem_id,
        referencia_mensagem_id=resultado.referencia_mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    return JSONResponse(
        {
            "success": True,
            "mensagem": resultado.mensagem_payload,
        }
    )


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/mesa/anexos/{anexo_id}",
    responses={
        200: {
            "description": "Arquivo do anexo da mesa.",
            "content": {
                "application/pdf": {},
                "image/png": {},
                "image/jpeg": {},
                "image/webp": {},
                "application/octet-stream": {},
            },
        },
        404: {"description": "Anexo da mesa não encontrado."},
    },
)
async def baixar_anexo_mesa_revisor(
    laudo_id: int,
    anexo_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    anexo = carregar_anexo_mesa_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        anexo_id=anexo_id,
    )

    return FileResponse(
        path=str(anexo.caminho_arquivo),
        filename=str(anexo.nome_original or anexo.nome_arquivo or f"anexo_mesa_{anexo.id}"),
        media_type=str(anexo.mime_type or "application/octet-stream"),
    )


@roteador_revisor.post(
    "/api/laudo/{laudo_id}/marcar-whispers-lidos",
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
)
async def marcar_whispers_lidos(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    total = marcar_whispers_lidos_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
    )

    return JSONResponse({"success": True, "marcadas": total})


@roteador_revisor.patch(
    "/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
        404: {"description": "Pendência da mesa não encontrada."},
    },
)
async def atualizar_pendencia_mesa_revisor(
    laudo_id: int,
    mensagem_id: int,
    dados: DadosPendenciaMesa,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    resultado = atualizar_pendencia_mesa_revisor_status(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        mensagem_id=mensagem_id,
        lida=bool(dados.lida),
        revisor_id=usuario.id,
    )

    await notificar_inspetor_sse(
        inspetor_id=resultado.inspetor_id,
        laudo_id=resultado.laudo_id,
        tipo="pendencia_mesa",
        texto=resultado.texto_notificacao,
        mensagem_id=resultado.mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    return JSONResponse(
        {
            "success": True,
            "mensagem_id": resultado.mensagem_id,
            "lida": resultado.lida,
            "resolvida_por_id": resultado.resolvida_por_id,
            "resolvida_por_nome": resultado.resolvida_por_nome,
            "resolvida_em": resultado.resolvida_em,
            "pendencias_abertas": resultado.pendencias_abertas,
        }
    )


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/mensagens",
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
)
async def obter_historico_chat_revisor(
    laudo_id: int,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    return carregar_historico_chat_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        cursor=cursor,
        limite=limite,
    )


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/completo",
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
)
async def obter_laudo_completo(
    laudo_id: int,
    incluir_historico: bool = Query(default=False),
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    payload = carregar_laudo_completo_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        incluir_historico=incluir_historico,
        cursor=cursor,
        limite=limite,
    )
    return JSONResponse(payload)


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/pacote",
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
)
async def obter_pacote_mesa_laudo(
    laudo_id: int,
    request: Request,
    limite_whispers: int = Query(default=80, ge=20, le=300),
    limite_pendencias: int = Query(default=80, ge=20, le=300),
    limite_revisoes: int = Query(default=10, ge=1, le=50),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    validar_parametros_pacote_mesa(request.query_params.keys())
    pacote_carregado = carregar_pacote_mesa_laudo_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
    )
    return JSONResponse(pacote_carregado.pacote.model_dump(mode="json"))


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/pacote/exportar-pdf",
    responses={
        200: {"description": "PDF do pacote da mesa.", "content": {"application/pdf": {}}},
        404: {"description": "Laudo não encontrado."},
        500: {"description": "Falha ao exportar o PDF do pacote."},
    },
)
async def exportar_pacote_mesa_laudo_pdf(
    laudo_id: int,
    request: Request,
    limite_whispers: int = Query(default=80, ge=20, le=300),
    limite_pendencias: int = Query(default=80, ge=20, le=300),
    limite_revisoes: int = Query(default=10, ge=1, le=50),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    validar_parametros_pacote_mesa(request.query_params.keys())
    pacote_carregado = carregar_pacote_mesa_laudo_revisor(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
    )

    try:
        exportacao = gerar_exportacao_pacote_mesa_laudo_pdf(
            banco,
            pacote_carregado=pacote_carregado,
            usuario=usuario,
        )
        return FileResponse(
            path=exportacao.caminho_pdf,
            filename=exportacao.filename,
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, exportacao.caminho_pdf),
        )
    except Exception:
        logger.exception(
            "Falha ao exportar pacote da mesa em PDF | laudo_id=%s empresa_id=%s",
            laudo_id,
            usuario.empresa_id,
        )
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao exportar o PDF do pacote da mesa."},
        )


__all__ = [
    "atualizar_pendencia_mesa_revisor",
    "avaliar_laudo",
    "baixar_anexo_mesa_revisor",
    "exportar_pacote_mesa_laudo_pdf",
    "marcar_whispers_lidos",
    "obter_historico_chat_revisor",
    "obter_laudo_completo",
    "obter_pacote_mesa_laudo",
    "responder_chat_campo",
    "responder_chat_campo_com_anexo",
    "whisper_responder",
]
