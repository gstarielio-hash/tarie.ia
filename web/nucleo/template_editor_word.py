from __future__ import annotations

import base64
import html
import io
import logging
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from pypdf import PdfReader

from nucleo.template_laudos import normalizar_codigo_template, salvar_pdf_template_base

logger = logging.getLogger(__name__)

MODO_EDITOR_LEGADO = "legado_pdf"
MODO_EDITOR_RICO = "editor_rico"

MAX_NODES_DOCUMENTO = 5_000
MAX_PROFUNDIDADE_DOCUMENTO = 45
MAX_ASSET_BYTES = 5 * 1024 * 1024
MAX_PLACEHOLDER_CHARS = 120

REGEX_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.:\-]{1,120})\s*\}\}")
REGEX_TOKEN_SEGMENTO = re.compile(r"^[a-zA-Z0-9_.\-]{1,120}$")

MIME_IMAGEM_PERMITIDO = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

_DIR_EDITOR_ASSETS = Path(
    os.getenv(
        "DIR_EDITOR_TEMPLATES_ASSETS",
        str(Path(tempfile.gettempdir()) / "tariel_templates_editor_assets"),
    )
).resolve()


def _agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalizar_modo_editor(valor: str | None) -> str:
    modo = str(valor or "").strip().lower()
    if modo == MODO_EDITOR_RICO:
        return MODO_EDITOR_RICO
    return MODO_EDITOR_LEGADO


def documento_editor_padrao() -> dict[str, Any]:
    return {
        "version": 1,
        "doc": {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "Template Técnico Tariel.ia"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "Use {{json_path:informacoes_gerais.local_inspecao}} e {{token:cliente_nome}} para preencher automaticamente.",
                        }
                    ],
                },
            ],
        },
    }


def estilo_editor_padrao() -> dict[str, Any]:
    return {
        "pagina": {
            "size": "A4",
            "orientation": "portrait",
            "margens_mm": {"top": 18, "right": 14, "bottom": 18, "left": 14},
        },
        "tipografia": {
            "font_family": "Inter, 'Segoe UI', Arial, sans-serif",
            "font_size_px": 12,
            "line_height": 1.45,
        },
        "cabecalho_texto": "",
        "rodape_texto": "",
        "marca_dagua": {"texto": "", "opacity": 0.08, "font_size_px": 72, "rotate_deg": -32},
    }


def _contar_nodes(node: Any, profundidade: int = 0) -> int:
    if profundidade > MAX_PROFUNDIDADE_DOCUMENTO:
        return MAX_NODES_DOCUMENTO + 1
    if isinstance(node, dict):
        total = 1
        content = node.get("content")
        if isinstance(content, list):
            for child in content:
                total += _contar_nodes(child, profundidade + 1)
                if total > MAX_NODES_DOCUMENTO:
                    return total
        return total
    if isinstance(node, list):
        total = 0
        for child in node:
            total += _contar_nodes(child, profundidade + 1)
            if total > MAX_NODES_DOCUMENTO:
                return total
        return total
    return 1


def normalizar_documento_editor(payload: dict[str, Any] | None) -> dict[str, Any]:
    base = documento_editor_padrao()
    if not isinstance(payload, dict):
        return base

    doc = payload.get("doc")
    if not isinstance(doc, dict) or str(doc.get("type") or "").strip().lower() != "doc":
        return base
    if _contar_nodes(doc) > MAX_NODES_DOCUMENTO:
        raise ValueError("Documento do editor excede o limite de complexidade.")

    return {
        "version": int(payload.get("version") or 1),
        "doc": doc,
    }


def normalizar_estilo_editor(payload: dict[str, Any] | None) -> dict[str, Any]:
    base = estilo_editor_padrao()
    if not isinstance(payload, dict):
        return base

    pagina_bruta = payload.get("pagina")
    if isinstance(pagina_bruta, dict):
        orientation = str(pagina_bruta.get("orientation") or "portrait").strip().lower()
        if orientation not in {"portrait", "landscape"}:
            orientation = "portrait"
        margens = pagina_bruta.get("margens_mm")
        if not isinstance(margens, dict):
            margens = {}
        base["pagina"] = {
            "size": "A4",
            "orientation": orientation,
            "margens_mm": {
                "top": max(5, min(40, int(margens.get("top", 18) or 18))),
                "right": max(5, min(40, int(margens.get("right", 14) or 14))),
                "bottom": max(5, min(40, int(margens.get("bottom", 18) or 18))),
                "left": max(5, min(40, int(margens.get("left", 14) or 14))),
            },
        }

    tipografia = payload.get("tipografia")
    if isinstance(tipografia, dict):
        base["tipografia"] = {
            "font_family": str(tipografia.get("font_family") or base["tipografia"]["font_family"])[:120],
            "font_size_px": max(10, min(18, int(tipografia.get("font_size_px", 12) or 12))),
            "line_height": max(1.2, min(2.0, float(tipografia.get("line_height", 1.45) or 1.45))),
        }

    base["cabecalho_texto"] = str(payload.get("cabecalho_texto") or "").strip()[:200]
    base["rodape_texto"] = str(payload.get("rodape_texto") or "").strip()[:200]

    marca_dagua = payload.get("marca_dagua")
    if isinstance(marca_dagua, dict):
        base["marca_dagua"] = {
            "texto": str(marca_dagua.get("texto") or "").strip()[:120],
            "opacity": max(0.02, min(0.35, float(marca_dagua.get("opacity", 0.08) or 0.08))),
            "font_size_px": max(24, min(160, int(marca_dagua.get("font_size_px", 72) or 72))),
            "rotate_deg": max(-70, min(70, int(marca_dagua.get("rotate_deg", -32) or -32))),
        }
    return base


def _normalizar_assets(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return []
    saida: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        asset_id = str(item.get("id") or "").strip()[:40]
        path = str(item.get("path") or "").strip()
        mime = str(item.get("mime_type") or "").strip().lower()
        if not asset_id or not path or mime not in MIME_IMAGEM_PERMITIDO:
            continue
        saida.append(
            {
                "id": asset_id,
                "filename": str(item.get("filename") or "imagem"),
                "mime_type": mime,
                "path": path,
                "size_bytes": int(item.get("size_bytes") or 0),
                "created_em": str(item.get("created_em") or ""),
            }
        )
    return saida


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


def _resolver_placeholder(raw: str, dados_formulario: dict[str, Any]) -> str:
    bruto = str(raw or "").strip()
    if not bruto:
        return ""

    modo = "token"
    chave = bruto
    if ":" in bruto:
        candidato_modo, candidato_chave = bruto.split(":", 1)
        candidato_modo = str(candidato_modo or "").strip().lower()
        candidato_chave = str(candidato_chave or "").strip()
        if candidato_modo in {"json_path", "token"} and candidato_chave:
            modo = candidato_modo
            chave = candidato_chave

    if not REGEX_TOKEN_SEGMENTO.match(chave):
        return ""

    if modo == "json_path" or "." in chave:
        valor = _obter_valor_por_caminho(dados_formulario, chave)
    else:
        tokens = dados_formulario.get("tokens") if isinstance(dados_formulario.get("tokens"), dict) else {}
        valor = tokens.get(chave)
        if valor is None:
            valor = dados_formulario.get(chave)

    if valor is None:
        return ""
    if isinstance(valor, (dict, list)):
        return html.escape(str(valor), quote=True)
    return html.escape(str(valor), quote=True)


def _substituir_placeholders_texto(texto: str, dados_formulario: dict[str, Any]) -> str:
    texto_bruto = str(texto or "")

    def _replace(match: re.Match[str]) -> str:
        chave = str(match.group(1) or "").strip()[:MAX_PLACEHOLDER_CHARS]
        return _resolver_placeholder(chave, dados_formulario)

    resolvido = REGEX_PLACEHOLDER.sub(_replace, texto_bruto)
    return html.escape(resolvido, quote=True).replace("\n", "<br>")


def _aplicar_marks(texto_html: str, marks: list[dict[str, Any]] | None) -> str:
    resultado = texto_html
    for mark in marks or []:
        tipo = str((mark or {}).get("type") or "").strip().lower()
        attrs = (mark or {}).get("attrs") if isinstance(mark, dict) else {}
        if tipo == "bold":
            resultado = f"<strong>{resultado}</strong>"
        elif tipo == "italic":
            resultado = f"<em>{resultado}</em>"
        elif tipo == "underline":
            resultado = f"<u>{resultado}</u>"
        elif tipo == "strike":
            resultado = f"<s>{resultado}</s>"
        elif tipo == "link":
            href = ""
            if isinstance(attrs, dict):
                href = str(attrs.get("href") or "").strip()
            if href.startswith("http://") or href.startswith("https://"):
                href_seguro = html.escape(href, quote=True)
                resultado = f'<a href="{href_seguro}" target="_blank" rel="noopener noreferrer">{resultado}</a>'
    return resultado


def _asset_para_data_uri(asset: dict[str, Any]) -> str:
    caminho = Path(str(asset.get("path") or "")).resolve()
    if not caminho.exists() or not caminho.is_file():
        return ""
    mime = str(asset.get("mime_type") or "").strip().lower()
    if mime not in MIME_IMAGEM_PERMITIDO:
        return ""
    conteudo = caminho.read_bytes()
    if len(conteudo) > MAX_ASSET_BYTES:
        return ""
    base = base64.b64encode(conteudo).decode("ascii")
    return f"data:{mime};base64,{base}"


def _render_nodes_html(
    nodes: list[dict[str, Any]],
    *,
    dados_formulario: dict[str, Any],
    assets_map: dict[str, dict[str, Any]],
) -> str:
    partes: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        tipo = str(node.get("type") or "").strip()
        content = node.get("content")
        filhos = content if isinstance(content, list) else []
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}

        if tipo == "text":
            texto = _substituir_placeholders_texto(str(node.get("text") or ""), dados_formulario)
            partes.append(_aplicar_marks(texto, node.get("marks") if isinstance(node.get("marks"), list) else []))
            continue

        if tipo == "hardBreak":
            partes.append("<br>")
            continue

        if tipo == "placeholder":
            raw = str(attrs.get("raw") or "").strip()
            if not raw:
                mode = str(attrs.get("mode") or "token").strip().lower()
                key = str(attrs.get("key") or "").strip()
                raw = f"{mode}:{key}" if key else ""
            partes.append(_resolver_placeholder(raw, dados_formulario))
            continue

        if tipo == "paragraph":
            partes.append(f"<p>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</p>")
            continue

        if tipo == "heading":
            nivel = int(attrs.get("level") or 2)
            nivel = max(1, min(4, nivel))
            partes.append(f"<h{nivel}>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</h{nivel}>")
            continue

        if tipo == "bulletList":
            partes.append(f"<ul>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</ul>")
            continue

        if tipo == "orderedList":
            partes.append(f"<ol>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</ol>")
            continue

        if tipo == "listItem":
            partes.append(f"<li>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</li>")
            continue

        if tipo == "table":
            partes.append(
                "<table><tbody>"
                + _render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)
                + "</tbody></table>"
            )
            continue

        if tipo == "tableRow":
            partes.append(f"<tr>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</tr>")
            continue

        if tipo in {"tableCell", "tableHeader"}:
            tag = "th" if tipo == "tableHeader" else "td"
            partes.append(f"<{tag}>{_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map)}</{tag}>")
            continue

        if tipo == "image":
            src = str(attrs.get("src") or "").strip()
            asset_id = str(attrs.get("asset_id") or "").strip()
            if src.startswith("asset://") and not asset_id:
                asset_id = src.split("asset://", 1)[1].strip()
            src_final = ""
            if asset_id:
                asset = assets_map.get(asset_id)
                if asset:
                    src_final = _asset_para_data_uri(asset)
            elif src.startswith("data:image/"):
                src_final = src

            if src_final:
                alt = html.escape(str(attrs.get("alt") or ""), quote=True)[:180]
                width = attrs.get("width")
                largura_style = ""
                if isinstance(width, (int, float)) and 40 <= float(width) <= 1200:
                    largura_style = f' style="max-width:{int(width)}px;"'
                partes.append(
                    f'<p><img src="{html.escape(src_final, quote=True)}" alt="{alt}"{largura_style}></p>'
                )
            continue

        partes.append(_render_nodes_html(filhos, dados_formulario=dados_formulario, assets_map=assets_map))
    return "".join(partes)


def montar_html_documento_editor(
    *,
    documento_editor_json: dict[str, Any] | None,
    estilo_json: dict[str, Any] | None,
    assets_json: Any,
    dados_formulario: dict[str, Any] | None,
) -> str:
    doc_payload = normalizar_documento_editor(documento_editor_json)
    estilo = normalizar_estilo_editor(estilo_json)
    dados = dados_formulario if isinstance(dados_formulario, dict) else {}
    assets = _normalizar_assets(assets_json)
    assets_map = {item["id"]: item for item in assets}

    doc = doc_payload.get("doc") if isinstance(doc_payload.get("doc"), dict) else documento_editor_padrao()["doc"]
    conteudo = doc.get("content") if isinstance(doc.get("content"), list) else []
    body_html = _render_nodes_html(conteudo, dados_formulario=dados, assets_map=assets_map)

    pagina = estilo["pagina"]
    margens = pagina["margens_mm"]
    tipografia = estilo["tipografia"]
    cabecalho = _substituir_placeholders_texto(str(estilo.get("cabecalho_texto") or ""), dados)
    rodape = _substituir_placeholders_texto(str(estilo.get("rodape_texto") or ""), dados)
    watermark = estilo.get("marca_dagua") if isinstance(estilo.get("marca_dagua"), dict) else {}
    watermark_texto = html.escape(str(watermark.get("texto") or ""), quote=True)
    watermark_opacidade = float(watermark.get("opacity", 0.08) or 0.08)
    watermark_fonte = int(watermark.get("font_size_px", 72) or 72)
    watermark_rotate = int(watermark.get("rotate_deg", -32) or -32)

    watermark_html = ""
    if watermark_texto:
        watermark_html = (
            '<div class="tariel-watermark">'
            + watermark_texto
            + "</div>"
        )

    html_doc = f"""
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @page {{
      size: A4 {"landscape" if pagina["orientation"] == "landscape" else "portrait"};
      margin: {margens["top"]}mm {margens["right"]}mm {margens["bottom"]}mm {margens["left"]}mm;
    }}
    html, body {{
      margin: 0;
      padding: 0;
      color: #111;
      font-family: {tipografia["font_family"]};
      font-size: {tipografia["font_size_px"]}px;
      line-height: {tipografia["line_height"]};
    }}
    body {{
      counter-reset: section;
    }}
    .tariel-doc {{
      position: relative;
      min-height: 100%;
      padding-top: 18mm;
      padding-bottom: 14mm;
    }}
    .tariel-header {{
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 14mm;
      font-size: 10px;
      border-bottom: 1px solid #d7d7d7;
      color: #444;
      padding: 2mm 4mm;
    }}
    .tariel-footer {{
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 10mm;
      font-size: 10px;
      border-top: 1px solid #d7d7d7;
      color: #555;
      padding: 2mm 4mm;
    }}
    .tariel-body p {{
      margin: 0 0 10px;
    }}
    .tariel-body h1, .tariel-body h2, .tariel-body h3, .tariel-body h4 {{
      margin: 0 0 10px;
      line-height: 1.2;
    }}
    .tariel-body ul, .tariel-body ol {{
      margin: 0 0 10px 22px;
    }}
    .tariel-body table {{
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 10px;
      page-break-inside: avoid;
    }}
    .tariel-body td, .tariel-body th {{
      border: 1px solid #9a9a9a;
      padding: 6px 7px;
      vertical-align: top;
    }}
    .tariel-body img {{
      max-width: 100%;
      height: auto;
      display: inline-block;
    }}
    .tariel-watermark {{
      position: fixed;
      inset: 45% 0 auto 0;
      text-align: center;
      font-size: {watermark_fonte}px;
      opacity: {watermark_opacidade};
      color: #666;
      transform: rotate({watermark_rotate}deg);
      pointer-events: none;
      z-index: 0;
      font-weight: 700;
      user-select: none;
    }}
    .tariel-body {{
      position: relative;
      z-index: 2;
    }}
  </style>
</head>
<body>
  <div class="tariel-header">{cabecalho}</div>
  <div class="tariel-footer">{rodape}</div>
  {watermark_html}
  <main class="tariel-doc">
    <section class="tariel-body">{body_html}</section>
  </main>
</body>
</html>
"""
    return html_doc


def _texto_plano_doc(node: Any, dados_formulario: dict[str, Any]) -> str:
    if isinstance(node, dict):
        tipo = str(node.get("type") or "")
        if tipo == "text":
            return REGEX_PLACEHOLDER.sub(
                lambda m: _resolver_placeholder(str(m.group(1) or ""), dados_formulario),
                str(node.get("text") or ""),
            )
        if tipo == "placeholder":
            attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
            raw = str(attrs.get("raw") or "")
            if not raw:
                raw = f"{attrs.get('mode') or 'token'}:{attrs.get('key') or ''}"
            return _resolver_placeholder(raw, dados_formulario)
        content = node.get("content")
        if isinstance(content, list):
            return " ".join(_texto_plano_doc(item, dados_formulario) for item in content)
        return ""
    if isinstance(node, list):
        return " ".join(_texto_plano_doc(item, dados_formulario) for item in node)
    return ""


def _gerar_pdf_fallback_texto(
    *,
    documento_editor_json: dict[str, Any] | None,
    dados_formulario: dict[str, Any] | None,
) -> bytes:
    doc_payload = normalizar_documento_editor(documento_editor_json)
    dados = dados_formulario if isinstance(dados_formulario, dict) else {}
    doc = doc_payload.get("doc") if isinstance(doc_payload.get("doc"), dict) else {}
    texto = _texto_plano_doc(doc, dados).strip() or "Template sem conteúdo renderizável."

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 8, "Preview de Template (fallback)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)
    pdf.set_font("helvetica", "", 11)
    pdf.multi_cell(0, 6, texto.encode("latin-1", errors="replace").decode("latin-1"))
    raw = pdf.output()
    if isinstance(raw, bytes):
        return raw
    if isinstance(raw, bytearray):
        return bytes(raw)
    return str(raw).encode("latin-1", errors="replace")


async def gerar_pdf_html_playwright(
    *,
    html_documento: str,
    orientation: str = "portrait",
    margens_mm: dict[str, int] | None = None,
) -> bytes:
    from playwright.async_api import async_playwright

    margens = margens_mm or {"top": 18, "right": 14, "bottom": 18, "left": 14}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            pagina = await browser.new_page()
            await pagina.set_content(html_documento, wait_until="networkidle")
            pdf_bytes = await pagina.pdf(
                format="A4",
                landscape=str(orientation or "").lower() == "landscape",
                print_background=True,
                prefer_css_page_size=True,
                margin={
                    "top": f"{int(margens.get('top', 18))}mm",
                    "right": f"{int(margens.get('right', 14))}mm",
                    "bottom": f"{int(margens.get('bottom', 18))}mm",
                    "left": f"{int(margens.get('left', 14))}mm",
                },
            )
            return pdf_bytes
        finally:
            await browser.close()


async def gerar_pdf_editor_rico_bytes(
    *,
    documento_editor_json: dict[str, Any] | None,
    estilo_json: dict[str, Any] | None,
    assets_json: Any,
    dados_formulario: dict[str, Any] | None,
) -> bytes:
    estilo = normalizar_estilo_editor(estilo_json)
    html_doc = montar_html_documento_editor(
        documento_editor_json=documento_editor_json,
        estilo_json=estilo,
        assets_json=assets_json,
        dados_formulario=dados_formulario,
    )
    try:
        return await gerar_pdf_html_playwright(
            html_documento=html_doc,
            orientation=str(estilo["pagina"]["orientation"]),
            margens_mm=estilo["pagina"]["margens_mm"],
        )
    except Exception:
        logger.warning(
            "Falha no Playwright para editor rico. Aplicando fallback textual.",
            exc_info=True,
        )
        return _gerar_pdf_fallback_texto(
            documento_editor_json=documento_editor_json,
            dados_formulario=dados_formulario,
        )


def gerar_pdf_base_placeholder_editor(
    *,
    empresa_id: int,
    codigo_template: str,
    versao: int,
    titulo: str = "Template A4 em branco",
) -> str:
    pdf = FPDF(unit="mm", format="A4")
    pdf.add_page()
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(
        0,
        10,
        titulo[:120].encode("latin-1", errors="replace").decode("latin-1"),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.set_font("helvetica", "", 10)
    pdf.multi_cell(
        0,
        6,
        "Base inicial do editor rico Tariel.ia. Este PDF sera substituido por snapshot na publicacao.",
    )
    raw = pdf.output()
    if isinstance(raw, bytes):
        conteudo = raw
    elif isinstance(raw, bytearray):
        conteudo = bytes(raw)
    else:
        conteudo = str(raw).encode("latin-1", errors="replace")
    return salvar_pdf_template_base(
        conteudo,
        empresa_id=empresa_id,
        codigo_template=normalizar_codigo_template(codigo_template),
        versao=versao,
    )


def salvar_snapshot_editor_como_pdf_base(
    *,
    pdf_bytes: bytes,
    empresa_id: int,
    codigo_template: str,
    versao: int,
) -> str:
    if not pdf_bytes:
        raise ValueError("Snapshot PDF vazio.")
    _ = PdfReader(io.BytesIO(pdf_bytes))
    return salvar_pdf_template_base(
        pdf_bytes,
        empresa_id=empresa_id,
        codigo_template=normalizar_codigo_template(codigo_template),
        versao=versao,
    )


def salvar_asset_editor_template(
    *,
    empresa_id: int,
    template_id: int,
    filename: str,
    mime_type: str,
    conteudo: bytes,
) -> dict[str, Any]:
    mime = str(mime_type or "").strip().lower()
    if mime not in MIME_IMAGEM_PERMITIDO:
        raise ValueError("Formato de imagem não suportado. Use PNG, JPG ou WEBP.")
    if not conteudo:
        raise ValueError("Arquivo de imagem vazio.")
    if len(conteudo) > MAX_ASSET_BYTES:
        raise ValueError("Imagem excede o limite de 5 MB.")

    pasta = (_DIR_EDITOR_ASSETS / f"empresa_{int(empresa_id)}" / f"template_{int(template_id)}").resolve()
    pasta.mkdir(parents=True, exist_ok=True)

    asset_id = os.urandom(8).hex()
    ext = MIME_IMAGEM_PERMITIDO[mime]
    nome_limpo = re.sub(r"[^A-Za-z0-9._\- ]+", "_", Path(filename or "imagem").name)[:120] or "imagem"
    caminho = (pasta / f"{asset_id}{ext}").resolve()
    caminho.write_bytes(conteudo)

    return {
        "id": asset_id,
        "filename": nome_limpo,
        "mime_type": mime,
        "path": str(caminho),
        "size_bytes": len(conteudo),
        "created_em": _agora_iso(),
    }


def obter_asset_editor_por_id(assets_json: Any, asset_id: str) -> dict[str, Any] | None:
    asset_id_limpo = str(asset_id or "").strip()
    for item in _normalizar_assets(assets_json):
        if item["id"] == asset_id_limpo:
            return item
    return None


__all__ = [
    "MODO_EDITOR_LEGADO",
    "MODO_EDITOR_RICO",
    "documento_editor_padrao",
    "estilo_editor_padrao",
    "normalizar_modo_editor",
    "normalizar_documento_editor",
    "normalizar_estilo_editor",
    "montar_html_documento_editor",
    "gerar_pdf_editor_rico_bytes",
    "gerar_pdf_base_placeholder_editor",
    "salvar_snapshot_editor_como_pdf_base",
    "salvar_asset_editor_template",
    "obter_asset_editor_por_id",
]
