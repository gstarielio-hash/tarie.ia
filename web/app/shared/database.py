# ==========================================
# TARIEL CONTROL TOWER — BANCO_DADOS.PY
# Responsabilidade:
# - engine SQLAlchemy
# - session factory
# - models centrais do ecossistema
# - seeds e migração versionada via Alembic
# ==========================================

from __future__ import annotations

import enum
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Generator

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    inspect,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker, validates
from sqlalchemy.pool import NullPool, StaticPool

from app.core.settings import env_bool, env_int, env_str, get_settings

load_dotenv()
logger = logging.getLogger("tariel.banco_dados")

# =========================================================
# CONFIGURAÇÃO DE AMBIENTE / ENGINE
# =========================================================

_DIR_BASE = os.path.dirname(os.path.abspath(__file__))
_DIR_PROJETO = Path(__file__).resolve().parents[2]
_URL_PADRAO = f"sqlite:///{_DIR_PROJETO / 'tariel_admin.db'}"
_ALEMBIC_INI = _DIR_PROJETO / "alembic.ini"
_ALEMBIC_DIR = _DIR_PROJETO / "alembic"

_settings = get_settings()
_AMBIENTE = _settings.ambiente
_SEED_DEV_BOOTSTRAP = env_bool("SEED_DEV_BOOTSTRAP", False)

_EM_PRODUCAO = _settings.em_producao


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_url_banco(valor: str) -> str:
    texto = str(valor or "").strip()
    if not texto:
        return _URL_PADRAO

    if texto.startswith("postgres://"):
        return "postgresql+psycopg://" + texto.removeprefix("postgres://")

    if texto.startswith("postgresql://") and not re.match(r"^postgresql\+[a-z0-9_]+://", texto):
        return "postgresql+psycopg://" + texto.removeprefix("postgresql://")

    return texto


URL_BANCO = _normalizar_url_banco(env_str("DATABASE_URL", _URL_PADRAO))
_EH_SQLITE = URL_BANCO.startswith("sqlite")
_EH_SQLITE_MEMORIA = _EH_SQLITE and (URL_BANCO in {"sqlite://", "sqlite:///:memory:"} or ":memory:" in URL_BANCO or "mode=memory" in URL_BANCO)


def _normalizar_texto_chave(valor: Any) -> str:
    texto = str(valor or "").strip().lower()
    texto = (
        texto.replace("á", "a")
        .replace("à", "a")
        .replace("ã", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )
    return re.sub(r"[\s\-_\\/]+", "_", texto)


def _criar_engine():
    kwargs: dict[str, Any] = {
        "pool_pre_ping": True,
        "future": True,
    }

    if _EH_SQLITE:
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool if _EH_SQLITE_MEMORIA else NullPool
    else:
        kwargs["pool_size"] = env_int("DB_POOL_SIZE", 10)
        kwargs["max_overflow"] = env_int("DB_MAX_OVERFLOW", 20)
        kwargs["pool_timeout"] = env_int("DB_POOL_TIMEOUT", 30)
        kwargs["pool_recycle"] = env_int("DB_POOL_RECYCLE", 3600)

    engine = create_engine(URL_BANCO, **kwargs)

    if _EH_SQLITE:

        @event.listens_for(engine, "connect")
        def _configurar_sqlite(conn, _record):
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")

            if not _EH_SQLITE_MEMORIA:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")

            cursor.close()

    return engine


motor_banco = _criar_engine()
SessaoLocal = sessionmaker(
    bind=motor_banco,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)

# =========================================================
# ENUMS E NORMALIZAÇÃO DE CONTRATOS
# =========================================================


class NivelAcesso(enum.IntEnum):
    INSPETOR = 1
    REVISOR = 50
    ADMIN_CLIENTE = 80
    DIRETORIA = 99

    @classmethod
    def normalizar(cls, valor: Any) -> int:
        if isinstance(valor, cls):
            return int(valor)

        if valor is None:
            return int(cls.INSPETOR)

        try:
            inteiro = int(valor)
        except (TypeError, ValueError):
            chave = _normalizar_texto_chave(valor)
            mapa = {
                "inspetor": cls.INSPETOR,
                "inspector": cls.INSPETOR,
                "revisor": cls.REVISOR,
                "reviewer": cls.REVISOR,
                "admin_cliente": cls.ADMIN_CLIENTE,
                "admincliente": cls.ADMIN_CLIENTE,
                "cliente_admin": cls.ADMIN_CLIENTE,
                "clienteadmin": cls.ADMIN_CLIENTE,
                "administrador_cliente": cls.ADMIN_CLIENTE,
                "diretoria": cls.DIRETORIA,
                "admin": cls.DIRETORIA,
                "administrador": cls.DIRETORIA,
            }
            if chave not in mapa:
                raise ValueError(f"Nível de acesso inválido: {valor!r}")
            return int(mapa[chave])

        validos = {
            int(cls.INSPETOR),
            int(cls.REVISOR),
            int(cls.ADMIN_CLIENTE),
            int(cls.DIRETORIA),
        }
        if inteiro not in validos:
            raise ValueError(f"Nível de acesso inválido: {valor!r}")
        return inteiro


class _EnumTexto(str, enum.Enum):
    @classmethod
    def valores(cls) -> list[str]:
        return [item.value for item in cls]


class StatusLaudo(_EnumTexto):
    PENDENTE = "Pendente"
    CONFORME = "Conforme"
    NAO_CONFORME = "Nao Conforme"
    EM_ANDAMENTO = "Em Andamento"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "pendente": cls.PENDENTE.value,
            "conforme": cls.CONFORME.value,
            "nao_conforme": cls.NAO_CONFORME.value,
            "em_andamento": cls.EM_ANDAMENTO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Status de laudo inválido: {valor!r}")


class StatusRevisao(_EnumTexto):
    RASCUNHO = "Rascunho"
    AGUARDANDO = "Aguardando Aval"
    APROVADO = "Aprovado"
    REJEITADO = "Rejeitado"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "rascunho": cls.RASCUNHO.value,
            "aguardando": cls.AGUARDANDO.value,
            "aguardando_aval": cls.AGUARDANDO.value,
            "aguardando_avaliacao": cls.AGUARDANDO.value,
            "aprovado": cls.APROVADO.value,
            "rejeitado": cls.REJEITADO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Status de revisão inválido: {valor!r}")


class PlanoEmpresa(_EnumTexto):
    INICIAL = "Inicial"
    INTERMEDIARIO = "Intermediario"
    ILIMITADO = "Ilimitado"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "inicial": cls.INICIAL.value,
            "piloto": cls.INICIAL.value,
            "starter": cls.INICIAL.value,
            "intermediario": cls.INTERMEDIARIO.value,
            "pro": cls.INTERMEDIARIO.value,
            "profissional": cls.INTERMEDIARIO.value,
            "ilimitado": cls.ILIMITADO.value,
            "enterprise": cls.ILIMITADO.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Plano inválido: {valor!r}")


class ModoResposta(_EnumTexto):
    CURTO = "curto"
    DETALHADO = "detalhado"
    DEEP_RESEARCH = "deep_research"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "curto": cls.CURTO.value,
            "detalhado": cls.DETALHADO.value,
            "deepresearch": cls.DEEP_RESEARCH.value,
            "deep_research": cls.DEEP_RESEARCH.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Modo de resposta inválido: {valor!r}")


class TipoMensagem(_EnumTexto):
    USER = "user"
    IA = "ia"
    HUMANO_INSP = "humano_insp"
    HUMANO_ENG = "humano_eng"

    @classmethod
    def normalizar(cls, valor: Any) -> str:
        chave = _normalizar_texto_chave(valor)
        mapa = {
            "user": cls.USER.value,
            "usuario": cls.USER.value,
            "ia": cls.IA.value,
            "assistente": cls.IA.value,
            "humano_insp": cls.HUMANO_INSP.value,
            "whisper_insp": cls.HUMANO_INSP.value,
            "humano_eng": cls.HUMANO_ENG.value,
            "humanoeng": cls.HUMANO_ENG.value,
            "whisper_eng": cls.HUMANO_ENG.value,
        }
        if chave in mapa:
            return mapa[chave]
        if valor in cls.valores():
            return str(valor)
        raise ValueError(f"Tipo de mensagem inválido: {valor!r}")


_TIPOS_MENSAGEM_VALIDOS = ", ".join(f"'{t.value}'" for t in TipoMensagem)


def _valores_enum(cls: type[enum.Enum]) -> list[str]:
    return [e.value for e in cls]


# =========================================================
# LIMITES POR PLANO
# =========================================================

LIMITES_PADRAO: dict[str, dict[str, Any]] = {
    PlanoEmpresa.INICIAL.value: {
        "laudos_mes": 50,
        "usuarios_max": 1,
        "upload_doc": False,
        "deep_research": False,
        "integracoes_max": 0,
        "retencao_dias": 30,
    },
    PlanoEmpresa.INTERMEDIARIO.value: {
        "laudos_mes": 300,
        "usuarios_max": 5,
        "upload_doc": True,
        "deep_research": False,
        "integracoes_max": 1,
        "retencao_dias": 365,
    },
    PlanoEmpresa.ILIMITADO.value: {
        "laudos_mes": None,
        "usuarios_max": None,
        "upload_doc": True,
        "deep_research": True,
        "integracoes_max": None,
        "retencao_dias": None,
    },
}


@dataclass(slots=True)
class LimitePlanoFallback:
    plano: str
    laudos_mes: int | None
    usuarios_max: int | None
    upload_doc: bool
    deep_research: bool
    integracoes_max: int | None
    retencao_dias: int | None

    def laudos_ilimitados(self) -> bool:
        return self.laudos_mes is None

    def usuarios_ilimitados(self) -> bool:
        return self.usuarios_max is None


# =========================================================
# BASE / MIXINS
# =========================================================


class MixinAuditoria:
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
        comment="Timestamp UTC de criação",
    )
    atualizado_em = Column(
        DateTime(timezone=True),
        nullable=True,
        onupdate=agora_utc,
        comment="Timestamp UTC da última atualização",
    )


class Base(DeclarativeBase):
    pass


# =========================================================
# MODELO: LIMITEPLANO
# =========================================================


class LimitePlano(Base):
    __tablename__ = "limites_plano"
    __table_args__ = (
        CheckConstraint(
            f"plano IN ({', '.join(repr(p.value) for p in PlanoEmpresa)})",
            name="ck_limite_plano_valido",
        ),
        CheckConstraint(
            "laudos_mes IS NULL OR laudos_mes >= 0",
            name="ck_limite_laudos_mes_nao_negativo",
        ),
        CheckConstraint(
            "usuarios_max IS NULL OR usuarios_max >= 0",
            name="ck_limite_usuarios_max_nao_negativo",
        ),
        CheckConstraint(
            "integracoes_max IS NULL OR integracoes_max >= 0",
            name="ck_limite_integracoes_max_nao_negativo",
        ),
        CheckConstraint(
            "retencao_dias IS NULL OR retencao_dias >= 0",
            name="ck_limite_retencao_dias_nao_negativo",
        ),
    )

    plano = Column(String(20), primary_key=True)
    laudos_mes = Column(Integer, nullable=True)
    usuarios_max = Column(Integer, nullable=True)
    upload_doc = Column(Boolean, nullable=False, default=False)
    deep_research = Column(Boolean, nullable=False, default=False)
    integracoes_max = Column(Integer, nullable=True)
    retencao_dias = Column(Integer, nullable=True)

    @validates("plano")
    def _validar_plano(self, _key: str, valor: Any) -> str:
        return PlanoEmpresa.normalizar(valor)

    def __repr__(self) -> str:
        return f"<LimitePlano plano={self.plano!r} laudos_mes={self.laudos_mes}>"

    def laudos_ilimitados(self) -> bool:
        return self.laudos_mes is None

    def usuarios_ilimitados(self) -> bool:
        return self.usuarios_max is None


# =========================================================
# MODELO: EMPRESA
# =========================================================


class Empresa(MixinAuditoria, Base):
    __tablename__ = "empresas"
    __table_args__ = (
        CheckConstraint(
            f"plano_ativo IN ({', '.join(repr(p.value) for p in PlanoEmpresa)})",
            name="ck_empresa_plano_valido",
        ),
        CheckConstraint(
            "custo_gerado_reais >= 0",
            name="ck_empresa_custo_nao_negativo",
        ),
        CheckConstraint(
            "mensagens_processadas >= 0",
            name="ck_empresa_msgs_nao_negativo",
        ),
        CheckConstraint(
            "LENGTH(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '')) = 14",
            name="ck_empresa_cnpj_tamanho",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    nome_fantasia = Column(String(200), nullable=False, index=True)
    cnpj = Column(String(18), nullable=False, unique=True, index=True)
    plano_ativo = Column(String(20), nullable=False, default=PlanoEmpresa.INICIAL.value)
    custo_gerado_reais = Column(
        Numeric(12, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    mensagens_processadas = Column(Integer, nullable=False, default=0)
    status_bloqueio = Column(Boolean, nullable=False, default=False)
    bloqueado_em = Column(DateTime(timezone=True), nullable=True)
    motivo_bloqueio = Column(String(300), nullable=True)
    segmento = Column(String(100), nullable=True)
    cidade_estado = Column(String(100), nullable=True)
    nome_responsavel = Column(String(150), nullable=True)
    observacoes = Column(Text, nullable=True)

    usuarios = relationship(
        "Usuario",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    laudos = relationship(
        "Laudo",
        back_populates="empresa",
        passive_deletes=True,
    )
    templates_laudo = relationship(
        "TemplateLaudo",
        back_populates="empresa",
        passive_deletes=True,
    )
    auditoria_registros = relationship(
        "RegistroAuditoriaEmpresa",
        back_populates="empresa",
        passive_deletes=True,
    )

    @validates("plano_ativo")
    def _validar_plano_ativo(self, _key: str, valor: Any) -> str:
        return PlanoEmpresa.normalizar(valor)

    def __repr__(self) -> str:
        return f"<Empresa id={self.id} nome={self.nome_fantasia!r} plano={self.plano_ativo}>"

    @property
    def plano_normalizado(self) -> str:
        return PlanoEmpresa.normalizar(self.plano_ativo)

    @property
    def esta_bloqueada(self) -> bool:
        return bool(self.status_bloqueio)

    def obter_limites(self, banco: Session) -> LimitePlano | LimitePlanoFallback:
        plano_normalizado = PlanoEmpresa.normalizar(self.plano_ativo)
        limite = banco.get(LimitePlano, plano_normalizado)
        if limite:
            return limite

        logger.warning(
            "LimitePlano não encontrado para plano=%r. Usando fallback.",
            plano_normalizado,
        )
        padrao = LIMITES_PADRAO.get(
            plano_normalizado,
            LIMITES_PADRAO[PlanoEmpresa.INICIAL.value],
        )
        return LimitePlanoFallback(
            plano=plano_normalizado,
            laudos_mes=padrao["laudos_mes"],
            usuarios_max=padrao["usuarios_max"],
            upload_doc=padrao["upload_doc"],
            deep_research=padrao["deep_research"],
            integracoes_max=padrao["integracoes_max"],
            retencao_dias=padrao["retencao_dias"],
        )


# =========================================================
# MODELO: USUARIO
# =========================================================


class Usuario(MixinAuditoria, Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        CheckConstraint(
            (f"nivel_acesso IN ({int(NivelAcesso.INSPETOR)}, {int(NivelAcesso.REVISOR)}, {int(NivelAcesso.ADMIN_CLIENTE)}, {int(NivelAcesso.DIRETORIA)})"),
            name="ck_usuario_nivel_acesso_valido",
        ),
        CheckConstraint(
            "tentativas_login >= 0",
            name="ck_usuario_tentativas_nao_negativo",
        ),
        Index("ix_usuario_empresa_email", "empresa_id", "email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome_completo = Column(String(150), nullable=False)
    email = Column(String(254), nullable=False, unique=True, index=True)
    telefone = Column(String(30), nullable=True)
    foto_perfil_url = Column(String(512), nullable=True)
    crea = Column(String(40), nullable=True)
    senha_hash = Column(String(256), nullable=False)
    nivel_acesso = Column(Integer, nullable=False, default=int(NivelAcesso.INSPETOR))
    ativo = Column(Boolean, nullable=False, default=True)
    tentativas_login = Column(Integer, nullable=False, default=0)
    bloqueado_ate = Column(DateTime(timezone=True), nullable=True)
    ultimo_login = Column(DateTime(timezone=True), nullable=True)
    ultimo_login_ip = Column(String(45), nullable=True)
    status_bloqueio = Column(Boolean, nullable=False, default=False)
    senha_temporaria_ativa = Column(Boolean, nullable=False, default=False)

    empresa = relationship("Empresa", back_populates="usuarios")
    laudos = relationship(
        "Laudo",
        foreign_keys="Laudo.usuario_id",
        back_populates="usuario",
    )
    templates_laudo_criados = relationship(
        "TemplateLaudo",
        foreign_keys="TemplateLaudo.criado_por_id",
        back_populates="criado_por",
    )
    preferencias_mobile = relationship(
        "PreferenciaMobileUsuario",
        uselist=False,
        back_populates="usuario",
        cascade="all, delete-orphan",
    )

    @validates("nivel_acesso")
    def _validar_nivel_acesso(self, _key: str, valor: Any) -> int:
        return NivelAcesso.normalizar(valor)

    def __repr__(self) -> str:
        return f"<Usuario id={self.id} email={self.email!r} nivel={self.nivel_acesso}>"

    @property
    def nome(self) -> str:
        return self.nome_completo or f"Usuário #{self.id}"

    @property
    def eh_inspetor(self) -> bool:
        return int(self.nivel_acesso) == int(NivelAcesso.INSPETOR)

    @property
    def eh_revisor(self) -> bool:
        return int(self.nivel_acesso) == int(NivelAcesso.REVISOR)

    @property
    def eh_admin_cliente(self) -> bool:
        return int(self.nivel_acesso) == int(NivelAcesso.ADMIN_CLIENTE)

    @property
    def eh_revisor_ou_superior(self) -> bool:
        return int(self.nivel_acesso) in {
            int(NivelAcesso.REVISOR),
            int(NivelAcesso.DIRETORIA),
        }

    @property
    def eh_diretoria(self) -> bool:
        return int(self.nivel_acesso) == int(NivelAcesso.DIRETORIA)

    def esta_bloqueado(self) -> bool:
        if self.bloqueado_ate is None:
            return False
        return agora_utc() < self.bloqueado_ate

    def registrar_login_sucesso(self, ip: str | None = None) -> None:
        self.tentativas_login = 0
        self.bloqueado_ate = None
        self.status_bloqueio = False
        self.ultimo_login = agora_utc()
        self.ultimo_login_ip = (ip or "")[:45] or None

    def incrementar_tentativa_falha(self, max_tentativas: int = 5) -> bool:
        self.tentativas_login += 1
        if self.tentativas_login >= max_tentativas:
            self.bloqueado_ate = agora_utc() + timedelta(minutes=15)
            self.status_bloqueio = True
            return True
        return False


# =========================================================
# MODELO: PREFERENCIAMOBILEUSUARIO
# =========================================================


class PreferenciaMobileUsuario(MixinAuditoria, Base):
    __tablename__ = "preferencias_mobile_usuarios"
    __table_args__ = (
        UniqueConstraint("usuario_id", name="uq_preferencias_mobile_usuario"),
        Index("ix_preferencias_mobile_usuario", "usuario_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    notificacoes_json = Column(JSON, nullable=False, default=dict)
    privacidade_json = Column(JSON, nullable=False, default=dict)
    permissoes_json = Column(JSON, nullable=False, default=dict)
    experiencia_ia_json = Column(JSON, nullable=False, default=dict)

    usuario = relationship("Usuario", back_populates="preferencias_mobile")

    def __repr__(self) -> str:
        return f"<PreferenciaMobileUsuario id={self.id} usuario_id={self.usuario_id}>"


# =========================================================
# MODELO: REGISTROAUDITORIAEMPRESA
# =========================================================


class RegistroAuditoriaEmpresa(MixinAuditoria, Base):
    __tablename__ = "auditoria_empresas"
    __table_args__ = (
        Index("ix_auditoria_empresa_criada", "empresa_id", "criado_em"),
        Index("ix_auditoria_empresa_portal", "empresa_id", "portal"),
        Index("ix_auditoria_ator_criada", "ator_usuario_id", "criado_em"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ator_usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    alvo_usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    portal = Column(String(30), nullable=False, default="cliente")
    acao = Column(String(80), nullable=False)
    resumo = Column(String(220), nullable=False)
    detalhe = Column(Text, nullable=True)
    payload_json = Column(JSON, nullable=True)

    empresa = relationship("Empresa", back_populates="auditoria_registros")
    ator_usuario = relationship("Usuario", foreign_keys=[ator_usuario_id])
    alvo_usuario = relationship("Usuario", foreign_keys=[alvo_usuario_id])

    def __repr__(self) -> str:
        return f"<RegistroAuditoriaEmpresa id={self.id} empresa_id={self.empresa_id} acao={self.acao!r} portal={self.portal!r}>"


# =========================================================
# MODELO: SESSAOATIVA
# =========================================================


class SessaoAtiva(Base):
    __tablename__ = "sessoes_ativas"
    __table_args__ = (
        Index("ix_sessao_usuario_criada", "usuario_id", "criada_em"),
        Index("ix_sessao_expira", "expira_em"),
    )

    token = Column(String(180), primary_key=True)
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    criada_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
    )
    expira_em = Column(
        DateTime(timezone=True),
        nullable=False,
    )
    ultima_atividade_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
    )
    lembrar = Column(Boolean, nullable=False, default=False)
    ip_hash = Column(String(64), nullable=True)
    user_agent_hash = Column(String(64), nullable=True)

    def __repr__(self) -> str:
        return f"<SessaoAtiva usuario_id={self.usuario_id} expira_em={self.expira_em}>"


# =========================================================
# MODELO: LAUDO
# =========================================================


class Laudo(MixinAuditoria, Base):
    __tablename__ = "laudos"
    __table_args__ = (
        CheckConstraint(
            "custo_api_reais >= 0",
            name="ck_laudo_custo_nao_negativo",
        ),
        Index("ix_laudo_empresa_criado", "empresa_id", "criado_em"),
        Index("ix_laudo_empresa_pinado", "empresa_id", "pinado"),
        Index("ix_laudo_empresa_deep", "empresa_id", "is_deep_research"),
        Index("ix_laudo_usuario_id", "usuario_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    setor_industrial = Column(String(100), nullable=False)
    tipo_template = Column(String(50), nullable=False, default="padrao")
    status_conformidade = Column(
        SAEnum(StatusLaudo, values_callable=_valores_enum, native_enum=False),
        nullable=False,
        default=StatusLaudo.PENDENTE.value,
    )
    status_revisao = Column(
        SAEnum(StatusRevisao, values_callable=_valores_enum, native_enum=False),
        nullable=False,
        default=StatusRevisao.RASCUNHO.value,
    )
    revisado_por = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    motivo_rejeicao = Column(Text, nullable=True)
    encerrado_pelo_inspetor_em = Column(DateTime(timezone=True), nullable=True)
    reabertura_pendente_em = Column(DateTime(timezone=True), nullable=True)
    reaberto_em = Column(DateTime(timezone=True), nullable=True)
    dados_formulario = Column(JSON, nullable=True)
    parecer_ia = Column(Text, nullable=True)
    confianca_ia_json = Column(JSON, nullable=True)
    codigo_hash = Column(String(32), nullable=False, unique=True, index=True)
    custo_api_reais = Column(
        Numeric(12, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    nome_arquivo_pdf = Column(String(100), nullable=True)
    primeira_mensagem = Column(String(80), nullable=True)
    pinado = Column(Boolean, nullable=False, default=False)
    pinado_em = Column(DateTime(timezone=True), nullable=True)
    modo_resposta = Column(
        SAEnum(ModoResposta, values_callable=_valores_enum, native_enum=False),
        nullable=False,
        default=ModoResposta.DETALHADO.value,
    )
    is_deep_research = Column(Boolean, nullable=False, default=False)

    empresa = relationship("Empresa", back_populates="laudos")
    usuario = relationship(
        "Usuario",
        foreign_keys=[usuario_id],
        back_populates="laudos",
    )
    revisor = relationship("Usuario", foreign_keys=[revisado_por])
    citacoes = relationship(
        "CitacaoLaudo",
        back_populates="laudo",
        cascade="all, delete-orphan",
        order_by="CitacaoLaudo.ordem",
    )
    revisoes = relationship(
        "LaudoRevisao",
        back_populates="laudo",
        cascade="all, delete-orphan",
        order_by="LaudoRevisao.numero_versao",
    )
    mensagens = relationship(
        "MensagemLaudo",
        back_populates="laudo",
        cascade="all, delete-orphan",
        order_by="MensagemLaudo.criado_em",
    )
    anexos_mesa = relationship(
        "AnexoMesa",
        back_populates="laudo",
        cascade="all, delete-orphan",
        order_by="AnexoMesa.criado_em",
    )

    @validates("status_conformidade")
    def _validar_status_conformidade(self, _key: str, valor: Any) -> str:
        return StatusLaudo.normalizar(valor)

    @validates("status_revisao")
    def _validar_status_revisao(self, _key: str, valor: Any) -> str:
        return StatusRevisao.normalizar(valor)

    @validates("modo_resposta")
    def _validar_modo_resposta(self, _key: str, valor: Any) -> str:
        return ModoResposta.normalizar(valor)

    def __repr__(self) -> str:
        return f"<Laudo id={self.id} template={self.tipo_template} status={self.status_revisao}>"

    @property
    def esta_em_rascunho(self) -> bool:
        return self.status_revisao == StatusRevisao.RASCUNHO.value

    @property
    def esta_aguardando_revisao(self) -> bool:
        return self.status_revisao == StatusRevisao.AGUARDANDO.value

    def pinar(self) -> bool:
        self.pinado = not self.pinado
        self.pinado_em = agora_utc() if self.pinado else None
        return self.pinado


# =========================================================
# MODELO: TEMPLATELAUDO
# =========================================================


class TemplateLaudo(MixinAuditoria, Base):
    __tablename__ = "templates_laudo"
    __table_args__ = (
        CheckConstraint("versao >= 1", name="ck_template_laudo_versao_positiva"),
        CheckConstraint(
            "modo_editor IN ('legado_pdf', 'editor_rico')",
            name="ck_template_laudo_modo_editor",
        ),
        UniqueConstraint(
            "empresa_id",
            "codigo_template",
            "versao",
            name="uq_template_laudo_empresa_codigo_versao",
        ),
        Index("ix_template_laudo_empresa_codigo", "empresa_id", "codigo_template"),
        Index("ix_template_laudo_empresa_ativo", "empresa_id", "ativo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    criado_por_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    nome = Column(String(180), nullable=False)
    codigo_template = Column(String(80), nullable=False)
    versao = Column(Integer, nullable=False, default=1)
    ativo = Column(Boolean, nullable=False, default=True)
    modo_editor = Column(String(20), nullable=False, default="legado_pdf")
    arquivo_pdf_base = Column(String(500), nullable=False)
    mapeamento_campos_json = Column(JSON, nullable=True)
    documento_editor_json = Column(JSON, nullable=True)
    assets_json = Column(JSON, nullable=True)
    estilo_json = Column(JSON, nullable=True)
    observacoes = Column(Text, nullable=True)

    empresa = relationship("Empresa", back_populates="templates_laudo")
    criado_por = relationship(
        "Usuario",
        foreign_keys=[criado_por_id],
        back_populates="templates_laudo_criados",
    )

    def __repr__(self) -> str:
        return f"<TemplateLaudo id={self.id} empresa_id={self.empresa_id} codigo={self.codigo_template!r} versao={self.versao} ativo={self.ativo}>"


# =========================================================
# MODELO: CITACAOLAUDO
# =========================================================


class CitacaoLaudo(MixinAuditoria, Base):
    __tablename__ = "citacoes_laudo"
    __table_args__ = (
        CheckConstraint("ordem >= 0", name="ck_citacao_ordem_nao_negativo"),
        Index("ix_citacao_laudo_id", "laudo_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    laudo_id = Column(
        Integer,
        ForeignKey("laudos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    referencia = Column(String(300), nullable=False)
    trecho = Column(Text, nullable=True)
    url = Column(String(500), nullable=True)
    ordem = Column(Integer, nullable=False, default=0)

    laudo = relationship("Laudo", back_populates="citacoes")

    def __repr__(self) -> str:
        return f"<CitacaoLaudo id={self.id} laudo_id={self.laudo_id} ordem={self.ordem}>"


# =========================================================
# MODELO: LAUDOREVISAO
# =========================================================


class LaudoRevisao(Base):
    __tablename__ = "laudo_revisoes"
    __table_args__ = (
        CheckConstraint("numero_versao >= 1", name="ck_laudo_revisao_numero_positivo"),
        UniqueConstraint("laudo_id", "numero_versao", name="uq_laudo_revisao_laudo_versao"),
        Index("ix_laudo_revisao_laudo_versao", "laudo_id", "numero_versao"),
        Index("ix_laudo_revisao_criado", "laudo_id", "criado_em"),
    )

    id = Column(Integer, primary_key=True, index=True)
    laudo_id = Column(
        Integer,
        ForeignKey("laudos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    numero_versao = Column(Integer, nullable=False)
    origem = Column(String(20), nullable=False, default="ia")
    resumo = Column(String(240), nullable=True)
    conteudo = Column(Text, nullable=False)
    confianca_geral = Column(String(16), nullable=True)
    confianca_json = Column(JSON, nullable=True)
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
    )

    laudo = relationship("Laudo", back_populates="revisoes")

    def __repr__(self) -> str:
        return f"<LaudoRevisao id={self.id} laudo_id={self.laudo_id} versao={self.numero_versao} origem={self.origem!r}>"


# =========================================================
# MODELO: MENSAGEMLAUDO
# =========================================================


class MensagemLaudo(Base):
    __tablename__ = "mensagens_laudo"
    __table_args__ = (
        CheckConstraint(
            f"tipo IN ({_TIPOS_MENSAGEM_VALIDOS})",
            name="ck_mensagem_tipo_valido",
        ),
        CheckConstraint(
            "custo_api_reais >= 0",
            name="ck_mensagem_custo_nao_negativo",
        ),
        Index("ix_mensagem_laudo_criado", "laudo_id", "criado_em"),
        Index("ix_mensagem_remetente", "remetente_id"),
        Index("ix_mensagem_resolvida_por", "resolvida_por_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    laudo_id = Column(
        Integer,
        ForeignKey("laudos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    remetente_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo = Column(String(20), nullable=False)
    conteudo = Column(Text, nullable=False)
    lida = Column(Boolean, nullable=False, default=False)
    resolvida_por_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolvida_em = Column(
        DateTime(timezone=True),
        nullable=True,
    )
    custo_api_reais = Column(
        Numeric(12, 4),
        nullable=False,
        default=Decimal("0.0000"),
    )
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
    )

    laudo = relationship("Laudo", back_populates="mensagens")
    remetente = relationship("Usuario", foreign_keys=[remetente_id])
    resolvida_por = relationship("Usuario", foreign_keys=[resolvida_por_id])
    anexos_mesa = relationship(
        "AnexoMesa",
        back_populates="mensagem",
        cascade="all, delete-orphan",
        order_by="AnexoMesa.criado_em",
    )

    @validates("tipo")
    def _validar_tipo(self, _key: str, valor: Any) -> str:
        return TipoMensagem.normalizar(valor)

    def __repr__(self) -> str:
        return f"<MensagemLaudo id={self.id} tipo={self.tipo!r} laudo_id={self.laudo_id}>"

    @property
    def is_whisper(self) -> bool:
        return self.tipo in (
            TipoMensagem.HUMANO_INSP.value,
            TipoMensagem.HUMANO_ENG.value,
        )

    def marcar_como_lida(self) -> None:
        self.lida = True


class AnexoMesa(Base):
    __tablename__ = "anexos_mesa"
    __table_args__ = (
        CheckConstraint(
            "categoria IN ('imagem', 'documento')",
            name="ck_anexo_mesa_categoria_valida",
        ),
        CheckConstraint(
            "tamanho_bytes >= 0",
            name="ck_anexo_mesa_tamanho_nao_negativo",
        ),
        Index("ix_anexo_mesa_laudo_criado", "laudo_id", "criado_em"),
        Index("ix_anexo_mesa_mensagem", "mensagem_id"),
        Index("ix_anexo_mesa_enviado_por", "enviado_por_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    laudo_id = Column(
        Integer,
        ForeignKey("laudos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mensagem_id = Column(
        Integer,
        ForeignKey("mensagens_laudo.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enviado_por_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    nome_original = Column(String(160), nullable=False)
    nome_arquivo = Column(String(220), nullable=False)
    mime_type = Column(String(120), nullable=False)
    categoria = Column(String(20), nullable=False)
    tamanho_bytes = Column(Integer, nullable=False, default=0)
    caminho_arquivo = Column(String(600), nullable=False)
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
    )

    laudo = relationship("Laudo", back_populates="anexos_mesa")
    mensagem = relationship("MensagemLaudo", back_populates="anexos_mesa")
    enviado_por = relationship("Usuario", foreign_keys=[enviado_por_id])

    def __repr__(self) -> str:
        return f"<AnexoMesa id={self.id} mensagem_id={self.mensagem_id} categoria={self.categoria!r}>"


# =========================================================
# DEPENDENCY FASTAPI
# =========================================================


def obter_banco() -> Generator[Session, None, None]:
    banco: Session = SessaoLocal()
    try:
        yield banco
        banco.commit()
    except HTTPException:
        banco.rollback()
        raise
    except Exception:
        banco.rollback()
        logger.error("Erro na sessão do banco. Rollback executado.", exc_info=True)
        raise
    finally:
        banco.close()


# =========================================================
# INICIALIZAÇÃO / SEED / MIGRAÇÃO
# =========================================================


def _aplicar_migracoes_versionadas() -> None:
    try:
        from alembic import command
        from alembic.config import Config as AlembicConfig
    except (ModuleNotFoundError, ImportError) as erro:
        raise RuntimeError("Falha ao importar Alembic. Execute 'pip install -r requirements.txt' no .venv ativo.") from erro

    if not _ALEMBIC_INI.exists() or not _ALEMBIC_DIR.exists():
        raise RuntimeError("Estrutura do Alembic não encontrada. Esperado: alembic.ini e pasta alembic/.")

    config = AlembicConfig(str(_ALEMBIC_INI))
    config.set_main_option("script_location", _ALEMBIC_DIR.as_posix())
    config.set_main_option("sqlalchemy.url", URL_BANCO)

    with motor_banco.begin() as conn:
        inspetor = inspect(conn)
        tabelas_existentes = set(inspetor.get_table_names())
        tabelas_esperadas = set(Base.metadata.tables.keys())
        sem_versionamento = "alembic_version" not in tabelas_existentes
        versao_vazia = False

        if not sem_versionamento:
            versao_vazia = conn.execute(text("SELECT COUNT(1) FROM alembic_version")).scalar_one() == 0

        tabelas_sem_versionamento = tabelas_existentes - {"alembic_version"}
        schema_legado_pronto = tabelas_esperadas.issubset(tabelas_sem_versionamento)

        config.attributes["connection"] = conn
        if schema_legado_pronto and (sem_versionamento or versao_vazia):
            logger.warning("Schema legado detectado sem versionamento Alembic. Aplicando stamp no head.")
            command.stamp(config, "head")
        else:
            command.upgrade(config, "head")


def inicializar_banco() -> None:
    try:
        _aplicar_migracoes_versionadas()
        seed_limites_plano()
        _bootstrap_admin_inicial_producao()

        if not _EM_PRODUCAO and _SEED_DEV_BOOTSTRAP:
            _seed_dev()
        elif not _EM_PRODUCAO:
            logger.info("Seed DEV desabilitado (SEED_DEV_BOOTSTRAP=0). Nenhum usuário/senha de seed foi criado.")

        with motor_banco.connect() as conn:
            conn.execute(text("SELECT 1"))

        logger.info("Banco de dados inicializado com sucesso.")
    except Exception:
        logger.critical("Falha ao inicializar o banco.", exc_info=True)
        raise


def _seed_dev() -> None:
    from sqlalchemy import select
    from app.shared.security import criar_hash_senha

    senha_padrao_seed = env_str("SEED_DEV_SENHA_PADRAO", "Dev@123456")
    senha_admin = env_str("SEED_ADMIN_SENHA", senha_padrao_seed)
    senha_admin_cliente = env_str("SEED_CLIENTE_SENHA", senha_padrao_seed)
    senha_inspetor = env_str("SEED_INSPETOR_SENHA", senha_padrao_seed)
    senha_revisor = env_str("SEED_REVISOR_SENHA", senha_padrao_seed)

    if senha_padrao_seed == "Dev@123456":
        logger.warning("Seed DEV usando senha padrão compartilhada. Não use isso fora de desenvolvimento.")

    with SessaoLocal() as banco:
        empresa = banco.scalar(select(Empresa).where(Empresa.cnpj == "00000000000000"))
        if not empresa:
            empresa = Empresa(
                nome_fantasia="Empresa Demo (DEV)",
                cnpj="00000000000000",
                plano_ativo=PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa)
            banco.flush()

        empresa_admin = banco.scalar(select(Empresa).where(Empresa.cnpj == "99999999999999"))
        if not empresa_admin:
            empresa_admin = Empresa(
                nome_fantasia="Tariel.ia Interno (DEV)",
                cnpj="99999999999999",
                plano_ativo=PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa_admin)
            banco.flush()

        usuarios_seed = [
            (
                empresa_admin.id,
                "admin@tariel.ia",
                "Diretoria Dev",
                int(NivelAcesso.DIRETORIA),
                senha_admin,
            ),
            (
                empresa.id,
                "admin-cliente@tariel.ia",
                "Admin-Cliente Dev",
                int(NivelAcesso.ADMIN_CLIENTE),
                senha_admin_cliente,
            ),
            (
                empresa.id,
                "inspetor@tariel.ia",
                "Inspetor Dev",
                int(NivelAcesso.INSPETOR),
                senha_inspetor,
            ),
            (
                empresa.id,
                "revisor@tariel.ia",
                "Engenheiro Revisor (Dev)",
                int(NivelAcesso.REVISOR),
                senha_revisor,
            ),
        ]

        for empresa_destino_id, email, nome, nivel, senha in usuarios_seed:
            usuario = banco.scalar(select(Usuario).where(Usuario.email == email))
            if usuario:
                usuario.empresa_id = empresa_destino_id
                usuario.nome_completo = nome
                usuario.nivel_acesso = nivel
                usuario.senha_hash = criar_hash_senha(senha)
                usuario.ativo = True
                usuario.tentativas_login = 0
                usuario.bloqueado_ate = None
                continue

            banco.add(
                Usuario(
                    empresa_id=empresa_destino_id,
                    nome_completo=nome,
                    email=email,
                    senha_hash=criar_hash_senha(senha),
                    nivel_acesso=nivel,
                )
            )

        banco.commit()
        logger.info("Seed DEV garantido com sucesso.")


def _bootstrap_admin_inicial_producao() -> None:
    if not _EM_PRODUCAO:
        return

    email_admin = env_str("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    senha_admin = env_str("BOOTSTRAP_ADMIN_PASSWORD", "").strip()
    nome_admin = env_str("BOOTSTRAP_ADMIN_NOME", "Administrador Tariel.ia").strip() or "Administrador Tariel.ia"
    nome_empresa = env_str("BOOTSTRAP_EMPRESA_NOME", "Tariel.ia").strip() or "Tariel.ia"
    cnpj_empresa = re.sub(r"\D+", "", env_str("BOOTSTRAP_EMPRESA_CNPJ", "11111111111111"))

    if not email_admin or not senha_admin:
        logger.info("Bootstrap inicial de produção ignorado: configure BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD para criar o primeiro acesso.")
        return

    if len(cnpj_empresa) != 14:
        logger.warning("BOOTSTRAP_EMPRESA_CNPJ inválido. Usando placeholder 11111111111111.")
        cnpj_empresa = "11111111111111"

    from sqlalchemy import func, select
    from app.shared.security import criar_hash_senha

    with SessaoLocal() as banco:
        empresa = banco.scalar(select(Empresa).where(Empresa.cnpj == cnpj_empresa))
        if not empresa:
            empresa = Empresa(
                nome_fantasia=nome_empresa,
                cnpj=cnpj_empresa,
                plano_ativo=PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa)
            banco.flush()

        usuario = banco.scalar(select(Usuario).where(Usuario.email == email_admin))
        if usuario:
            usuario.empresa_id = int(empresa.id)
            usuario.nome_completo = nome_admin
            usuario.senha_hash = criar_hash_senha(senha_admin)
            usuario.nivel_acesso = int(NivelAcesso.DIRETORIA)
            usuario.ativo = True
            usuario.tentativas_login = 0
            usuario.bloqueado_ate = None
            usuario.status_bloqueio = False
            usuario.senha_temporaria_ativa = False
        else:
            total_usuarios = int(banco.scalar(select(func.count()).select_from(Usuario)) or 0)
            if total_usuarios > 0:
                logger.info(
                    "Bootstrap inicial de produção criando Admin-CEO %s mesmo com outros usuários já cadastrados.",
                    email_admin,
                )

            banco.add(
                Usuario(
                    empresa_id=int(empresa.id),
                    nome_completo=nome_admin,
                    email=email_admin,
                    senha_hash=criar_hash_senha(senha_admin),
                    nivel_acesso=int(NivelAcesso.DIRETORIA),
                    ativo=True,
                    senha_temporaria_ativa=False,
                )
            )
        banco.commit()
        logger.info("Bootstrap inicial de produção concluído para %s.", email_admin)


def seed_limites_plano() -> None:
    with SessaoLocal() as banco:
        for plano_valor, limites in LIMITES_PADRAO.items():
            registro = banco.get(LimitePlano, plano_valor)
            if not registro:
                registro = LimitePlano(plano=plano_valor)
                banco.add(registro)

            for campo, valor in limites.items():
                setattr(registro, campo, valor)

        try:
            banco.commit()
        except Exception:
            banco.rollback()
            raise
