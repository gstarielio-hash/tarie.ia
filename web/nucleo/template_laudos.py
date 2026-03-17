from __future__ import annotations

import io
import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fpdf import FPDF
from pypdf import PdfReader, PdfWriter

_MM_POR_PT = 25.4 / 72.0
_MAX_UPLOAD_TEMPLATE_BYTES = 15 * 1024 * 1024
_DIR_TEMPLATES_BASE = Path(
    os.getenv(
        "DIR_TEMPLATES_LAUDO",
        str(Path(tempfile.gettempdir()) / "tariel_templates_laudo"),
    )
).resolve()


def normalizar_codigo_template(valor: str) -> str:
    bruto = re.sub(r"[^a-zA-Z0-9_\-]+", "_", (valor or "").strip().lower())
    normalizado = re.sub(r"_+", "_", bruto).strip("_-")
    return normalizado[:80] or "template"


def mapeamento_cbmgo_padrao() -> dict[str, Any]:
    return {
        "pages": [
            {
                "page": 1,
                "fields": [
                    {"key": "informacoes_gerais.responsavel_pela_inspecao", "x": 12, "y": 95, "w": 92, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.data_inspecao", "x": 114, "y": 95, "w": 32, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.local_inspecao", "x": 12, "y": 101, "w": 92, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.cnpj", "x": 114, "y": 101, "w": 58, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.numero_projeto_cbmgo", "x": 12, "y": 107, "w": 102, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.numero_cercon", "x": 114, "y": 113, "w": 32, "h": 4.6, "font_size": 8},
                    {"key": "informacoes_gerais.validade_cercon", "x": 152, "y": 113, "w": 22, "h": 4.6, "font_size": 8},
                ],
            },
            {
                "page": 2,
                "fields": [
                    {"key": "trrf_observacoes", "x": 12, "y": 142, "w": 186, "h": 4.2, "font_size": 7.5, "multiline": True},
                    {"key": "resumo_executivo", "x": 12, "y": 182, "w": 186, "h": 4.2, "font_size": 7.5, "multiline": True},
                ],
            },
            {
                "page": 3,
                "fields": [
                    {"key": "coleta_assinaturas.responsavel_pela_inspecao", "x": 12, "y": 48, "w": 186, "h": 5, "font_size": 8},
                    {"key": "coleta_assinaturas.assinatura_responsavel", "x": 12, "y": 58, "w": 186, "h": 5, "font_size": 8},
                    {"key": "coleta_assinaturas.responsavel_empresa_acompanhamento", "x": 12, "y": 68, "w": 186, "h": 5, "font_size": 8},
                    {"key": "coleta_assinaturas.assinatura_empresa", "x": 12, "y": 78, "w": 186, "h": 5, "font_size": 8},
                ],
            },
        ]
    }


def normalizar_mapeamento_campos(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    pages_brutas = payload.get("pages") if isinstance(payload, dict) else []
    pages: list[dict[str, Any]] = []

    if not isinstance(pages_brutas, list):
        pages_brutas = []

    for item in pages_brutas:
        if not isinstance(item, dict):
            continue
        try:
            pagina = int(item.get("page", 0))
        except (TypeError, ValueError):
            pagina = 0
        if pagina <= 0:
            continue

        fields_brutos = item.get("fields")
        fields: list[dict[str, Any]] = []
        if isinstance(fields_brutos, list):
            for field in fields_brutos:
                if not isinstance(field, dict):
                    continue
                chave = str(field.get("key") or "").strip()
                if not chave:
                    continue
                try:
                    x = float(field.get("x", 0))
                    y = float(field.get("y", 0))
                    w = float(field.get("w", 60))
                    h = float(field.get("h", 4.5))
                except (TypeError, ValueError):
                    continue

                fields.append(
                    {
                        "key": chave,
                        "x": max(x, 0.0),
                        "y": max(y, 0.0),
                        "w": max(w, 1.0),
                        "h": max(h, 1.0),
                        "font_size": float(field.get("font_size", 8) or 8),
                        "align": str(field.get("align", "L") or "L")[:1].upper(),
                        "multiline": bool(field.get("multiline", False)),
                        "max_chars": int(field.get("max_chars", 0) or 0),
                    }
                )

        pages.append({"page": pagina, "fields": fields})

    return {"pages": pages}


def salvar_pdf_template_base(
    arquivo_bytes: bytes,
    *,
    empresa_id: int,
    codigo_template: str,
    versao: int,
) -> str:
    if not arquivo_bytes:
        raise ValueError("Arquivo PDF obrigatório.")
    if len(arquivo_bytes) > _MAX_UPLOAD_TEMPLATE_BYTES:
        raise ValueError("Arquivo excede o limite de 15 MB.")

    try:
        _ = PdfReader(io.BytesIO(arquivo_bytes))
    except Exception as exc:
        raise ValueError("Arquivo inválido. Envie um PDF válido.") from exc

    codigo = normalizar_codigo_template(codigo_template)
    pasta_empresa = _DIR_TEMPLATES_BASE / f"empresa_{int(empresa_id)}"
    pasta_empresa.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"{codigo}_v{int(versao)}_{uuid.uuid4().hex[:10]}.pdf"
    caminho = (pasta_empresa / nome_arquivo).resolve()
    caminho.write_bytes(arquivo_bytes)
    return str(caminho)


def _obter_valor_por_caminho(payload: dict[str, Any], caminho: str) -> Any:
    atual: Any = payload
    for parte in str(caminho or "").split("."):
        chave = parte.strip()
        if not chave:
            continue
        if isinstance(atual, dict):
            atual = atual.get(chave)
        else:
            return None
    return atual


def _sanitizar_texto(valor: Any) -> str:
    if valor is None:
        return ""
    if isinstance(valor, (dict, list)):
        texto = json.dumps(valor, ensure_ascii=False)
    else:
        texto = str(valor)
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto.encode("latin-1", errors="replace").decode("latin-1")


def _gerar_overlay_pagina(
    *,
    largura_pt: float,
    altura_pt: float,
    fields: list[dict[str, Any]],
    dados_formulario: dict[str, Any],
) -> bytes:
    largura_mm = max(float(largura_pt) * _MM_POR_PT, 1.0)
    altura_mm = max(float(altura_pt) * _MM_POR_PT, 1.0)

    overlay = FPDF(unit="mm", format=(largura_mm, altura_mm))
    overlay.set_auto_page_break(auto=False)
    overlay.add_page()

    for field in fields:
        chave = str(field.get("key") or "").strip()
        if not chave:
            continue

        valor = _obter_valor_por_caminho(dados_formulario, chave)
        texto = _sanitizar_texto(valor)
        if not texto:
            continue

        max_chars = int(field.get("max_chars", 0) or 0)
        if max_chars > 0:
            texto = texto[:max_chars]

        x = float(field.get("x", 0) or 0)
        y = float(field.get("y", 0) or 0)
        w = max(float(field.get("w", 60) or 60), 1.0)
        h = max(float(field.get("h", 4.5) or 4.5), 1.0)
        tamanho = max(float(field.get("font_size", 8) or 8), 4.0)
        align = str(field.get("align", "L") or "L")[:1].upper()
        multiline = bool(field.get("multiline", False))

        if align not in {"L", "C", "R", "J"}:
            align = "L"

        overlay.set_font("helvetica", "", tamanho)
        overlay.set_xy(x, y)
        if multiline:
            overlay.multi_cell(w=w, h=h, text=texto, border=0, align=align)
        else:
            overlay.cell(w=w, h=h, text=texto, border=0, align=align)

    overlay_raw = overlay.output()
    if isinstance(overlay_raw, bytearray):
        return bytes(overlay_raw)
    if isinstance(overlay_raw, bytes):
        return overlay_raw
    return str(overlay_raw).encode("latin-1", errors="replace")


def gerar_preview_pdf_template(
    *,
    caminho_pdf_base: str,
    mapeamento_campos: dict[str, Any] | None,
    dados_formulario: dict[str, Any],
) -> bytes:
    caminho = Path(str(caminho_pdf_base or "")).resolve()
    if not caminho.exists():
        raise FileNotFoundError("Arquivo base do template não encontrado.")

    leitor = PdfReader(str(caminho))
    escritor = PdfWriter(clone_from=leitor)
    mapa = normalizar_mapeamento_campos(mapeamento_campos)
    pages_cfg = {int(item["page"]): list(item.get("fields", [])) for item in mapa.get("pages", [])}

    for indice, pagina_base in enumerate(escritor.pages, start=1):
        fields = pages_cfg.get(indice, [])
        if fields:
            overlay_bytes = _gerar_overlay_pagina(
                largura_pt=float(pagina_base.mediabox.width),
                altura_pt=float(pagina_base.mediabox.height),
                fields=fields,
                dados_formulario=dados_formulario,
            )
            pagina_overlay = PdfReader(io.BytesIO(overlay_bytes)).pages[0]
            pagina_base.merge_page(pagina_overlay)

    buffer_saida = io.BytesIO()
    escritor.write(buffer_saida)
    return buffer_saida.getvalue()
