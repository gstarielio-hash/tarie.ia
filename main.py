"""
main.py — Tariel Control Tower
WF Engenharia · Aplicação SaaS de Inspeções Industriais

Responsabilidades deste arquivo:
- criar e configurar a aplicação FastAPI
- aplicar middlewares globais
- endurecer headers e política de segurança
- inicializar banco e recursos no lifespan
- montar arquivos estáticos
- registrar roteadores
- definir endpoints operacionais (health/ready)
- tratar exceções globais
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import sys
import time
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Final, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.settings import env_int, env_log_level, env_str, get_settings
from app.shared.database import (
    NivelAcesso,
    SessaoLocal,
    Usuario,
    inicializar_banco,
    obter_banco,
)
from app.domains.router_registry import (
    roteador_admin,
    roteador_inspetor,
    roteador_revisor,
)
from app.shared.security import (
    SESSOES_ATIVAS,
    obter_dados_sessao_portal,
    portal_por_caminho,
    token_esta_ativo,
    usuario_tem_bloqueio_ativo,
)


# =============================================================================
# CAMINHOS
# =============================================================================

DIR_BASE: Final[Path] = Path(__file__).parent.resolve()
DIR_STATIC: Final[Path] = DIR_BASE / "static"


# =============================================================================
# HELPERS DE AMBIENTE
# =============================================================================

_obter_str_env = env_str
_obter_int_env = env_int
_obter_nivel_log_env = env_log_level


def _normalizar_host(valor: str) -> str:
    """
    Remove protocolo, barras finais e espaços.
    Mantém wildcard se existir, pois o TrustedHostMiddleware aceita "*.dominio".
    """
    texto = (valor or "").strip()
    if not texto:
        return ""

    texto = texto.removeprefix("https://").removeprefix("http://").rstrip("/")
    return texto.strip()


def _host_sem_porta(valor: str) -> str:
    texto = _normalizar_host(valor)
    if not texto or texto.startswith("*."):
        return texto
    return texto.split(":", 1)[0].strip()


def _deduplicar_preservando_ordem(valores: list[str]) -> list[str]:
    vistos: set[str] = set()
    saida: list[str] = []

    for valor in valores:
        if not valor or valor in vistos:
            continue
        vistos.add(valor)
        saida.append(valor)

    return saida


# =============================================================================
# AMBIENTE
# =============================================================================

_settings = get_settings()
AMBIENTE: Final[str] = _settings.ambiente
EM_PRODUCAO: Final[bool] = _settings.em_producao
APP_VERSAO: Final[str] = _settings.app_versao
PORTA_APP: Final[int] = _settings.porta
HOST_BIND_APP: Final[str] = _normalizar_host(
    _settings.host_bind
) or ("0.0.0.0" if not EM_PRODUCAO else "0.0.0.0")
LOG_LEVEL_DEV_ROOT: Final[int] = _obter_nivel_log_env("LOG_LEVEL_DEV_ROOT", logging.INFO)
LOG_LEVEL_DEV_TARIEL: Final[int] = _obter_nivel_log_env("LOG_LEVEL_DEV_TARIEL", logging.DEBUG)


# =============================================================================
# HOSTS / DOMÍNIO
# =============================================================================

APP_HOST_PUBLICO: Final[str] = _normalizar_host(
    _obter_str_env(
        "APP_HOST_PUBLICO",
        "wf.com.br" if EM_PRODUCAO else "127.0.0.1:8000",
    )
)

_allowed_hosts_env = _obter_str_env("ALLOWED_HOSTS", "")
if _allowed_hosts_env:
    allowed_hosts_base = [_normalizar_host(item) for item in _allowed_hosts_env.split(",") if _normalizar_host(item)]
else:
    if EM_PRODUCAO:
        allowed_hosts_base = ["wf.com.br", "*.wf.com.br"]
    else:
        # Em dev, permite acesso por IP local (ex.: celular via 192.168.x.x)
        # sem exigir ajuste manual de ALLOWED_HOSTS.
        allowed_hosts_base = ["*"]

if APP_HOST_PUBLICO:
    allowed_hosts_base.append(APP_HOST_PUBLICO)
    allowed_hosts_base.append(_host_sem_porta(APP_HOST_PUBLICO))

ALLOWED_HOSTS: Final[list[str]] = _deduplicar_preservando_ordem(allowed_hosts_base)


# =============================================================================
# SEGREDO / SESSÃO
# =============================================================================

CHAVE_SECRETA = _obter_str_env("CHAVE_SECRETA_APP", "")
NOME_COOKIE_SESSAO: Final[str] = (
    _obter_str_env(
        "SESSION_COOKIE_NAME",
        "cracha_wf_seguro",
    )
    or "cracha_wf_seguro"
)
MAX_AGE_SESSAO: Final[int] = max(_obter_int_env("SESSION_MAX_AGE", 2592000), 300)

if not CHAVE_SECRETA:
    if EM_PRODUCAO:
        sys.stderr.write("[CRITICAL] CHAVE_SECRETA_APP não definida. Impossível iniciar em produção.\n")
        sys.exit(1)

    CHAVE_SECRETA = "dev-chave-fixa-tariel-wf-2026-nao-usar-em-producao"

if EM_PRODUCAO and len(CHAVE_SECRETA) < 32:
    sys.stderr.write("[CRITICAL] CHAVE_SECRETA_APP muito curta. Use ao menos 32 caracteres em produção.\n")
    sys.exit(1)


# =============================================================================
# CORRELATION ID + LOGGING
# =============================================================================

correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")
_RESERVED_LOG_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {
    "message",
    "asctime",
}


class CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_ctx.get()
        return True


def _extrair_campos_extras(record: logging.LogRecord) -> dict:
    extras = {}

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


def _configurar_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(CorrelationIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]

    if EM_PRODUCAO:

        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                payload = {
                    "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
                    "level": record.levelname,
                    "logger": record.name,
                    "msg": record.getMessage(),
                    "module": record.module,
                    "correlation_id": getattr(record, "correlation_id", "-"),
                    "ambiente": AMBIENTE,
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
        root.setLevel(LOG_LEVEL_DEV_ROOT)

        # Mantém verbosidade detalhada só para o app, sem poluir o terminal
        # com DEBUG de bibliotecas externas.
        logging.getLogger("tariel").setLevel(LOG_LEVEL_DEV_TARIEL)

    # Ruído comum em desenvolvimento (multipart/http interno/SDKs externos).
    for nome_logger in (
        "python_multipart",
        "httpcore",
        "httpx",
        "google_genai",
        "urllib3",
        "asyncio",
    ):
        logging.getLogger(nome_logger).setLevel(logging.WARNING)


_configurar_logging()
logger = logging.getLogger("tariel.main")

if not EM_PRODUCAO:
    logger.warning(
        "Modo desenvolvimento ativo. Nunca suba esta configuração em produção.",
        extra={"ambiente": AMBIENTE},
    )


# =============================================================================
# RATE LIMIT
# =============================================================================

REDIS_URL: Final[str | None] = _obter_str_env("REDIS_URL", "") or None

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri=REDIS_URL,
)


# =============================================================================
# CSP / SEGURANÇA DE FRONT
# =============================================================================

CSP_STYLE_FONTES: Final[str] = "https://fonts.googleapis.com"
CSP_FONT_GSTATIC: Final[str] = "https://fonts.gstatic.com"
CSP_SCRIPTS_CDN: Final[str] = "https://cdn.jsdelivr.net"

if EM_PRODUCAO:
    WS_ORIGINS = [f"wss://{_host_sem_porta(APP_HOST_PUBLICO)}"] if APP_HOST_PUBLICO else []
else:
    WS_ORIGINS = [
        "ws://127.0.0.1:8000",
        "ws://localhost:8000",
    ]


def construir_csp(nonce: str, para_app: bool = True) -> str:
    if not para_app:
        return "default-src 'self'; frame-ancestors 'none';"

    connect_src = " ".join(
        [
            "'self'",
            "blob:",
            *WS_ORIGINS,
            CSP_SCRIPTS_CDN,
            CSP_STYLE_FONTES,
            CSP_FONT_GSTATIC,
        ]
    )

    partes = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "manifest-src 'self'",
        f"style-src 'self' {CSP_STYLE_FONTES} 'unsafe-inline'",
        f"font-src 'self' data: {CSP_FONT_GSTATIC}",
        f"script-src 'self' {CSP_SCRIPTS_CDN} 'nonce-{nonce}' 'unsafe-hashes'",
        "img-src 'self' data: blob: https://cdn-icons-png.flaticon.com",
        f"connect-src {connect_src}",
        "worker-src 'self' blob:",
        "media-src 'self' blob:",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]

    if EM_PRODUCAO:
        partes.append("upgrade-insecure-requests")

    return "; ".join(partes) + ";"


# =============================================================================
# HELPERS DE SESSÃO / USUÁRIO
# =============================================================================


def _obter_usuario_da_sessao(
    request: Request,
    banco: Session,
) -> Optional[Usuario]:
    dados_sessao = obter_dados_sessao_portal(
        request.session,
        caminho=request.url.path,
    )
    token = dados_sessao.get("token")
    if not token or not token_esta_ativo(token):
        return None

    usuario_id = SESSOES_ATIVAS.get(token)
    if not usuario_id:
        return None

    usuario = banco.get(Usuario, usuario_id)
    if not usuario:
        return None

    if usuario_tem_bloqueio_ativo(usuario):
        return None

    return usuario


def _redirecionar_por_nivel(usuario: Usuario) -> RedirectResponse:
    nivel = usuario.nivel_acesso

    if nivel == NivelAcesso.INSPETOR.value:
        return RedirectResponse(url="/app/", status_code=302)

    if nivel == NivelAcesso.REVISOR.value:
        return RedirectResponse(url="/revisao/painel", status_code=302)

    if nivel >= NivelAcesso.DIRETORIA.value:
        return RedirectResponse(url="/admin/painel", status_code=302)

    return RedirectResponse(url="/app/login", status_code=302)


def _rota_api(path: str) -> bool:
    return path.startswith(("/api/", "/app/api/", "/revisao/api/", "/admin/api/"))


def _rota_protegida_html(path: str) -> bool:
    return path.startswith(("/admin", "/app", "/revisao"))


def _deve_no_store(path: str) -> bool:
    """
    Evita cache de shells HTML autenticados e endpoints sensíveis.
    Não aplica em /static para não prejudicar performance dos assets.
    """
    if path.startswith("/static"):
        return False

    if path in {"/favicon.ico"}:
        return False

    return _rota_protegida_html(path)


def _pagina_html_erro(
    titulo: str,
    mensagem: str,
    correlation_id: str | None = None,
    status_code: int = 500,
) -> HTMLResponse:
    cid_html = f"<p style='opacity:.7;font-size:12px;margin-top:18px;'>CID: {correlation_id}</p>" if correlation_id else ""

    html = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>{titulo}</title>
        <style>
            body {{
                margin: 0;
                font-family: Inter, Arial, sans-serif;
                background: #081624;
                color: #ffffff;
                display: grid;
                place-items: center;
                min-height: 100vh;
                padding: 24px;
            }}
            .box {{
                width: 100%;
                max-width: 560px;
                background: #10263d;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 18px;
                padding: 28px;
                box-shadow: 0 20px 60px rgba(0,0,0,.35);
            }}
            h1 {{
                margin: 0 0 12px;
                font-size: 22px;
            }}
            p {{
                margin: 0;
                line-height: 1.6;
                color: #c6d5e3;
            }}
            a {{
                display: inline-block;
                margin-top: 18px;
                color: #F47B20;
                text-decoration: none;
                font-weight: 600;
            }}
        </style>
    </head>
    <body>
        <div class="box">
            <h1>{titulo}</h1>
            <p>{mensagem}</p>
            {cid_html}
            <a href="/app/login">Ir para o login</a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=status_code)


# =============================================================================
# MIDDLEWARES CUSTOMIZADOS
# =============================================================================


class MiddlewareCorrelationID(BaseHTTPMiddleware):
    HEADER: Final[str] = "X-Correlation-ID"

    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = request.headers.get(self.HEADER) or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        token_ctx = correlation_id_ctx.set(correlation_id)
        inicio = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duracao_ms = round((time.perf_counter() - inicio) * 1000, 1)
            logger.exception(
                "Falha durante processamento da requisição",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "duration_ms": duracao_ms,
                },
            )
            raise
        else:
            duracao_ms = round((time.perf_counter() - inicio) * 1000, 1)
            response.headers[self.HEADER] = correlation_id
            response.headers["X-Response-Time"] = f"{duracao_ms}ms"

            logger.info(
                "Requisição processada",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "duration_ms": duracao_ms,
                },
            )
            return response
        finally:
            correlation_id_ctx.reset(token_ctx)


class MiddlewareHeadersSeguranca(BaseHTTPMiddleware):
    HEADERS_REMOVER: Final[tuple[str, ...]] = ("server", "x-powered-by")

    async def dispatch(self, request: Request, call_next) -> Response:
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce

        response = await call_next(request)
        caminho = request.url.path

        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"

        if _deve_no_store(caminho):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

        for header in self.HEADERS_REMOVER:
            if header in response.headers:
                del response.headers[header]

        if EM_PRODUCAO:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        if _rota_protegida_html(caminho):
            response.headers["Content-Security-Policy"] = construir_csp(
                nonce=nonce,
                para_app=True,
            )

        return response


# =============================================================================
# LIFESPAN
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Iniciando Tariel Control Tower",
        extra={
            "ambiente": AMBIENTE,
            "versao": APP_VERSAO,
            "allowed_hosts": ALLOWED_HOSTS,
        },
    )

    try:
        inicializar_banco()

        with SessaoLocal() as banco:
            banco.execute(text("SELECT 1"))

        logger.info("Inicialização concluída com sucesso")
    except Exception:
        logger.critical(
            "Falha catastrófica na inicialização. Abortando.",
            exc_info=True,
        )
        raise

    yield

    logger.info("Encerrando Tariel Control Tower")


# =============================================================================
# FACTORY DA APLICAÇÃO
# =============================================================================


def create_app() -> FastAPI:
    app = FastAPI(
        title="Tariel Control Tower",
        version=APP_VERSAO,
        docs_url=None if EM_PRODUCAO else "/docs",
        redoc_url=None if EM_PRODUCAO else "/redoc",
        openapi_url=None if EM_PRODUCAO else "/openapi.json",
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ):
        return JSONResponse(
            status_code=422,
            content={
                "detail": exc.errors(),
                "correlation_id": getattr(request.state, "correlation_id", None),
            },
        )

    @app.exception_handler(404)
    async def nao_encontrado_handler(request: Request, exc: Exception):
        correlation_id = getattr(request.state, "correlation_id", None)
        caminho = request.url.path

        if _rota_api(caminho):
            detalhe: object = "Recurso não encontrado."
            if isinstance(exc, HTTPException):
                detalhe_exc = getattr(exc, "detail", None)
                if isinstance(detalhe_exc, str):
                    if detalhe_exc.strip().lower() not in {"not found"}:
                        detalhe = detalhe_exc
                elif isinstance(detalhe_exc, (dict, list)):
                    detalhe = detalhe_exc

            return JSONResponse(
                status_code=404,
                content={
                    "detail": detalhe,
                    "correlation_id": correlation_id,
                },
            )

        try:
            token = obter_dados_sessao_portal(
                request.session,
                caminho=request.url.path,
            ).get("token")
        except Exception:
            token = None

        if not token or not token_esta_ativo(token):
            return RedirectResponse(url="/app/login", status_code=302)

        try:
            with SessaoLocal() as banco:
                usuario = _obter_usuario_da_sessao(request, banco)
                if usuario:
                    return _redirecionar_por_nivel(usuario)
        except Exception:
            logger.warning("Falha ao consultar usuário no handler 404.", exc_info=True)

        return RedirectResponse(url="/app/login", status_code=302)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        correlation_id = getattr(request.state, "correlation_id", None)
        caminho = request.url.path

        logger.exception(
            "Erro interno não tratado",
            extra={
                "path": caminho,
                "method": request.method,
            },
        )

        if _rota_api(caminho):
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Erro interno do servidor.",
                    "correlation_id": correlation_id,
                },
            )

        return _pagina_html_erro(
            titulo="Erro interno",
            mensagem=("O sistema encontrou um erro inesperado. Tente novamente em instantes."),
            correlation_id=correlation_id,
            status_code=500,
        )

    # -------------------------------------------------------------------------
    # Ordem dos middlewares:
    # O último add_middleware fica mais externo.
    #
    # Ordem efetiva do request:
    # TrustedHost -> Session -> HeadersSeguranca -> CorrelationID -> SlowAPI -> GZip -> rota
    # -------------------------------------------------------------------------

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(MiddlewareCorrelationID)
    app.add_middleware(MiddlewareHeadersSeguranca)
    app.add_middleware(
        SessionMiddleware,
        secret_key=CHAVE_SECRETA,
        https_only=EM_PRODUCAO,
        same_site="lax",
        max_age=MAX_AGE_SESSAO,
        session_cookie=NOME_COOKIE_SESSAO,
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=ALLOWED_HOSTS,
    )

    if not DIR_STATIC.is_dir():
        logger.warning(
            "Diretório de estáticos não encontrado",
            extra={"path": str(DIR_STATIC)},
        )
    else:
        app.mount("/static", StaticFiles(directory=str(DIR_STATIC)), name="static")

    # -------------------------------------------------------------------------
    # ROTEADORES
    # -------------------------------------------------------------------------

    app.include_router(roteador_admin, prefix="/admin", tags=["Administração"])
    app.include_router(roteador_inspetor, prefix="/app", tags=["Inspetor"])
    app.include_router(roteador_revisor, tags=["Revisão"])

    # -------------------------------------------------------------------------
    # ARQUIVOS OPERACIONAIS
    # -------------------------------------------------------------------------

    @app.get("/app/trabalhador_servico.js", include_in_schema=False)
    async def service_worker():
        caminho = DIR_STATIC / "js" / "shared" / "trabalhador_servico.js"
        if not caminho.is_file():
            return Response(status_code=404)

        return FileResponse(
            str(caminho),
            media_type="application/javascript",
            headers={
                "Service-Worker-Allowed": "/app/",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

    @app.get("/app/manifesto.json", include_in_schema=False)
    async def manifesto():
        caminho = DIR_STATIC / "manifesto.json"
        if not caminho.is_file():
            return Response(status_code=404)

        return FileResponse(
            str(caminho),
            media_type="application/manifest+json",
            headers={
                "Cache-Control": "public, max-age=3600",
            },
        )

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        for nome in ("img/favicon.ico", "img/logo_wf.png"):
            caminho = DIR_STATIC / nome
            if caminho.is_file():
                return FileResponse(
                    str(caminho),
                    headers={"Cache-Control": "public, max-age=86400"},
                )
        return Response(status_code=404)

    # -------------------------------------------------------------------------
    # ENDPOINTS OPERACIONAIS
    # -------------------------------------------------------------------------

    @app.get("/health", include_in_schema=False)
    async def health_check():
        return JSONResponse(
            {
                "status": "ok",
                "versao": APP_VERSAO,
                "ambiente": AMBIENTE,
            }
        )

    @app.get("/ready", include_in_schema=False)
    async def readiness_check():
        detalhes = {
            "status": "ok",
            "banco": "ok",
            "rate_limit_storage": "memory" if not REDIS_URL else "redis_configurado",
            "ambiente": AMBIENTE,
            "versao": APP_VERSAO,
        }

        try:
            with SessaoLocal() as banco:
                banco.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Readiness falhou ao consultar banco")
            return JSONResponse(
                status_code=503,
                content={
                    "status": "erro",
                    "banco": "indisponivel",
                    "ambiente": AMBIENTE,
                    "versao": APP_VERSAO,
                },
            )

        return JSONResponse(detalhes)

    if not EM_PRODUCAO:

        @app.get("/debug-sessao", include_in_schema=False)
        def debug_sessao(
            request: Request,
            banco: Session = Depends(obter_banco),
        ):
            portal_atual = portal_por_caminho(request.url.path)
            token = obter_dados_sessao_portal(
                request.session,
                portal=portal_atual,
                caminho=request.url.path,
            ).get("token", "Nenhum token")
            usuario_id = SESSOES_ATIVAS.get(token, "Nenhum ID")

            if isinstance(usuario_id, int):
                usuario = banco.get(Usuario, usuario_id)
                if usuario:
                    return {
                        "email": usuario.email,
                        "nivel_acesso": usuario.nivel_acesso,
                        "nome": getattr(
                            usuario,
                            "nome_completo",
                            getattr(usuario, "nome", ""),
                        ),
                        "status": "Sessão válida.",
                    }

            return {
                "erro": "Sessão não reconhecida ou expirada.",
                "token_recebido": token,
                "id_memoria": usuario_id,
            }

    # -------------------------------------------------------------------------
    # RAIZ
    # -------------------------------------------------------------------------

    @app.get("/", include_in_schema=False)
    def redirecionamento_raiz(
        request: Request,
        banco: Session = Depends(obter_banco),
    ):
        usuario = _obter_usuario_da_sessao(request, banco)

        if usuario:
            logger.debug(
                "Redirecionando usuário autenticado",
                extra={
                    "email": usuario.email,
                    "nivel_acesso": usuario.nivel_acesso,
                },
            )
            return _redirecionar_por_nivel(usuario)

        logger.debug("Sessão inválida ou inexistente. Redirecionando para /app/login")
        return RedirectResponse(url="/app/login", status_code=302)

    return app


# =============================================================================
# INSTÂNCIA DA APP
# =============================================================================

app = create_app()


# =============================================================================
# EXECUÇÃO LOCAL
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=HOST_BIND_APP,
        port=PORTA_APP,
        reload=not EM_PRODUCAO,
        log_level="debug" if not EM_PRODUCAO else "info",
        access_log=not EM_PRODUCAO,
    )
