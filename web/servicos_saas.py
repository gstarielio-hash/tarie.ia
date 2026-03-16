import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from sqlalchemy.exc import IntegrityError

from banco_dados import Empresa, Usuario, Laudo, NivelAcesso
# FIX: removido gerar_hash_senha — duplicata de criar_hash_senha
from seguranca import gerar_senha_fortificada, criar_hash_senha

logger = logging.getLogger(__name__)


# Fonte única de verdade para planos — usada em TODO o módulo
_PLANOS_VALIDOS   = ("Piloto", "Pro", "Ilimitado")
_PRIORIDADE_PLANO = {"Ilimitado": 1, "Pro": 2, "Piloto": 3}
_LIMITE_PLANO     = {"Piloto": 20, "Pro": 999_999, "Ilimitado": 999_999}


# ── Onboarding ────────────────────────────────────────────────────────────────


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
    # FIX: valida plano na criação — antes era aceito qualquer string
    if plano not in _PLANOS_VALIDOS:
        raise ValueError(f"Plano inválido. Use: {list(_PLANOS_VALIDOS)}")

    # FIX: normaliza e-mail para evitar duplicatas por capitalização
    email_norm = email_admin.lower().strip()

    if db.query(Empresa).filter(Empresa.cnpj == cnpj).first():
        raise ValueError("CNPJ já cadastrado no sistema.")
    if db.query(Usuario).filter(Usuario.email == email_norm).first():
        raise ValueError("E-mail já em uso.")

    nova_empresa = Empresa(
        nome_fantasia=nome,
        cnpj=cnpj,
        plano_ativo=plano,
        segmento=segmento or None,
        cidade_estado=cidade_estado or None,
        nome_responsavel=nome_responsavel or None,
        observacoes=observacoes or None,
    )
    db.add(nova_empresa)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ValueError("Falha ao reservar registro. Tente novamente.")

    senha_plana  = gerar_senha_fortificada()
    novo_usuario = Usuario(
        empresa_id=nova_empresa.id,
        nome_completo=f"Admin {nome}",
        email=email_norm,                          # FIX: e-mail normalizado
        senha_hash=criar_hash_senha(senha_plana),  # FIX: função unificada
        nivel_acesso=int(NivelAcesso.INSPETOR),
    )
    db.add(novo_usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("Falha de integridade. Verifique CNPJ e e-mail.")

    try:
        _disparar_email_boas_vindas(email_norm, nome, senha_plana)
    except Exception as e:
        # FIX: logger com exc_info para rastrear falha de envio em produção
        logger.error(
            "Falha ao enviar e-mail de boas-vindas | empresa=%s email=%s erro=%s",
            nome, email_norm, e, exc_info=True,
        )

    return nova_empresa, senha_plana


# ── Painel ────────────────────────────────────────────────────────────────────


def buscar_metricas_ia_painel(db: Session) -> dict:
    qtd_clientes    = db.query(Empresa).count()
    total_inspecoes = db.query(Laudo).count()
    faturamento_ia  = db.query(func.sum(Laudo.custo_api_reais)).scalar() or 0.0

    ranking = db.query(Empresa).order_by(
        case(
            (Empresa.plano_ativo == "Ilimitado", 1),
            (Empresa.plano_ativo == "Pro", 2),
            else_=3,
        ),
        Empresa.id.desc(),
    ).all()

    hoje = datetime.now(timezone.utc).date()
    labels, valores = [], []
    for i in range(6, -1, -1):
        dia    = hoje - timedelta(days=i)
        inicio = datetime(dia.year, dia.month, dia.day, tzinfo=timezone.utc)
        fim    = inicio + timedelta(days=1)
        qtd    = db.query(Laudo).filter(
            Laudo.criado_em >= inicio,
            Laudo.criado_em < fim,
        ).count()
        labels.append(dia.strftime("%a %d/%m"))
        valores.append(qtd)

    return {
        "qtd_clientes":     qtd_clientes,
        "total_inspecoes":  total_inspecoes,
        "receita_ia_total": faturamento_ia,
        "clientes":         ranking,
        "labels_grafico":   labels,
        "valores_grafico":  valores,
    }


# ── Clientes SaaS ─────────────────────────────────────────────────────────────


def buscar_todos_clientes(
    db: Session,
    filtro_nome: str = "",
    filtro_plano: str = "",
) -> list[Empresa]:
    q = db.query(Empresa)
    if filtro_nome:
        q = q.filter(Empresa.nome_fantasia.ilike(f"%{filtro_nome}%"))
    if filtro_plano:
        q = q.filter(Empresa.plano_ativo == filtro_plano)
    return q.order_by(
        case(
            (Empresa.plano_ativo == "Ilimitado", 1),
            (Empresa.plano_ativo == "Pro", 2),
            else_=3,
        ),
        Empresa.id.desc(),
    ).all()


def buscar_detalhe_cliente(db: Session, empresa_id: int) -> dict | None:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        return None

    inspetores = db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id,
        Usuario.nivel_acesso < 99,
    ).all()

    laudos_recentes = db.query(Laudo).filter(
        Laudo.empresa_id == empresa_id,
    ).order_by(Laudo.data_criacao.desc()).limit(10).all()

    # FIX: query única para total e custo — evita round-trip duplo ao banco
    stats = db.query(
        func.count(Laudo.id).label("total"),
        func.coalesce(func.sum(Laudo.custo_api_reais), 0.0).label("custo"),
    ).filter(Laudo.empresa_id == empresa_id).one()

    limite = _LIMITE_PLANO.get(empresa.plano_ativo, 20)

    # FIX: (mensagens_processadas or 0) evita TypeError quando o campo é NULL no banco
    uso_pct = (
        min(100, int(((empresa.mensagens_processadas or 0) / limite) * 100))
        if limite < 999_999
        else None
    )

    return {
        "empresa":         empresa,
        "inspetores":      inspetores,
        "laudos_recentes": laudos_recentes,
        "limite_plano":    limite if limite < 999_999 else "Ilimitado",
        "uso_percentual":  uso_pct,
        "total_laudos":    stats.total,
        "custo_total":     stats.custo,
    }


def alternar_bloqueio(db: Session, empresa_id: int) -> bool:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise ValueError("Empresa não encontrada.")
    empresa.status_bloqueio = not empresa.status_bloqueio
    db.commit()
    return empresa.status_bloqueio


def alterar_plano(db: Session, empresa_id: int, novo_plano: str) -> None:
    # FIX: usa _PLANOS_VALIDOS global — fonte única de verdade
    if novo_plano not in _PLANOS_VALIDOS:
        raise ValueError(f"Plano inválido. Use: {list(_PLANOS_VALIDOS)}")
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise ValueError("Empresa não encontrada.")
    empresa.plano_ativo = novo_plano
    db.commit()


def resetar_senha_inspetor(db: Session, usuario_id: int) -> str:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise ValueError("Inspetor não encontrado.")
    nova_senha = gerar_senha_fortificada()
    usuario.senha_hash = criar_hash_senha(nova_senha)
    db.commit()
    return nova_senha  # retornada ao admin via UI — nunca logada (ver rotas_admin.py)


def adicionar_inspetor(db: Session, empresa_id: int, nome: str, email: str) -> str:
    # FIX: normaliza e-mail antes de checar duplicata e persistir
    email_norm = email.lower().strip()

    if db.query(Usuario).filter(Usuario.email == email_norm).first():
        raise ValueError("E-mail já cadastrado.")

    senha = gerar_senha_fortificada()
    novo  = Usuario(
        empresa_id=empresa_id,
        nome_completo=nome,
        email=email_norm,                    # FIX: e-mail normalizado
        senha_hash=criar_hash_senha(senha),  # FIX: função unificada
        nivel_acesso=int(NivelAcesso.INSPETOR),
    )
    db.add(novo)
    db.commit()
    return senha


# ── Stub de e-mail ─────────────────────────────────────────────────────────────


def _disparar_email_boas_vindas(email: str, empresa: str, senha: str) -> None:
    """
    STUB — substituir por integração real (SendGrid, SES, SMTP).
    A senha em texto plano é necessária aqui pois o usuário precisa recebê-la.
    NUNCA logar a senha — nem parcialmente.
    """
    # FIX: logger sem senha — apenas confirma que o envio foi tentado
    logger.info(
        "E-mail de boas-vindas disparado (stub) | empresa=%s email=%s",
        empresa, email,
    )
    # TODO: implementar envio real. Exemplo com SendGrid:
    # sendgrid_client.send(to=email, subject="Bem-vindo à Tariel.ia", body=f"Senha: {senha}")
    raise NotImplementedError(
        "Serviço de e-mail não configurado. "
        "Implemente _disparar_email_boas_vindas com SendGrid/SES/SMTP."
    )
