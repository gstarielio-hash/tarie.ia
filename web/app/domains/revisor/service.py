from __future__ import annotations

import os
import tempfile
import uuid
from dataclasses import dataclass
from typing import Any, Iterable, Literal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domains.chat.media_helpers import safe_remove_file
from app.domains.mesa.attachments import (
    conteudo_mensagem_mesa_com_anexo,
    remover_arquivo_anexo_mesa,
    resumo_mensagem_mesa,
    salvar_arquivo_anexo_mesa,
)
from app.domains.mesa.contracts import PacoteMesaLaudo
from app.domains.mesa.service import montar_pacote_mesa_laudo
from app.domains.revisor.base import (
    _agora_utc,
    _formatar_data_local,
    _gerar_pdf_placeholder_schemathesis,
    _listar_mensagens_laudo_paginadas,
    _marcar_whispers_lidos_laudo,
    _nome_resolvedor_mensagem,
    _registrar_mensagem_revisor,
    _serializar_mensagem,
    _validar_destinatario_whisper,
    logger,
)
from app.domains.revisor.common import _obter_laudo_empresa
from app.shared.database import (
    AnexoMesa,
    Laudo,
    MensagemLaudo,
    StatusRevisao,
    TipoMensagem,
    Usuario,
)
from nucleo.gerador_laudos import GeradorLaudos
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia


@dataclass(slots=True)
class AvaliacaoLaudoResult:
    laudo_id: int
    acao: str
    status_revisao: str
    motivo: str
    modo_schemathesis: bool
    inspetor_id: int | None = None
    mensagem_id: int | None = None
    texto_notificacao_inspetor: str = ""


@dataclass(slots=True)
class WhisperRespostaResult:
    laudo_id: int
    destinatario_id: int
    mensagem_id: int
    referencia_mensagem_id: int | None
    preview: str


@dataclass(slots=True)
class RespostaChatResult:
    laudo_id: int
    inspetor_id: int | None
    mensagem_id: int
    referencia_mensagem_id: int | None
    texto_notificacao: str


@dataclass(slots=True)
class RespostaChatAnexoResult:
    laudo_id: int
    inspetor_id: int | None
    mensagem_id: int
    referencia_mensagem_id: int | None
    texto_notificacao: str
    mensagem_payload: dict[str, Any]


@dataclass(slots=True)
class PendenciaMesaResult:
    laudo_id: int
    mensagem_id: int
    lida: bool
    resolvida_por_id: int | None
    resolvida_por_nome: str
    resolvida_em: str
    pendencias_abertas: int
    inspetor_id: int | None
    texto_notificacao: str


@dataclass(slots=True)
class PacoteMesaCarregado:
    laudo: Laudo
    pacote: PacoteMesaLaudo


@dataclass(slots=True)
class ExportacaoPacoteMesaPdf:
    caminho_pdf: str
    filename: str


def garantir_referencia_mensagem(
    banco: Session,
    *,
    laudo_id: int,
    referencia_mensagem_id: int | None,
) -> None:
    if not referencia_mensagem_id:
        return

    referencia_existe = (
        banco.query(MensagemLaudo.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.id == referencia_mensagem_id,
        )
        .first()
    )
    if not referencia_existe:
        raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")


def validar_parametros_pacote_mesa(parametros: Iterable[str]) -> None:
    parametros_invalidos = set(parametros) - {
        "limite_whispers",
        "limite_pendencias",
        "limite_revisoes",
    }
    if not parametros_invalidos:
        return

    raise HTTPException(
        status_code=422,
        detail=[
            {
                "loc": ["query", nome_parametro],
                "msg": "Extra inputs are not permitted",
                "type": "extra_forbidden",
            }
            for nome_parametro in sorted(parametros_invalidos)
        ],
    )


def avaliar_laudo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    revisor_id: int,
    revisor_nome: str,
    acao: Literal["aprovar", "rejeitar"] | str,
    motivo: str,
    resposta_api: bool,
    modo_schemathesis: bool,
) -> AvaliacaoLaudoResult:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)

    if laudo.status_revisao != StatusRevisao.AGUARDANDO.value and not modo_schemathesis:
        raise HTTPException(
            status_code=400,
            detail="Laudo não está aguardando avaliação.",
        )

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

    banco.commit()
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
    banco.commit()

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
    banco.commit()

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
        banco.commit()
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
    banco.commit()
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
    banco.commit()
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


def carregar_historico_chat_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    cursor: int | None,
    limite: int,
) -> dict[str, Any]:
    _obter_laudo_empresa(banco, laudo_id, empresa_id)

    pagina = _listar_mensagens_laudo_paginadas(
        banco,
        laudo_id=laudo_id,
        cursor=cursor,
        limite=limite,
        com_data_longa=False,
    )

    return {
        "itens": pagina["itens"],
        "cursor_proximo": int(pagina["cursor_proximo"]) if pagina["cursor_proximo"] else None,
        "tem_mais": bool(pagina["tem_mais"]),
        "laudo_id": laudo_id,
        "limite": limite,
    }


def carregar_laudo_completo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    incluir_historico: bool,
    cursor: int | None,
    limite: int,
) -> dict[str, Any]:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)

    historico: list[dict[str, Any]] = []
    whispers: list[dict[str, Any]] = []
    cursor_proximo: int | None = None
    tem_mais = False

    if incluir_historico:
        pagina = _listar_mensagens_laudo_paginadas(
            banco,
            laudo_id=laudo_id,
            cursor=cursor,
            limite=limite,
            com_data_longa=True,
        )
        historico = pagina["itens"]
        whispers = [mensagem for mensagem in historico if mensagem["is_whisper"]]
        cursor_proximo = int(pagina["cursor_proximo"]) if pagina["cursor_proximo"] else None
        tem_mais = bool(pagina["tem_mais"])

    return {
        "id": laudo.id,
        "hash": laudo.codigo_hash[-6:],
        "setor": laudo.setor_industrial,
        "status": laudo.status_revisao,
        "tipo_template": getattr(laudo, "tipo_template", "padrao"),
        "criado_em": laudo.criado_em.strftime("%d/%m/%Y %H:%M"),
        "dados_formulario": getattr(laudo, "dados_formulario", None),
        "historico": historico,
        "whispers": whispers,
        "historico_paginado": {
            "incluir_historico": incluir_historico,
            "cursor_proximo": cursor_proximo,
            "tem_mais": tem_mais,
            "limite": limite,
        },
    }


def carregar_pacote_mesa_laudo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    limite_whispers: int,
    limite_pendencias: int,
    limite_revisoes: int,
) -> PacoteMesaCarregado:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    pacote = montar_pacote_mesa_laudo(
        banco,
        laudo=laudo,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
    )
    return PacoteMesaCarregado(laudo=laudo, pacote=pacote)


def gerar_exportacao_pacote_mesa_laudo_pdf(
    banco: Session,
    *,
    pacote_carregado: PacoteMesaCarregado,
    usuario: Usuario,
) -> ExportacaoPacoteMesaPdf:
    laudo = pacote_carregado.laudo
    pacote = pacote_carregado.pacote

    nome_arquivo_tmp = f"Pacote_Mesa_{laudo.id}_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo_tmp)

    nome_empresa = (
        getattr(usuario.empresa, "nome_fantasia", None)
        or getattr(usuario.empresa, "razao_social", None)
        or f"Empresa #{usuario.empresa_id}"
    )

    inspetor_nome = "Nao informado"
    if pacote.inspetor_id:
        inspetor = banco.get(Usuario, pacote.inspetor_id)
        if inspetor and inspetor.empresa_id == usuario.empresa_id:
            inspetor_nome = inspetor.nome

    revisoes_payload = [
        {
            "numero_versao": revisao.numero_versao,
            "origem": revisao.origem,
            "resumo": revisao.resumo,
            "confianca_geral": revisao.confianca_geral,
            "criado_em": _formatar_data_local(revisao.criado_em),
        }
        for revisao in pacote.revisoes_recentes
    ]
    pendencias_payload = [
        {
            "id": item.id,
            "tipo": item.tipo,
            "texto": item.texto,
            "criado_em": _formatar_data_local(item.criado_em),
            "referencia_mensagem_id": item.referencia_mensagem_id,
            "anexos": [anexo.model_dump(mode="json") for anexo in item.anexos],
        }
        for item in pacote.pendencias_abertas
    ]
    whispers_payload = [
        {
            "id": item.id,
            "tipo": item.tipo,
            "texto": item.texto,
            "criado_em": _formatar_data_local(item.criado_em),
            "referencia_mensagem_id": item.referencia_mensagem_id,
            "anexos": [anexo.model_dump(mode="json") for anexo in item.anexos],
        }
        for item in pacote.whispers_recentes
    ]

    try:
        if os.getenv("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1":
            _gerar_pdf_placeholder_schemathesis(
                caminho_pdf,
                f"Pacote Mesa Laudo #{laudo.id}",
            )
        else:
            GeradorLaudos.gerar_pdf_pacote_mesa(
                caminho_saida=caminho_pdf,
                laudo_id=laudo.id,
                codigo_hash=pacote.codigo_hash,
                empresa=nome_empresa,
                inspetor=inspetor_nome,
                data_geracao=_formatar_data_local(_agora_utc()),
                tipo_template=pacote.tipo_template,
                setor_industrial=pacote.setor_industrial,
                status_revisao=pacote.status_revisao,
                status_conformidade=pacote.status_conformidade,
                ultima_interacao=_formatar_data_local(pacote.ultima_interacao_em),
                tempo_em_campo_minutos=pacote.tempo_em_campo_minutos,
                resumo_mensagens=pacote.resumo_mensagens.model_dump(mode="json"),
                resumo_evidencias=pacote.resumo_evidencias.model_dump(mode="json"),
                resumo_pendencias=pacote.resumo_pendencias.model_dump(mode="json"),
                pendencias_abertas=pendencias_payload,
                whispers_recentes=whispers_payload,
                revisoes_recentes=revisoes_payload,
                engenheiro_nome=usuario.nome,
                engenheiro_cargo="Engenheiro Revisor",
                engenheiro_crea=(str(usuario.crea or "").strip()[:40] or "Nao informado"),
                carimbo_texto="CARIMBO DIGITAL TARIEL.IA",
            )
    except Exception:
        safe_remove_file(caminho_pdf)
        raise

    return ExportacaoPacoteMesaPdf(
        caminho_pdf=caminho_pdf,
        filename=f"pacote_mesa_laudo_{laudo.id}.pdf",
    )


__all__ = [
    "AvaliacaoLaudoResult",
    "ExportacaoPacoteMesaPdf",
    "PacoteMesaCarregado",
    "PendenciaMesaResult",
    "RespostaChatAnexoResult",
    "RespostaChatResult",
    "WhisperRespostaResult",
    "atualizar_pendencia_mesa_revisor_status",
    "avaliar_laudo_revisor",
    "carregar_anexo_mesa_revisor",
    "carregar_historico_chat_revisor",
    "carregar_laudo_completo_revisor",
    "carregar_pacote_mesa_laudo_revisor",
    "garantir_referencia_mensagem",
    "gerar_exportacao_pacote_mesa_laudo_pdf",
    "marcar_whispers_lidos_revisor",
    "registrar_resposta_chat_com_anexo_revisor",
    "registrar_resposta_chat_revisor",
    "registrar_whisper_resposta_revisor",
    "validar_parametros_pacote_mesa",
]
