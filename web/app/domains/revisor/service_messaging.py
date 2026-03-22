from __future__ import annotations

import os

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.mesa.attachments import (
    conteudo_mensagem_mesa_com_anexo,
    remover_arquivo_anexo_mesa,
    resumo_mensagem_mesa,
    salvar_arquivo_anexo_mesa,
)
from app.domains.revisor.base import (
    _agora_utc,
    _marcar_whispers_lidos_laudo,
    _nome_resolvedor_mensagem,
    _registrar_mensagem_revisor,
    _serializar_mensagem,
    _validar_destinatario_whisper,
    logger,
)
from app.domains.revisor.common import _obter_laudo_empresa
from app.domains.revisor.service_contracts import (
    AvaliacaoLaudoResult,
    PendenciaMesaResult,
    RespostaChatAnexoResult,
    RespostaChatResult,
    WhisperRespostaResult,
)
from app.shared.database import AnexoMesa, MensagemLaudo, StatusRevisao, TipoMensagem, commit_ou_rollback_operacional
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia


def garantir_referencia_mensagem(
    banco: Session,
    *,
    laudo_id: int,
    referencia_mensagem_id: int | None,
) -> None:
    if not referencia_mensagem_id:
        return

    referencia_existe = banco.scalar(
        select(MensagemLaudo.id).where(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.id == referencia_mensagem_id,
        )
    )
    if not referencia_existe:
        raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")


def avaliar_laudo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    revisor_id: int,
    revisor_nome: str,
    acao: str,
    motivo: str,
    resposta_api: bool,
    modo_schemathesis: bool,
) -> AvaliacaoLaudoResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)

    if laudo.status_revisao != StatusRevisao.AGUARDANDO.value and not modo_schemathesis:
        raise HTTPException(status_code=400, detail="Laudo não está aguardando avaliação.")

    acao_normalizada = str(acao or "").strip().lower()
    motivo_normalizado = str(motivo or "").strip()
    texto_notificacao_inspetor = ""
    conteudo_notificacao = ""
    status_destino = laudo.status_revisao
    motivo_rejeicao = laudo.motivo_rejeicao

    if acao_normalizada == "aprovar":
        status_destino = StatusRevisao.APROVADO.value
        motivo_rejeicao = None
        texto_notificacao_inspetor = "✅ Seu laudo foi aprovado pela mesa avaliadora."
        conteudo_notificacao = "✅ **APROVADO!** Laudo finalizado e liberado com ART."
        logger.info("Laudo aprovado | laudo=%s | revisor=%s", laudo_id, revisor_nome)
    elif acao_normalizada == "rejeitar":
        if not motivo_normalizado:
            if resposta_api:
                motivo_normalizado = "Devolvido pela mesa sem motivo detalhado."
            else:
                raise HTTPException(status_code=400, detail="Motivo obrigatório.")

        status_destino = StatusRevisao.REJEITADO.value
        motivo_rejeicao = motivo_normalizado
        texto_notificacao_inspetor = f"⚠️ Seu laudo foi rejeitado. Motivo: {motivo_normalizado}"
        conteudo_notificacao = f"⚠️ **REJEITADO** Motivo: {motivo_normalizado}\n\nCorrija e reenvie."
        logger.info("Laudo rejeitado | laudo=%s | revisor=%s", laudo_id, revisor_nome)
    else:
        raise HTTPException(status_code=400, detail="Ação inválida.")

    if modo_schemathesis:
        return AvaliacaoLaudoResult(
            laudo_id=laudo.id,
            acao=acao_normalizada,
            status_revisao=status_destino,
            motivo=motivo_rejeicao or "",
            modo_schemathesis=True,
        )

    laudo.status_revisao = status_destino
    laudo.revisado_por = revisor_id
    laudo.motivo_rejeicao = motivo_rejeicao
    laudo.reabertura_pendente_em = _agora_utc() if status_destino == StatusRevisao.REJEITADO.value else None
    laudo.atualizado_em = _agora_utc()

    mensagem_notificacao = _registrar_mensagem_revisor(
        banco,
        laudo_id=laudo.id,
        usuario_id=revisor_id,
        tipo=TipoMensagem.HUMANO_ENG,
        conteudo=conteudo_notificacao,
    )

    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar avaliacao do laudo pela mesa.",
    )
    return AvaliacaoLaudoResult(
        laudo_id=laudo.id,
        acao=acao_normalizada,
        status_revisao=laudo.status_revisao,
        motivo=laudo.motivo_rejeicao or "",
        modo_schemathesis=False,
        inspetor_id=laudo.usuario_id,
        mensagem_id=mensagem_notificacao.id if mensagem_notificacao else None,
        texto_notificacao_inspetor=texto_notificacao_inspetor,
    )


def registrar_whisper_resposta_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    revisor_id: int,
    mensagem: str,
    destinatario_id: int,
    referencia_mensagem_id: int | None,
) -> WhisperRespostaResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    destinatario = _validar_destinatario_whisper(
        banco,
        destinatario_id=destinatario_id,
        empresa_id=empresa_id,
        laudo=laudo,
    )
    garantir_referencia_mensagem(
        banco,
        laudo_id=laudo.id,
        referencia_mensagem_id=referencia_mensagem_id,
    )

    texto_mensagem = str(mensagem or "").strip()
    mensagem_salva = _registrar_mensagem_revisor(
        banco,
        laudo_id=laudo.id,
        usuario_id=revisor_id,
        tipo=TipoMensagem.HUMANO_ENG,
        conteudo=compor_texto_com_referencia(
            f"💬 **Engenharia:** {texto_mensagem}",
            referencia_mensagem_id,
        ),
    )
    laudo.atualizado_em = _agora_utc()
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar whisper da mesa.",
    )

    return WhisperRespostaResult(
        laudo_id=laudo.id,
        destinatario_id=destinatario.id,
        mensagem_id=mensagem_salva.id,
        referencia_mensagem_id=referencia_mensagem_id,
        preview=texto_mensagem[:120],
    )


def registrar_resposta_chat_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    revisor_id: int,
    texto: str,
    referencia_mensagem_id: int | None,
    revisor_nome: str,
) -> RespostaChatResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    texto_limpo = str(texto or "").strip()
    if not texto_limpo:
        raise HTTPException(status_code=400, detail="Mensagem vazia.")

    garantir_referencia_mensagem(
        banco,
        laudo_id=laudo.id,
        referencia_mensagem_id=referencia_mensagem_id,
    )

    mensagem_salva = _registrar_mensagem_revisor(
        banco,
        laudo_id=laudo.id,
        usuario_id=revisor_id,
        tipo=TipoMensagem.HUMANO_ENG,
        conteudo=compor_texto_com_referencia(texto_limpo, referencia_mensagem_id),
    )
    if laudo.status_revisao == StatusRevisao.AGUARDANDO.value:
        laudo.reabertura_pendente_em = _agora_utc()
    laudo.atualizado_em = _agora_utc()
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar resposta textual da mesa.",
    )

    logger.info(
        "Chat engenharia | laudo=%s | revisor=%s | len=%d",
        laudo_id,
        revisor_nome,
        len(texto_limpo),
    )
    return RespostaChatResult(
        laudo_id=laudo.id,
        inspetor_id=laudo.usuario_id,
        mensagem_id=mensagem_salva.id,
        referencia_mensagem_id=referencia_mensagem_id,
        texto_notificacao=texto_limpo,
    )


def registrar_resposta_chat_com_anexo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    revisor_id: int,
    nome_arquivo: str,
    mime_type: str,
    conteudo_arquivo: bytes,
    texto: str,
    referencia_mensagem_id: int | None,
) -> RespostaChatAnexoResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    texto_limpo = str(texto or "").strip()
    garantir_referencia_mensagem(
        banco,
        laudo_id=laudo.id,
        referencia_mensagem_id=referencia_mensagem_id,
    )

    dados_arquivo = salvar_arquivo_anexo_mesa(
        empresa_id=empresa_id,
        laudo_id=laudo.id,
        nome_original=nome_arquivo,
        mime_type=mime_type,
        conteudo=conteudo_arquivo,
    )

    try:
        mensagem_salva = _registrar_mensagem_revisor(
            banco,
            laudo_id=laudo.id,
            usuario_id=revisor_id,
            tipo=TipoMensagem.HUMANO_ENG,
            conteudo=compor_texto_com_referencia(
                conteudo_mensagem_mesa_com_anexo(texto_limpo),
                referencia_mensagem_id,
            ),
        )
        banco.flush()

        anexo = AnexoMesa(
            laudo_id=laudo.id,
            mensagem_id=mensagem_salva.id,
            enviado_por_id=revisor_id,
            nome_original=dados_arquivo["nome_original"],
            nome_arquivo=dados_arquivo["nome_arquivo"],
            mime_type=dados_arquivo["mime_type"],
            categoria=dados_arquivo["categoria"],
            tamanho_bytes=dados_arquivo["tamanho_bytes"],
            caminho_arquivo=dados_arquivo["caminho_arquivo"],
        )
        mensagem_salva.anexos_mesa.append(anexo)

        if laudo.status_revisao == StatusRevisao.AGUARDANDO.value:
            laudo.reabertura_pendente_em = _agora_utc()
        laudo.atualizado_em = _agora_utc()
        commit_ou_rollback_operacional(
            banco,
            logger_operacao=logger,
            mensagem_erro="Falha ao confirmar resposta da mesa com anexo.",
        )
    except Exception:
        banco.rollback()
        remover_arquivo_anexo_mesa(dados_arquivo.get("caminho_arquivo"))
        raise

    resumo_notificacao = resumo_mensagem_mesa(
        mensagem_salva.conteudo,
        anexos=[anexo],
    )
    return RespostaChatAnexoResult(
        laudo_id=laudo.id,
        inspetor_id=laudo.usuario_id,
        mensagem_id=mensagem_salva.id,
        referencia_mensagem_id=referencia_mensagem_id,
        texto_notificacao=resumo_notificacao,
        mensagem_payload=_serializar_mensagem(mensagem_salva, com_data_longa=True),
    )


def carregar_anexo_mesa_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    anexo_id: int,
) -> AnexoMesa:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    anexo = (
        banco.query(AnexoMesa)
        .filter(
            AnexoMesa.id == anexo_id,
            AnexoMesa.laudo_id == laudo.id,
        )
        .first()
    )
    if not anexo or not str(anexo.caminho_arquivo or "").strip() or not os.path.isfile(str(anexo.caminho_arquivo)):
        raise HTTPException(status_code=404, detail="Anexo da mesa não encontrado.")
    return anexo


def marcar_whispers_lidos_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
) -> int:
    _obter_laudo_empresa(banco, laudo_id, empresa_id)
    total = _marcar_whispers_lidos_laudo(banco, laudo_id=laudo_id)
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao marcar whispers da mesa como lidos.",
    )
    return total


def atualizar_pendencia_mesa_revisor_status(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    mensagem_id: int,
    lida: bool,
    revisor_id: int,
) -> PendenciaMesaResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    mensagem = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.id == mensagem_id,
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
        )
        .first()
    )
    if not mensagem:
        raise HTTPException(status_code=404, detail="Pendência da mesa não encontrada.")

    mensagem.lida = bool(lida)
    if mensagem.lida:
        mensagem.resolvida_por_id = revisor_id
        mensagem.resolvida_em = _agora_utc()
        texto_notificacao = f"Pendência #{mensagem.id} marcada como resolvida pela mesa."
    else:
        mensagem.resolvida_por_id = None
        mensagem.resolvida_em = None
        texto_notificacao = f"Pendência #{mensagem.id} foi reaberta pela mesa."

    laudo.atualizado_em = _agora_utc()
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao atualizar status da pendencia da mesa.",
    )
    banco.refresh(mensagem)

    pendencias_abertas = (
        banco.query(func.count(MensagemLaudo.id))
        .filter(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .scalar()
        or 0
    )

    return PendenciaMesaResult(
        laudo_id=laudo.id,
        mensagem_id=mensagem.id,
        lida=bool(mensagem.lida),
        resolvida_por_id=mensagem.resolvida_por_id,
        resolvida_por_nome=_nome_resolvedor_mensagem(mensagem),
        resolvida_em=mensagem.resolvida_em.isoformat() if mensagem.resolvida_em else "",
        pendencias_abertas=int(pendencias_abertas),
        inspetor_id=laudo.usuario_id,
        texto_notificacao=texto_notificacao,
    )


__all__ = [
    "atualizar_pendencia_mesa_revisor_status",
    "avaliar_laudo_revisor",
    "carregar_anexo_mesa_revisor",
    "garantir_referencia_mensagem",
    "marcar_whispers_lidos_revisor",
    "registrar_resposta_chat_com_anexo_revisor",
    "registrar_resposta_chat_revisor",
    "registrar_whisper_resposta_revisor",
]
