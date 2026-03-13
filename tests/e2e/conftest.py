from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict[str, object]) -> dict[str, object]:
    """Evita interferência de Service Worker nos fluxos E2E de sessão/reload."""
    return {
        **browser_context_args,
        "service_workers": "block",
    }


def _obter_porta_livre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def _aguardar_app(base_url: str, timeout_segundos: int = 90) -> None:
    inicio = time.time()
    ultimo_erro: Exception | None = None

    while (time.time() - inicio) < timeout_segundos:
        try:
            resposta = requests.get(f"{base_url}/health", timeout=2.0)
            if resposta.status_code == 200:
                return
        except Exception as erro:  # pragma: no cover - caminho de retentativa
            ultimo_erro = erro
        time.sleep(0.5)

    if ultimo_erro:
        raise RuntimeError(f"App não respondeu em {timeout_segundos}s. Último erro: {ultimo_erro}") from ultimo_erro
    raise RuntimeError(f"App não respondeu em {timeout_segundos}s.")


@pytest.fixture(scope="session")
def live_server_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    base_url_externo = os.getenv("E2E_BASE_URL", "").strip().rstrip("/")
    if base_url_externo:
        _aguardar_app(base_url_externo)
        yield base_url_externo
        return

    projeto_dir = Path(__file__).resolve().parents[2]
    porta = _obter_porta_livre()
    base_url = f"http://127.0.0.1:{porta}"
    usar_db_local = os.getenv("E2E_USE_LOCAL_DB", "0").strip().lower() in {"1", "true", "yes", "on"}

    env = os.environ.copy()
    env.update({"AMBIENTE": "dev", "PYTHONUNBUFFERED": "1"})

    if usar_db_local:
        db_local = os.getenv("E2E_LOCAL_DATABASE_URL", "").strip()
        if not db_local:
            caminho_db_local = projeto_dir / "tariel_admin.db"
            db_local = f"sqlite:///{caminho_db_local.as_posix()}"
        env["DATABASE_URL"] = db_local
        env["SEED_DEV_BOOTSTRAP"] = os.getenv("E2E_LOCAL_SEED_BOOTSTRAP", "0").strip() or "0"
    else:
        pasta_db = tmp_path_factory.mktemp("playwright_db")
        caminho_db = pasta_db / "tariel_playwright.sqlite3"
        env["SEED_DEV_BOOTSTRAP"] = "1"
        env["DATABASE_URL"] = f"sqlite:///{caminho_db.as_posix()}"

    # Para suites de stress local, garantimos usuários dedicados de carga
    # (inspetor A/B, revisor e admin) no mesmo banco do servidor E2E.
    if os.getenv("RUN_E2E_LOCAL", "0").strip() == "1":
        subprocess.run(
            [sys.executable, "scripts/seed_usuario_uso_intenso.py"],
            cwd=str(projeto_dir),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )

    processo = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(porta),
            "--log-level",
            "warning",
        ],
        cwd=str(projeto_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        _aguardar_app(base_url)
        yield base_url
    finally:
        if processo.poll() is None:
            processo.terminate()
            try:
                processo.wait(timeout=10)
            except subprocess.TimeoutExpired:  # pragma: no cover - caminho de limpeza
                processo.kill()
                processo.wait(timeout=5)


@pytest.fixture(scope="session")
def credenciais_seed() -> dict[str, dict[str, str]]:
    return {
        "inspetor": {
            "email": "inspetor@wf.com.br",
            "senha": "Dev@123456",
        },
        "revisor": {
            "email": "revisor@wf.com.br",
            "senha": "Dev@123456",
        },
        "admin_cliente": {
            "email": "admin-cliente@wf.com.br",
            "senha": "Dev@123456",
        },
        "admin": {
            "email": "admin@wf.com.br",
            "senha": "Admin@123",
        },
    }
