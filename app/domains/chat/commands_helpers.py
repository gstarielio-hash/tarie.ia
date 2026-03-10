"""Helpers dos comandos rápidos do chat inspetor."""

from __future__ import annotations

import difflib
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domains.chat.media_helpers import mensagem_representa_documento
from app.domains.chat.normalization import nome_template_humano
from app.domains.chat.pendencias_helpers import (
    MAPA_FILTRO_PENDENCIAS_LABEL,
    descrever_status_revisao,
    formatar_data_humana,
    listar_pendencias_mesa_laudo,
    normalizar_filtro_pendencias,
)
from app.shared.database import Laudo, LaudoRevisao, MensagemLaudo, TipoMensagem, Usuario
from nucleo.inspetor.confianca_ia import (
    CONFIANCA_MEDIA,
    _titulo_confianca_humano,
    normalizar_payload_confianca_ia,
)


def _mensagem_representa_foto(conteudo: str) -> bool:
    texto = (conteudo or "").strip().lower()
    return texto in {"[imagem]", "imagem enviada", "[foto]"}


def _obter_ultima_revisao_laudo(banco: Session, laudo_id: int) -> LaudoRevisao | None:
    return (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc())
        .first()
    )


def _obter_revisao_por_versao(banco: Session, laudo_id: int, versao: int) -> LaudoRevisao | None:
    return (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id, LaudoRevisao.numero_versao == versao)
        .first()
    )


def _gerar_diff_revisoes(base: str, comparar: str) -> str:
    linhas_base = (base or "").splitlines()
    linhas_comparar = (comparar or "").splitlines()

    diff = difflib.unified_diff(
        linhas_base,
        linhas_comparar,
        fromfile="versao_base",
        tofile="versao_comparada",
        lineterm="",
        n=2,
    )
    return "\n".join(diff).strip()


def _resumo_diff_revisoes(diff_texto: str) -> dict[str, int]:
    adicionadas = 0
    removidas = 0
    for linha in (diff_texto or "").splitlines():
        if not linha or linha.startswith(("+++", "---", "@@")):
            continue
        if linha.startswith("+"):
            adicionadas += 1
        elif linha.startswith("-"):
            removidas += 1

    return {
        "linhas_adicionadas": adicionadas,
        "linhas_removidas": removidas,
        "total_alteracoes": adicionadas + removidas,
    }


def _avaliar_gate_padrao(banco: Session, laudo: Laudo) -> dict[str, Any]:
    from app.domains.chat.routes import avaliar_gate_qualidade_laudo

    return avaliar_gate_qualidade_laudo(banco, laudo)


def montar_resposta_comando_pendencias(
    banco: Session,
    laudo: Laudo,
    argumento: str,
) -> str:
    filtro_bruto = (argumento or "").split(" ", 1)[0].strip().lower()
    filtro = normalizar_filtro_pendencias(filtro_bruto or "abertas")
    pendencias, total, abertas, total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo.id,
        filtro=filtro,
        pagina=1,
        tamanho=5,
    )
    resolvidas = max(total - abertas, 0)

    linhas = [
        "### Pendências da Mesa",
        f"- Filtro: **{MAPA_FILTRO_PENDENCIAS_LABEL.get(filtro, 'Abertas')}**",
        f"- Total geral: **{total}**",
        f"- Abertas: **{abertas}** | Resolvidas: **{resolvidas}**",
    ]

    if total_filtrado <= 0:
        linhas.append("- Nenhuma pendência para o filtro selecionado.")
        linhas.append("")
        linhas.append("Comandos úteis: `/pendencias todas` | `/pendencias abertas` | `/pendencias resolvidas`")
        return "\n".join(linhas)

    linhas.append("")
    linhas.append("Principais itens:")
    for indice, item in enumerate(pendencias, start=1):
        status_item = "aberta" if not item.lida else "resolvida"
        data_item = formatar_data_humana(item.criado_em)
        texto_item = " ".join((item.conteudo or "").split()).strip()[:180] or "(sem conteúdo)"
        linhas.append(f"{indice}. [{status_item}] {texto_item} _(#{item.id} · {data_item})_")

    if total_filtrado > len(pendencias):
        linhas.append(f"- ... e mais **{total_filtrado - len(pendencias)}** item(ns) no filtro atual.")

    linhas.append("")
    linhas.append("Dica: use `/enviar_mesa <mensagem>` para responder no mesmo chat.")
    return "\n".join(linhas)


def montar_resposta_comando_resumo(
    banco: Session,
    laudo: Laudo,
    *,
    avaliar_gate_fn: Callable[[Session, Laudo], dict[str, Any]] | None = None,
) -> str:
    avaliar_gate = avaliar_gate_fn or _avaliar_gate_padrao
    mensagens = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo.id).all()
    qtd_usuario = sum(1 for item in mensagens if item.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value))
    qtd_ia = sum(1 for item in mensagens if item.tipo == TipoMensagem.IA.value)
    qtd_mesa = sum(1 for item in mensagens if item.tipo == TipoMensagem.HUMANO_ENG.value)
    qtd_fotos = sum(1 for item in mensagens if _mensagem_representa_foto(item.conteudo or ""))
    qtd_docs = sum(1 for item in mensagens if mensagem_representa_documento(item.conteudo or ""))
    gate = avaliar_gate(banco, laudo)
    hash_curto = (laudo.codigo_hash or "")[-6:]
    pendencias_abertas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .count()
    )
    total_revisoes = (
        banco.query(func.count(LaudoRevisao.id))
        .filter(LaudoRevisao.laudo_id == laudo.id)
        .scalar()
        or 0
    )
    ultima_revisao = _obter_ultima_revisao_laudo(banco, laudo.id)
    confianca = normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
    confianca_geral = _titulo_confianca_humano(confianca.get("geral", CONFIANCA_MEDIA))

    linhas = [
        "### Resumo da Sessão",
        f"- Laudo: **#{hash_curto or laudo.id}** ({nome_template_humano(getattr(laudo, 'tipo_template', 'padrao'))})",
        f"- Status: **{descrever_status_revisao(laudo.status_revisao)}**",
        f"- Atualizado em: **{formatar_data_humana(getattr(laudo, 'atualizado_em', None) or getattr(laudo, 'criado_em', None))}**",
        f"- Mensagens: usuário/inspetor **{qtd_usuario}**, IA **{qtd_ia}**, mesa **{qtd_mesa}**",
        f"- Evidências registradas: fotos **{qtd_fotos}**, documentos **{qtd_docs}**",
        f"- Pendências abertas da mesa: **{pendencias_abertas}**",
        f"- Confiança IA (última síntese): **{confianca_geral}**",
    ]

    if total_revisoes:
        linhas.append(f"- Versionamento: **v{ultima_revisao.numero_versao if ultima_revisao else total_revisoes}** ({total_revisoes} revisão(ões))")
        if total_revisoes >= 2 and ultima_revisao:
            revisao_anterior = _obter_revisao_por_versao(
                banco,
                laudo.id,
                int(ultima_revisao.numero_versao) - 1,
            )
            if revisao_anterior:
                diff = _gerar_diff_revisoes(revisao_anterior.conteudo or "", ultima_revisao.conteudo or "")
                resumo_diff = _resumo_diff_revisoes(diff)
                linhas.append(
                    "- Mudanças da última revisão: "
                    f"**+{resumo_diff['linhas_adicionadas']} / -{resumo_diff['linhas_removidas']}**"
                )

    if gate.get("aprovado", False):
        linhas.append("- Gate de qualidade: **aprovado**")
    else:
        faltantes = gate.get("faltantes", []) or []
        linhas.append(f"- Gate de qualidade: **reprovado** ({len(faltantes)} item(ns) pendente(s))")
        if faltantes:
            linhas.append("  Itens críticos:")
            for item in faltantes[:3]:
                linhas.append(f"  - {item.get('titulo', 'Item pendente')}")

    pontos_humanos = confianca.get("pontos_validacao_humana", []) or []
    if pontos_humanos:
        linhas.append("- Pontos para validação humana:")
        for item in pontos_humanos[:3]:
            linhas.append(f"  - {item}")

    return "\n".join(linhas)


def montar_resposta_comando_previa(
    banco: Session,
    laudo: Laudo,
    *,
    avaliar_gate_fn: Callable[[Session, Laudo], dict[str, Any]] | None = None,
) -> str:
    avaliar_gate = avaliar_gate_fn or _avaliar_gate_padrao
    gate = avaliar_gate(banco, laudo)
    faltantes = gate.get("faltantes", []) or []
    pendencias_abertas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .count()
    )
    parecer_ia = (laudo.parecer_ia or "").strip()
    if parecer_ia:
        parecer_preview = parecer_ia[:900] + ("..." if len(parecer_ia) > 900 else "")
    else:
        parecer_preview = "_Sem parecer consolidado da IA até o momento._"
    confianca = normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
    confianca_geral = _titulo_confianca_humano(confianca.get("geral", CONFIANCA_MEDIA))
    ultima_revisao = _obter_ultima_revisao_laudo(banco, laudo.id)
    total_revisoes = (
        banco.query(func.count(LaudoRevisao.id))
        .filter(LaudoRevisao.laudo_id == laudo.id)
        .scalar()
        or 0
    )

    linhas = [
        "### Prévia Operacional do Laudo",
        f"**Template:** {nome_template_humano(getattr(laudo, 'tipo_template', 'padrao'))}",
        f"**Status:** {descrever_status_revisao(laudo.status_revisao)}",
        f"**Atualização:** {formatar_data_humana(getattr(laudo, 'atualizado_em', None) or getattr(laudo, 'criado_em', None))}",
        f"**Confiança IA:** {confianca_geral}",
        "",
        "**Escopo inicial registrado**",
        (laudo.primeira_mensagem or "_Sem escopo inicial registrado._"),
        "",
        "**Síntese técnica atual da IA**",
        parecer_preview,
        "",
        f"**Pendências abertas da mesa:** {pendencias_abertas}",
    ]

    if total_revisoes:
        linhas.append(
            f"**Versão atual:** v{ultima_revisao.numero_versao if ultima_revisao else total_revisoes} "
            f"({total_revisoes} revisão(ões))"
        )

    pontos_humanos = confianca.get("pontos_validacao_humana", []) or []
    if pontos_humanos:
        linhas.append("")
        linhas.append("**Pontos para validação humana**")
        for item in pontos_humanos[:4]:
            linhas.append(f"- {item}")

    if gate.get("aprovado", False):
        linhas.append("**Gate de qualidade:** aprovado para envio.")
    else:
        linhas.append(f"**Gate de qualidade:** bloqueado ({len(faltantes)} item(ns) pendente(s)).")
        if faltantes:
            linhas.append("")
            linhas.append("Itens que faltam:")
            for item in faltantes[:5]:
                linhas.append(f"- {item.get('titulo', 'Item pendente')} — {item.get('observacao', '')}".strip())

    linhas.append("")
    linhas.append("Comandos úteis: `/resumo` | `/pendencias` | `/enviar_mesa <mensagem>`")
    return "\n".join(linhas)


def montar_resposta_comando_rapido(
    banco: Session,
    laudo: Laudo,
    comando: str,
    argumento: str,
    *,
    avaliar_gate_fn: Callable[[Session, Laudo], dict[str, Any]] | None = None,
) -> str:
    comando_normalizado = str(comando or "").strip().lower()
    if comando_normalizado == "pendencias":
        return montar_resposta_comando_pendencias(banco, laudo, argumento)
    if comando_normalizado == "resumo":
        return montar_resposta_comando_resumo(banco, laudo, avaliar_gate_fn=avaliar_gate_fn)
    if comando_normalizado == "gerar_previa":
        return montar_resposta_comando_previa(banco, laudo, avaliar_gate_fn=avaliar_gate_fn)

    raise HTTPException(status_code=400, detail="Comando rápido inválido.")


def registrar_comando_rapido_historico(
    banco: Session,
    laudo: Laudo,
    usuario: Usuario,
    comando: str,
    argumento: str,
    resposta: str,
) -> None:
    sufixo = f" {argumento.strip()}" if argumento else ""
    conteudo_comando = f"[COMANDO_RAPIDO] /{comando}{sufixo}".strip()

    banco.add(
        MensagemLaudo(
            laudo_id=laudo.id,
            remetente_id=usuario.id,
            tipo=TipoMensagem.USER.value,
            conteudo=conteudo_comando,
            custo_api_reais=Decimal("0.0000"),
        )
    )
    banco.add(
        MensagemLaudo(
            laudo_id=laudo.id,
            tipo=TipoMensagem.IA.value,
            conteudo=resposta,
            custo_api_reais=Decimal("0.0000"),
        )
    )
    laudo.atualizado_em = datetime.now(timezone.utc)


__all__ = [
    "montar_resposta_comando_pendencias",
    "montar_resposta_comando_resumo",
    "montar_resposta_comando_previa",
    "montar_resposta_comando_rapido",
    "registrar_comando_rapido_historico",
]
