from __future__ import annotations

import re
from difflib import SequenceMatcher, ndiff
from itertools import zip_longest
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.shared.database import TemplateLaudo
from nucleo.template_editor_word import (
    MODO_EDITOR_RICO,
    normalizar_documento_editor,
    normalizar_modo_editor,
)

_MAX_LINHAS_DIFF = 220
_MAX_PAGINAS_PDF = 8
_MAX_BLOCOS_DIFF = 120

_REGEX_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.:\-]{1,120})\s*\}\}")


def _contar_folhas(payload: Any) -> int:
    if isinstance(payload, dict):
        if not payload:
            return 0
        return sum(_contar_folhas(valor) for valor in payload.values())
    if isinstance(payload, list):
        return sum(_contar_folhas(valor) for valor in payload)
    return 1


def _texto_inline_nodes(nodes: list[dict[str, Any]] | None) -> str:
    partes: list[str] = []
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        tipo = str(node.get("type") or "").strip()
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        filhos = node.get("content") if isinstance(node.get("content"), list) else []
        if tipo == "text":
            partes.append(str(node.get("text") or ""))
            continue
        if tipo == "hardBreak":
            partes.append(" / ")
            continue
        if tipo == "placeholder":
            bruto = str(attrs.get("raw") or "").strip()
            if not bruto:
                modo = str(attrs.get("mode") or "token").strip().lower()
                chave = str(attrs.get("key") or "").strip()
                bruto = f"{modo}:{chave}" if chave else ""
            if bruto:
                partes.append(f"{{{{{bruto}}}}}")
            continue
        if tipo == "image":
            rotulo = str(attrs.get("alt") or "").strip() or str(attrs.get("asset_id") or "").strip() or "imagem"
            partes.append(f"[Imagem: {rotulo}]")
            continue
        texto_filho = _texto_inline_nodes(filhos)
        if texto_filho:
            partes.append(texto_filho)
    return " ".join(parte.strip() for parte in partes if str(parte or "").strip()).strip()


def _texto_normalizado(valor: Any) -> str:
    return " ".join(str(valor or "").split()).strip()


def _texto_truncado(valor: Any, *, limite: int = 180) -> str:
    texto = _texto_normalizado(valor)
    if len(texto) <= limite:
        return texto
    return texto[: max(0, limite - 1)].rstrip() + "…"


def _placeholders_em_texto(texto: Any) -> list[str]:
    encontrados: list[str] = []
    vistos: set[str] = set()
    for match in _REGEX_PLACEHOLDER.finditer(str(texto or "")):
        bruto = _texto_normalizado(match.group(1))
        if bruto and bruto not in vistos:
            vistos.add(bruto)
            encontrados.append(bruto)
    return encontrados


def _coletar_placeholders_inline(nodes: list[dict[str, Any]] | None) -> list[str]:
    encontrados: list[str] = []
    vistos: set[str] = set()

    def registrar(valor: str) -> None:
        bruto = _texto_normalizado(valor)
        if bruto and bruto not in vistos:
            vistos.add(bruto)
            encontrados.append(bruto)

    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        tipo = str(node.get("type") or "").strip()
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        filhos = node.get("content") if isinstance(node.get("content"), list) else []
        if tipo == "text":
            for placeholder in _placeholders_em_texto(node.get("text")):
                registrar(placeholder)
        elif tipo == "placeholder":
            bruto = _texto_normalizado(attrs.get("raw"))
            if not bruto:
                modo = _texto_normalizado(attrs.get("mode") or "token").lower() or "token"
                chave = _texto_normalizado(attrs.get("key"))
                bruto = f"{modo}:{chave}" if chave else ""
            registrar(bruto)
        for placeholder in _coletar_placeholders_inline(filhos):
            registrar(placeholder)
    return encontrados


def _coletar_linhas_doc(nodes: list[dict[str, Any]] | None, *, prefixo_lista: str = "- ") -> list[str]:
    linhas: list[str] = []
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        tipo = str(node.get("type") or "").strip()
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        filhos = node.get("content") if isinstance(node.get("content"), list) else []

        if tipo == "heading":
            nivel = max(1, min(4, int(attrs.get("level") or 1)))
            texto = _texto_inline_nodes(filhos)
            if texto:
                linhas.append(f"H{nivel}: {texto}")
            continue

        if tipo == "paragraph":
            texto = _texto_inline_nodes(filhos)
            if texto:
                linhas.append(texto)
            continue

        if tipo == "bulletList":
            linhas.extend(_coletar_linhas_doc(filhos, prefixo_lista="- "))
            continue

        if tipo == "orderedList":
            linhas.extend(_coletar_linhas_doc(filhos, prefixo_lista="1. "))
            continue

        if tipo == "listItem":
            texto = _texto_inline_nodes(filhos)
            if texto:
                linhas.append(f"{prefixo_lista}{texto}")
                continue
            linhas.extend(_coletar_linhas_doc(filhos, prefixo_lista=prefixo_lista))
            continue

        if tipo == "table":
            linhas.extend(_coletar_linhas_doc(filhos))
            continue

        if tipo == "tableRow":
            celulas: list[str] = []
            for filho in filhos:
                if not isinstance(filho, dict):
                    continue
                conteudo = filho.get("content") if isinstance(filho.get("content"), list) else []
                texto = _texto_inline_nodes(conteudo)
                if texto:
                    celulas.append(texto)
            if celulas:
                linhas.append(" | ".join(celulas))
            continue

        texto_generico = _texto_inline_nodes(filhos)
        if texto_generico:
            linhas.append(texto_generico)
            continue
        linhas.extend(_coletar_linhas_doc(filhos, prefixo_lista=prefixo_lista))
    return [linha.strip() for linha in linhas if str(linha or "").strip()]


def _extrair_linhas_documento_editor(payload: Any) -> list[str]:
    try:
        doc_payload = normalizar_documento_editor(payload if isinstance(payload, dict) else None)
    except ValueError:
        return []
    doc = doc_payload.get("doc") if isinstance(doc_payload.get("doc"), dict) else {}
    conteudo = doc.get("content") if isinstance(doc.get("content"), list) else []
    return _coletar_linhas_doc(conteudo)


def _extrair_linhas_pdf(caminho_pdf: str | None) -> list[str]:
    caminho = Path(str(caminho_pdf or "")).expanduser().resolve()
    if not caminho.is_file():
        return []
    try:
        leitor = PdfReader(str(caminho))
    except Exception:
        return []

    linhas: list[str] = []
    for pagina in leitor.pages[:_MAX_PAGINAS_PDF]:
        try:
            texto = str(pagina.extract_text() or "")
        except Exception:
            continue
        for linha in texto.splitlines():
            linha_limpa = " ".join(str(linha or "").split()).strip()
            if linha_limpa:
                linhas.append(linha_limpa)
    return linhas


def _total_itens_lista(nodes: list[dict[str, Any]] | None) -> int:
    total = 0
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        if str(node.get("type") or "").strip() == "listItem":
            total += 1
        filhos = node.get("content") if isinstance(node.get("content"), list) else []
        total += _total_itens_lista(filhos)
    return total


def _compactar_linhas(linhas: list[str], *, limite: int = 4) -> str:
    linhas_validas = [_texto_normalizado(linha) for linha in linhas if _texto_normalizado(linha)]
    if not linhas_validas:
        return ""
    return "\n".join(linhas_validas[:limite])


def _montar_bloco(
    *,
    tipo: str,
    tipo_label: str,
    estrutura: str,
    preview: Any,
    texto: Any,
    placeholders: list[str] | None = None,
    metricas: dict[str, Any] | None = None,
) -> dict[str, Any]:
    texto_completo = str(texto or "").strip()
    return {
        "tipo": str(tipo or "bloco"),
        "tipo_label": str(tipo_label or "Bloco"),
        "estrutura": _texto_normalizado(estrutura),
        "preview": _texto_truncado(preview or texto_completo or tipo_label, limite=160),
        "texto": _texto_truncado(texto_completo, limite=320),
        "placeholders": [item for item in (placeholders or []) if _texto_normalizado(item)],
        "total_placeholders": len([item for item in (placeholders or []) if _texto_normalizado(item)]),
        "metricas": metricas or {},
    }


def _resumir_bloco_documento(node: dict[str, Any]) -> dict[str, Any] | None:
    tipo = str(node.get("type") or "").strip()
    attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
    filhos = node.get("content") if isinstance(node.get("content"), list) else []
    placeholders = _coletar_placeholders_inline(filhos)

    if tipo == "heading":
        nivel = max(1, min(6, int(attrs.get("level") or 1)))
        texto = _texto_inline_nodes(filhos)
        return _montar_bloco(
            tipo="heading",
            tipo_label="Título",
            estrutura=f"H{nivel}",
            preview=texto or f"Título H{nivel}",
            texto=texto,
            placeholders=placeholders,
            metricas={"heading_level": nivel},
        )

    if tipo == "paragraph":
        texto = _texto_inline_nodes(filhos)
        return _montar_bloco(
            tipo="paragraph",
            tipo_label="Parágrafo",
            estrutura="Texto corrido",
            preview=texto or "Parágrafo",
            texto=texto,
            placeholders=placeholders,
            metricas={"linhas": 1 if texto else 0},
        )

    if tipo in {"bulletList", "orderedList"}:
        linhas = _coletar_linhas_doc([node])
        itens = _total_itens_lista(filhos)
        tipo_label = "Lista numerada" if tipo == "orderedList" else "Lista com marcadores"
        return _montar_bloco(
            tipo=tipo,
            tipo_label=tipo_label,
            estrutura=f"{itens} item(ns)",
            preview=linhas[0] if linhas else tipo_label,
            texto=_compactar_linhas(linhas, limite=6),
            placeholders=placeholders,
            metricas={"itens": itens},
        )

    if tipo == "table":
        linhas = _coletar_linhas_doc([node])
        linhas_tabela = [item for item in filhos if isinstance(item, dict) and str(item.get("type") or "").strip() == "tableRow"]
        total_linhas = len(linhas_tabela)
        total_colunas = 0
        for linha in linhas_tabela:
            celulas = linha.get("content") if isinstance(linha.get("content"), list) else []
            total_colunas = max(total_colunas, len([item for item in celulas if isinstance(item, dict)]))
        return _montar_bloco(
            tipo="table",
            tipo_label="Tabela",
            estrutura=f"{total_linhas} x {total_colunas}",
            preview=linhas[0] if linhas else "Tabela",
            texto=_compactar_linhas(linhas, limite=4),
            placeholders=placeholders,
            metricas={"rows": total_linhas, "cols": total_colunas},
        )

    linhas_genericas = _coletar_linhas_doc([node])
    texto_generico = _compactar_linhas(linhas_genericas, limite=5)
    if tipo or texto_generico:
        return _montar_bloco(
            tipo=tipo or "bloco",
            tipo_label=(tipo or "Bloco").replace("_", " ").title(),
            estrutura="Bloco livre",
            preview=texto_generico or tipo or "Bloco",
            texto=texto_generico,
            placeholders=placeholders,
            metricas={"linhas": len(linhas_genericas)},
        )
    return None


def _extrair_blocos_documento_editor(payload: Any) -> list[dict[str, Any]]:
    try:
        doc_payload = normalizar_documento_editor(payload if isinstance(payload, dict) else None)
    except ValueError:
        return []
    doc = doc_payload.get("doc") if isinstance(doc_payload.get("doc"), dict) else {}
    conteudo = doc.get("content") if isinstance(doc.get("content"), list) else []
    blocos: list[dict[str, Any]] = []
    for node in conteudo:
        if not isinstance(node, dict):
            continue
        bloco = _resumir_bloco_documento(node)
        if bloco:
            blocos.append(bloco)
    return blocos


def _extrair_blocos_pdf(caminho_pdf: str | None) -> list[dict[str, Any]]:
    linhas = _extrair_linhas_pdf(caminho_pdf)
    if not linhas:
        return []
    blocos: list[dict[str, Any]] = []
    tamanho_chunk = 8
    for indice in range(0, len(linhas), tamanho_chunk):
        trecho = linhas[indice : indice + tamanho_chunk]
        ordem = (indice // tamanho_chunk) + 1
        blocos.append(
            _montar_bloco(
                tipo="pdf_chunk",
                tipo_label="Trecho PDF",
                estrutura=f"{len(trecho)} linha(s)",
                preview=trecho[0] if trecho else f"Trecho {ordem}",
                texto=_compactar_linhas(trecho, limite=5),
                placeholders=[],
                metricas={"linhas": len(trecho), "chunk": ordem},
            )
        )
    return blocos


def extrair_linhas_template(item: TemplateLaudo) -> list[str]:
    modo_editor = normalizar_modo_editor(getattr(item, "modo_editor", None))
    linhas: list[str] = []
    if modo_editor == MODO_EDITOR_RICO:
        linhas = _extrair_linhas_documento_editor(getattr(item, "documento_editor_json", None))
    if not linhas:
        linhas = _extrair_linhas_pdf(getattr(item, "arquivo_pdf_base", None))
    if not linhas:
        linhas = ["[Sem conteúdo textual comparável]"]
    return linhas


def extrair_blocos_template(item: TemplateLaudo) -> list[dict[str, Any]]:
    modo_editor = normalizar_modo_editor(getattr(item, "modo_editor", None))
    blocos: list[dict[str, Any]] = []
    if modo_editor == MODO_EDITOR_RICO:
        blocos = _extrair_blocos_documento_editor(getattr(item, "documento_editor_json", None))
    if not blocos:
        blocos = _extrair_blocos_pdf(getattr(item, "arquivo_pdf_base", None))
    return blocos


def _assinatura_bloco(bloco: dict[str, Any]) -> str:
    metricas = bloco.get("metricas") if isinstance(bloco.get("metricas"), dict) else {}
    partes = [
        str(bloco.get("tipo") or ""),
        str(bloco.get("estrutura") or ""),
        str(bloco.get("preview") or ""),
        "|".join(str(item) for item in (bloco.get("placeholders") or [])),
        str(metricas.get("heading_level") or ""),
        str(metricas.get("itens") or ""),
        str(metricas.get("rows") or ""),
        str(metricas.get("cols") or ""),
    ]
    return "¦".join(partes)


def _descrever_mudancas_bloco(base: dict[str, Any], comparado: dict[str, Any]) -> list[str]:
    mudancas: list[str] = []
    if str(base.get("tipo") or "") != str(comparado.get("tipo") or ""):
        mudancas.append("Tipo de bloco alterado")
    if str(base.get("estrutura") or "") != str(comparado.get("estrutura") or ""):
        mudancas.append("Estrutura alterada")
    if str(base.get("preview") or "") != str(comparado.get("preview") or "") or str(base.get("texto") or "") != str(comparado.get("texto") or ""):
        mudancas.append("Conteúdo textual alterado")
    if list(base.get("placeholders") or []) != list(comparado.get("placeholders") or []):
        mudancas.append("Placeholders alterados")
    if not mudancas:
        mudancas.append("Bloco reposicionado")
    return mudancas


def _serializar_item_diff_bloco(
    *,
    status: str,
    bloco_base: dict[str, Any] | None,
    bloco_comparado: dict[str, Any] | None,
    ordem_base: int | None,
    ordem_comparado: int | None,
) -> dict[str, Any]:
    saida: dict[str, Any] = {
        "status": status,
        "ordem_base": ordem_base,
        "ordem_comparado": ordem_comparado,
        "base": bloco_base,
        "comparado": bloco_comparado,
    }
    if bloco_base and bloco_comparado and status == "alterado":
        saida["mudancas"] = _descrever_mudancas_bloco(bloco_base, bloco_comparado)
    else:
        saida["mudancas"] = []
    return saida


def _gerar_diff_blocos(blocos_base: list[dict[str, Any]], blocos_comparado: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    assinaturas_base = [_assinatura_bloco(bloco) for bloco in blocos_base]
    assinaturas_comparado = [_assinatura_bloco(bloco) for bloco in blocos_comparado]
    matcher = SequenceMatcher(a=assinaturas_base, b=assinaturas_comparado, autojunk=False)

    diff_blocos: list[dict[str, Any]] = []
    resumo = {
        "total_base": len(blocos_base),
        "total_comparado": len(blocos_comparado),
        "inalterados": 0,
        "alterados": 0,
        "adicionados": 0,
        "removidos": 0,
        "ocultos": 0,
    }

    def registrar(item: dict[str, Any], *, chave_resumo: str) -> None:
        resumo[chave_resumo] += 1
        if len(diff_blocos) < _MAX_BLOCOS_DIFF:
            diff_blocos.append(item)
        else:
            resumo["ocultos"] += 1

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        base_slice = blocos_base[i1:i2]
        comparado_slice = blocos_comparado[j1:j2]

        if tag == "equal":
            for offset, (bloco_base, bloco_comparado) in enumerate(zip(base_slice, comparado_slice)):
                registrar(
                    _serializar_item_diff_bloco(
                        status="inalterado",
                        bloco_base=bloco_base,
                        bloco_comparado=bloco_comparado,
                        ordem_base=i1 + offset + 1,
                        ordem_comparado=j1 + offset + 1,
                    ),
                    chave_resumo="inalterados",
                )
            continue

        if tag == "delete":
            for offset, bloco_base in enumerate(base_slice):
                registrar(
                    _serializar_item_diff_bloco(
                        status="removido",
                        bloco_base=bloco_base,
                        bloco_comparado=None,
                        ordem_base=i1 + offset + 1,
                        ordem_comparado=None,
                    ),
                    chave_resumo="removidos",
                )
            continue

        if tag == "insert":
            for offset, bloco_comparado in enumerate(comparado_slice):
                registrar(
                    _serializar_item_diff_bloco(
                        status="adicionado",
                        bloco_base=None,
                        bloco_comparado=bloco_comparado,
                        ordem_base=None,
                        ordem_comparado=j1 + offset + 1,
                    ),
                    chave_resumo="adicionados",
                )
            continue

        for offset, (bloco_base, bloco_comparado) in enumerate(zip_longest(base_slice, comparado_slice)):
            if bloco_base and bloco_comparado:
                registrar(
                    _serializar_item_diff_bloco(
                        status="alterado",
                        bloco_base=bloco_base,
                        bloco_comparado=bloco_comparado,
                        ordem_base=i1 + offset + 1,
                        ordem_comparado=j1 + offset + 1,
                    ),
                    chave_resumo="alterados",
                )
            elif bloco_base:
                registrar(
                    _serializar_item_diff_bloco(
                        status="removido",
                        bloco_base=bloco_base,
                        bloco_comparado=None,
                        ordem_base=i1 + offset + 1,
                        ordem_comparado=None,
                    ),
                    chave_resumo="removidos",
                )
            elif bloco_comparado:
                registrar(
                    _serializar_item_diff_bloco(
                        status="adicionado",
                        bloco_base=None,
                        bloco_comparado=bloco_comparado,
                        ordem_base=None,
                        ordem_comparado=j1 + offset + 1,
                    ),
                    chave_resumo="adicionados",
                )

    return diff_blocos, resumo


def _serializar_data_iso(valor: Any) -> str:
    if hasattr(valor, "isoformat"):
        return str(valor.isoformat())
    return str(valor or "")


def gerar_diff_templates(base: TemplateLaudo, comparado: TemplateLaudo) -> dict[str, Any]:
    linhas_base = extrair_linhas_template(base)
    linhas_comparado = extrair_linhas_template(comparado)
    blocos_base = extrair_blocos_template(base)
    blocos_comparado = extrair_blocos_template(comparado)
    diff_blocos, resumo_blocos = _gerar_diff_blocos(blocos_base, blocos_comparado)

    diff_linhas: list[dict[str, str]] = []
    total_contexto = 0
    total_adicoes = 0
    total_remocoes = 0
    total_ignoradas = 0

    for linha in ndiff(linhas_base, linhas_comparado):
        prefixo = linha[:2]
        texto = str(linha[2:] or "").strip()
        if prefixo == "? ":
            continue
        if prefixo == "+ ":
            total_adicoes += 1
            tipo = "adicionado"
        elif prefixo == "- ":
            total_remocoes += 1
            tipo = "removido"
        else:
            total_contexto += 1
            tipo = "contexto"
        if len(diff_linhas) < _MAX_LINHAS_DIFF:
            diff_linhas.append({"tipo": tipo, "texto": texto or " "})
        else:
            total_ignoradas += 1

    atualizado_base = _serializar_data_iso(getattr(base, "atualizado_em", None) or getattr(base, "criado_em", None))
    atualizado_comparado = _serializar_data_iso(
        getattr(comparado, "atualizado_em", None) or getattr(comparado, "criado_em", None)
    )

    comparacao_campos = [
        {
            "campo": "Nome",
            "base": str(base.nome or ""),
            "comparado": str(comparado.nome or ""),
            "mudou": str(base.nome or "") != str(comparado.nome or ""),
        },
        {
            "campo": "Versão",
            "base": f"v{int(base.versao or 1)}",
            "comparado": f"v{int(comparado.versao or 1)}",
            "mudou": int(base.versao or 1) != int(comparado.versao or 1),
        },
        {
            "campo": "Modo",
            "base": "Word" if normalizar_modo_editor(getattr(base, "modo_editor", None)) == MODO_EDITOR_RICO else "PDF base",
            "comparado": "Word" if normalizar_modo_editor(getattr(comparado, "modo_editor", None)) == MODO_EDITOR_RICO else "PDF base",
            "mudou": normalizar_modo_editor(getattr(base, "modo_editor", None)) != normalizar_modo_editor(getattr(comparado, "modo_editor", None)),
        },
        {
            "campo": "Status",
            "base": str(getattr(base, "status_template", "") or ""),
            "comparado": str(getattr(comparado, "status_template", "") or ""),
            "mudou": str(getattr(base, "status_template", "") or "") != str(getattr(comparado, "status_template", "") or ""),
        },
        {
            "campo": "Ativo",
            "base": "Sim" if bool(getattr(base, "ativo", False)) else "Não",
            "comparado": "Sim" if bool(getattr(comparado, "ativo", False)) else "Não",
            "mudou": bool(getattr(base, "ativo", False)) != bool(getattr(comparado, "ativo", False)),
        },
        {
            "campo": "Campos mapeados",
            "base": str(_contar_folhas(getattr(base, "mapeamento_campos_json", None))),
            "comparado": str(_contar_folhas(getattr(comparado, "mapeamento_campos_json", None))),
            "mudou": _contar_folhas(getattr(base, "mapeamento_campos_json", None)) != _contar_folhas(getattr(comparado, "mapeamento_campos_json", None)),
        },
        {
            "campo": "Assets",
            "base": str(len(getattr(base, "assets_json", None) or [])),
            "comparado": str(len(getattr(comparado, "assets_json", None) or [])),
            "mudou": len(getattr(base, "assets_json", None) or []) != len(getattr(comparado, "assets_json", None) or []),
        },
        {
            "campo": "Observações",
            "base": str(getattr(base, "observacoes", "") or ""),
            "comparado": str(getattr(comparado, "observacoes", "") or ""),
            "mudou": str(getattr(base, "observacoes", "") or "") != str(getattr(comparado, "observacoes", "") or ""),
        },
        {
            "campo": "Atualização",
            "base": atualizado_base,
            "comparado": atualizado_comparado,
            "mudou": atualizado_base != atualizado_comparado,
        },
    ]

    return {
        "resumo": {
            "linhas_base": len(linhas_base),
            "linhas_comparado": len(linhas_comparado),
            "linhas_adicionadas": total_adicoes,
            "linhas_removidas": total_remocoes,
            "linhas_contexto": total_contexto,
            "linhas_ocultas": total_ignoradas,
            "campos_alterados": sum(1 for item in comparacao_campos if bool(item.get("mudou"))),
        },
        "comparacao_campos": comparacao_campos,
        "diff_linhas": diff_linhas,
        "resumo_blocos": resumo_blocos,
        "diff_blocos": diff_blocos,
        "blocos_base": blocos_base,
        "blocos_comparado": blocos_comparado,
        "conteudo_base": linhas_base,
        "conteudo_comparado": linhas_comparado,
    }


__all__ = ["extrair_blocos_template", "extrair_linhas_template", "gerar_diff_templates"]
