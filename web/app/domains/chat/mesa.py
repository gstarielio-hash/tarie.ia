"""Rotas da mesa avaliadora no domínio do inspetor."""

from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal

from typing import Annotated

from fastapi import Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.routing import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.domains.chat.auth_helpers import usuario_nome
from app.domains.chat.app_context import logger
from app.domains.chat.core_helpers import (
    agora_utc,
    obter_preview_primeira_mensagem,
    resposta_json_ok,
)
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.laudo_state_helpers import (
    laudo_permite_edicao_inspetor,
    laudo_possui_historico_visivel,
    laudo_tem_interacao,
    serializar_card_laudo,
)
from app.domains.chat.mensagem_helpers import (
    notificar_mesa_whisper,
    serializar_mensagem_mesa,
)
from app.domains.chat.mesa_mobile_support import (
    carregar_mensagem_idempotente,
    carregar_mensagens_mesa_por_laudo_ids,
    montar_feed_mesa_mobile,
    normalizar_client_message_id,
    normalizar_cursor_atualizado_em,
    obter_request_id,
    serializar_estado_resumo_mesa_laudo,
)
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.mesa.attachments import (
    conteudo_mensagem_mesa_com_anexo,
    remover_arquivo_anexo_mesa,
    resumo_mensagem_mesa,
    salvar_arquivo_anexo_mesa,
)
from app.domains.chat.session_helpers import aplicar_contexto_laudo_selecionado, exigir_csrf
from app.domains.chat.schemas import DadosMesaMensagem
from app.shared.database import (
    AnexoMesa,
    MensagemLaudo,
    StatusRevisao,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_inspetor
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia

roteador_mesa = APIRouter()
RESPOSTA_LAUDO_NAO_ENCONTRADO = {404: {"description": "Laudo não encontrado."}}


async def listar_mensagens_mesa_laudo(
    laudo_id: int,
    request: Request,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    apos_id: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=40, ge=10, le=120),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
    if cursor and apos_id:
        raise HTTPException(status_code=400, detail="Use cursor ou apos_id, nunca ambos.")

    consulta = (
        select(MensagemLaudo)
        .where(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo.in_(
                (
                    TipoMensagem.HUMANO_INSP.value,
                    TipoMensagem.HUMANO_ENG.value,
                )
            ),
        )
        .options(selectinload(MensagemLaudo.anexos_mesa))
    )
    if apos_id:
        consulta = consulta.where(MensagemLaudo.id > apos_id)
    elif cursor:
        consulta = consulta.where(MensagemLaudo.id < cursor)

    if apos_id:
        mensagens_asc = list(
            banco.scalars(
                consulta.order_by(MensagemLaudo.id.asc()).limit(limite + 1)
            ).all()
        )
        tem_mais = len(mensagens_asc) > limite
        mensagens_pagina = mensagens_asc[:limite]
        cursor_proximo = mensagens_pagina[-1].id if tem_mais and mensagens_pagina else None
    else:
        mensagens_desc = list(
            banco.scalars(
                consulta.order_by(MensagemLaudo.id.desc()).limit(limite + 1)
            ).all()
        )
        tem_mais = len(mensagens_desc) > limite
        mensagens_pagina = list(reversed(mensagens_desc[:limite]))
        cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None
    mensagens_resumo = carregar_mensagens_mesa_por_laudo_ids(banco, [laudo_id]).get(laudo_id, [])
    estado_resumo = serializar_estado_resumo_mesa_laudo(
        banco,
        laudo=laudo,
        mensagens=mensagens_resumo,
    )

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "itens": [serializar_mensagem_mesa(item) for item in mensagens_pagina],
            "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
            "cursor_ultimo_id": estado_resumo["resumo"]["ultima_mensagem_id"],
            "tem_mais": tem_mais,
            "estado": contexto["estado"],
            "permite_edicao": contexto["permite_edicao"],
            "permite_reabrir": contexto["permite_reabrir"],
            "laudo_card": serializar_card_laudo(banco, laudo) if laudo_possui_historico_visivel(banco, laudo) else None,
            "resumo": estado_resumo["resumo"],
            "sync": {
                "modo": "delta" if apos_id else "full",
                "apos_id": int(apos_id) if apos_id else None,
                "cursor_ultimo_id": estado_resumo["resumo"]["ultima_mensagem_id"],
            },
        }
    )


async def enviar_mensagem_mesa_laudo(
    laudo_id: int,
    dados: DadosMesaMensagem,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    request_id = obter_request_id(request)

    if not laudo_permite_edicao_inspetor(laudo):
        if laudo.status_revisao == StatusRevisao.APROVADO.value:
            detalhe = "Laudo aprovado não pode receber novas mensagens."
        elif laudo.status_revisao == StatusRevisao.REJEITADO.value:
            detalhe = "Laudo em ajustes precisa ser reaberto antes de responder à mesa."
        elif getattr(laudo, "reabertura_pendente_em", None):
            detalhe = "Laudo com ajustes da mesa precisa ser reaberto antes de responder."
        else:
            detalhe = "Laudo aguardando avaliação não aceita novas mensagens até ser reaberto."
        raise HTTPException(status_code=400, detail=detalhe)

    texto_limpo = (dados.texto or "").strip()
    if not texto_limpo:
        raise HTTPException(status_code=400, detail="Mensagem para a mesa está vazia.")

    primeira_interacao_real = not laudo_tem_interacao(banco, laudo.id)
    client_message_id = normalizar_client_message_id(dados.client_message_id)
    mensagem_idempotente = carregar_mensagem_idempotente(
        banco,
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        client_message_id=client_message_id,
    )
    if mensagem_idempotente is not None:
        contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
        estado_resumo = serializar_estado_resumo_mesa_laudo(
            banco,
            laudo=laudo,
            mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo.id]).get(laudo.id, []),
        )
        return resposta_json_ok(
            {
                "laudo_id": laudo.id,
                "mensagem": serializar_mensagem_mesa(mensagem_idempotente),
                "laudo_card": estado_resumo["laudo_card"],
                "estado": contexto["estado"],
                "permite_edicao": contexto["permite_edicao"],
                "permite_reabrir": contexto["permite_reabrir"],
                "resumo": estado_resumo["resumo"],
                "request_id": request_id,
                "idempotent_replay": True,
            }
        )

    referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
    if referencia_mensagem_id:
        referencia_existe = banco.scalar(
            select(MensagemLaudo.id).where(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_mensagem_id,
            )
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    mensagem = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        tipo=TipoMensagem.HUMANO_INSP.value,
        conteudo=compor_texto_com_referencia(texto_limpo, referencia_mensagem_id),
        custo_api_reais=Decimal("0.0000"),
        client_message_id=client_message_id,
    )
    banco.add(mensagem)
    laudo.atualizado_em = agora_utc()
    if primeira_interacao_real:
        laudo.primeira_mensagem = obter_preview_primeira_mensagem(texto_limpo)
    try:
        banco.flush()
        banco.commit()
    except IntegrityError:
        banco.rollback()
        mensagem_idempotente = carregar_mensagem_idempotente(
            banco,
            laudo_id=laudo.id,
            remetente_id=usuario.id,
            client_message_id=client_message_id,
        )
        if mensagem_idempotente is not None:
            laudo_recarregado = obter_laudo_do_inspetor(banco, laudo_id, usuario)
            contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo_recarregado, usuario)
            estado_resumo = serializar_estado_resumo_mesa_laudo(
                banco,
                laudo=laudo_recarregado,
                mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo_recarregado.id]).get(laudo_recarregado.id, []),
            )
            return resposta_json_ok(
                {
                    "laudo_id": laudo_recarregado.id,
                    "mensagem": serializar_mensagem_mesa(mensagem_idempotente),
                    "laudo_card": estado_resumo["laudo_card"],
                    "estado": contexto["estado"],
                    "permite_edicao": contexto["permite_edicao"],
                    "permite_reabrir": contexto["permite_reabrir"],
                    "resumo": estado_resumo["resumo"],
                    "request_id": request_id,
                    "idempotent_replay": True,
                }
            )
        logger.error(
            "Falha de integridade ao confirmar envio de mensagem do inspetor para a mesa.",
            exc_info=True,
        )
        raise
    except Exception:
        banco.rollback()
        logger.error(
            "Falha ao confirmar envio de mensagem do inspetor para a mesa.",
            exc_info=True,
        )
        raise
    contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    await notificar_mesa_whisper(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        inspetor_id=usuario.id,
        inspetor_nome=usuario_nome(usuario),
        preview=texto_limpo,
    )

    payload = serializar_mensagem_mesa(mensagem)
    estado_resumo = serializar_estado_resumo_mesa_laudo(
        banco,
        laudo=laudo,
        mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo.id]).get(laudo.id, []),
    )
    return resposta_json_ok(
        {
            "laudo_id": laudo.id,
            "mensagem": payload,
            "laudo_card": estado_resumo["laudo_card"],
            "estado": contexto["estado"],
            "permite_edicao": contexto["permite_edicao"],
            "permite_reabrir": contexto["permite_reabrir"],
            "resumo": estado_resumo["resumo"],
            "request_id": request_id,
            "idempotent_replay": False,
        },
        status_code=201,
    )


async def enviar_mensagem_mesa_laudo_com_anexo(
    laudo_id: int,
    request: Request,
    arquivo: UploadFile = File(...),
    texto: str = Form(default=""),
    referencia_mensagem_id: Annotated[InteiroOpcionalNullish, Form()] = None,
    client_message_id: Annotated[str | None, Form()] = None,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    request_id = obter_request_id(request)

    if not laudo_permite_edicao_inspetor(laudo):
        if laudo.status_revisao == StatusRevisao.APROVADO.value:
            detalhe = "Laudo aprovado não pode receber novas mensagens."
        elif laudo.status_revisao == StatusRevisao.REJEITADO.value:
            detalhe = "Laudo em ajustes precisa ser reaberto antes de responder à mesa."
        elif getattr(laudo, "reabertura_pendente_em", None):
            detalhe = "Laudo com ajustes da mesa precisa ser reaberto antes de responder."
        else:
            detalhe = "Laudo aguardando avaliação não aceita novas mensagens até ser reaberto."
        raise HTTPException(status_code=400, detail=detalhe)

    texto_limpo = str(texto or "").strip()
    primeira_interacao_real = not laudo_tem_interacao(banco, laudo.id)
    client_message_id_normalizado = normalizar_client_message_id(client_message_id)
    mensagem_idempotente = carregar_mensagem_idempotente(
        banco,
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        client_message_id=client_message_id_normalizado,
    )
    if mensagem_idempotente is not None:
        contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
        estado_resumo = serializar_estado_resumo_mesa_laudo(
            banco,
            laudo=laudo,
            mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo.id]).get(laudo.id, []),
        )
        return resposta_json_ok(
            {
                "laudo_id": laudo.id,
                "mensagem": serializar_mensagem_mesa(mensagem_idempotente),
                "laudo_card": estado_resumo["laudo_card"],
                "estado": contexto["estado"],
                "permite_edicao": contexto["permite_edicao"],
                "permite_reabrir": contexto["permite_reabrir"],
                "resumo": estado_resumo["resumo"],
                "request_id": request_id,
                "idempotent_replay": True,
            }
        )

    referencia_id = int(referencia_mensagem_id or 0) or None
    if referencia_id:
        referencia_existe = banco.scalar(
            select(MensagemLaudo.id).where(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_id,
            )
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    conteudo_arquivo = await arquivo.read()
    dados_arquivo = salvar_arquivo_anexo_mesa(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        nome_original=str(arquivo.filename or "anexo_mesa"),
        mime_type=str(arquivo.content_type or ""),
        conteudo=conteudo_arquivo,
    )

    try:
        mensagem = MensagemLaudo(
            laudo_id=laudo.id,
            remetente_id=usuario.id,
            tipo=TipoMensagem.HUMANO_INSP.value,
            conteudo=compor_texto_com_referencia(
                conteudo_mensagem_mesa_com_anexo(texto_limpo),
                referencia_id,
            ),
            custo_api_reais=Decimal("0.0000"),
            client_message_id=client_message_id_normalizado,
        )
        banco.add(mensagem)
        banco.flush()

        anexo = AnexoMesa(
            laudo_id=laudo.id,
            mensagem_id=mensagem.id,
            enviado_por_id=usuario.id,
            nome_original=dados_arquivo["nome_original"],
            nome_arquivo=dados_arquivo["nome_arquivo"],
            mime_type=dados_arquivo["mime_type"],
            categoria=dados_arquivo["categoria"],
            tamanho_bytes=dados_arquivo["tamanho_bytes"],
            caminho_arquivo=dados_arquivo["caminho_arquivo"],
        )
        mensagem.anexos_mesa.append(anexo)

        laudo.atualizado_em = agora_utc()
        if primeira_interacao_real:
            laudo.primeira_mensagem = obter_preview_primeira_mensagem(
                texto_limpo,
                nome_documento=anexo.nome_original if anexo.categoria == "documento" else "",
                tem_imagem=anexo.categoria == "imagem",
            )
        banco.commit()
    except IntegrityError:
        banco.rollback()
        remover_arquivo_anexo_mesa(dados_arquivo.get("caminho_arquivo"))
        mensagem_idempotente = carregar_mensagem_idempotente(
            banco,
            laudo_id=laudo.id,
            remetente_id=usuario.id,
            client_message_id=client_message_id_normalizado,
        )
        if mensagem_idempotente is not None:
            laudo_recarregado = obter_laudo_do_inspetor(banco, laudo_id, usuario)
            contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo_recarregado, usuario)
            estado_resumo = serializar_estado_resumo_mesa_laudo(
                banco,
                laudo=laudo_recarregado,
                mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo_recarregado.id]).get(laudo_recarregado.id, []),
            )
            return resposta_json_ok(
                {
                    "laudo_id": laudo_recarregado.id,
                    "mensagem": serializar_mensagem_mesa(mensagem_idempotente),
                    "laudo_card": estado_resumo["laudo_card"],
                    "estado": contexto["estado"],
                    "permite_edicao": contexto["permite_edicao"],
                    "permite_reabrir": contexto["permite_reabrir"],
                    "resumo": estado_resumo["resumo"],
                    "request_id": request_id,
                    "idempotent_replay": True,
                }
            )
        logger.error(
            "Falha de integridade ao confirmar envio de anexo do inspetor para a mesa.",
            exc_info=True,
        )
        raise
    except Exception:
        banco.rollback()
        remover_arquivo_anexo_mesa(dados_arquivo.get("caminho_arquivo"))
        logger.error(
            "Falha ao confirmar envio de anexo do inspetor para a mesa.",
            exc_info=True,
        )
        raise

    contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
    preview = resumo_mensagem_mesa(mensagem.conteudo, anexos=[anexo])

    await notificar_mesa_whisper(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        inspetor_id=usuario.id,
        inspetor_nome=usuario_nome(usuario),
        preview=preview,
    )

    payload = serializar_mensagem_mesa(mensagem)
    estado_resumo = serializar_estado_resumo_mesa_laudo(
        banco,
        laudo=laudo,
        mensagens=carregar_mensagens_mesa_por_laudo_ids(banco, [laudo.id]).get(laudo.id, []),
    )
    return resposta_json_ok(
        {
            "laudo_id": laudo.id,
            "mensagem": payload,
            "laudo_card": estado_resumo["laudo_card"],
            "estado": contexto["estado"],
            "permite_edicao": contexto["permite_edicao"],
            "permite_reabrir": contexto["permite_reabrir"],
            "resumo": estado_resumo["resumo"],
            "request_id": request_id,
            "idempotent_replay": False,
        },
        status_code=201,
    )


async def obter_resumo_mesa_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
    mensagens = carregar_mensagens_mesa_por_laudo_ids(banco, [laudo_id]).get(laudo_id, [])
    return resposta_json_ok(
        serializar_estado_resumo_mesa_laudo(
            banco,
            laudo=laudo,
            mensagens=mensagens,
        )
    )


def _parse_laudo_ids_feed(laudo_ids: str) -> list[int]:
    ids: list[int] = []
    for parte in str(laudo_ids or "").split(","):
        valor = parte.strip()
        if not valor:
            continue
        try:
            laudo_id = int(valor)
        except ValueError as erro:
            raise HTTPException(status_code=400, detail="laudo_ids inválido.") from erro
        if laudo_id > 0 and laudo_id not in ids:
            ids.append(laudo_id)
    return ids


async def feed_mesa_mobile(
    laudo_ids: str = Query(default=""),
    cursor_atualizado_em: datetime | None = Query(default=None),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    return resposta_json_ok(
        montar_feed_mesa_mobile(
            banco,
            usuario=usuario,
            laudo_ids=_parse_laudo_ids_feed(laudo_ids),
            cursor_atualizado_em=normalizar_cursor_atualizado_em(cursor_atualizado_em),
        )
    )


async def baixar_anexo_mesa_laudo(
    laudo_id: int,
    anexo_id: int,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    anexo = banco.scalar(
        select(AnexoMesa).where(
            AnexoMesa.id == anexo_id,
            AnexoMesa.laudo_id == laudo.id,
        )
    )
    if not anexo or not str(anexo.caminho_arquivo or "").strip() or not os.path.isfile(str(anexo.caminho_arquivo)):
        raise HTTPException(status_code=404, detail="Anexo da mesa não encontrado.")

    return FileResponse(
        path=str(anexo.caminho_arquivo),
        filename=str(anexo.nome_original or anexo.nome_arquivo or f"anexo_mesa_{anexo.id}"),
        media_type=str(anexo.mime_type or "application/octet-stream"),
    )


listar_mensagens_mesa = listar_mensagens_mesa_laudo
enviar_mensagem_mesa = enviar_mensagem_mesa_laudo

roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagens",
    listar_mensagens_mesa_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/resumo",
    obter_resumo_mesa_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagem",
    enviar_mensagem_mesa_laudo,
    methods=["POST"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        201: {"description": "Mensagem enviada para a mesa."},
        400: {"description": "Mensagem inválida para o canal da mesa."},
    },
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/anexo",
    enviar_mensagem_mesa_laudo_com_anexo,
    methods=["POST"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        201: {"description": "Anexo enviado para a mesa."},
        400: {"description": "Corpo multipart inválido."},
        413: {"description": "Anexo acima do limite permitido."},
        415: {"description": "Tipo de arquivo não suportado."},
    },
)
roteador_mesa.add_api_route(
    "/api/mobile/mesa/feed",
    feed_mesa_mobile,
    methods=["GET"],
    responses={400: {"description": "Parâmetros inválidos para o feed da mesa."}},
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/anexos/{anexo_id}",
    baixar_anexo_mesa_laudo,
    methods=["GET"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        200: {
            "description": "Download do anexo da mesa.",
            "content": {
                "application/pdf": {},
                "image/png": {},
                "image/jpeg": {},
                "image/webp": {},
                "application/octet-stream": {},
            },
        },
    },
)

__all__ = [
    "roteador_mesa",
    "listar_mensagens_mesa_laudo",
    "listar_mensagens_mesa",
    "enviar_mensagem_mesa_laudo",
    "enviar_mensagem_mesa",
    "enviar_mensagem_mesa_laudo_com_anexo",
    "obter_resumo_mesa_laudo",
    "feed_mesa_mobile",
    "baixar_anexo_mesa_laudo",
]
