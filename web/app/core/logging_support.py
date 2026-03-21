from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from typing import Any

correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")
_RESERVED_LOG_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {
    "message",
    "asctime",
}


class CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_ctx.get()
        return True


def _extrair_campos_extras(record: logging.LogRecord) -> dict[str, Any]:
    extras: dict[str, Any] = {}

    for chave, valor in record.__dict__.items():
        if chave.startswith("_") or chave in _RESERVED_LOG_KEYS:
            continue

        if chave in {
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
            "name",
            "correlation_id",
        }:
            continue

        extras[chave] = valor

    return extras


def configurar_logging(
    *,
    em_producao: bool,
    ambiente: str,
    log_level_dev_root: int,
    log_level_dev_tariel: int,
) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(CorrelationIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]

    if em_producao:

        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                payload = {
                    "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
                    "level": record.levelname,
                    "logger": record.name,
                    "msg": record.getMessage(),
                    "module": record.module,
                    "correlation_id": getattr(record, "correlation_id", "-"),
                    "ambiente": ambiente,
                }

                extras = _extrair_campos_extras(record)
                if extras:
                    payload.update(extras)

                if record.exc_info:
                    payload["exc"] = self.formatException(record.exc_info)

                return json.dumps(payload, ensure_ascii=False)

        handler.setFormatter(JsonFormatter())
        root.setLevel(logging.INFO)

    else:
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s [cid=%(correlation_id)s] %(message)s")
        handler.setFormatter(formatter)
        root.setLevel(log_level_dev_root)
        logging.getLogger("tariel").setLevel(log_level_dev_tariel)

    for nome_logger in (
        "python_multipart",
        "httpcore",
        "httpx",
        "google_genai",
        "urllib3",
        "asyncio",
    ):
        logging.getLogger(nome_logger).setLevel(logging.WARNING)
