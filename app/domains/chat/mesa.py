"""Rotas da mesa avaliadora no domínio do inspetor."""

from __future__ import annotations

from decimal import Decimal

from fastapi import Depends, HTTPException, Query, Request
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.domains.chat.mensagem_helpers import (
    notificar_mesa_whisper,
    serializar_mensagem_mesa,
)
from app.domains.chat.session_helpers import exigir_csrf
from app.domains.chat.routes import (
    agora_utc,
    obter_laudo_do_inspetor,
    resposta_json_ok,
    usuario_nome,
)
from app.domains.chat.schemas import DadosMesaMensagem
from app.shared.database import MensagemLaudo, TipoMensagem, Usuario, obter_banco
from app.shared.security import exigir_inspetor
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia

roteador_mesa = APIRouter()


async def listar_mensagens_mesa_laudo(
    laudo_id: int,
    cursor: int | None = Query(default=None, gt=0),
    limite: int = Query(default=40, ge=10, le=120),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    consulta = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        MensagemLaudo.tipo.in_(
            (
                TipoMensagem.HUMANO_INSP.value,
                TipoMensagem.HUMANO_ENG.value,
            )
        ),
    )
    if cursor:
        consulta = consulta.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))
    cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "itens": [serializar_mensagem_mesa(item) for item in mensagens_pagina],
            "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
            "tem_mais": tem_mais,
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

    texto_limpo = (dados.texto or "").strip()
    if not texto_limpo:
        raise HTTPException(status_code=400, detail="Mensagem para a mesa está vazia.")

    referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
    if referencia_mensagem_id:
        referencia_existe = (
            banco.query(MensagemLaudo.id)
            .filter(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_mensagem_id,
            )
            .first()
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    mensagem = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        tipo=TipoMensagem.HUMANO_INSP.value,
        conteudo=compor_texto_com_referencia(texto_limpo, referencia_mensagem_id),
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(mensagem)
    laudo.atualizado_em = agora_utc()
    banco.commit()

    await notificar_mesa_whisper(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        inspetor_id=usuario.id,
        inspetor_nome=usuario_nome(usuario),
        preview=texto_limpo,
    )

    payload = serializar_mensagem_mesa(mensagem)
    return resposta_json_ok({"laudo_id": laudo.id, "mensagem": payload}, status_code=201)


listar_mensagens_mesa = listar_mensagens_mesa_laudo
enviar_mensagem_mesa = enviar_mensagem_mesa_laudo

roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagens",
    listar_mensagens_mesa_laudo,
    methods=["GET"],
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagem",
    enviar_mensagem_mesa_laudo,
    methods=["POST"],
)

__all__ = [
    "roteador_mesa",
    "listar_mensagens_mesa_laudo",
    "listar_mensagens_mesa",
    "enviar_mensagem_mesa_laudo",
    "enviar_mensagem_mesa",
]
