"""Runtime e constantes do chat inspetor."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from app.shared.database import ModoResposta

LIMITE_MSG_CHARS = 8_000
LIMITE_HISTORICO = 20

LIMITE_DOC_BYTES = 15 * 1024 * 1024
LIMITE_DOC_CHARS = 40_000
LIMITE_PARECER = 4_000
LIMITE_FEEDBACK = 500

TIMEOUT_FILA_STREAM_SEGUNDOS = 90.0
TIMEOUT_KEEPALIVE_SSE_SEGUNDOS = 25.0

PREFIXO_METADATA = "__METADATA__:"
PREFIXO_CITACOES = "__CITACOES__:"
PREFIXO_MODO_HUMANO = "__MODO_HUMANO__:"

MODO_DETALHADO = ModoResposta.DETALHADO.value
MODO_CURTO = ModoResposta.CURTO.value
MODO_DEEP = ModoResposta.DEEP_RESEARCH.value

MIME_DOC_PERMITIDOS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

try:
    import pypdf as leitor_pdf

    TEM_PYPDF = True
except ImportError:
    TEM_PYPDF = False
    leitor_pdf = None

try:
    import docx as leitor_docx

    TEM_DOCX = True
except ImportError:
    TEM_DOCX = False
    leitor_docx = None

executor_stream = ThreadPoolExecutor(max_workers=4, thread_name_prefix="tariel_ia")


__all__ = [
    "LIMITE_MSG_CHARS",
    "LIMITE_HISTORICO",
    "LIMITE_DOC_BYTES",
    "LIMITE_DOC_CHARS",
    "LIMITE_PARECER",
    "LIMITE_FEEDBACK",
    "TIMEOUT_FILA_STREAM_SEGUNDOS",
    "TIMEOUT_KEEPALIVE_SSE_SEGUNDOS",
    "PREFIXO_METADATA",
    "PREFIXO_CITACOES",
    "PREFIXO_MODO_HUMANO",
    "MODO_DETALHADO",
    "MODO_CURTO",
    "MODO_DEEP",
    "MIME_DOC_PERMITIDOS",
    "TEM_PYPDF",
    "leitor_pdf",
    "TEM_DOCX",
    "leitor_docx",
    "executor_stream",
]
