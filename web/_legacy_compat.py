"""Helpers para wrappers legados da raiz do projeto."""

from __future__ import annotations

from importlib import import_module
from typing import Any
import os
import warnings

LEGACY_IMPORTS_ENV = "TARIEL_ALLOW_LEGACY_IMPORTS"
_VALORES_TRUTHY = frozenset({"1", "true", "yes", "on", "sim"})


def _legacy_imports_habilitados() -> bool:
    return os.getenv(LEGACY_IMPORTS_ENV, "").strip().lower() in _VALORES_TRUTHY


def _mensagem_modulo_legado_desabilitado(
    legacy_name: str,
    targets: tuple[str, ...],
) -> str:
    destinos = ", ".join(targets)
    return (
        f"O modulo legado `{legacy_name}` da raiz esta desabilitado por padrao. "
        f"Use {destinos}. "
        f"Se precisar de compatibilidade temporaria durante migracao controlada, "
        f"habilite `{LEGACY_IMPORTS_ENV}=1` apenas para esse processo."
    )


def reexport_legacy_module(
    legacy_name: str,
    target_names: str | tuple[str, ...],
    namespace: dict[str, Any],
) -> None:
    targets = (target_names,) if isinstance(target_names, str) else tuple(target_names)
    if not targets:
        raise ValueError("Ao menos um modulo alvo e obrigatorio.")

    if not _legacy_imports_habilitados():
        raise ImportError(_mensagem_modulo_legado_desabilitado(legacy_name, targets))

    warnings.warn(
        (
            f"O modulo legado `{legacy_name}` esta deprecated. "
            f"Use {', '.join(targets)}. "
            f"Compatibilidade temporaria habilitada via {LEGACY_IMPORTS_ENV}=1."
        ),
        DeprecationWarning,
        stacklevel=2,
    )

    exported: set[str] = set()
    for target_name in targets:
        target = import_module(target_name)
        for attr in dir(target):
            if attr.startswith("__"):
                continue
            namespace[attr] = getattr(target, attr)
            if not attr.startswith("_"):
                exported.add(attr)

    namespace["_LEGACY_TARGETS"] = targets
    namespace["__all__"] = tuple(sorted(exported))
