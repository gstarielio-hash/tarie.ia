#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import http.cookiejar
import os
import re
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

WEB_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = WEB_ROOT / "scripts"
EXCLUDED_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    ".venv-linux",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}
COMPILEALL_EXCLUDE = r"[/\\](venv|\.venv|\.venv-linux|node_modules|\.git|dist|build|\.mypy_cache|\.pytest_cache|\.ruff_cache|__pycache__)([/\\]|$)"
PORTAL_CHOICES = ("publico", "inspetor", "revisor", "cliente", "admin")
AUTH_PORTAL_CHOICES = ("inspetor", "revisor", "cliente", "admin")


@dataclass
class ServerHandle:
    process: subprocess.Popen[bytes]
    base_url: str
    port: int
    database_url: str
    stdout_handle: object
    stderr_handle: object


@dataclass
class PortalAuth:
    cookie: str
    csrf_token: str
    landing_html: str


class CliError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, flush=True)


def project_path(*parts: str) -> Path:
    return WEB_ROOT.joinpath(*parts)


def resolve_python_executable() -> str:
    candidates = [
        os.environ.get("PYTHON_BIN"),
        project_path(".venv-linux", "bin", "python"),
        project_path(".venv", "bin", "python"),
        project_path("venv", "bin", "python"),
        project_path(".venv-linux", "Scripts", "python.exe"),
        project_path(".venv", "Scripts", "python.exe"),
        project_path("venv", "Scripts", "python.exe"),
        sys.executable,
    ]
    for candidate in candidates:
        if not candidate:
            continue
        candidate_path = Path(candidate)
        if candidate_path.is_file():
            return str(candidate_path)

    for command in ("python3", "python"):
        resolved = shutil.which(command)
        if resolved:
            return resolved

    raise CliError("Python nao encontrado. Instale python3 ou configure PYTHON_BIN.")


def resolve_venv_executable(name: str) -> str:
    executable_names = [name]
    if not name.endswith(".exe"):
        executable_names.append(f"{name}.exe")

    candidates: list[str | Path] = [os.environ.get(f"{name.upper()}_BIN")]
    for executable_name in executable_names:
        candidates.extend(
            [
                project_path(".venv-linux", "bin", executable_name),
                project_path(".venv", "bin", executable_name),
                project_path("venv", "bin", executable_name),
                project_path(".venv-linux", "Scripts", executable_name),
                project_path(".venv", "Scripts", executable_name),
                project_path("venv", "Scripts", executable_name),
            ]
        )

    for candidate in candidates:
        if not candidate:
            continue
        candidate_path = Path(candidate)
        if candidate_path.is_file():
            return str(candidate_path)

    for executable_name in executable_names:
        resolved = shutil.which(executable_name)
        if resolved:
            return resolved

    raise CliError(
        f"Executavel {name} nao encontrado. Instale na venv do projeto ou configure {name.upper()}_BIN.",
    )


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_process_group_kwargs() -> dict[str, object]:
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"preexec_fn": os.setsid}


def run_command(
    args: Sequence[str | os.PathLike[str]],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> None:
    quoted = " ".join(shlex.quote(str(arg)) for arg in args)
    log(f"$ {quoted}")
    subprocess.run([str(arg) for arg in args], cwd=cwd or WEB_ROOT, env=env, check=True)


def http_status_ok(url: str, timeout: float = 3.0) -> bool:
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def wait_health_endpoint(base_url: str, timeout_seconds: int = 90) -> None:
    deadline = time.time() + timeout_seconds
    health_url = f"{base_url}/health"
    while time.time() < deadline:
        if http_status_ok(health_url, timeout=5.0):
            return
        time.sleep(0.5)
    raise CliError(f"A aplicacao nao respondeu em {timeout_seconds} segundos em {base_url}.")


def get_free_tcp_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def new_test_database_url(label: str = "test") -> str:
    runtime_dir = ensure_directory(project_path(".test-artifacts", "runtime"))
    safe_label = re.sub(r"[^A-Za-z0-9_-]", "_", label).strip("_") or "test"
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    db_path = runtime_dir / f"{safe_label}-{timestamp}.sqlite3"
    return f"sqlite:///{db_path.as_posix()}"


def kill_process_tree(pid: int) -> None:
    try:
        if os.name == "nt":
            os.kill(pid, signal.SIGTERM)
            return
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGTERM)
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.2)
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        return


def start_local_test_server(
    *,
    port: int = 0,
    database_url: str = "",
    seed_dev_bootstrap: str = "1",
) -> ServerHandle:
    python_executable = resolve_python_executable()
    port_final = port if port > 0 else get_free_tcp_port()
    base_url = f"http://127.0.0.1:{port_final}"
    database_url_final = database_url or new_test_database_url("server")
    runtime_dir = ensure_directory(project_path(".test-artifacts", "runtime"))
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    stdout_path = runtime_dir / f"server-{port_final}-{timestamp}.log"
    stderr_path = runtime_dir / f"server-{port_final}-{timestamp}.err.log"
    stdout_handle = stdout_path.open("ab")
    stderr_handle = stderr_path.open("ab")

    env = os.environ.copy()
    env.update(
        {
            "AMBIENTE": env.get("AMBIENTE", "dev"),
            "PYTHONUNBUFFERED": "1",
            "SEED_DEV_BOOTSTRAP": seed_dev_bootstrap,
            "DATABASE_URL": database_url_final,
        }
    )

    process = subprocess.Popen(
        [
            python_executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port_final),
            "--log-level",
            "warning",
        ],
        cwd=WEB_ROOT,
        env=env,
        stdout=stdout_handle,
        stderr=stderr_handle,
        **new_process_group_kwargs(),
    )

    try:
        wait_health_endpoint(base_url, timeout_seconds=90)
    except Exception:
        kill_process_tree(process.pid)
        stdout_handle.close()
        stderr_handle.close()
        raise

    return ServerHandle(
        process=process,
        base_url=base_url,
        port=port_final,
        database_url=database_url_final,
        stdout_handle=stdout_handle,
        stderr_handle=stderr_handle,
    )


def stop_local_test_server(server: ServerHandle | None) -> None:
    if server is None:
        return
    kill_process_tree(server.process.pid)
    server.stdout_handle.close()
    server.stderr_handle.close()


def fetch_text(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 15.0,
) -> str:
    request = urllib.request.Request(url, data=data, headers=headers or {})
    with opener.open(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_hidden_input_value(html: str, name: str) -> str:
    patterns = [
        rf'<input[^>]*name=["\']{re.escape(name)}["\'][^>]*value=["\']([^"\']+)["\']',
        rf'<input[^>]*value=["\']([^"\']+)["\'][^>]*name=["\']{re.escape(name)}["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    raise CliError(f"Campo oculto '{name}' nao encontrado.")


def extract_meta_content_value(html: str, name: str) -> str:
    patterns = [
        rf'<meta[^>]*name=["\']{re.escape(name)}["\'][^>]*content=["\']([^"\']*)["\']',
        rf'<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']{re.escape(name)}["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    raise CliError(f"Meta '{name}' nao encontrada.")


def get_portal_auth_headers(base_url: str, portal: str, email: str, senha: str) -> PortalAuth:
    routes = {
        "inspetor": ("/app/login", "/app/"),
        "revisor": ("/revisao/login", "/revisao/painel"),
        "admin": ("/admin/login", "/admin/painel"),
        "cliente": ("/cliente/login", "/cliente/painel"),
    }
    login_path, landing_path = routes[portal]
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    login_page = fetch_text(opener, base_url + login_path)
    csrf_token = extract_hidden_input_value(login_page, "csrf_token")
    form = urllib.parse.urlencode({"csrf_token": csrf_token, "email": email, "senha": senha}).encode()
    fetch_text(
        opener,
        base_url + login_path,
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    landing_page = fetch_text(opener, base_url + landing_path)
    header_csrf = extract_meta_content_value(landing_page, "csrf-token")
    cookie_header = "; ".join(f"{cookie.name}={cookie.value}" for cookie in cookie_jar)

    return PortalAuth(cookie=cookie_header, csrf_token=header_csrf, landing_html=landing_page)


def iter_project_files(root: Path, extensions: Iterable[str]) -> list[Path]:
    normalized_extensions = {extension.lower() for extension in extensions}
    collected: list[Path] = []
    for current_root, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in EXCLUDED_DIRS]
        current_path = Path(current_root)
        for filename in filenames:
            path = current_path / filename
            if path.suffix.lower() in normalized_extensions:
                collected.append(path)
    return collected


def cmd_validate_pipeline(_: argparse.Namespace) -> None:
    python_executable = resolve_python_executable()
    code_files = iter_project_files(WEB_ROOT, {".py", ".js", ".html", ".css", ".json"})
    scanned_dirs = sorted({str(path.parent.relative_to(WEB_ROOT)) if path.parent != WEB_ROOT else "." for path in code_files})

    log(f"Python em uso: {python_executable}")
    log("Pastas analisadas (recursivo):")
    for directory in scanned_dirs:
        log(f" - {directory}")

    log("")
    log("1/9 format (python)")
    run_command([python_executable, "-m", "ruff", "format", "."], cwd=WEB_ROOT)

    log("2/9 lint (python)")
    run_command([python_executable, "-m", "ruff", "check", "."], cwd=WEB_ROOT)

    log("3/9 arquitetura (chat compat/imports)")
    run_command([python_executable, "scripts/check_chat_architecture.py"], cwd=WEB_ROOT)

    log("4/9 type-check (python)")
    run_command([python_executable, "-m", "mypy"], cwd=WEB_ROOT)

    log("5/9 test (python)")
    run_command([python_executable, "-m", "pytest", "-q"], cwd=WEB_ROOT)

    log("6/9 build (python compileall recursivo)")
    run_command([python_executable, "-m", "compileall", "-q", "-x", COMPILEALL_EXCLUDE, "."], cwd=WEB_ROOT)

    js_files = iter_project_files(WEB_ROOT, {".js"})
    if js_files:
        log("7/9 sintaxe JS (node --check)")
        for js_file in js_files:
            run_command(["node", "--check", str(js_file)], cwd=WEB_ROOT)
    else:
        log("7/9 sintaxe JS (sem arquivos .js para validar)")

    template_root = project_path("templates")
    if template_root.is_dir():
        log("8/9 sintaxe templates Jinja2")
        template_script = (
            "from pathlib import Path; import sys; "
            "from jinja2 import Environment, FileSystemLoader; "
            "root = Path(sys.argv[1]); env = Environment(loader=FileSystemLoader(str(root))); "
            "files = sorted(root.rglob('*.html')); "
            "[env.parse(path.read_text(encoding='utf-8')) for path in files]; "
            "print(f'TEMPLATES_OK={len(files)}')"
        )
        run_command([python_executable, "-c", template_script, str(template_root)], cwd=WEB_ROOT)
    else:
        log("8/9 sintaxe templates Jinja2 (pasta templates nao encontrada)")

    json_files = iter_project_files(WEB_ROOT, {".json"})
    if json_files:
        log("9/9 sintaxe JSON")
        json_script = "import json, sys; json.load(open(sys.argv[1], encoding='utf-8'))"
        for json_file in json_files:
            run_command([python_executable, "-c", json_script, str(json_file)], cwd=WEB_ROOT)
    else:
        log("9/9 sintaxe JSON (sem arquivos .json para validar)")

    log("")
    log("Resumo:")
    log(f" - Arquivos de codigo analisados: {len(code_files)}")
    log(f" - Pastas analisadas: {len(scanned_dirs)}")
    log("Pipeline concluida com sucesso.")


def cmd_schemathesis(args: argparse.Namespace) -> None:
    python_executable = resolve_python_executable()
    schemathesis_executable = resolve_venv_executable("schemathesis")
    output_dir = ensure_directory(project_path(".test-artifacts", "schemathesis"))
    hooks_path = project_path("scripts", "schemathesis_hooks.py")

    server: ServerHandle | None = None
    env = os.environ.copy()
    env.update(
        {
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
            "SCHEMATHESIS_HOOKS": str(hooks_path),
        }
    )

    base_url = args.base_url
    try:
        if not base_url:
            env["SCHEMATHESIS_TEST_HINTS"] = "1"
            server = start_local_test_server(seed_dev_bootstrap="1")
            base_url = server.base_url

        headers: list[str] = []
        include_path_regex = args.include_path_regex

        if args.portal == "publico" and not include_path_regex:
            include_path_regex = r"^/(health|ready)$"
        elif args.portal == "inspetor":
            if not include_path_regex:
                include_path_regex = r"^/app/api/(perfil($|/foto$)|laudo/status$|laudo/iniciar$|laudo/cancelar$|laudo/desativar$)$"
            if server is not None:
                run_command(
                    [
                        python_executable,
                        str(project_path("scripts", "seed_schemathesis_data.py")),
                        "--database-url",
                        server.database_url,
                        "--inspetor-email",
                        env.get("SCHEMA_INSPETOR_EMAIL", "inspetor@tariel.ia"),
                        "--revisor-email",
                        env.get("SCHEMA_REVISOR_EMAIL", "revisor@tariel.ia"),
                    ],
                    cwd=WEB_ROOT,
                    env=env,
                )
            auth = get_portal_auth_headers(
                base_url,
                "inspetor",
                env.get("SCHEMA_INSPETOR_EMAIL", "inspetor@tariel.ia"),
                env.get("SCHEMA_INSPETOR_SENHA", "Dev@123456"),
            )
            headers.extend(["-H", f"Cookie:{auth.cookie}", "-H", f"X-CSRF-Token:{auth.csrf_token}"])
        elif args.portal == "revisor":
            if not include_path_regex:
                include_path_regex = r"revisao/api/laudo/.+/(completo|mensagens|pacote)$"
            if server is not None:
                run_command(
                    [
                        python_executable,
                        str(project_path("scripts", "seed_schemathesis_data.py")),
                        "--database-url",
                        server.database_url,
                        "--inspetor-email",
                        env.get("SCHEMA_INSPETOR_EMAIL", "inspetor@tariel.ia"),
                        "--revisor-email",
                        env.get("SCHEMA_REVISOR_EMAIL", "revisor@tariel.ia"),
                    ],
                    cwd=WEB_ROOT,
                    env=env,
                )
            auth = get_portal_auth_headers(
                base_url,
                "revisor",
                env.get("SCHEMA_REVISOR_EMAIL", "revisor@tariel.ia"),
                env.get("SCHEMA_REVISOR_SENHA", "Dev@123456"),
            )
            headers.extend(["-H", f"Cookie:{auth.cookie}", "-H", f"X-CSRF-Token:{auth.csrf_token}"])
        elif args.portal == "admin":
            if not include_path_regex:
                include_path_regex = r"^/admin/api/"
            auth = get_portal_auth_headers(
                base_url,
                "admin",
                env.get("SCHEMA_ADMIN_EMAIL", "admin@tariel.ia"),
                env.get("SCHEMA_ADMIN_SENHA", "Dev@123456"),
            )
            headers.extend(["-H", f"Cookie:{auth.cookie}", "-H", f"X-CSRF-Token:{auth.csrf_token}"])
        elif args.portal == "cliente":
            if not include_path_regex:
                include_path_regex = r"^/cliente/api/"
            if server is not None:
                run_command(
                    [
                        python_executable,
                        str(project_path("scripts", "seed_schemathesis_data.py")),
                        "--database-url",
                        server.database_url,
                        "--inspetor-email",
                        env.get("SCHEMA_INSPETOR_EMAIL", "inspetor@tariel.ia"),
                        "--revisor-email",
                        env.get("SCHEMA_REVISOR_EMAIL", "revisor@tariel.ia"),
                    ],
                    cwd=WEB_ROOT,
                    env=env,
                )
            auth = get_portal_auth_headers(
                base_url,
                "cliente",
                env.get("SCHEMA_CLIENTE_EMAIL", "cliente@tariel.ia"),
                env.get("SCHEMA_CLIENTE_SENHA", "Dev@123456"),
            )
            headers.extend(["-H", f"Cookie:{auth.cookie}", "-H", f"X-CSRF-Token:{auth.csrf_token}"])

        command = [
            schemathesis_executable,
            "run",
            f"{base_url}/openapi.json",
            "--url",
            base_url,
            "--no-color",
            "--wait-for-schema",
            "30",
            "--workers",
            args.workers,
            "--phases",
            "examples,coverage",
            "--checks",
            "all",
            "--max-examples",
            str(args.max_examples),
            "--generation-deterministic",
            "--report",
            "junit,har",
            "--report-dir",
            str(output_dir),
            "--include-path-regex",
            include_path_regex,
        ]
        if args.continue_on_failure:
            command.append("--continue-on-failure")
        command.extend(headers)
        run_command(command, cwd=WEB_ROOT, env=env)
    finally:
        stop_local_test_server(server)


def cmd_locust(args: argparse.Namespace) -> None:
    locust_executable = resolve_venv_executable("locust")
    output_dir = ensure_directory(project_path(".test-artifacts", "locust"))
    report_base = output_dir / "locust-report"

    server: ServerHandle | None = None
    base_url = args.base_url
    env = os.environ.copy()
    env.setdefault("LOCUST_INSPETOR_EMAIL", "inspetor@tariel.ia")
    env.setdefault("LOCUST_INSPETOR_SENHA", "Dev@123456")
    env.setdefault("LOCUST_REVISOR_EMAIL", "revisor@tariel.ia")
    env.setdefault("LOCUST_REVISOR_SENHA", "Dev@123456")

    try:
        if not base_url:
            server = start_local_test_server(seed_dev_bootstrap="1")
            base_url = server.base_url

        run_command(
            [
                locust_executable,
                "-f",
                str(project_path("tests", "load", "locustfile.py")),
                "--host",
                base_url,
                "--headless",
                "--users",
                str(args.users),
                "--spawn-rate",
                str(args.spawn_rate),
                "--run-time",
                args.run_time,
                "--html",
                str(report_base.with_suffix(".html")),
                "--csv",
                str(report_base),
            ],
            cwd=WEB_ROOT,
            env=env,
        )
    finally:
        stop_local_test_server(server)


def resolve_cloudflared_path() -> str:
    candidates = [
        os.environ.get("CLOUDFLARED_BIN"),
        shutil.which("cloudflared"),
        os.environ.get("LOCALAPPDATA")
        and str(
            Path(os.environ["LOCALAPPDATA"])
            / "Microsoft"
            / "WinGet"
            / "Packages"
            / "Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe"
            / "cloudflared.exe"
        ),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if Path(candidate).is_file():
            return candidate
    raise CliError("cloudflared nao encontrado. Instale-o no PATH ou configure CLOUDFLARED_BIN.")


def write_pid_file(path: Path, pid: int) -> None:
    path.write_text(f"{pid}\n", encoding="ascii")


def stop_process_from_pid_file(path: Path) -> None:
    if not path.exists():
        return
    raw = path.read_text(encoding="ascii", errors="ignore").strip()
    path.unlink(missing_ok=True)
    if not raw:
        return
    try:
        pid = int(raw)
    except ValueError:
        return
    kill_process_tree(pid)


def tail_contains_url(paths: Sequence[Path]) -> str:
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    latest = ""
    for path in paths:
        if not path.exists():
            continue
        match = pattern.findall(path.read_text(encoding="utf-8", errors="replace"))
        if match:
            latest = match[-1]
    return latest


def scan_and_kill_orphans(port: int, bind_host: str) -> None:
    if os.name == "nt":
        return
    result = subprocess.run(
        ["ps", "-eo", "pid=,args="],
        capture_output=True,
        text=True,
        check=True,
    )
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            pid_raw, args = line.split(None, 1)
            pid = int(pid_raw)
        except ValueError:
            continue
        is_app = "uvicorn main:app" in args and f"--port {port}" in args
        is_tunnel = "cloudflared" in args and f"http://{bind_host}:{port}" in args
        if is_app or is_tunnel:
            kill_process_tree(pid)
            log(f"[Tariel Online] Processo orfao finalizado: PID {pid}")


def cmd_start_online_preview(args: argparse.Namespace) -> None:
    runtime_dir = ensure_directory(project_path(".tmp_online"))
    app_pid_file = runtime_dir / "app.pid"
    tunnel_pid_file = runtime_dir / "tunnel.pid"
    app_log = runtime_dir / "app.log"
    app_err = runtime_dir / "app.err.log"
    tunnel_out_log = runtime_dir / "tunnel.out.log"
    tunnel_err_log = runtime_dir / "tunnel.err.log"

    stop_process_from_pid_file(app_pid_file)
    stop_process_from_pid_file(tunnel_pid_file)
    time.sleep(0.4)

    for log_path in (app_log, app_err, tunnel_out_log, tunnel_err_log):
        log_path.unlink(missing_ok=True)

    python_executable = resolve_python_executable()
    cloudflared_path = resolve_cloudflared_path()
    env = os.environ.copy()
    env.setdefault("AMBIENTE", "dev")

    if not args.use_project_database:
        preview_db_path = runtime_dir / "preview_online.db"
        env["DATABASE_URL"] = f"sqlite:///{preview_db_path.as_posix()}"
        env["SEED_DEV_BOOTSTRAP"] = "1"
        log(f"[Tariel Online] Usando banco isolado de preview: {preview_db_path}")
    elif "DATABASE_URL" not in env:
        log("[Tariel Online] Usando DATABASE_URL do ambiente/.env do projeto.")

    app_stdout = app_log.open("ab")
    app_stderr = app_err.open("ab")
    tunnel_stdout = tunnel_out_log.open("ab")
    tunnel_stderr = tunnel_err_log.open("ab")

    app_process: subprocess.Popen[bytes] | None = None
    tunnel_process: subprocess.Popen[bytes] | None = None
    try:
        log(f"[Tariel Online] Subindo app em http://{args.bind_host}:{args.port} ...")
        app_process = subprocess.Popen(
            [
                python_executable,
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                args.bind_host,
                "--port",
                str(args.port),
            ],
            cwd=WEB_ROOT,
            env=env,
            stdout=app_stdout,
            stderr=app_stderr,
            **new_process_group_kwargs(),
        )
        write_pid_file(app_pid_file, app_process.pid)

        health_url = f"http://{args.bind_host}:{args.port}/health"
        deadline = time.time() + 60
        health_ok = False
        while time.time() < deadline:
            if app_process.poll() is not None:
                break
            if http_status_ok(health_url, timeout=3.0):
                health_ok = True
                break
            time.sleep(0.8)

        if not health_ok:
            if app_process.poll() is not None:
                raise CliError(f"App encerrou com codigo {app_process.returncode}. Veja {app_err} e {app_log}.")
            raise CliError(f"App nao respondeu em {health_url}. Veja {app_err} e {app_log}.")

        log("[Tariel Online] App online localmente. Iniciando tunel publico...")
        tunnel_process = subprocess.Popen(
            [
                cloudflared_path,
                "tunnel",
                "--url",
                f"http://{args.bind_host}:{args.port}",
                "--no-autoupdate",
                "--protocol",
                "http2",
            ],
            cwd=WEB_ROOT,
            stdout=tunnel_stdout,
            stderr=tunnel_stderr,
            **new_process_group_kwargs(),
        )
        write_pid_file(tunnel_pid_file, tunnel_process.pid)

        public_url = ""
        deadline = time.time() + 90
        while time.time() < deadline:
            if tunnel_process.poll() is not None:
                break
            public_url = tail_contains_url((tunnel_out_log, tunnel_err_log))
            if public_url:
                break
            time.sleep(0.7)

        if not public_url:
            raise CliError(f"Tunel nao disponibilizou URL. Confira os logs em {runtime_dir}.")

        print("\n===============================================")
        print("URL PUBLICA (compartilhe para testes):")
        print(public_url)
        print("===============================================\n")
        log(f"[Tariel Online] Logs: {runtime_dir}")
        log("[Tariel Online] Para encerrar tudo: ./scripts/stop_online_preview.sh")

        if not args.no_open_browser:
            with contextlib.suppress(Exception):
                webbrowser.open(public_url)

        while True:
            time.sleep(2)
            if app_process.poll() is not None:
                log(f"[Tariel Online] App foi encerrada (PID {app_process.pid}).")
                break
            if tunnel_process.poll() is not None:
                log(f"[Tariel Online] Tunel foi encerrado (PID {tunnel_process.pid}).")
                break
    finally:
        tunnel_stdout.close()
        tunnel_stderr.close()
        app_stdout.close()
        app_stderr.close()
        stop_process_from_pid_file(tunnel_pid_file)
        stop_process_from_pid_file(app_pid_file)


def cmd_stop_online_preview(args: argparse.Namespace) -> None:
    runtime_dir = project_path(".tmp_online")
    app_pid_file = runtime_dir / "app.pid"
    tunnel_pid_file = runtime_dir / "tunnel.pid"

    stop_process_from_pid_file(tunnel_pid_file)
    stop_process_from_pid_file(app_pid_file)
    scan_and_kill_orphans(args.port, args.bind_host)
    log("[Tariel Online] Encerramento concluido.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ferramentas Linux para o workspace web do Tariel.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate-pipeline", help="Executa a pipeline local completa.")
    validate_parser.set_defaults(func=cmd_validate_pipeline)

    schemathesis_parser = subparsers.add_parser("schemathesis", help="Executa Schemathesis no Linux.")
    schemathesis_parser.add_argument("--portal", choices=PORTAL_CHOICES, default="inspetor")
    schemathesis_parser.add_argument("--base-url", default="")
    schemathesis_parser.add_argument("--workers", default="1")
    schemathesis_parser.add_argument("--max-examples", type=int, default=8)
    schemathesis_parser.add_argument("--include-path-regex", default="")
    schemathesis_parser.add_argument("--continue-on-failure", action="store_true")
    schemathesis_parser.set_defaults(func=cmd_schemathesis)

    locust_parser = subparsers.add_parser("locust", help="Executa Locust no Linux.")
    locust_parser.add_argument("--base-url", default="")
    locust_parser.add_argument("--users", type=int, default=6)
    locust_parser.add_argument("--spawn-rate", type=int, default=2)
    locust_parser.add_argument("--run-time", default="45s")
    locust_parser.set_defaults(func=cmd_locust)

    preview_start_parser = subparsers.add_parser(
        "start-online-preview",
        help="Sobe app + tunel Cloudflare para preview publico.",
    )
    preview_start_parser.add_argument("--port", type=int, default=8000)
    preview_start_parser.add_argument("--bind-host", default="127.0.0.1")
    preview_start_parser.add_argument("--use-project-database", action="store_true")
    preview_start_parser.add_argument("--no-open-browser", action="store_true")
    preview_start_parser.set_defaults(func=cmd_start_online_preview)

    preview_stop_parser = subparsers.add_parser(
        "stop-online-preview",
        help="Encerra preview online e limpa processos orfaos.",
    )
    preview_stop_parser.add_argument("--port", type=int, default=8000)
    preview_stop_parser.add_argument("--bind-host", default="127.0.0.1")
    preview_stop_parser.set_defaults(func=cmd_stop_online_preview)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except KeyboardInterrupt:
        return 130
    except subprocess.CalledProcessError as error:
        return error.returncode or 1
    except CliError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
