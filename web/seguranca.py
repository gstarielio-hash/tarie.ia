"""
seguranca.py — Tariel.ia
Hashing, sessões e dependências de autenticação FastAPI.

Arquitetura de sessão (dupla camada):
  Camada 1 — request.session (Starlette SessionMiddleware):
    Cookie HMAC-SHA256 assinado com CHAVE_SECRETA_APP (.env).
    Armazena: session_token, csrf_token.
    FIX: substitui request.cookies.get("cracha_tariel_seguro") — cookie bruto
    nunca continha o valor decodificado, invalidando toda autenticação.

  Camada 2 — SESSOES_ATIVAS (whitelist server-side):
    SESSOES_ATIVAS[session_token] → usuario_id (int)
    Permite invalidação forçada (bloqueio, logout remoto, expiração por TTL).
    AVISO: in-memory → substituir por Redis em produção com múltiplos workers.
"""

import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from banco_dados import NivelAcesso, Usuario, obter_banco

logger = logging.getLogger(__name__)

contexto_senha = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Duração máxima de uma sessão autenticada
# Deve ser igual ao max_age configurado no SessionMiddleware em main.py
_SESSAO_TTL = timedelta(hours=8)

# ── Whitelist server-side ─────────────────────────────────────────────────────
# AVISO: in-memory → não persiste entre reinicializações e não funciona com
# múltiplos workers Uvicorn. Em produção, substitua por Redis com TTL nativo.
SESSOES_ATIVAS:    dict[str, int]      = {}
_SESSAO_EXPIRACAO: dict[str, datetime] = {}


# ── Senhas ────────────────────────────────────────────────────────────────────

def criar_hash_senha(senha_pura: str) -> str:
    """Gera hash bcrypt de uma senha."""
    return contexto_senha.hash(senha_pura)


def verificar_senha(senha_pura: str, senha_hash: str) -> bool:
    """Verifica se a senha confere com o hash armazenado."""
    return contexto_senha.verify(senha_pura, senha_hash)


def gerar_senha_fortificada(comprimento: int = 14) -> str:
    """
    Gera senha aleatória segura para onboarding.
    Usa secrets.choice — criptograficamente seguro (não random).
    """
    if comprimento < 8:
        raise ValueError("comprimento mínimo para gerar_senha_fortificada é 8.")

    alfabeto = string.ascii_letters + string.digits + "!@#$%&*"
    senha: list[str] = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%&*"),
    ]
    senha += [secrets.choice(alfabeto) for _ in range(comprimento - 4)]
    # SystemRandom usa urandom — não deixa obrigatórios sempre no início
    secrets.SystemRandom().shuffle(senha)
    return "".join(senha)


# ── Sessões ───────────────────────────────────────────────────────────────────

def criar_sessao(usuario_id: int) -> str:
    """
    Gera session_token e registra na whitelist server-side com TTL.
    O roteador deve armazenar o token retornado em request.session["session_token"].

    Exemplo em rotas_admin.py (processar_login):
        token = criar_sessao(usuario.id)
        request.session["session_token"] = token
        request.session["csrf_token"]    = secrets.token_urlsafe(32)
    """
    token = secrets.token_urlsafe(32)
    SESSOES_ATIVAS[token]    = usuario_id
    _SESSAO_EXPIRACAO[token] = datetime.now(timezone.utc) + _SESSAO_TTL
    logger.info("Sessão criada | usuario_id=%s", usuario_id)
    return token


def encerrar_sessao(token: Optional[str]) -> None:
    """
    Remove token da whitelist server-side.
    FIX: aceita Optional[str] — simplifica chamada com request.session.get("session_token")
    que pode retornar None; evita verificação no chamador.

    Exemplo em rotas_admin.py (fazer_logout):
        encerrar_sessao(request.session.get("session_token"))
        request.session.clear()
    """
    if not token:
        return
    uid = SESSOES_ATIVAS.pop(token, None)
    _SESSAO_EXPIRACAO.pop(token, None)
    if uid:
        logger.info("Sessão encerrada | usuario_id=%s", uid)


def token_esta_ativo(token: str) -> bool:
    """
    Verifica existência e TTL do token na whitelist.
    Encerra automaticamente sessões expiradas ao detectá-las.
    """
    if token not in SESSOES_ATIVAS:
        return False
    if datetime.now(timezone.utc) > _SESSAO_EXPIRACAO.get(
        token, datetime.min.replace(tzinfo=timezone.utc)
    ):
        encerrar_sessao(token)
        return False
    return True


def limpar_sessoes_expiradas() -> int:
    """
    Remove todos os tokens expirados da whitelist.
    Chamar periodicamente via APScheduler para evitar crescimento indefinido.
    Retorna o número de sessões removidas.
    """
    agora     = datetime.now(timezone.utc)
    expirados = [t for t, exp in _SESSAO_EXPIRACAO.items() if agora > exp]
    for token in expirados:
        encerrar_sessao(token)
    if expirados:
        logger.info("Limpeza: %d sessão(ões) expirada(s) removida(s).", len(expirados))
    return len(expirados)


# ── Lógica central de autenticação (interna) ──────────────────────────────────

def _resolver_usuario(request: Request, banco: Session) -> Optional[Usuario]:
    """
    FIX: lê request.session["session_token"] (SessionMiddleware assinado)
    em vez de request.cookies.get("cracha_tariel_seguro") (cookie bruto não decodificado).

    Retorna Usuario autenticado ou None — sem levantar exceção.
    As dependências públicas decidem o comportamento (redirect vs HTTPException).
    """
    token = request.session.get("session_token")

    if not token or not token_esta_ativo(token):
        if token:
            logger.warning(
                "Token inválido/expirado | ip=%s",
                request.client.host if request.client else "?",
            )
        return None

    usuario_id = SESSOES_ATIVAS.get(token)
    if not usuario_id:
        return None

    usuario = banco.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        encerrar_sessao(token)
        logger.warning(
            "Token aponta para usuario_id=%s inexistente — sessão encerrada.", usuario_id
        )
        return None

    # Verifica bloqueio da conta ou da empresa — interrompe sessão ativa imediatamente
    conta_bloqueada   = getattr(usuario, "status_bloqueio", False)
    empresa_bloqueada = usuario.empresa and getattr(usuario.empresa, "status_bloqueio", False)

    if conta_bloqueada or empresa_bloqueada:
        encerrar_sessao(token)
        request.session.clear()
        logger.warning(
            "Acesso negado — conta/empresa bloqueada | usuario_id=%s empresa_id=%s",
            usuario.id, usuario.empresa_id,
        )
        return None

    return usuario


# ── Dependências públicas FastAPI ──────────────────────────────────────────────

def obter_usuario_html(
    request: Request,
    banco: Session = Depends(obter_banco),
) -> Optional[Usuario]:
    """
    Para rotas HTML (TemplateResponse / Jinja2).
    Retorna None se não autenticado — a rota faz RedirectResponse("/admin/login").

    FIX: não levanta HTTPException — corrige dois problemas da versão anterior:
      1. obter_banco capturava a exceção e fazia rollback desnecessário no banco.
      2. Uma resposta 401 JSON aparecia em rota que deveria servir HTML.
    """
    return _resolver_usuario(request, banco)


def obter_usuario_api(
    request: Request,
    banco: Session = Depends(obter_banco),
) -> Usuario:
    """
    Para rotas de API (retornam JSON).
    Levanta HTTPException 401 se não autenticado — resposta JSON esperada pelo cliente.
    """
    usuario = _resolver_usuario(request, banco)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )
    return usuario


def exigir_inspetor(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """Permite acesso para qualquer usuário com nível >= INSPETOR."""
    if usuario.nivel_acesso < int(NivelAcesso.INSPETOR):
        logger.warning(
            "Acesso negado — nível insuficiente | usuario_id=%s nivel=%s",
            usuario.id, usuario.nivel_acesso,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado.",
        )
    return usuario


def exigir_diretoria(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """Permite acesso somente para Diretoria (nível 99)."""
    if usuario.nivel_acesso < int(NivelAcesso.DIRETORIA):
        logger.warning(
            "Acesso negado — nível abaixo de Diretoria | usuario_id=%s nivel=%s",
            usuario.id, usuario.nivel_acesso,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito à Diretoria.",
        )
    return usuario
