from __future__ import annotations

import app.domains.admin.routes as rotas_admin
import pytest
from sqlalchemy.orm import Session

from tests.regras_rotas_criticas_support import _csrf_pagina, _login_admin


def test_admin_cadastrar_empresa_exibe_aviso_operacional_quando_boas_vindas_nao_sao_entregues(
    ambiente_critico,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = ambiente_critico["client"]

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, "/admin/painel")

    class _EmpresaStub:
        id = 777
        nome_fantasia = "Cliente Operacional"

    def _registrar_stub(_db: Session, **_kwargs) -> tuple[_EmpresaStub, str, str]:
        return _EmpresaStub(), "Senha@Temp123", "Entrega automática de boas-vindas não configurada."

    monkeypatch.setattr(rotas_admin, "registrar_novo_cliente", _registrar_stub)

    resposta = client.post(
        "/admin/cadastrar-empresa",
        data={
            "csrf_token": csrf,
            "nome": "Cliente Operacional",
            "cnpj": "88999888000199",
            "email": "cliente-operacional@test.local",
            "plano": "Ilimitado",
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    pagina = client.get(resposta.headers["location"])
    assert pagina.status_code == 200
    assert "Cliente Cliente Operacional cadastrado com sucesso." in pagina.text
    assert "Entrega automática de boas-vindas não configurada." in pagina.text
