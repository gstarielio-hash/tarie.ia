"""Serviços de aplicação do domínio Mesa Avaliadora."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.domains.mesa.contracts import (
    EventoMesa,
    MensagemPacoteMesa,
    NotificacaoMesa,
    PacoteMesaLaudo,
    ResumoEvidenciasMesa,
    ResumoMensagensMesa,
    ResumoPendenciasMesa,
    RevisaoPacoteMesa,
)
from app.shared.database import Laudo, LaudoRevisao, MensagemLaudo, TipoMensagem
from nucleo.inspetor.referencias_mensagem import extrair_referencia_do_texto

REGEX_ARQUIVO_DOCUMENTO = re.compile(r"\.(?:pdf|docx?)\b", flags=re.IGNORECASE)


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_data_utc(data: datetime | None) -> datetime | None:
    if data is None:
        return None
    if data.tzinfo is None:
        return data.replace(tzinfo=timezone.utc)
    return data.astimezone(timezone.utc)


def _texto_eh_foto(conteudo: str) -> bool:
    texto = (conteudo or "").strip().lower()
    return texto in {"[imagem]", "imagem enviada", "[foto]"}


def _texto_eh_evidencia_textual(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if _texto_eh_foto(texto):
        return False
    if _texto_representa_documento(texto):
        return False
    return len(texto) >= 8


def _texto_representa_documento(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if texto.lower().startswith("documento:"):
        return True
    return bool(REGEX_ARQUIVO_DOCUMENTO.search(texto))


def _serializar_mensagem_pacote(msg: MensagemLaudo) -> MensagemPacoteMesa:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(msg.conteudo)
    return MensagemPacoteMesa(
        id=int(msg.id),
        tipo=str(msg.tipo or ""),
        texto=texto_limpo,
        criado_em=_normalizar_data_utc(msg.criado_em) or agora_utc(),
        remetente_id=int(msg.remetente_id) if msg.remetente_id else None,
        lida=bool(msg.lida),
        referencia_mensagem_id=referencia_mensagem_id,
        resolvida_em=_normalizar_data_utc(msg.resolvida_em),
        resolvida_por_id=int(msg.resolvida_por_id) if msg.resolvida_por_id else None,
    )


def _tempo_em_campo_minutos(inicio: datetime | None) -> int:
    inicio_utc = _normalizar_data_utc(inicio)
    if inicio_utc is None:
        return 0
    delta = agora_utc() - inicio_utc
    if delta.total_seconds() < 0:
        return 0
    return int(delta.total_seconds() // 60)


def criar_notificacao(
    *,
    evento: EventoMesa,
    laudo_id: int,
    origem: str,
    resumo: str,
) -> NotificacaoMesa:
    return NotificacaoMesa(
        evento=evento,
        laudo_id=laudo_id,
        origem=origem,
        resumo=resumo,
    )


def montar_pacote_mesa_laudo(
    banco: Session,
    *,
    laudo: Laudo,
    limite_whispers: int = 80,
    limite_pendencias: int = 80,
    limite_revisoes: int = 10,
) -> PacoteMesaLaudo:
    limite_whispers_seguro = max(10, min(int(limite_whispers), 400))
    limite_pendencias_seguro = max(10, min(int(limite_pendencias), 400))
    limite_revisoes_seguro = max(1, min(int(limite_revisoes), 80))

    mensagens = (
        banco.query(MensagemLaudo)
        .filter(MensagemLaudo.laudo_id == laudo.id)
        .order_by(MensagemLaudo.id.asc())
        .all()
    )

    total_inspetor = 0
    total_ia = 0
    total_mesa = 0
    total_outros = 0
    evidencias_textuais = 0
    evidencias_fotos = 0
    evidencias_documentos = 0

    for msg in mensagens:
        tipo = str(msg.tipo or "")
        _, texto_limpo = extrair_referencia_do_texto(msg.conteudo)

        if tipo in {TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value}:
            total_inspetor += 1
            if tipo != TipoMensagem.USER.value:
                continue
            if _texto_eh_foto(texto_limpo):
                evidencias_fotos += 1
            elif _texto_representa_documento(texto_limpo):
                evidencias_documentos += 1
            elif _texto_eh_evidencia_textual(texto_limpo):
                evidencias_textuais += 1
            continue

        if tipo == TipoMensagem.IA.value:
            total_ia += 1
            continue

        if tipo == TipoMensagem.HUMANO_ENG.value:
            total_mesa += 1
            continue

        total_outros += 1

    mensagens_mesa = [msg for msg in mensagens if msg.tipo == TipoMensagem.HUMANO_ENG.value]
    pendencias_abertas = [msg for msg in mensagens_mesa if msg.resolvida_em is None]
    pendencias_resolvidas = [msg for msg in mensagens_mesa if msg.resolvida_em is not None]
    pendencias_resolvidas.sort(
        key=lambda msg: (
            _normalizar_data_utc(msg.resolvida_em)
            or _normalizar_data_utc(msg.criado_em)
            or agora_utc()
        ),
        reverse=True,
    )

    whispers = [msg for msg in mensagens if msg.is_whisper]
    whispers_recentes = list(reversed(whispers[-limite_whispers_seguro:]))

    revisoes = (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo.id)
        .order_by(LaudoRevisao.numero_versao.desc())
        .limit(limite_revisoes_seguro)
        .all()
    )

    ultima_interacao = None
    if mensagens:
        ultima_interacao = _normalizar_data_utc(mensagens[-1].criado_em)
    if ultima_interacao is None:
        ultima_interacao = _normalizar_data_utc(laudo.atualizado_em) or _normalizar_data_utc(laudo.criado_em)

    resumo_mensagens = ResumoMensagensMesa(
        total=len(mensagens),
        inspetor=total_inspetor,
        ia=total_ia,
        mesa=total_mesa,
        sistema_outros=total_outros,
    )
    resumo_evidencias = ResumoEvidenciasMesa(
        total=evidencias_textuais + evidencias_fotos + evidencias_documentos,
        textuais=evidencias_textuais,
        fotos=evidencias_fotos,
        documentos=evidencias_documentos,
    )
    resumo_pendencias = ResumoPendenciasMesa(
        total=len(mensagens_mesa),
        abertas=len(pendencias_abertas),
        resolvidas=len(pendencias_resolvidas),
    )

    revisoes_payload = [
        RevisaoPacoteMesa(
            numero_versao=int(revisao.numero_versao),
            origem=str(revisao.origem or "ia"),
            resumo=(revisao.resumo or None),
            confianca_geral=(revisao.confianca_geral or None),
            criado_em=_normalizar_data_utc(revisao.criado_em) or agora_utc(),
        )
        for revisao in revisoes
    ]

    status_revisao = getattr(laudo, "status_revisao", "")
    status_conformidade = getattr(laudo, "status_conformidade", "")
    if hasattr(status_revisao, "value"):
        status_revisao = status_revisao.value
    if hasattr(status_conformidade, "value"):
        status_conformidade = status_conformidade.value

    return PacoteMesaLaudo(
        laudo_id=int(laudo.id),
        codigo_hash=str(laudo.codigo_hash or ""),
        tipo_template=str(getattr(laudo, "tipo_template", "") or ""),
        setor_industrial=str(laudo.setor_industrial or ""),
        status_revisao=str(status_revisao or ""),
        status_conformidade=str(status_conformidade or ""),
        criado_em=_normalizar_data_utc(laudo.criado_em) or agora_utc(),
        atualizado_em=_normalizar_data_utc(laudo.atualizado_em),
        tempo_em_campo_minutos=_tempo_em_campo_minutos(laudo.criado_em),
        ultima_interacao_em=ultima_interacao,
        inspetor_id=int(laudo.usuario_id) if laudo.usuario_id else None,
        revisor_id=int(laudo.revisado_por) if laudo.revisado_por else None,
        dados_formulario=getattr(laudo, "dados_formulario", None),
        parecer_ia=getattr(laudo, "parecer_ia", None),
        resumo_mensagens=resumo_mensagens,
        resumo_evidencias=resumo_evidencias,
        resumo_pendencias=resumo_pendencias,
        pendencias_abertas=[_serializar_mensagem_pacote(msg) for msg in pendencias_abertas[:limite_pendencias_seguro]],
        pendencias_resolvidas_recentes=[_serializar_mensagem_pacote(msg) for msg in pendencias_resolvidas[:limite_pendencias_seguro]],
        whispers_recentes=[_serializar_mensagem_pacote(msg) for msg in whispers_recentes],
        revisoes_recentes=revisoes_payload,
    )


__all__ = [
    "agora_utc",
    "criar_notificacao",
    "montar_pacote_mesa_laudo",
]
