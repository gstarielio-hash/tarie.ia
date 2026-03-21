"""Helpers compartilhados do aprendizado supervisionado de IA."""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
import unicodedata
import uuid
from pathlib import Path
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.chat.media_helpers import nome_documento_seguro, validar_imagem_base64
from app.shared.database import AprendizadoVisualIa, StatusAprendizadoIa, VereditoAprendizadoIa

PASTA_APRENDIZADOS_VISUAIS_IA = Path(
    env_str("PASTA_APRENDIZADOS_VISUAIS_IA", "static/uploads/aprendizados_ia")
).expanduser()
MIME_IMAGEM_APRENDIZADO = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
CORRECAO_CHAT_AUTOMATICA_PADRAO = (
    "Sem correção explícita do inspetor. Evidência visual capturada do chat para validação posterior da mesa."
)
DESCRICAO_CHAT_AUTOMATICA_PADRAO = (
    "Evidência visual capturada automaticamente do chat do inspetor para revisão da mesa avaliadora."
)
_TERMOS_CHAT_CONFORME = (
    "esta correto",
    "esta correta",
    "isso esta correto",
    "isso esta correta",
    "ta correto",
    "ta correta",
    "esta sim correta",
    "esta sim correto",
    "procede",
)
_TERMOS_CHAT_NAO_CONFORME = (
    "nao conforme",
    "não conforme",
    "irregular",
    "inadequado",
)
_TERMOS_CHAT_AJUSTE = (
    "esta errado",
    "esta errada",
    "isso esta errado",
    "isso esta errada",
    "incorreto",
    "incorreta",
    "reavalie",
    "reavaliar",
    "revise",
    "corrija",
    "corrigir",
)


def _valor_enum_ou_texto(valor: Any) -> str:
    if valor is None:
        return ""
    return str(getattr(valor, "value", valor))


def _normalizar_texto_detector(texto: str) -> str:
    texto_normalizado = unicodedata.normalize("NFKD", str(texto or "").strip().lower())
    texto_sem_acento = "".join(char for char in texto_normalizado if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", texto_sem_acento).strip()


def _resumir_texto_chat(texto: str, *, fallback: str = "Evidência visual capturada do chat") -> str:
    valor = re.sub(r"\s+", " ", str(texto or "").strip())
    return valor[:240] if valor else fallback


def inferir_veredito_correcao_chat(texto: str) -> str | None:
    texto_norm = _normalizar_texto_detector(texto)
    if not texto_norm:
        return None
    if any(termo in texto_norm for termo in _TERMOS_CHAT_NAO_CONFORME):
        return VereditoAprendizadoIa.NAO_CONFORME.value
    if any(termo in texto_norm for termo in _TERMOS_CHAT_AJUSTE):
        return VereditoAprendizadoIa.AJUSTE.value
    if any(termo in texto_norm for termo in _TERMOS_CHAT_CONFORME):
        return VereditoAprendizadoIa.CONFORME.value
    return None
_STOPWORDS_APRENDIZADO = {
    "com",
    "como",
    "para",
    "pela",
    "pelo",
    "das",
    "dos",
    "uma",
    "que",
    "por",
    "sem",
    "nas",
    "nos",
    "foto",
    "fotos",
    "imagem",
    "imagens",
    "laudo",
    "esse",
    "essa",
    "isso",
    "esta",
    "está",
    "aqui",
    "qual",
}


def normalizar_lista_textos(
    valores: Iterable[str] | None,
    *,
    limite_itens: int = 12,
    limite_chars: int = 180,
) -> list[str]:
    itens: list[str] = []
    vistos: set[str] = set()
    for valor in list(valores or []):
        texto = re.sub(r"\s+", " ", str(valor or "").strip())[:limite_chars]
        if not texto:
            continue
        chave = texto.lower()
        if chave in vistos:
            continue
        itens.append(texto)
        vistos.add(chave)
        if len(itens) >= limite_itens:
            break
    return itens


def normalizar_marcacoes_aprendizado(
    marcacoes: Iterable[dict[str, Any]] | None,
    *,
    limite_itens: int = 12,
) -> list[dict[str, Any]]:
    itens: list[dict[str, Any]] = []
    for item in list(marcacoes or []):
        if not isinstance(item, dict):
            continue
        rotulo = str(item.get("rotulo") or "").strip()[:80]
        observacao = str(item.get("observacao") or "").strip()[:300]
        if not rotulo and not observacao:
            continue
        payload: dict[str, Any] = {
            "rotulo": rotulo,
            "observacao": observacao,
        }
        for chave in ("x", "y", "largura", "altura"):
            valor = item.get(chave)
            if isinstance(valor, (int, float)) and 0 <= float(valor) <= 1:
                payload[chave] = round(float(valor), 4)
        itens.append(payload)
        if len(itens) >= limite_itens:
            break
    return itens


def salvar_evidencia_aprendizado_visual(
    *,
    empresa_id: int,
    laudo_id: int,
    dados_imagem: str,
    nome_imagem: str,
) -> dict[str, str]:
    imagem_data_uri = validar_imagem_base64(dados_imagem)
    if not imagem_data_uri:
        return {}

    cabecalho, conteudo_b64 = imagem_data_uri.split(",", 1)
    mime_type = cabecalho.split(";", 1)[0].split(":", 1)[1].strip().lower()
    extensao = MIME_IMAGEM_APRENDIZADO.get(mime_type)
    if not extensao:
        raise HTTPException(status_code=415, detail="Formato de imagem não suportado para aprendizado visual.")

    try:
        conteudo = base64.b64decode(conteudo_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Imagem base64 inválida para aprendizado visual.") from exc

    if not conteudo:
        raise HTTPException(status_code=400, detail="A evidência visual enviada está vazia.")

    sha256 = hashlib.sha256(conteudo).hexdigest()
    pasta_destino = PASTA_APRENDIZADOS_VISUAIS_IA / str(int(empresa_id)) / str(int(laudo_id))
    pasta_destino.mkdir(parents=True, exist_ok=True)

    nome_base = nome_documento_seguro(nome_imagem or "evidencia_aprendizado") or "evidencia_aprendizado"
    nome_arquivo = f"{uuid.uuid4().hex[:16]}{extensao}"
    caminho_arquivo = pasta_destino / nome_arquivo
    caminho_arquivo.write_bytes(conteudo)

    return {
        "imagem_url": f"/static/uploads/aprendizados_ia/{int(empresa_id)}/{int(laudo_id)}/{nome_arquivo}",
        "imagem_nome_original": Path(nome_base).name[:160],
        "imagem_mime_type": mime_type,
        "imagem_sha256": sha256,
        "caminho_arquivo": str(caminho_arquivo),
    }


def serializar_aprendizado_visual(item: AprendizadoVisualIa) -> dict[str, Any]:
    return {
        "id": int(item.id),
        "empresa_id": int(item.empresa_id),
        "laudo_id": int(item.laudo_id),
        "mensagem_referencia_id": int(item.mensagem_referencia_id) if item.mensagem_referencia_id else None,
        "setor_industrial": str(item.setor_industrial or ""),
        "resumo": str(item.resumo or ""),
        "descricao_contexto": str(item.descricao_contexto or ""),
        "correcao_inspetor": str(item.correcao_inspetor or ""),
        "parecer_mesa": str(item.parecer_mesa or ""),
        "sintese_consolidada": str(item.sintese_consolidada or ""),
        "status": _valor_enum_ou_texto(item.status),
        "veredito_inspetor": _valor_enum_ou_texto(item.veredito_inspetor),
        "veredito_mesa": _valor_enum_ou_texto(item.veredito_mesa) if item.veredito_mesa else None,
        "pontos_chave": list(item.pontos_chave_json or []),
        "referencias_norma": list(item.referencias_norma_json or []),
        "marcacoes": list(item.marcacoes_json or []),
        "imagem_url": str(item.imagem_url or ""),
        "imagem_nome_original": str(item.imagem_nome_original or ""),
        "imagem_mime_type": str(item.imagem_mime_type or ""),
        "imagem_sha256": str(item.imagem_sha256 or ""),
        "criado_por_id": int(item.criado_por_id) if item.criado_por_id else None,
        "validado_por_id": int(item.validado_por_id) if item.validado_por_id else None,
        "criado_em": item.criado_em.isoformat() if item.criado_em else None,
        "atualizado_em": item.atualizado_em.isoformat() if item.atualizado_em else None,
        "validado_em": item.validado_em.isoformat() if item.validado_em else None,
    }


def listar_aprendizados_laudo(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
) -> list[AprendizadoVisualIa]:
    return (
        banco.query(AprendizadoVisualIa)
        .filter(
            AprendizadoVisualIa.laudo_id == laudo_id,
            AprendizadoVisualIa.empresa_id == empresa_id,
        )
        .order_by(AprendizadoVisualIa.criado_em.desc(), AprendizadoVisualIa.id.desc())
        .all()
    )


def obter_aprendizado_visual(
    banco: Session,
    *,
    aprendizado_id: int,
    empresa_id: int,
) -> AprendizadoVisualIa:
    item = (
        banco.query(AprendizadoVisualIa)
        .filter(
            AprendizadoVisualIa.id == aprendizado_id,
            AprendizadoVisualIa.empresa_id == empresa_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Aprendizado visual não encontrado.")
    return item


def obter_rascunho_aprendizado_visual_chat(
    banco: Session,
    *,
    empresa_id: int,
    laudo_id: int,
    criado_por_id: int,
    referencia_mensagem_id: int | None = None,
) -> AprendizadoVisualIa | None:
    consulta = banco.query(AprendizadoVisualIa).filter(
        AprendizadoVisualIa.empresa_id == empresa_id,
        AprendizadoVisualIa.laudo_id == laudo_id,
        AprendizadoVisualIa.criado_por_id == criado_por_id,
        AprendizadoVisualIa.status == StatusAprendizadoIa.RASCUNHO_INSPETOR.value,
    )
    if referencia_mensagem_id:
        item_referenciado = (
            consulta.filter(AprendizadoVisualIa.mensagem_referencia_id == referencia_mensagem_id)
            .order_by(AprendizadoVisualIa.criado_em.desc(), AprendizadoVisualIa.id.desc())
            .first()
        )
        if item_referenciado:
            return item_referenciado
    return consulta.order_by(AprendizadoVisualIa.criado_em.desc(), AprendizadoVisualIa.id.desc()).first()


def registrar_aprendizado_visual_automatico_chat(
    banco: Session,
    *,
    empresa_id: int,
    laudo_id: int,
    criado_por_id: int,
    setor_industrial: str,
    mensagem_id: int,
    mensagem_chat: str,
    dados_imagem: str,
    referencia_mensagem_id: int | None = None,
) -> AprendizadoVisualIa | None:
    texto_chat = str(mensagem_chat or "").strip()
    tem_imagem = bool(str(dados_imagem or "").strip())
    veredito_chat = inferir_veredito_correcao_chat(texto_chat)
    correcao_detectada = bool(veredito_chat)

    if not tem_imagem and not correcao_detectada:
        return None

    if tem_imagem:
        evidencia = salvar_evidencia_aprendizado_visual(
            empresa_id=empresa_id,
            laudo_id=laudo_id,
            dados_imagem=dados_imagem,
            nome_imagem="chat-evidencia.png",
        )
        item = AprendizadoVisualIa(
            empresa_id=empresa_id,
            laudo_id=laudo_id,
            mensagem_referencia_id=mensagem_id,
            criado_por_id=criado_por_id,
            setor_industrial=str(setor_industrial or "geral").strip() or "geral",
            resumo=_resumir_texto_chat(texto_chat),
            descricao_contexto=(
                f"{DESCRICAO_CHAT_AUTOMATICA_PADRAO} Mensagem do inspetor: {texto_chat}"
                if texto_chat
                else DESCRICAO_CHAT_AUTOMATICA_PADRAO
            )[:4000],
            correcao_inspetor=texto_chat if correcao_detectada else CORRECAO_CHAT_AUTOMATICA_PADRAO,
            veredito_inspetor=veredito_chat or VereditoAprendizadoIa.DUVIDA.value,
            **evidencia,
        )
        banco.add(item)
        banco.flush()
        return item

    rascunho: AprendizadoVisualIa | None = obter_rascunho_aprendizado_visual_chat(
        banco,
        empresa_id=empresa_id,
        laudo_id=laudo_id,
        criado_por_id=criado_por_id,
        referencia_mensagem_id=referencia_mensagem_id,
    )
    if not rascunho:
        return None

    texto_existente = str(rascunho.correcao_inspetor or "").strip()
    if not texto_existente or texto_existente == CORRECAO_CHAT_AUTOMATICA_PADRAO:
        rascunho.correcao_inspetor = texto_chat
    elif _normalizar_texto_detector(texto_chat) not in _normalizar_texto_detector(texto_existente):
        rascunho.correcao_inspetor = f"{texto_existente}\n\nComplemento do inspetor no chat: {texto_chat}"[:4000]
    if veredito_chat:
        rascunho.veredito_inspetor = veredito_chat
    if not rascunho.resumo or rascunho.resumo == "Evidência visual capturada do chat":
        rascunho.resumo = _resumir_texto_chat(texto_chat)
    descricao_contexto = str(rascunho.descricao_contexto or "")
    if texto_chat and _normalizar_texto_detector(texto_chat) not in _normalizar_texto_detector(descricao_contexto):
        rascunho.descricao_contexto = f"{descricao_contexto} Complemento do inspetor no chat: {texto_chat}".strip()[:4000]
    banco.add(rascunho)
    banco.flush()
    return rascunho


def _extrair_termos_busca(texto: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-zÀ-ÿ0-9]{3,}", str(texto or "").lower())
        if token not in _STOPWORDS_APRENDIZADO
    }


def _formatar_marcacoes_para_prompt(marcacoes: Iterable[dict[str, Any]] | None) -> str:
    itens: list[str] = []
    for item in list(marcacoes or []):
        rotulo = str(item.get("rotulo") or "").strip()
        observacao = str(item.get("observacao") or "").strip()
        if rotulo and observacao:
            itens.append(f"{rotulo}: {observacao}")
        elif rotulo:
            itens.append(rotulo)
        elif observacao:
            itens.append(observacao)
    return "; ".join(itens[:4])


def construir_contexto_aprendizado_para_ia(
    banco: Session,
    *,
    empresa_id: int,
    laudo_id: int | None,
    setor_industrial: str,
    mensagem_atual: str,
    limite: int = 3,
) -> str:
    consulta = (
        banco.query(AprendizadoVisualIa)
        .filter(
            AprendizadoVisualIa.empresa_id == empresa_id,
            AprendizadoVisualIa.status == StatusAprendizadoIa.VALIDADO_MESA.value,
            or_(
                AprendizadoVisualIa.laudo_id == laudo_id,
                AprendizadoVisualIa.setor_industrial == setor_industrial,
            ),
        )
        .order_by(AprendizadoVisualIa.validado_em.desc(), AprendizadoVisualIa.id.desc())
        .limit(60)
        .all()
    )
    if not consulta:
        return ""

    termos_consulta = _extrair_termos_busca(mensagem_atual)
    candidatos: list[tuple[int, AprendizadoVisualIa]] = []
    for item in consulta:
        corpus = " ".join(
            [
                str(item.resumo or ""),
                str(item.sintese_consolidada or ""),
                str(item.parecer_mesa or ""),
                " ".join(normalizar_lista_textos(item.pontos_chave_json or [])),
                " ".join(normalizar_lista_textos(item.referencias_norma_json or [])),
                _formatar_marcacoes_para_prompt(item.marcacoes_json or []),
            ]
        )
        score = 0
        if laudo_id and item.laudo_id == laudo_id:
            score += 100
        if str(item.setor_industrial or "").strip() == str(setor_industrial or "").strip():
            score += 35
        score += len(termos_consulta & _extrair_termos_busca(corpus)) * 8
        if item.pontos_chave_json:
            score += min(len(item.pontos_chave_json), 4)
        candidatos.append((score, item))

    selecionados = [
        item
        for score, item in sorted(candidatos, key=lambda entry: (entry[0], entry[1].id), reverse=True)
        if score > 0
    ][:limite]
    if not selecionados:
        selecionados = [item for _score, item in candidatos[:limite]]
    if not selecionados:
        return ""

    blocos = [
        "[aprendizados_visuais_validados]",
        (
            "Considere os casos abaixo como referência validada pela mesa avaliadora. "
            "Em caso de divergência com a evidência atual, explique a diferença "
            "em vez de copiar o caso antigo."
        ),
    ]
    for indice, item in enumerate(selecionados, start=1):
        blocos.append(f"Caso {indice}:")
        blocos.append(f"- Resumo: {str(item.resumo or '').strip()}")
        blocos.append(f"- Veredito final da mesa: {str(item.veredito_mesa or item.veredito_inspetor or 'duvida')}")
        sintese = str(item.sintese_consolidada or item.parecer_mesa or item.correcao_inspetor or "").strip()
        if sintese:
            blocos.append(f"- Síntese validada: {sintese}")
        pontos = normalizar_lista_textos(item.pontos_chave_json or [], limite_itens=4, limite_chars=120)
        if pontos:
            blocos.append(f"- Pontos-chave: {'; '.join(pontos)}")
        normas = normalizar_lista_textos(item.referencias_norma_json or [], limite_itens=4, limite_chars=120)
        if normas:
            blocos.append(f"- Normas: {'; '.join(normas)}")
        marcacoes = _formatar_marcacoes_para_prompt(item.marcacoes_json or [])
        if marcacoes:
            blocos.append(f"- Marcações: {marcacoes}")
    blocos.append("[/aprendizados_visuais_validados]")
    return "\n".join(blocos)


def anexar_contexto_aprendizado_na_mensagem(
    mensagem_atual: str,
    *,
    contexto_aprendizado: str,
) -> str:
    texto = str(mensagem_atual or "").strip()
    if not contexto_aprendizado:
        return texto
    if not texto:
        return (
            f"{contexto_aprendizado}\n\n"
            "[solicitacao_atual]\n"
            "Sem texto adicional; analise a evidência enviada.\n"
            "[/solicitacao_atual]"
        )
    return f"{contexto_aprendizado}\n\n[solicitacao_atual]\n{texto}\n[/solicitacao_atual]"


__all__ = [
    "PASTA_APRENDIZADOS_VISUAIS_IA",
    "anexar_contexto_aprendizado_na_mensagem",
    "construir_contexto_aprendizado_para_ia",
    "listar_aprendizados_laudo",
    "normalizar_lista_textos",
    "normalizar_marcacoes_aprendizado",
    "obter_aprendizado_visual",
    "salvar_evidencia_aprendizado_visual",
    "serializar_aprendizado_visual",
]
