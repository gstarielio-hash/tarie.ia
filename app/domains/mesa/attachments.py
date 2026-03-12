"""Infra compartilhada de anexos da Mesa Avaliadora."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from typing import Any, Iterable

from fastapi import HTTPException

from app.domains.chat.media_helpers import nome_documento_seguro
from app.shared.database import AnexoMesa
from nucleo.inspetor.referencias_mensagem import extrair_referencia_do_texto

MAX_BYTES_ANEXO_MESA = 12 * 1024 * 1024
TEXTO_PADRAO_ANEXO_MESA = "[ANEXO_MESA_SEM_TEXTO]"
MIME_ANEXOS_MESA_PERMITIDOS = {
    "image/png": ("imagem", ".png"),
    "image/jpeg": ("imagem", ".jpg"),
    "image/jpg": ("imagem", ".jpg"),
    "image/webp": ("imagem", ".webp"),
    "application/pdf": ("documento", ".pdf"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ("documento", ".docx"),
}
PASTA_ANEXOS_MESA = Path(tempfile.gettempdir()) / "tariel_control" / "mesa_anexos"


def categoria_mime_anexo_mesa(mime_type: str) -> tuple[str, str]:
    mime_limpo = str(mime_type or "").strip().lower()
    categoria_ext = MIME_ANEXOS_MESA_PERMITIDOS.get(mime_limpo)
    if not categoria_ext:
        raise HTTPException(
            status_code=415,
            detail="Use PNG, JPG, WebP, PDF ou DOCX no canal da mesa.",
        )
    return categoria_ext


def validar_anexo_mesa_bytes(*, mime_type: str, conteudo: bytes) -> tuple[str, str]:
    categoria, extensao = categoria_mime_anexo_mesa(mime_type)
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo da mesa está vazio.")
    if len(conteudo) > MAX_BYTES_ANEXO_MESA:
        raise HTTPException(status_code=413, detail="O anexo da mesa deve ter no máximo 12MB.")
    return categoria, extensao


def montar_nome_anexo_mesa(nome_original: str, *, mime_type: str) -> tuple[str, str]:
    _categoria, extensao_padrao = categoria_mime_anexo_mesa(mime_type)
    nome_seguro = nome_documento_seguro(nome_original or "anexo_mesa")
    base = Path(nome_seguro).name or "anexo_mesa"
    if Path(base).suffix:
        return base, base
    final = f"{base}{extensao_padrao}"
    return final, final


def salvar_arquivo_anexo_mesa(
    *,
    empresa_id: int,
    laudo_id: int,
    nome_original: str,
    mime_type: str,
    conteudo: bytes,
) -> dict[str, Any]:
    categoria, extensao = validar_anexo_mesa_bytes(mime_type=mime_type, conteudo=conteudo)
    nome_exibicao, nome_seguro = montar_nome_anexo_mesa(nome_original, mime_type=mime_type)
    pasta_destino = PASTA_ANEXOS_MESA / str(int(empresa_id)) / str(int(laudo_id))
    pasta_destino.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"{uuid.uuid4().hex[:16]}{extensao}"
    caminho_arquivo = pasta_destino / nome_arquivo
    caminho_arquivo.write_bytes(conteudo)

    return {
        "categoria": categoria,
        "nome_original": nome_exibicao,
        "nome_arquivo": nome_seguro,
        "mime_type": str(mime_type or "").strip().lower(),
        "tamanho_bytes": len(conteudo),
        "caminho_arquivo": str(caminho_arquivo),
    }


def remover_arquivo_anexo_mesa(caminho_arquivo: str | None) -> None:
    valor = str(caminho_arquivo or "").strip()
    if not valor:
        return
    caminho = Path(valor)
    try:
        if caminho.is_file():
            caminho.unlink()
    except Exception:
        return


def conteudo_mensagem_mesa_com_anexo(texto: str) -> str:
    texto_limpo = str(texto or "").strip()
    return texto_limpo if texto_limpo else TEXTO_PADRAO_ANEXO_MESA


def texto_mensagem_mesa_visivel(
    conteudo: str,
    *,
    anexos: Iterable[AnexoMesa] | None = None,
) -> str:
    _referencia_id, texto_limpo = extrair_referencia_do_texto(conteudo or "")
    texto_final = str(texto_limpo or "").strip()
    if texto_final == TEXTO_PADRAO_ANEXO_MESA and list(anexos or []):
        return ""
    return texto_final


def resumo_mensagem_mesa(
    conteudo: str,
    *,
    anexos: Iterable[AnexoMesa] | None = None,
) -> str:
    anexos_lista = list(anexos or [])
    texto_visivel = texto_mensagem_mesa_visivel(conteudo, anexos=anexos_lista)
    if texto_visivel:
        return texto_visivel

    if not anexos_lista:
        return ""

    if len(anexos_lista) == 1:
        anexo = anexos_lista[0]
        prefixo = "Foto anexada" if anexo.categoria == "imagem" else "Documento anexado"
        return f"{prefixo}: {anexo.nome_original}"

    return f"{len(anexos_lista)} anexos enviados"


def serializar_anexo_mesa(
    anexo: AnexoMesa,
    *,
    portal: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": int(anexo.id),
        "nome": str(anexo.nome_original or ""),
        "mime_type": str(anexo.mime_type or ""),
        "categoria": str(anexo.categoria or ""),
        "tamanho_bytes": int(anexo.tamanho_bytes or 0),
        "eh_imagem": str(anexo.categoria or "") == "imagem",
    }
    if portal:
        payload["url"] = f"/{portal}/api/laudo/{int(anexo.laudo_id)}/mesa/anexos/{int(anexo.id)}"
    return payload


def serializar_anexos_mesa(
    anexos: Iterable[AnexoMesa] | None,
    *,
    portal: str | None = None,
) -> list[dict[str, Any]]:
    return [
        serializar_anexo_mesa(anexo, portal=portal)
        for anexo in list(anexos or [])
        if anexo is not None
    ]


__all__ = [
    "MAX_BYTES_ANEXO_MESA",
    "MIME_ANEXOS_MESA_PERMITIDOS",
    "PASTA_ANEXOS_MESA",
    "TEXTO_PADRAO_ANEXO_MESA",
    "categoria_mime_anexo_mesa",
    "validar_anexo_mesa_bytes",
    "salvar_arquivo_anexo_mesa",
    "remover_arquivo_anexo_mesa",
    "conteudo_mensagem_mesa_com_anexo",
    "texto_mensagem_mesa_visivel",
    "resumo_mensagem_mesa",
    "serializar_anexo_mesa",
    "serializar_anexos_mesa",
]
