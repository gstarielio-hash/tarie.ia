from __future__ import annotations

import os
import re

from locust import HttpUser, between, task


def _extrair_csrf_hidden(html: str) -> str:
    match = re.search(r'name="csrf_token"\s+value="([^"]+)"', html or "")
    return match.group(1) if match else ""


class TarielBaseUser(HttpUser):
    abstract = True
    wait_time = between(1.0, 3.0)

    def _login_form(self, *, login_path: str, landing_path: str, email: str, senha: str) -> None:
        if not email or not senha:
            return

        resposta_login = self.client.get(login_path, name=f"{login_path} [form]")
        csrf = _extrair_csrf_hidden(resposta_login.text)
        payload = {
            "csrf_token": csrf,
            "email": email,
            "senha": senha,
        }
        self.client.post(
            login_path,
            data=payload,
            name=f"{login_path} [submit]",
            allow_redirects=True,
        )
        self.client.get(landing_path, name=f"{landing_path} [landing]")


class TarielPublicoUser(TarielBaseUser):
    weight = 1

    @task(2)
    def health(self) -> None:
        self.client.get("/health", name="/health")

    @task(1)
    def login_pages(self) -> None:
        self.client.get("/app/login", name="/app/login")
        self.client.get("/revisao/login", name="/revisao/login")


class TarielInspetorUser(TarielBaseUser):
    weight = 2

    def on_start(self) -> None:
        self._login_form(
            login_path="/app/login",
            landing_path="/app/",
            email=os.getenv("LOCUST_INSPETOR_EMAIL", "inspetor@wf.com.br"),
            senha=os.getenv("LOCUST_INSPETOR_SENHA", "Dev@123456"),
        )

    @task(2)
    def home(self) -> None:
        self.client.get("/app/", name="/app/")

    @task(2)
    def perfil(self) -> None:
        self.client.get("/app/api/perfil", name="/app/api/perfil")

    @task(3)
    def status_laudo(self) -> None:
        self.client.get("/app/api/laudo/status", name="/app/api/laudo/status")


class TarielRevisorUser(TarielBaseUser):
    weight = 1

    def on_start(self) -> None:
        self._login_form(
            login_path="/revisao/login",
            landing_path="/revisao/painel",
            email=os.getenv("LOCUST_REVISOR_EMAIL", "revisor@wf.com.br"),
            senha=os.getenv("LOCUST_REVISOR_SENHA", "Dev@123456"),
        )

    @task(3)
    def painel(self) -> None:
        self.client.get("/revisao/painel", name="/revisao/painel")
