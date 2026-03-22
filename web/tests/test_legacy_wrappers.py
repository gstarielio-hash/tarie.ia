from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


DIR_WEB = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def _executar_import(module_name: str, *, habilitar_compat: bool = False) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("TARIEL_ALLOW_LEGACY_IMPORTS", None)
    if habilitar_compat:
        env["TARIEL_ALLOW_LEGACY_IMPORTS"] = "1"

    return subprocess.run(
        [
            PYTHON,
            "-c",
            (
                "import importlib; "
                f"mod = importlib.import_module('{module_name}'); "
                "print(getattr(mod, '__name__', 'sem_nome'))"
            ),
        ],
        cwd=str(DIR_WEB),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_wrappers_legados_de_modulo_falham_por_padrao() -> None:
    resultado = _executar_import("banco_dados")

    assert resultado.returncode != 0
    combinado = f"{resultado.stdout}\n{resultado.stderr}"
    assert "TARIEL_ALLOW_LEGACY_IMPORTS=1" in combinado
    assert "app.shared.database" in combinado


def test_wrapper_legado_pode_ser_reabilitado_em_migracao_controlada() -> None:
    resultado = _executar_import("banco_dados", habilitar_compat=True)

    assert resultado.returncode == 0
    assert "banco_dados" in resultado.stdout
