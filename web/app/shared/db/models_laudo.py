from __future__ import annotations

from decimal import Decimal
from typing import Any

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
)
from sqlalchemy.orm import relationship, validates

from app.shared.db.contracts import (
    ModoResposta,
    StatusLaudo,
    StatusRevisao,
    TipoMensagem,
    _TIPOS_MENSAGEM_VALIDOS,
    _valores_enum,
)
from app.shared.db.models_base import Base, MixinAuditoria, agora_utc


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
    aprendizados_visuais_ia = relationship(
        "AprendizadoVisualIa",
        back_populates="laudo",
        cascade="all, delete-orphan",
        order_by="AprendizadoVisualIa.criado_em",
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


class TemplateLaudo(MixinAuditoria, Base):
    __tablename__ = "templates_laudo"
    __table_args__ = (
        CheckConstraint("versao >= 1", name="ck_template_laudo_versao_positiva"),
        CheckConstraint(
            "modo_editor IN ('legado_pdf', 'editor_rico')",
            name="ck_template_laudo_modo_editor",
        ),
        CheckConstraint(
            "status_template IN ('rascunho', 'em_teste', 'ativo', 'legado', 'arquivado')",
            name="ck_template_laudo_status_template",
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
    base_recomendada_fixa = Column(Boolean, nullable=False, default=False)
    modo_editor = Column(String(20), nullable=False, default="legado_pdf")
    status_template = Column(String(20), nullable=False, default="rascunho")
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


class MensagemLaudo(Base):
    __tablename__ = "mensagens_laudo"
    __table_args__ = (
        UniqueConstraint(
            "laudo_id",
            "remetente_id",
            "client_message_id",
            name="uq_mensagem_laudo_cliente_idempotencia",
        ),
        CheckConstraint(
            f"tipo IN ({_TIPOS_MENSAGEM_VALIDOS})",
            name="ck_mensagem_tipo_valido",
        ),
        CheckConstraint(
            "custo_api_reais >= 0",
            name="ck_mensagem_custo_nao_negativo",
        ),
        Index("ix_mensagem_laudo_client_message", "laudo_id", "client_message_id"),
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
    client_message_id = Column(String(64), nullable=True)
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
