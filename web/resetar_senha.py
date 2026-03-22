"""Wrapper legado para o CLI oficial `scripts/resetar_senha.py`."""

from __future__ import annotations

from pathlib import Path
import sys

DIR_PROJETO = Path(__file__).resolve().parent
if str(DIR_PROJETO) not in sys.path:
    sys.path.insert(0, str(DIR_PROJETO))

from scripts.resetar_senha import main  # noqa: E402


if __name__ == "__main__":
    print(
        "Aviso: `resetar_senha.py` na raiz esta deprecated. "
        "Use `python3 scripts/resetar_senha.py`.",
        file=sys.stderr,
    )
    raise SystemExit(main())
