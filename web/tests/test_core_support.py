from __future__ import annotations

import json
import logging
from types import SimpleNamespace

from app.core import http_setup_support, logging_support


def test_sanitizar_para_json_converte_uploads_e_collections() -> None:
    upload = SimpleNamespace(filename="evidencia.png", content_type="image/png")

    payload = http_setup_support._sanitizar_para_json(
        {
            "arquivo": upload,
            "itens": {1, 2},
            "meta": ("ok", 3),
        }
    )

    assert payload == {
        "arquivo": {
            "__type__": "SimpleNamespace",
            "filename": "evidencia.png",
            "content_type": "image/png",
        },
        "itens": [1, 2],
        "meta": ["ok", 3],
    }


def test_limpar_openapi_mantem_apenas_rotas_operacionais_e_api() -> None:
    schema = {
        "paths": {
            "/health": {"get": {}},
            "/ready": {"get": {}},
            "/admin/painel": {"get": {}},
            "/cliente/api/bootstrap": {"get": {}},
        }
    }

    http_setup_support._limpar_openapi_para_rotas_de_api(schema)

    assert schema["paths"] == {
        "/health": {"get": {}},
        "/ready": {"get": {}},
        "/cliente/api/bootstrap": {"get": {}},
    }


def test_logging_json_em_producao_inclui_correlation_id_e_extras() -> None:
    logging_support.configurar_logging(
        em_producao=True,
        ambiente="prod",
        log_level_dev_root=logging.DEBUG,
        log_level_dev_tariel=logging.INFO,
    )
    logging_support.correlation_id_ctx.set("cid-123")

    handler = logging.getLogger().handlers[0]
    record = logging.makeLogRecord(
        {
            "name": "tariel.teste",
            "levelno": logging.INFO,
            "levelname": "INFO",
            "msg": "evento-operacional",
            "cliente_id": 9,
        }
    )
    for filtro in handler.filters:
        filtro.filter(record)

    payload = json.loads(handler.format(record))

    assert payload["msg"] == "evento-operacional"
    assert payload["logger"] == "tariel.teste"
    assert payload["correlation_id"] == "cid-123"
    assert payload["cliente_id"] == 9
