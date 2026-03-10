"""Helpers de gate de qualidade do laudo para o domínio Chat/Inspetor."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.chat.media_helpers import mensagem_representa_documento
from app.domains.chat.normalization import nome_template_humano, normalizar_tipo_template
from app.shared.database import Laudo, MensagemLaudo, TipoMensagem

REGRAS_GATE_QUALIDADE_TEMPLATE: dict[str, dict[str, Any]] = {
    "padrao": {
        "min_textos": 1,
        "min_evidencias": 2,
        "min_fotos": 1,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "avcb": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "spda": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "pie": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "rti": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "nr12maquinas": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "nr13": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "cbmgo": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": True,
    },
}


def _mensagem_eh_comando_sistema(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False

    texto_lower = texto.lower()
    return (
        "[comando_sistema]" in texto_lower
        or "[comando_rapido]" in texto_lower
        or "comando_sistema finalizarlaudoagora" in texto_lower
        or "solicitou encerramento e geração do laudo" in texto_lower
        or "solicitou encerramento e geracao do laudo" in texto_lower
    )


def _mensagem_representa_foto(conteudo: str) -> bool:
    texto = (conteudo or "").strip().lower()
    return texto in {"[imagem]", "imagem enviada", "[foto]"}


def _mensagem_representa_documento(conteudo: str) -> bool:
    return mensagem_representa_documento(conteudo)


def _mensagem_textual_relevante(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if _mensagem_eh_comando_sistema(texto):
        return False
    if _mensagem_representa_foto(texto):
        return False
    if _mensagem_representa_documento(texto):
        return False

    texto_util = re.sub(r"[\W_]+", "", texto, flags=re.UNICODE)
    return len(texto_util) >= 8


def _primeira_mensagem_qualificada(laudo: Laudo) -> bool:
    texto = (laudo.primeira_mensagem or "").strip()
    if not texto:
        return False

    texto_lower = texto.lower()
    if texto_lower in {"nova conversa", "imagem enviada", "[imagem]"}:
        return False
    if (
        texto_lower.startswith("relatório ")
        or texto_lower.startswith("relatorio ")
    ) and "iniciado" in texto_lower:
        return False

    texto_util = re.sub(r"[\W_]+", "", texto, flags=re.UNICODE)
    return len(texto_util) >= 8


def _item_gate_qualidade(
    *,
    item_id: str,
    categoria: str,
    titulo: str,
    ok: bool,
    atual: Any,
    minimo: Any,
    observacao: str,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "categoria": categoria,
        "titulo": titulo,
        "status": "ok" if ok else "faltante",
        "atual": atual,
        "minimo": minimo,
        "observacao": observacao,
    }


def avaliar_gate_qualidade_laudo(banco: Session, laudo: Laudo) -> dict[str, Any]:
    tipo_template = normalizar_tipo_template(getattr(laudo, "tipo_template", "padrao"))
    regra = REGRAS_GATE_QUALIDADE_TEMPLATE.get(
        tipo_template,
        REGRAS_GATE_QUALIDADE_TEMPLATE["padrao"],
    )

    mensagens = (
        banco.query(MensagemLaudo)
        .filter(MensagemLaudo.laudo_id == laudo.id)
        .order_by(MensagemLaudo.criado_em.asc())
        .all()
    )
    mensagens_usuario = [
        item
        for item in mensagens
        if item.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value)
    ]
    mensagens_ia = [item for item in mensagens if item.tipo == TipoMensagem.IA.value]

    qtd_textos = 0
    qtd_fotos = 0
    qtd_documentos = 0
    qtd_evidencias = 0

    for item in mensagens_usuario:
        conteudo = (item.conteudo or "").strip()
        eh_texto = _mensagem_textual_relevante(conteudo)
        eh_foto = _mensagem_representa_foto(conteudo)
        eh_documento = _mensagem_representa_documento(conteudo)

        if eh_texto:
            qtd_textos += 1
        if eh_foto:
            qtd_fotos += 1
        if eh_documento:
            qtd_documentos += 1
        if eh_texto or eh_foto or eh_documento:
            qtd_evidencias += 1

    min_textos = int(regra.get("min_textos", 0) or 0)
    min_evidencias = int(regra.get("min_evidencias", 0) or 0)
    min_fotos = int(regra.get("min_fotos", 0) or 0)
    min_mensagens_ia = int(regra.get("min_mensagens_ia", 0) or 0)
    requer_dados_formulario = bool(regra.get("requer_dados_formulario", False))

    primeira_ok = _primeira_mensagem_qualificada(laudo)
    mensagens_ia_ok = len(mensagens_ia) >= min_mensagens_ia
    textos_ok = qtd_textos >= min_textos
    evidencias_ok = qtd_evidencias >= min_evidencias
    fotos_ok = qtd_fotos >= min_fotos
    dados_formulario_ok = (not requer_dados_formulario) or bool(laudo.dados_formulario)

    itens = [
        _item_gate_qualidade(
            item_id="campo_escopo_inicial",
            categoria="campo_critico",
            titulo="Escopo inicial da inspeção",
            ok=primeira_ok,
            atual="registrado" if primeira_ok else "ausente",
            minimo="registrado",
            observacao="Defina contexto técnico inicial da inspeção no chat.",
        ),
        _item_gate_qualidade(
            item_id="campo_parecer_ia",
            categoria="campo_critico",
            titulo="Parecer técnico preliminar da IA",
            ok=mensagens_ia_ok,
            atual=len(mensagens_ia),
            minimo=min_mensagens_ia,
            observacao="A IA precisa consolidar ao menos uma resposta técnica antes do envio.",
        ),
        _item_gate_qualidade(
            item_id="evidencias_textuais",
            categoria="evidencia",
            titulo="Registros textuais de campo",
            ok=textos_ok,
            atual=qtd_textos,
            minimo=min_textos,
            observacao="Descreva achados, medições e contexto operacional.",
        ),
        _item_gate_qualidade(
            item_id="evidencias_minimas",
            categoria="evidencia",
            titulo="Evidências mínimas consolidadas",
            ok=evidencias_ok,
            atual=qtd_evidencias,
            minimo=min_evidencias,
            observacao="Combine texto, fotos e documentos para suportar o laudo.",
        ),
        _item_gate_qualidade(
            item_id="fotos_essenciais",
            categoria="foto",
            titulo="Fotos essenciais da inspeção",
            ok=fotos_ok,
            atual=qtd_fotos,
            minimo=min_fotos,
            observacao="Envie imagens dos pontos críticos antes de finalizar.",
        ),
    ]

    if requer_dados_formulario:
        itens.append(
            _item_gate_qualidade(
                item_id="formulario_estruturado",
                categoria="campo_critico",
                titulo="Formulário estruturado obrigatório",
                ok=dados_formulario_ok,
                atual="gerado" if dados_formulario_ok else "pendente",
                minimo="gerado",
                observacao="O template selecionado exige estruturação automática antes do envio.",
            )
        )

    faltantes = [item for item in itens if item["status"] == "faltante"]
    aprovado = len(faltantes) == 0

    resumo = {
        "mensagens_usuario": len(mensagens_usuario),
        "mensagens_ia": len(mensagens_ia),
        "textos_campo": qtd_textos,
        "fotos": qtd_fotos,
        "documentos": qtd_documentos,
        "evidencias": qtd_evidencias,
    }

    mensagem = (
        "Gate de qualidade aprovado. O laudo pode ser enviado para a mesa avaliadora."
        if aprovado
        else (
            f"Finalize bloqueado: faltam {len(faltantes)} item(ns) obrigatório(s) no checklist de qualidade."
        )
    )

    return {
        "codigo": "GATE_QUALIDADE_OK" if aprovado else "GATE_QUALIDADE_REPROVADO",
        "aprovado": aprovado,
        "mensagem": mensagem,
        "tipo_template": tipo_template,
        "template_nome": nome_template_humano(tipo_template),
        "resumo": resumo,
        "itens": itens,
        "faltantes": faltantes,
    }


def garantir_gate_qualidade_laudo(banco: Session, laudo: Laudo) -> dict[str, Any]:
    resultado = avaliar_gate_qualidade_laudo(banco, laudo)
    if not bool(resultado.get("aprovado", False)):
        raise HTTPException(
            status_code=422,
            detail=resultado,
        )
    return resultado


__all__ = [
    "REGRAS_GATE_QUALIDADE_TEMPLATE",
    "avaliar_gate_qualidade_laudo",
    "garantir_gate_qualidade_laudo",
]
