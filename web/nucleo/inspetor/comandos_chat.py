from __future__ import annotations

import re
from typing import Callable

REGEX_PREFIXO_MESA = re.compile(
    r"^@?(?:insp|inspetor|eng|engenharia|revisor|mesa|avaliador|avaliacao)\b\s*[:\-]?\s*",
    flags=re.IGNORECASE,
)

REGEX_COMANDO_NATURAL_MESA = re.compile(
    r"^(?:por\s+favor\s+)?(?:avise|avisa|avisar|notifique|notifica|notificar|comunique|comunica|comunicar)\s+"
    r"(?:a\s+)?(?:mesa(?:\s+avaliadora)?|engenharia|revisor(?:es)?|avaliador(?:es)?|avaliacao)\b"
    r"(?:\s+(?:que|sobre))?\s*[:\-]?\s*",
    flags=re.IGNORECASE,
)

REGEX_COMANDO_FINALIZAR_NOVO = re.compile(
    r"^COMANDO_SISTEMA\s+FINALIZARLAUDOAGORA(?:\s+TIPO\s+([a-zA-Z0-9_]+))?\s*$",
    flags=re.IGNORECASE,
)

REGEX_COMANDO_FINALIZAR_LEGADO = re.compile(
    r"^\[COMANDO_SISTEMA\]:\s*FINALIZAR_LAUDO_AGORA(?:\s*\|\s*TIPO:\s*([a-zA-Z0-9_]+))?\s*$",
    flags=re.IGNORECASE,
)

COMANDOS_RAPIDOS_CHAT = frozenset(
    {
        "/pendencias",
        "/resumo",
        "/enviar_mesa",
        "/gerar_previa",
    }
)


def mensagem_para_mesa(texto: str) -> bool:
    valor = (texto or "").strip()
    return bool(REGEX_PREFIXO_MESA.match(valor) or REGEX_COMANDO_NATURAL_MESA.match(valor))


def remover_mencao_mesa(texto: str) -> str:
    valor = (texto or "").strip()
    sem_prefixo = REGEX_PREFIXO_MESA.sub("", valor, count=1).strip()
    if sem_prefixo != valor:
        return sem_prefixo
    return REGEX_COMANDO_NATURAL_MESA.sub("", valor, count=1).strip()


def analisar_comando_rapido_chat(texto: str) -> tuple[str, str]:
    bruto = (texto or "").strip()
    if not bruto.startswith("/"):
        return "", ""

    comando_bruto, _, restante = bruto.partition(" ")
    comando = comando_bruto.strip().lower()
    if comando not in COMANDOS_RAPIDOS_CHAT:
        return "", ""

    return comando.lstrip("/"), restante.strip()


def analisar_comando_finalizacao(
    texto: str,
    *,
    normalizar_tipo_template: Callable[[str], str],
) -> tuple[bool, str]:
    bruto = (texto or "").strip()
    if not bruto:
        return False, "padrao"

    match_novo = REGEX_COMANDO_FINALIZAR_NOVO.match(bruto)
    if match_novo:
        return True, normalizar_tipo_template(match_novo.group(1) or "padrao")

    match_legado = REGEX_COMANDO_FINALIZAR_LEGADO.match(bruto)
    if match_legado:
        return True, normalizar_tipo_template(match_legado.group(1) or "padrao")

    return False, "padrao"
