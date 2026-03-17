# ==========================================
# TARIEL CONTROL TOWER — BANCO_DADOS.PY
# Responsabilidade: models SQLAlchemy,
# engine e dependency FastAPI
# ==========================================

import enum
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Generator

from dotenv import load_dotenv
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError  # FIX: adicionado
from sqlalchemy import (
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
    create_engine,
    event,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

load_dotenv()

logger = logging.getLogger(__name__)


# ── URL e configuração do banco ───────────────────────────────────────────────

_DIR_BASE   = os.path.dirname(os.path.abspath(__file__))
_URL_PADRAO = f"sqlite:///{os.path.join(_DIR_BASE, 'tariel_admin.db')}"
URL_BANCO   = os.getenv("DATABASE_URL", _URL_PADRAO)

_EH_SQLITE = URL_BANCO.startswith("sqlite")


def _criar_engine():
    """
    FIX: cria engine com parâmetros corretos por tipo de banco.
    SQLite e bancos de produção (PostgreSQL, MySQL) têm configurações distintas.
    """
    kwargs: dict = {"pool_pre_ping": True}

    if _EH_SQLITE:
        kwargs["connect_args"] = {"check_same_thread": False}
        if os.getenv("ENV", "development") == "production":
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_size"]    = int(os.getenv("DB_POOL_SIZE",    "10"))
        kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "20"))
        kwargs["pool_timeout"] = int(os.getenv("DB_POOL_TIMEOUT", "30"))
        kwargs["pool_recycle"] = int(os.getenv("DB_POOL_RECYCLE", "3600"))

    engine = create_engine(URL_BANCO, **kwargs)

    if _EH_SQLITE:
        @event.listens_for(engine, "connect")
        def _configurar_sqlite(conn, _record):
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    return engine


motor_banco = _criar_engine()
SessaoLocal = sessionmaker(autocommit=False, autoflush=False, bind=motor_banco)


# ── Enums ─────────────────────────────────────────────────────────────────────

class NivelAcesso(enum.IntEnum):
    INSPETOR  = 1
    DIRETORIA = 99


class StatusLaudo(str, enum.Enum):
    PENDENTE     = "Pendente"
    CONFORME     = "Conforme"
    NAO_CONFORME = "Nao Conforme"


class PlanoEmpresa(str, enum.Enum):
    PILOTO    = "Piloto"
    PRO       = "Pro"
    ILIMITADO = "Ilimitado"


def _valores_enum(cls: type) -> list[str]:
    return [e.value for e in cls]


# ── Mixin de auditoria ────────────────────────────────────────────────────────

class MixinAuditoria:
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="Timestamp UTC de criação do registro",
    )
    atualizado_em = Column(
        DateTime(timezone=True),
        nullable=True,
        onupdate=lambda: datetime.now(timezone.utc),
        comment="Timestamp UTC da última atualização",
    )


# ── Base ──────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Modelo: Empresa ───────────────────────────────────────────────────────────

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
            r"LENGTH(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '')) = 14",
            name="ck_empresa_cnpj_tamanho",
        ),
    )

    id            = Column(Integer, primary_key=True, index=True)
    nome_fantasia = Column(String(200), nullable=False, index=True)
    cnpj          = Column(String(18),  nullable=False, unique=True, index=True)
    plano_ativo   = Column(
        String(20),
        nullable=False,
        default=PlanoEmpresa.PILOTO.value,
    )
    custo_gerado_reais    = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"))
    mensagens_processadas = Column(Integer,        nullable=False, default=0)
    status_bloqueio       = Column(Boolean,        nullable=False, default=False)
    bloqueado_em          = Column(DateTime(timezone=True), nullable=True)
    motivo_bloqueio       = Column(String(300), nullable=True)

    segmento         = Column(String(100), nullable=True)
    cidade_estado    = Column(String(100), nullable=True)
    nome_responsavel = Column(String(150), nullable=True)
    observacoes      = Column(Text,        nullable=True)

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

    def __repr__(self) -> str:
        return (
            f"<Empresa id={self.id} nome={self.nome_fantasia!r} "
            f"plano={self.plano_ativo!r}>"
        )


# ── Modelo: Usuario ───────────────────────────────────────────────────────────

class Usuario(MixinAuditoria, Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        CheckConstraint(
            f"nivel_acesso IN ({int(NivelAcesso.INSPETOR)}, {int(NivelAcesso.DIRETORIA)})",
            name="ck_usuario_nivel_acesso_valido",
        ),
        CheckConstraint(
            "tentativas_login >= 0",
            name="ck_usuario_tentativas_nao_negativo",
        ),
        Index("ix_usuario_empresa_email", "empresa_id", "email"),
    )

    id         = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nome_completo = Column(String(150), nullable=False)
    email         = Column(String(254), nullable=False, unique=True, index=True)
    senha_hash    = Column(String(256), nullable=False)
    nivel_acesso  = Column(Integer,     nullable=False, default=int(NivelAcesso.INSPETOR))
    ativo         = Column(Boolean,     nullable=False, default=True)

    tentativas_login = Column(Integer, nullable=False, default=0)
    bloqueado_ate    = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Bloqueio temporário por excesso de tentativas",
    )
    ultimo_login = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp UTC do último login bem-sucedido",
    )
    ultimo_login_ip = Column(
        String(45),
        nullable=True,
        comment="IP do último login (IPv4 ou IPv6)",
    )

    empresa = relationship("Empresa", back_populates="usuarios")
    laudos  = relationship("Laudo",   back_populates="usuario")

    def __repr__(self) -> str:
        return (
            f"<Usuario id={self.id} email={self.email!r} "
            f"nivel={self.nivel_acesso} ativo={self.ativo}>"
        )

    def esta_bloqueado(self) -> bool:
        if self.bloqueado_ate is None:
            return False
        return datetime.now(timezone.utc) < self.bloqueado_ate

    def registrar_login_sucesso(self, ip: str | None = None) -> None:
        self.tentativas_login = 0
        self.bloqueado_ate    = None
        self.ultimo_login     = datetime.now(timezone.utc)
        self.ultimo_login_ip  = (ip or "")[:45] or None

    def incrementar_tentativa_falha(self, max_tentativas: int = 5) -> bool:
        from datetime import timedelta
        self.tentativas_login += 1
        if self.tentativas_login >= max_tentativas:
            self.bloqueado_ate = datetime.now(timezone.utc) + timedelta(minutes=15)
            return True
        return False


# ── Modelo: Laudo ─────────────────────────────────────────────────────────────

class Laudo(MixinAuditoria, Base):
    __tablename__ = "laudos"
    __table_args__ = (
        CheckConstraint(
            "custo_api_reais >= 0",
            name="ck_laudo_custo_nao_negativo",
        ),
        Index("ix_laudo_empresa_criado", "empresa_id", "criado_em"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    setor_industrial    = Column(String(100), nullable=False)
    status_conformidade = Column(
        SAEnum(StatusLaudo, values_callable=_valores_enum),
        nullable=False,
        default=StatusLaudo.PENDENTE.value,
    )
    parecer_ia       = Column(Text,           nullable=True)
    codigo_hash      = Column(String(32),     nullable=False, unique=True, index=True)
    custo_api_reais  = Column(Numeric(12, 4), nullable=False, default=Decimal("0.0000"))
    nome_arquivo_pdf = Column(
        String(100),
        nullable=True,
        comment="Nome do arquivo PDF gerado (sem path)",
    )

    empresa = relationship("Empresa", back_populates="laudos")
    usuario = relationship("Usuario", back_populates="laudos")

    def __repr__(self) -> str:
        return (
            f"<Laudo id={self.id} hash={self.codigo_hash!r} "
            f"setor={self.setor_industrial!r} status={self.status_conformidade!r}>"
        )


# ── Dependency FastAPI ────────────────────────────────────────────────────────

def obter_banco() -> Generator[Session, None, None]:
    """
    Dependency do FastAPI — fornece sessão do banco com gerenciamento
    correto de commit/rollback/close.

    FIX: HTTPException e RequestValidationError capturadas separadamente —
    são exceções de controle de fluxo da aplicação, não falhas do banco.
    Antes, qualquer uma delas disparava rollback e log de erro desnecessários.
    """
    banco: Session = SessaoLocal()
    try:
        yield banco
        banco.commit()
    except (HTTPException, RequestValidationError):
        # Controle de fluxo — sem rollback, sem log de erro de banco
        raise
    except Exception:
        banco.rollback()
        logger.error("Erro na sessão do banco. Rollback executado.", exc_info=True)
        raise
    finally:
        banco.close()


# ── Inicialização das tabelas ─────────────────────────────────────────────────

def inicializar_banco() -> None:
    """
    Cria todas as tabelas se não existirem.
    Chamar no startup do servidor (lifespan do FastAPI).
    """
    try:
        Base.metadata.create_all(bind=motor_banco)
        with motor_banco.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(
            "Banco de dados inicializado com sucesso. Driver: %s",
            URL_BANCO.split(":")[0],
        )
    except Exception:
        logger.critical("Falha ao inicializar o banco de dados.", exc_info=True)
        raise
