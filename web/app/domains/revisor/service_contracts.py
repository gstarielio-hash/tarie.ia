from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.domains.mesa.contracts import PacoteMesaLaudo
from app.shared.database import Laudo


@dataclass(slots=True)
class AvaliacaoLaudoResult:
    laudo_id: int
    acao: str
    status_revisao: str
    motivo: str
    modo_schemathesis: bool
    inspetor_id: int | None = None
    mensagem_id: int | None = None
    texto_notificacao_inspetor: str = ""


@dataclass(slots=True)
class WhisperRespostaResult:
    laudo_id: int
    destinatario_id: int
    mensagem_id: int
    referencia_mensagem_id: int | None
    preview: str


@dataclass(slots=True)
class RespostaChatResult:
    laudo_id: int
    inspetor_id: int | None
    mensagem_id: int
    referencia_mensagem_id: int | None
    texto_notificacao: str


@dataclass(slots=True)
class RespostaChatAnexoResult:
    laudo_id: int
    inspetor_id: int | None
    mensagem_id: int
    referencia_mensagem_id: int | None
    texto_notificacao: str
    mensagem_payload: dict[str, Any]


@dataclass(slots=True)
class PendenciaMesaResult:
    laudo_id: int
    mensagem_id: int
    lida: bool
    resolvida_por_id: int | None
    resolvida_por_nome: str
    resolvida_em: str
    pendencias_abertas: int
    inspetor_id: int | None
    texto_notificacao: str


@dataclass(slots=True)
class PacoteMesaCarregado:
    laudo: Laudo
    pacote: PacoteMesaLaudo


@dataclass(slots=True)
class ExportacaoPacoteMesaPdf:
    caminho_pdf: str
    filename: str


__all__ = [
    "AvaliacaoLaudoResult",
    "ExportacaoPacoteMesaPdf",
    "PacoteMesaCarregado",
    "PendenciaMesaResult",
    "RespostaChatAnexoResult",
    "RespostaChatResult",
    "WhisperRespostaResult",
]
