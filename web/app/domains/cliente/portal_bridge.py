"""Contrato explícito de integrações do portal cliente com outros domínios."""

from __future__ import annotations

from fastapi import Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.domains.chat.chat import rota_chat
from app.domains.chat.chat_service import (
    obter_mensagens_laudo_payload,
    processar_upload_documento,
)
from app.domains.chat.laudo_service import (
    RESPOSTA_GATE_QUALIDADE_REPROVADO,
    RESPOSTA_LAUDO_NAO_ENCONTRADO,
    finalizar_relatorio_resposta,
    iniciar_relatorio_resposta,
    obter_gate_qualidade_laudo_resposta,
    obter_status_relatorio_resposta,
    reabrir_laudo_resposta,
)
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.chat.schemas import DadosChat
from app.domains.revisor.base import (
    DadosPendenciaMesa,
    DadosRespostaChat,
    RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
)
from app.domains.revisor.mesa_api import (
    atualizar_pendencia_mesa_revisor,
    avaliar_laudo,
    baixar_anexo_mesa_revisor,
    marcar_whispers_lidos,
    obter_historico_chat_revisor,
    obter_laudo_completo,
    obter_pacote_mesa_laudo,
    responder_chat_campo,
    responder_chat_campo_com_anexo,
)
from app.shared.database import Usuario


async def api_status_relatorio_cliente(*, request: Request, usuario: Usuario, banco: Session) -> JSONResponse:
    payload, status_code = await obter_status_relatorio_resposta(
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def api_iniciar_relatorio_cliente(
    *,
    request: Request,
    tipo_template: str,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    payload, status_code = await iniciar_relatorio_resposta(
        request=request,
        tipo_template=tipo_template,
        tipotemplate=None,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def obter_mensagens_laudo_cliente(
    *,
    laudo_id: int,
    request: Request,
    cursor: InteiroOpcionalNullish,
    limite: int,
    usuario: Usuario,
    banco: Session,
) -> dict[str, object]:
    return await obter_mensagens_laudo_payload(
        laudo_id=laudo_id,
        request=request,
        cursor=int(cursor) if cursor is not None else None,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )


async def rota_upload_doc_cliente(
    *,
    request: Request,
    arquivo: UploadFile,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    payload, status_code = await processar_upload_documento(
        arquivo=arquivo,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def rota_chat_cliente(
    *,
    dados: DadosChat,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await rota_chat(
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


async def api_obter_gate_qualidade_laudo_cliente(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    payload, status_code = obter_gate_qualidade_laudo_resposta(
        laudo_id=laudo_id,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def api_finalizar_relatorio_cliente(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    payload, status_code = await finalizar_relatorio_resposta(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def api_reabrir_laudo_cliente(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    payload, status_code = await reabrir_laudo_resposta(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def obter_historico_chat_revisor_cliente(
    *,
    laudo_id: int,
    cursor: InteiroOpcionalNullish,
    limite: int,
    usuario: Usuario,
    banco: Session,
) -> dict[str, object]:
    return await obter_historico_chat_revisor(
        laudo_id=laudo_id,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )


async def obter_laudo_completo_cliente(
    *,
    laudo_id: int,
    incluir_historico: bool,
    cursor: InteiroOpcionalNullish,
    limite: int,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await obter_laudo_completo(
        laudo_id=laudo_id,
        incluir_historico=incluir_historico,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )


async def obter_pacote_mesa_laudo_cliente(
    *,
    laudo_id: int,
    request: Request,
    limite_whispers: int,
    limite_pendencias: int,
    limite_revisoes: int,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await obter_pacote_mesa_laudo(
        laudo_id=laudo_id,
        request=request,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
        usuario=usuario,
        banco=banco,
    )


async def responder_chat_campo_cliente(
    *,
    laudo_id: int,
    dados: DadosRespostaChat,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await responder_chat_campo(
        laudo_id=laudo_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


async def responder_chat_campo_com_anexo_cliente(
    *,
    laudo_id: int,
    request: Request,
    arquivo: UploadFile,
    texto: str,
    referencia_mensagem_id: InteiroOpcionalNullish,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await responder_chat_campo_com_anexo(
        laudo_id=laudo_id,
        request=request,
        arquivo=arquivo,
        texto=texto,
        referencia_mensagem_id=referencia_mensagem_id,
        usuario=usuario,
        banco=banco,
    )


async def atualizar_pendencia_mesa_cliente(
    *,
    laudo_id: int,
    mensagem_id: int,
    dados: DadosPendenciaMesa,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await atualizar_pendencia_mesa_revisor(
        laudo_id=laudo_id,
        mensagem_id=mensagem_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


async def avaliar_laudo_cliente(
    *,
    laudo_id: int,
    request: Request,
    acao: str,
    motivo: str,
    csrf_token: str,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await avaliar_laudo(
        laudo_id=laudo_id,
        request=request,
        acao=acao,
        motivo=motivo,
        csrf_token=csrf_token,
        usuario=usuario,
        banco=banco,
    )


async def marcar_whispers_lidos_cliente(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> JSONResponse:
    return await marcar_whispers_lidos(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )


async def baixar_anexo_mesa_cliente(
    *,
    laudo_id: int,
    anexo_id: int,
    usuario: Usuario,
    banco: Session,
):
    return await baixar_anexo_mesa_revisor(
        laudo_id=laudo_id,
        anexo_id=anexo_id,
        usuario=usuario,
        banco=banco,
    )


__all__ = [
    "DadosChat",
    "DadosPendenciaMesa",
    "DadosRespostaChat",
    "InteiroOpcionalNullish",
    "RESPOSTA_GATE_QUALIDADE_REPROVADO",
    "RESPOSTA_LAUDO_NAO_ENCONTRADO",
    "RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR",
    "api_finalizar_relatorio_cliente",
    "api_iniciar_relatorio_cliente",
    "api_obter_gate_qualidade_laudo_cliente",
    "api_reabrir_laudo_cliente",
    "api_status_relatorio_cliente",
    "atualizar_pendencia_mesa_cliente",
    "avaliar_laudo_cliente",
    "baixar_anexo_mesa_cliente",
    "marcar_whispers_lidos_cliente",
    "obter_historico_chat_revisor_cliente",
    "obter_laudo_completo_cliente",
    "obter_mensagens_laudo_cliente",
    "obter_pacote_mesa_laudo_cliente",
    "responder_chat_campo_cliente",
    "responder_chat_campo_com_anexo_cliente",
    "rota_chat_cliente",
    "rota_upload_doc_cliente",
]
