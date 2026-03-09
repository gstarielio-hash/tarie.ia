# ==========================================
# TARIEL CONTROL TOWER — SERVICOS_SAAS.PY
# Responsabilidade:
# - onboarding de clientes SaaS
# - métricas do painel administrativo
# - gestão de empresas e usuários do ecossistema
# - regras comerciais de plano e limite
# ==========================================

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from banco_dados import Empresa, Laudo, NivelAcesso, PlanoEmpresa, Usuario
from seguranca import criar_hash_senha, encerrar_todas_sessoes_usuario, gerar_senha_fortificada

logger = logging.getLogger("tariel.saas")

_AMBIENTE_BRUTO = os.getenv("AMBIENTE", "").strip()
if not _AMBIENTE_BRUTO:
    raise RuntimeError(
        "AMBIENTE é obrigatório. Defina no .env (ex.: AMBIENTE=dev ou AMBIENTE=producao)."
    )

_AMBIENTE = _AMBIENTE_BRUTO.lower()
_AMBIENTES_DEV = {"dev", "development", "local"}
_AMBIENTES_PRODUCAO = {"producao", "production", "prod"}
if _AMBIENTE not in (_AMBIENTES_DEV | _AMBIENTES_PRODUCAO):
    raise RuntimeError(
        "AMBIENTE inválido. Use: dev, development, local, producao, production ou prod."
    )

_MODO_DEV = _AMBIENTE in _AMBIENTES_DEV

# =========================================================
# NORMALIZAÇÃO / CONTRATO COMERCIAL
# =========================================================

# Aceita aliases comerciais antigos, mas persiste no formato canônico
# definido em banco_dados.PlanoEmpresa.
_ALIASES_PLANO = {
    "piloto": PlanoEmpresa.INICIAL.value,
    "inicial": PlanoEmpresa.INICIAL.value,
    "starter": PlanoEmpresa.INICIAL.value,
    "pro": PlanoEmpresa.INTERMEDIARIO.value,
    "intermediario": PlanoEmpresa.INTERMEDIARIO.value,
    "profissional": PlanoEmpresa.INTERMEDIARIO.value,
    "ilimitado": PlanoEmpresa.ILIMITADO.value,
    "enterprise": PlanoEmpresa.ILIMITADO.value,
}

_PRIORIDADE_PLANO = {
    PlanoEmpresa.ILIMITADO.value: 1,
    PlanoEmpresa.INTERMEDIARIO.value: 2,
    PlanoEmpresa.INICIAL.value: 3,
}


# =========================================================
# HELPERS
# =========================================================


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_email(email: str) -> str:
    valor = str(email or "").strip().lower()
    if not valor:
        raise ValueError("E-mail obrigatório.")
    return valor


def _normalizar_cnpj(cnpj: str) -> str:
    valor = re.sub(r"\D+", "", str(cnpj or ""))
    if len(valor) != 14:
        raise ValueError("CNPJ inválido. Informe 14 dígitos.")
    return valor


def _normalizar_texto_curto(valor: str, *, campo: str, max_len: int) -> str:
    texto = str(valor or "").strip()
    if not texto:
        raise ValueError(f"{campo} é obrigatório.")
    return texto[:max_len]


def _normalizar_texto_opcional(valor: str, max_len: int | None = None) -> str | None:
    texto = str(valor or "").strip()
    if not texto:
        return None
    if max_len is not None:
        return texto[:max_len]
    return texto


def _normalizar_crea(valor: str) -> str | None:
    texto = str(valor or "").strip().upper()
    if not texto:
        return None

    texto = re.sub(r"\s+", "", texto)
    if len(texto) > 40:
        raise ValueError("CREA inválido. Limite de 40 caracteres.")

    if not re.fullmatch(r"[A-Z0-9./\-]+", texto):
        raise ValueError("CREA inválido. Use apenas letras, números, ponto, barra e hífen.")

    return texto


def _normalizar_plano(plano: str) -> str:
    try:
        # Banco já absorve parte da compatibilidade.
        return PlanoEmpresa.normalizar(plano)
    except Exception:
        chave = str(plano or "").strip().lower()
        if chave in _ALIASES_PLANO:
            return _ALIASES_PLANO[chave]
        raise ValueError("Plano inválido. Use: Inicial, Intermediario ou Ilimitado.")


def _case_prioridade_plano():
    return case(
        (Empresa.plano_ativo == PlanoEmpresa.ILIMITADO.value, 1),
        (Empresa.plano_ativo == PlanoEmpresa.INTERMEDIARIO.value, 2),
        else_=3,
    )


def _commit_ou_rollback(db: Session, mensagem_erro: str) -> None:
    try:
        db.commit()
    except IntegrityError as erro:
        db.rollback()
        logger.warning("%s | integrity_error=%s", mensagem_erro, erro)
        raise ValueError(mensagem_erro) from erro


def _obter_limite_usuarios_empresa(db: Session, empresa: Empresa) -> int | None:
    limites = empresa.obter_limites(db)
    return limites.usuarios_max


def _obter_limite_laudos_empresa(db: Session, empresa: Empresa) -> int | None:
    limites = empresa.obter_limites(db)
    return limites.laudos_mes


def _contar_usuarios_empresa(db: Session, empresa_id: int) -> int:
    return db.scalar(select(func.count(Usuario.id)).where(Usuario.empresa_id == empresa_id)) or 0


def _validar_capacidade_novo_usuario(db: Session, empresa: Empresa) -> None:
    limite = _obter_limite_usuarios_empresa(db, empresa)
    if limite is None:
        return

    total_atual = _contar_usuarios_empresa(db, empresa.id)
    if total_atual >= limite:
        raise ValueError(f"Limite de usuários do plano atingido ({limite}).")


# =========================================================
# ONBOARDING
# =========================================================


def registrar_novo_cliente(
    db: Session,
    nome: str,
    cnpj: str,
    email_admin: str,
    plano: str,
    segmento: str = "",
    cidade_estado: str = "",
    nome_responsavel: str = "",
    observacoes: str = "",
) -> tuple[Empresa, str]:
    nome_norm = _normalizar_texto_curto(nome, campo="Nome da empresa", max_len=200)
    cnpj_norm = _normalizar_cnpj(cnpj)
    email_norm = _normalizar_email(email_admin)
    plano_norm = _normalizar_plano(plano)

    if db.scalar(select(Empresa).where(Empresa.cnpj == cnpj_norm)):
        raise ValueError("CNPJ já cadastrado no sistema.")

    if db.scalar(select(Usuario).where(Usuario.email == email_norm)):
        raise ValueError("E-mail já em uso.")

    nova_empresa = Empresa(
        nome_fantasia=nome_norm,
        cnpj=cnpj_norm,
        plano_ativo=plano_norm,
        segmento=_normalizar_texto_opcional(segmento, 100),
        cidade_estado=_normalizar_texto_opcional(cidade_estado, 100),
        nome_responsavel=_normalizar_texto_opcional(nome_responsavel, 150),
        observacoes=_normalizar_texto_opcional(observacoes),
    )
    db.add(nova_empresa)

    try:
        db.flush()
    except IntegrityError as erro:
        db.rollback()
        logger.warning(
            "Falha ao criar empresa no onboarding | nome=%s cnpj=%s erro=%s",
            nome_norm,
            cnpj_norm,
            erro,
        )
        raise ValueError("Falha ao reservar registro da empresa.") from erro

    senha_plana = gerar_senha_fortificada()

    usuario_admin = Usuario(
        empresa_id=nova_empresa.id,
        nome_completo=f"Administrador {nome_norm}",
        email=email_norm,
        senha_hash=criar_hash_senha(senha_plana),
        nivel_acesso=int(NivelAcesso.DIRETORIA),
        ativo=True,
        senha_temporaria_ativa=True,
    )
    db.add(usuario_admin)

    _commit_ou_rollback(
        db,
        "Falha de integridade ao concluir o cadastro. Verifique CNPJ e e-mail.",
    )

    db.refresh(nova_empresa)

    try:
        _disparar_email_boas_vindas(email_norm, nome_norm, senha_plana)
    except Exception as erro:
        logger.error(
            "Falha ao enviar e-mail de boas-vindas | empresa=%s email=%s erro=%s",
            nome_norm,
            email_norm,
            erro,
            exc_info=True,
        )

    return nova_empresa, senha_plana


# =========================================================
# PAINEL ADMINISTRATIVO
# =========================================================


def buscar_metricas_ia_painel(db: Session) -> dict[str, Any]:
    qtd_clientes = db.scalar(select(func.count(Empresa.id))) or 0
    total_inspecoes = db.scalar(select(func.count(Laudo.id))) or 0
    faturamento_ia = db.scalar(select(func.coalesce(func.sum(Laudo.custo_api_reais), 0))) or Decimal("0")

    stmt_ranking = select(Empresa).order_by(_case_prioridade_plano(), Empresa.id.desc())
    ranking = list(db.scalars(stmt_ranking).all())

    hoje = _agora_utc().date()
    labels: list[str] = []
    valores: list[int] = []

    for i in range(6, -1, -1):
        dia = hoje - timedelta(days=i)
        inicio = datetime(dia.year, dia.month, dia.day, tzinfo=timezone.utc)
        fim = inicio + timedelta(days=1)

        qtd = (
            db.scalar(
                select(func.count(Laudo.id)).where(
                    Laudo.criado_em >= inicio,
                    Laudo.criado_em < fim,
                )
            )
            or 0
        )

        labels.append(dia.strftime("%a %d/%m"))
        valores.append(int(qtd))

    return {
        "qtd_clientes": int(qtd_clientes),
        "total_inspecoes": int(total_inspecoes),
        "receita_ia_total": faturamento_ia,
        "clientes": ranking,
        "labels_grafico": labels,
        "valores_grafico": valores,
    }


# =========================================================
# GESTÃO DE CLIENTES SAAS
# =========================================================


def buscar_todos_clientes(
    db: Session,
    filtro_nome: str = "",
    filtro_plano: str = "",
) -> list[Empresa]:
    stmt = select(Empresa)

    nome = str(filtro_nome or "").strip()
    if nome:
        stmt = stmt.where(Empresa.nome_fantasia.ilike(f"%{nome}%"))

    plano = str(filtro_plano or "").strip()
    if plano:
        plano_norm = _normalizar_plano(plano)
        stmt = stmt.where(Empresa.plano_ativo == plano_norm)

    stmt = stmt.order_by(_case_prioridade_plano(), Empresa.id.desc())
    return list(db.scalars(stmt).all())


def buscar_detalhe_cliente(db: Session, empresa_id: int) -> dict[str, Any] | None:
    empresa = db.scalar(select(Empresa).where(Empresa.id == empresa_id))
    if not empresa:
        return None

    usuarios_empresa = list(
        db.scalars(select(Usuario).where(Usuario.empresa_id == empresa_id).order_by(Usuario.nivel_acesso.desc(), Usuario.nome_completo.asc())).all()
    )

    usuarios_operacionais = [usuario for usuario in usuarios_empresa if int(usuario.nivel_acesso) < int(NivelAcesso.DIRETORIA)]

    laudos_recentes = list(db.scalars(select(Laudo).where(Laudo.empresa_id == empresa_id).order_by(Laudo.criado_em.desc()).limit(10)).all())

    stmt_stats = select(
        func.count(Laudo.id).label("total"),
        func.coalesce(func.sum(Laudo.custo_api_reais), 0).label("custo"),
    ).where(Laudo.empresa_id == empresa_id)

    stats = db.execute(stmt_stats).one()
    limite_laudos = _obter_limite_laudos_empresa(db, empresa)
    total_laudos_processados = int(empresa.mensagens_processadas or 0)

    uso_pct: int | None = None
    if isinstance(limite_laudos, int) and limite_laudos > 0:
        uso_pct = min(100, int((total_laudos_processados / limite_laudos) * 100))

    return {
        "empresa": empresa,
        "inspetores": usuarios_operacionais,
        "usuarios": usuarios_empresa,
        "laudos_recentes": laudos_recentes,
        "limite_plano": limite_laudos if limite_laudos is not None else "Ilimitado",
        "uso_percentual": uso_pct,
        "total_laudos": int(stats.total or 0),
        "custo_total": stats.custo or Decimal("0"),
    }


def alternar_bloqueio(db: Session, empresa_id: int) -> bool:
    empresa = db.scalar(select(Empresa).where(Empresa.id == empresa_id))
    if not empresa:
        raise ValueError("Empresa não encontrada.")

    novo_estado = not bool(empresa.status_bloqueio)
    empresa.status_bloqueio = novo_estado
    empresa.bloqueado_em = _agora_utc() if novo_estado else None
    empresa.motivo_bloqueio = empresa.motivo_bloqueio if novo_estado else None

    _commit_ou_rollback(db, "Não foi possível alterar o bloqueio da empresa.")
    return bool(empresa.status_bloqueio)


def alterar_plano(db: Session, empresa_id: int, novo_plano: str) -> None:
    plano_norm = _normalizar_plano(novo_plano)

    empresa = db.scalar(select(Empresa).where(Empresa.id == empresa_id))
    if not empresa:
        raise ValueError("Empresa não encontrada.")

    empresa.plano_ativo = plano_norm
    _commit_ou_rollback(db, "Não foi possível alterar o plano da empresa.")


def resetar_senha_inspetor(db: Session, usuario_id: int) -> str:
    usuario = db.scalar(select(Usuario).where(Usuario.id == usuario_id))
    if not usuario:
        raise ValueError("Usuário não encontrado.")

    nova_senha = gerar_senha_fortificada()
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.tentativas_login = 0
    usuario.bloqueado_ate = None
    usuario.status_bloqueio = False
    usuario.senha_temporaria_ativa = True

    _commit_ou_rollback(db, "Não foi possível resetar a senha do usuário.")
    sessoes_encerradas = encerrar_todas_sessoes_usuario(int(usuario.id))
    if sessoes_encerradas:
        logger.info(
            "Sessões encerradas após reset de senha | usuario_id=%s | removidas=%s",
            usuario.id,
            sessoes_encerradas,
        )
    return nova_senha


def atualizar_crea_revisor(db: Session, empresa_id: int, usuario_id: int, crea: str) -> Usuario:
    usuario = db.scalar(
        select(Usuario).where(
            Usuario.id == usuario_id,
            Usuario.empresa_id == empresa_id,
        )
    )
    if not usuario:
        raise ValueError("Usuário não encontrado para esta empresa.")

    if int(usuario.nivel_acesso) < int(NivelAcesso.REVISOR):
        raise ValueError("Somente usuários revisores aceitam cadastro de CREA.")

    usuario.crea = _normalizar_crea(crea)
    _commit_ou_rollback(db, "Não foi possível atualizar o CREA do revisor.")
    return usuario


def adicionar_inspetor(db: Session, empresa_id: int, nome: str, email: str) -> str:
    empresa = db.scalar(select(Empresa).where(Empresa.id == empresa_id))
    if not empresa:
        raise ValueError("Empresa não encontrada.")

    _validar_capacidade_novo_usuario(db, empresa)

    email_norm = _normalizar_email(email)
    nome_norm = _normalizar_texto_curto(nome, campo="Nome do usuário", max_len=150)

    if db.scalar(select(Usuario).where(Usuario.email == email_norm)):
        raise ValueError("E-mail já cadastrado.")

    senha = gerar_senha_fortificada()

    novo = Usuario(
        empresa_id=empresa_id,
        nome_completo=nome_norm,
        email=email_norm,
        senha_hash=criar_hash_senha(senha),
        nivel_acesso=int(NivelAcesso.INSPETOR),
        ativo=True,
        senha_temporaria_ativa=True,
    )
    db.add(novo)

    _commit_ou_rollback(db, "Não foi possível adicionar o inspetor.")
    return senha


# =========================================================
# STUB DE COMUNICAÇÃO
# =========================================================


def _disparar_email_boas_vindas(email: str, empresa: str, senha: str) -> None:
    """
    STUB.
    Em desenvolvimento, registra o conteúdo completo no log.
    Em produção, registra apenas que o envio deveria ocorrer.
    """
    if _MODO_DEV:
        logger.info(
            "\n=========================================\n"
            "[MODO DEV] E-MAIL DE BOAS-VINDAS INTERCEPTADO\n"
            f"Empresa: {empresa}\n"
            f"E-mail:  {email}\n"
            f"Senha:   {senha}\n"
            "=========================================\n"
        )
        return

    logger.info(
        "Stub de envio de boas-vindas acionado | empresa=%s email=%s",
        empresa,
        email,
    )
