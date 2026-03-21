"""Serviços reutilizáveis do domínio de chat do inspetor."""

from __future__ import annotations

import io
from typing import Any, TypeAlias

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.domains.chat.chat_runtime import (
    LIMITE_DOC_BYTES,
    LIMITE_DOC_CHARS,
    MIME_DOC_PERMITIDOS,
    MODO_DETALHADO,
    TEM_DOCX,
    TEM_PYPDF,
    leitor_docx,
    leitor_pdf,
)
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.laudo_state_helpers import (
    laudo_possui_historico_visivel,
    serializar_card_laudo,
)
from app.domains.chat.limits_helpers import garantir_upload_documento_habilitado
from app.domains.chat.media_helpers import nome_documento_seguro
from app.domains.chat.mensagem_helpers import serializar_historico_mensagem
from app.domains.chat.session_helpers import aplicar_contexto_laudo_selecionado
from app.shared.database import CitacaoLaudo, MensagemLaudo, TipoMensagem, Usuario
from nucleo.inspetor.confianca_ia import normalizar_payload_confianca_ia

PayloadJson: TypeAlias = dict[str, Any]
ResultadoJson: TypeAlias = tuple[PayloadJson, int]


async def obter_mensagens_laudo_payload(
    *,
    laudo_id: int,
    request: Request,
    cursor: int | None,
    limite: int,
    usuario: Usuario,
    banco: Session,
) -> PayloadJson:
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    estado_contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
    card_laudo = serializar_card_laudo(banco, laudo) if laudo_possui_historico_visivel(banco, laudo) else None

    citacoes_laudo = (
        banco.query(CitacaoLaudo)
        .filter(CitacaoLaudo.laudo_id == laudo_id)
        .order_by(CitacaoLaudo.ordem.asc())
        .all()
    )

    citacoes_list = [
        {
            "norma": cit.referencia,
            "trecho": cit.trecho or "",
            "artigo": "",
            "url": cit.url or "",
        }
        for cit in citacoes_laudo
    ]

    consulta_mensagens = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        ~MensagemLaudo.tipo.in_(
            (
                TipoMensagem.HUMANO_INSP.value,
                TipoMensagem.HUMANO_ENG.value,
            )
        ),
    )
    if cursor:
        consulta_mensagens = consulta_mensagens.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta_mensagens.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))
    cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None

    if not mensagens_pagina and not cursor:
        historico: list[PayloadJson] = []

        if laudo.primeira_mensagem:
            historico.append(
                {
                    "id": None,
                    "papel": "usuario",
                    "texto": laudo.primeira_mensagem,
                    "tipo": TipoMensagem.USER.value,
                }
            )

        if laudo.parecer_ia:
            historico.append(
                {
                    "id": None,
                    "papel": "assistente",
                    "texto": laudo.parecer_ia,
                    "modo": laudo.modo_resposta or MODO_DETALHADO,
                    "tipo": TipoMensagem.IA.value,
                    "citacoes": citacoes_list,
                    "confianca_ia": normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {}),
                }
            )

        return {
            "itens": historico,
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
            "estado": estado_contexto["estado"],
            "status_card": estado_contexto["status_card"],
            "permite_edicao": estado_contexto["permite_edicao"],
            "permite_reabrir": estado_contexto["permite_reabrir"],
            "laudo_card": card_laudo,
        }

    if not mensagens_pagina:
        return {
            "itens": [],
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
            "estado": estado_contexto["estado"],
            "status_card": estado_contexto["status_card"],
            "permite_edicao": estado_contexto["permite_edicao"],
            "permite_reabrir": estado_contexto["permite_reabrir"],
            "laudo_card": card_laudo,
        }

    ultima_ia_id = (
        banco.query(MensagemLaudo.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.IA.value,
        )
        .order_by(MensagemLaudo.id.desc())
        .limit(1)
        .scalar()
    )

    resultado: list[PayloadJson] = []
    for mensagem in mensagens_pagina:
        entrada = serializar_historico_mensagem(
            mensagem,
            laudo.modo_resposta or MODO_DETALHADO,
            citacoes_list if (mensagem.id == ultima_ia_id and citacoes_list) else None,
            normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
            if mensagem.id == ultima_ia_id and mensagem.tipo == TipoMensagem.IA.value
            else None,
        )
        resultado.append(entrada)

    return {
        "itens": resultado,
        "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
        "tem_mais": tem_mais,
        "laudo_id": laudo_id,
        "limite": limite,
        "estado": estado_contexto["estado"],
        "status_card": estado_contexto["status_card"],
        "permite_edicao": estado_contexto["permite_edicao"],
        "permite_reabrir": estado_contexto["permite_reabrir"],
        "laudo_card": card_laudo,
    }


async def processar_upload_documento(
    *,
    arquivo: UploadFile,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
    if not usuario.empresa:
        raise HTTPException(status_code=403, detail="Empresa não configurada.")

    garantir_upload_documento_habilitado(usuario, banco)

    tipo = (arquivo.content_type or "").strip().lower()
    if tipo not in MIME_DOC_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Use PDF ou DOCX.")

    if tipo == "application/pdf" and not TEM_PYPDF:
        raise HTTPException(status_code=501, detail="Leitura de PDF indisponível.")

    if tipo != "application/pdf" and not TEM_DOCX:
        raise HTTPException(status_code=501, detail="Leitura de DOCX indisponível.")

    conteudo = await arquivo.read()
    if len(conteudo) > LIMITE_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande.")

    try:
        if tipo == "application/pdf":
            leitor = leitor_pdf.PdfReader(io.BytesIO(conteudo))
            texto = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
        else:
            documento = leitor_docx.Document(io.BytesIO(conteudo))
            texto = "\n".join(paragrafo.text for paragrafo in documento.paragraphs)
    except Exception:
        raise HTTPException(status_code=422, detail="Não foi possível extrair texto.")

    texto_bruto = (texto or "").strip()
    if not texto_bruto:
        raise HTTPException(status_code=422, detail="Documento sem texto extraível.")

    texto_truncado = texto_bruto[:LIMITE_DOC_CHARS]
    nome_seguro = nome_documento_seguro(arquivo.filename or "documento")

    return (
        {
            "texto": texto_truncado,
            "chars": len(texto_truncado),
            "nome": nome_seguro,
            "truncado": len(texto_bruto) > LIMITE_DOC_CHARS,
        },
        200,
    )


__all__ = [
    "ResultadoJson",
    "obter_mensagens_laudo_payload",
    "processar_upload_documento",
]
