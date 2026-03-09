from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

CONFIANCA_ALTA = "alta"
CONFIANCA_MEDIA = "media"
CONFIANCA_BAIXA = "baixa"
CONFIANCAS_VALIDAS = {CONFIANCA_ALTA, CONFIANCA_MEDIA, CONFIANCA_BAIXA}
MAX_SECOES_CONFIANCA = 8
MAX_PONTOS_VALIDACAO_HUMANA = 5

TERMOS_EVIDENCIA_CONFIANCA = (
    "nr-",
    "nr ",
    "nbr",
    "item ",
    "art.",
    "artigo",
    "anexo",
    "foto",
    "evidencia",
    "medi",
    "laudo",
    "checklist",
    "avcb",
    "spda",
    "rti",
    "pie",
    "loto",
)

TERMOS_INCERTEZA_CONFIANCA = (
    "talvez",
    "aparente",
    "aparentemente",
    "possivel",
    "hipotese",
    "estimado",
    "sugere",
    "pode ser",
    "necessario validar",
    "validacao humana",
    "nao foi possivel confirmar",
    "sem evidencia",
    "sem confirmacao",
)

REGEX_CABECALHO_SECAO_MD = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*$")
REGEX_NUMERACAO_ESTRUTURADA = re.compile(
    r"\b(?:\d+[.,]?\d*|nr[-\s]?\d+|nbr\s?\d+)\b",
    flags=re.IGNORECASE,
)


def _agora_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resumo_texto_curto(texto: str, limite: int = 220) -> str:
    conteudo = " ".join((texto or "").split()).strip()
    if not conteudo:
        return ""
    if len(conteudo) <= limite:
        return conteudo
    return conteudo[: limite - 3].rstrip() + "..."


def _extrair_secoes_confianca(texto: str) -> list[dict[str, str]]:
    bruto = str(texto or "").strip()
    if not bruto:
        return []

    secoes: list[dict[str, str]] = []
    titulo_atual = "Sintese geral"
    linhas_atuais: list[str] = []

    for linha in bruto.splitlines():
        match = REGEX_CABECALHO_SECAO_MD.match(linha)
        if match:
            conteudo_secao = "\n".join(linhas_atuais).strip()
            if conteudo_secao:
                secoes.append({"titulo": titulo_atual, "conteudo": conteudo_secao})
            titulo_atual = _resumo_texto_curto(match.group(1), limite=80) or "Secao tecnica"
            linhas_atuais = []
            continue

        linhas_atuais.append(linha)

    conteudo_final = "\n".join(linhas_atuais).strip()
    if conteudo_final:
        secoes.append({"titulo": titulo_atual, "conteudo": conteudo_final})

    if not secoes:
        return [{"titulo": "Sintese geral", "conteudo": bruto}]

    return secoes[:MAX_SECOES_CONFIANCA]


def _score_confianca_secao(conteudo: str) -> tuple[float, list[str], list[str]]:
    texto = str(conteudo or "").strip()
    texto_lower = texto.lower()
    score = 0.0
    evidencias: list[str] = []
    incertezas: list[str] = []

    if len(texto) >= 160:
        score += 1.0
    elif len(texto) >= 80:
        score += 0.5

    if REGEX_NUMERACAO_ESTRUTURADA.search(texto):
        score += 1.0
        evidencias.append("dados numericos ou referencia normativa")

    for termo in TERMOS_EVIDENCIA_CONFIANCA:
        if termo in texto_lower:
            score += 0.25
            evidencias.append(termo)
            if len(evidencias) >= 3:
                break

    for termo in TERMOS_INCERTEZA_CONFIANCA:
        if termo in texto_lower:
            score -= 0.8
            incertezas.append(termo)
            if len(incertezas) >= 3:
                break

    return score, evidencias, incertezas


def _nivel_confianca_por_score(score: float) -> str:
    if score >= 1.9:
        return CONFIANCA_ALTA
    if score >= 0.7:
        return CONFIANCA_MEDIA
    return CONFIANCA_BAIXA


def normalizar_payload_confianca_ia(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    if not payload:
        return {}

    geral = str(payload.get("geral", "")).strip().lower()
    if geral not in CONFIANCAS_VALIDAS:
        geral = CONFIANCA_MEDIA

    secoes_brutas = payload.get("secoes", [])
    secoes_normalizadas: list[dict[str, Any]] = []
    if isinstance(secoes_brutas, list):
        for secao in secoes_brutas[:MAX_SECOES_CONFIANCA]:
            if not isinstance(secao, dict):
                continue
            nivel = str(secao.get("confianca", "")).strip().lower()
            if nivel not in CONFIANCAS_VALIDAS:
                nivel = CONFIANCA_MEDIA

            titulo = _resumo_texto_curto(str(secao.get("titulo", "") or ""), limite=90) or "Secao"
            trecho = _resumo_texto_curto(str(secao.get("trecho", "") or ""), limite=180)

            secoes_normalizadas.append(
                {
                    "titulo": titulo,
                    "confianca": nivel,
                    "trecho": trecho,
                    "requer_validacao_humana": bool(secao.get("requer_validacao_humana", False)),
                    "justificativa": _resumo_texto_curto(str(secao.get("justificativa", "") or ""), limite=160),
                }
            )

    pontos_brutos = payload.get("pontos_validacao_humana", [])
    pontos = []
    if isinstance(pontos_brutos, list):
        for item in pontos_brutos[:MAX_PONTOS_VALIDACAO_HUMANA]:
            texto = _resumo_texto_curto(str(item or ""), limite=160)
            if texto:
                pontos.append(texto)

    return {
        "geral": geral,
        "secoes": secoes_normalizadas,
        "pontos_validacao_humana": pontos,
        "gerado_em": str(payload.get("gerado_em", "") or _agora_utc_iso()),
    }


def analisar_confianca_resposta_ia(texto: str) -> dict[str, Any]:
    secoes = _extrair_secoes_confianca(texto)
    if not secoes:
        return {}

    secoes_resultado: list[dict[str, Any]] = []
    pontuacoes: list[float] = []
    pontos_validacao: list[str] = []

    for secao in secoes:
        titulo = secao.get("titulo", "Secao")
        conteudo = secao.get("conteudo", "")
        score, evidencias, incertezas = _score_confianca_secao(conteudo)
        nivel = _nivel_confianca_por_score(score)
        pontuacoes.append(score)

        justificativas: list[str] = []
        if evidencias:
            justificativas.append("com evidencias textuais")
        if incertezas:
            justificativas.append("com pontos de incerteza")
        justificativa = ", ".join(justificativas) if justificativas else "analise textual automatica"

        requer_validacao_humana = nivel == CONFIANCA_BAIXA or bool(incertezas)
        if requer_validacao_humana and len(pontos_validacao) < MAX_PONTOS_VALIDACAO_HUMANA:
            razao = incertezas[0] if incertezas else "baixo nivel de confianca"
            pontos_validacao.append(f"{titulo}: validar '{razao}'.")

        secoes_resultado.append(
            {
                "titulo": titulo,
                "confianca": nivel,
                "score": round(score, 2),
                "trecho": _resumo_texto_curto(conteudo, limite=180),
                "justificativa": justificativa,
                "requer_validacao_humana": requer_validacao_humana,
            }
        )

    score_medio = (sum(pontuacoes) / len(pontuacoes)) if pontuacoes else 0.0
    geral = _nivel_confianca_por_score(score_medio)

    return normalizar_payload_confianca_ia(
        {
            "geral": geral,
            "secoes": secoes_resultado,
            "pontos_validacao_humana": pontos_validacao,
            "gerado_em": _agora_utc_iso(),
        }
    )


def _titulo_confianca_humano(nivel: str) -> str:
    mapa = {
        CONFIANCA_ALTA: "Alta",
        CONFIANCA_MEDIA: "Media",
        CONFIANCA_BAIXA: "Baixa",
    }
    return mapa.get(str(nivel or "").strip().lower(), "Media")

