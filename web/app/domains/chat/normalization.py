"""Helpers de normalização e catálogos do domínio Chat/Inspetor."""

from __future__ import annotations

import re

SETORES_PERMITIDOS = frozenset(
    {
        "geral",
        "eletrica",
        "mecanica",
        "caldeiraria",
        "spda",
        "loto",
        "nr10",
        "nr12",
        "nr13",
        "nr35",
        "avcb",
        "pie",
        "rti",
    }
)

TIPOS_TEMPLATE_VALIDOS = {
    "cbmgo": "CBM-GO Vistoria Bombeiro",
    "rti": "NR-10 RTI Elétrica",
    "nr10_rti": "NR-10 RTI Elétrica",
    "nr13": "NR-13 Caldeiras",
    "nr13_caldeira": "NR-13 Caldeiras",
    "nr12maquinas": "NR-12 Máquinas",
    "nr12_maquinas": "NR-12 Máquinas",
    "spda": "SPDA Proteção Descargas",
    "pie": "PIE Instalações Elétricas",
    "avcb": "AVCB Projeto Bombeiro",
    "padrao": "Inspeção Geral (Padrão)",
}

ALIASES_TEMPLATE = {
    "nr12": "nr12maquinas",
    "nr12_maquinas": "nr12maquinas",
    "nr12maquinas": "nr12maquinas",
    "rti": "rti",
    "nr10_rti": "rti",
    "nr13": "nr13",
    "nr13_caldeira": "nr13",
    "cbmgo": "cbmgo",
    "spda": "spda",
    "pie": "pie",
    "avcb": "avcb",
    "padrao": "padrao",
}


def normalizar_email(email: str) -> str:
    return (email or "").strip().lower()


def normalizar_setor(valor: str) -> str:
    setor = (valor or "").strip().lower()
    return setor if setor in SETORES_PERMITIDOS else "geral"


def normalizar_tipo_template(valor: str) -> str:
    bruto = (valor or "").strip().lower()
    return ALIASES_TEMPLATE.get(bruto, "padrao")


def codigos_template_compativeis(tipo_template: str) -> list[str]:
    tipo = normalizar_tipo_template(tipo_template)
    variantes_por_tipo: dict[str, list[str]] = {
        "cbmgo": ["cbmgo", "cbmgo_cmar", "checklist_cbmgo"],
        "rti": ["rti", "nr10_rti"],
        "nr13": ["nr13", "nr13_caldeira"],
        "nr12maquinas": ["nr12maquinas", "nr12_maquinas"],
        "padrao": ["padrao"],
    }

    candidatos = [tipo, *variantes_por_tipo.get(tipo, [])]
    vistos: set[str] = set()
    codigos: list[str] = []
    for item in candidatos:
        codigo = re.sub(r"[^a-z0-9_-]+", "_", str(item or "").strip().lower()).strip("_-")
        if not codigo or codigo in vistos:
            continue
        vistos.add(codigo)
        codigos.append(codigo)
    return codigos


def nome_template_humano(tipo_template: str) -> str:
    tipo = normalizar_tipo_template(tipo_template)
    return TIPOS_TEMPLATE_VALIDOS.get(tipo, TIPOS_TEMPLATE_VALIDOS["padrao"])


__all__ = [
    "SETORES_PERMITIDOS",
    "TIPOS_TEMPLATE_VALIDOS",
    "ALIASES_TEMPLATE",
    "normalizar_email",
    "normalizar_setor",
    "normalizar_tipo_template",
    "codigos_template_compativeis",
    "nome_template_humano",
]
