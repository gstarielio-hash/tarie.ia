"""Pacote de runtime e utilitários da camada de banco compartilhada."""

from app.shared.db.runtime import SessaoLocal, URL_BANCO, _normalizar_url_banco, motor_banco

__all__ = [
    "SessaoLocal",
    "URL_BANCO",
    "_normalizar_url_banco",
    "motor_banco",
]
