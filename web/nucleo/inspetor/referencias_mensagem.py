from __future__ import annotations

import re

PADRAO_REFERENCIA = re.compile(r"^\[REF_MSG_ID:(\d+)\]\s*", re.IGNORECASE)


def compor_texto_com_referencia(texto: str, referencia_mensagem_id: int | None = None) -> str:
    conteudo = (texto or "").strip()
    if not conteudo:
        return ""

    if isinstance(referencia_mensagem_id, int) and referencia_mensagem_id > 0:
        return f"[REF_MSG_ID:{referencia_mensagem_id}] {conteudo}"

    return conteudo


def extrair_referencia_do_texto(texto: str) -> tuple[int | None, str]:
    conteudo = (texto or "").strip()
    if not conteudo:
        return None, ""

    encontrado = PADRAO_REFERENCIA.match(conteudo)
    if not encontrado:
        return None, conteudo

    referencia_id = int(encontrado.group(1))
    texto_limpo = conteudo[encontrado.end() :].lstrip()
    return referencia_id, texto_limpo
