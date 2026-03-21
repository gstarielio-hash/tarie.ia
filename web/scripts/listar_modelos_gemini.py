from __future__ import annotations

import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from google.genai import Client

DIR_PROJETO = Path(__file__).resolve().parents[1]
load_dotenv(DIR_PROJETO / ".env")


def _suporta_geracao(modelo) -> bool:
    for campo in ("supported_generation_methods", "supported_actions"):
        valores = getattr(modelo, campo, None)
        if not valores:
            continue
        if any("generate" in str(item).lower() for item in valores):
            return True
    return False


def main(argv: list[str] | None = None) -> int:
    del argv

    chave = str(os.getenv("CHAVE_API_GEMINI", "") or "").strip()
    if not chave:
        print("CHAVE_API_GEMINI nao configurada.", file=sys.stderr)
        return 1

    cliente = Client(api_key=chave)
    encontrados = 0

    print("Modelos Gemini com suporte aparente a geracao:")
    for modelo in cliente.models.list():
        if not _suporta_geracao(modelo):
            continue
        nome = getattr(modelo, "name", None) or getattr(modelo, "display_name", None) or "<sem-nome>"
        print(f"- {nome}")
        encontrados += 1

    if encontrados == 0:
        print("Nenhum modelo compativel encontrado para a chave configurada.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
