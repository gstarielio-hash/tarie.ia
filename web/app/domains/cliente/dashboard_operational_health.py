"""Series temporais e saúde operacional do portal admin-cliente."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.admin.services import filtro_usuarios_gerenciaveis_cliente
from app.shared.database import Empresa, Laudo, RegistroAuditoriaEmpresa, Usuario


def agora_utc_cliente() -> datetime:
    return datetime.now(timezone.utc)


def _inicio_mes_utc(valor: datetime) -> datetime:
    return valor.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _deslocar_mes_utc(valor: datetime, quantidade: int) -> datetime:
    base = _inicio_mes_utc(valor)
    total = base.year * 12 + (base.month - 1) + int(quantidade)
    ano = total // 12
    mes = total % 12 + 1
    return base.replace(year=ano, month=mes)


def serie_laudos_mensal_empresa(banco: Session, *, empresa_id: int, meses: int = 6) -> list[dict[str, Any]]:
    agora = agora_utc_cliente()
    inicio_janela = _deslocar_mes_utc(agora, -(max(meses, 1) - 1))
    registros = list(
        banco.scalars(
            select(Laudo.criado_em)
            .where(
                Laudo.empresa_id == int(empresa_id),
                Laudo.criado_em >= inicio_janela,
            )
            .order_by(Laudo.criado_em.asc())
        ).all()
    )
    contagem: dict[str, int] = {}
    for criado_em in registros:
        if not criado_em:
            continue
        chave = criado_em.astimezone(timezone.utc).strftime("%Y-%m")
        contagem[chave] = contagem.get(chave, 0) + 1

    serie: list[dict[str, Any]] = []
    for deslocamento in range(max(meses, 1)):
        referencia = _deslocar_mes_utc(inicio_janela, deslocamento)
        chave = referencia.strftime("%Y-%m")
        serie.append(
            {
                "chave": chave,
                "label": referencia.strftime("%m/%Y"),
                "total": int(contagem.get(chave, 0)),
                "atual": chave == _inicio_mes_utc(agora).strftime("%Y-%m"),
            }
        )
    return serie


def serie_laudos_diaria_empresa(banco: Session, *, empresa_id: int, dias: int = 14) -> list[dict[str, Any]]:
    janela = max(dias, 1)
    agora = agora_utc_cliente()
    inicio = agora.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=janela - 1)
    registros = list(
        banco.scalars(
            select(Laudo.criado_em)
            .where(
                Laudo.empresa_id == int(empresa_id),
                Laudo.criado_em >= inicio,
            )
            .order_by(Laudo.criado_em.asc())
        ).all()
    )
    contagem: dict[str, int] = {}
    for criado_em in registros:
        if not criado_em:
            continue
        chave = criado_em.astimezone(timezone.utc).strftime("%Y-%m-%d")
        contagem[chave] = contagem.get(chave, 0) + 1

    serie: list[dict[str, Any]] = []
    for offset in range(janela):
        dia = inicio + timedelta(days=offset)
        chave = dia.strftime("%Y-%m-%d")
        serie.append(
            {
                "chave": chave,
                "label": dia.strftime("%d/%m"),
                "total": int(contagem.get(chave, 0)),
            }
        )
    return serie


def resumo_saude_empresa_cliente(
    banco: Session,
    *,
    empresa: Empresa,
    usuarios_total: int,
    admins_cliente: int,
    inspetores: int,
    revisores: int,
    capacidade_status: str,
    capacidade_tone: str,
    laudos_mes_atual: int,
) -> dict[str, Any]:
    serie_mensal = serie_laudos_mensal_empresa(banco, empresa_id=int(empresa.id), meses=6)
    serie_diaria = serie_laudos_diaria_empresa(banco, empresa_id=int(empresa.id), dias=14)

    atual = serie_mensal[-1]["total"] if serie_mensal else 0
    anterior = serie_mensal[-2]["total"] if len(serie_mensal) > 1 else 0
    if anterior > 0:
        variacao_pct = int(round(((atual - anterior) / anterior) * 100))
    elif atual > 0:
        variacao_pct = 100
    else:
        variacao_pct = 0

    if atual > anterior:
        tendencia = "subindo"
        tendencia_rotulo = "Operacao aquecendo"
        tendencia_tone = "aprovado" if capacidade_status in {"estavel", "monitorar"} else capacidade_tone
    elif atual < anterior:
        tendencia = "caindo"
        tendencia_rotulo = "Operacao desacelerando"
        tendencia_tone = "aguardando"
    else:
        tendencia = "estavel"
        tendencia_rotulo = "Ritmo estavel"
        tendencia_tone = capacidade_tone if capacidade_status != "estavel" else "aberto"

    janela_login = agora_utc_cliente() - timedelta(days=14)
    usuarios_ativos = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == int(empresa.id),
                filtro_usuarios_gerenciaveis_cliente(),
                Usuario.ativo.is_(True),
            )
        )
        or 0
    )
    usuarios_login_recente = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == int(empresa.id),
                filtro_usuarios_gerenciaveis_cliente(),
                Usuario.ativo.is_(True),
                Usuario.ultimo_login.is_not(None),
                Usuario.ultimo_login >= janela_login,
            )
        )
        or 0
    )
    primeiros_acessos = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == int(empresa.id),
                filtro_usuarios_gerenciaveis_cliente(),
                Usuario.senha_temporaria_ativa.is_(True),
            )
        )
        or 0
    )
    eventos_comerciais = (
        banco.scalar(
            select(func.count(RegistroAuditoriaEmpresa.id)).where(
                RegistroAuditoriaEmpresa.empresa_id == int(empresa.id),
                RegistroAuditoriaEmpresa.portal == "cliente",
                RegistroAuditoriaEmpresa.criado_em >= (agora_utc_cliente() - timedelta(days=60)),
                RegistroAuditoriaEmpresa.acao.in_(["plano_alterado", "plano_interesse_registrado"]),
            )
        )
        or 0
    )

    if bool(empresa.status_bloqueio):
        saude_rotulo = "Operacao bloqueada"
        saude_tone = "ajustes"
        saude_texto = "A empresa segue bloqueada e precisa de acao administrativa antes de recuperar o ritmo normal."
    elif capacidade_status == "critico":
        saude_rotulo = "Capacidade critica"
        saude_tone = "ajustes"
        saude_texto = "O crescimento do uso ja encostou no plano. A saude do contrato depende de ajuste rapido."
    elif usuarios_ativos and usuarios_login_recente / max(usuarios_ativos, 1) < 0.45:
        saude_rotulo = "Equipe esfriando"
        saude_tone = "aguardando"
        saude_texto = "Pouca gente da equipe acessou recentemente. Vale revisar onboarding, bloqueios e retomada operacional."
    else:
        saude_rotulo = tendencia_rotulo
        saude_tone = tendencia_tone
        saude_texto = (
            "A empresa tem atividade consistente e sinais claros para planejar o proximo passo."
            if atual or usuarios_login_recente
            else "Ainda ha pouca movimentacao recente; acompanhe os primeiros usos e a ativacao do time."
        )

    return {
        "status": saude_rotulo,
        "tone": saude_tone,
        "texto": saude_texto,
        "tendencia": tendencia,
        "tendencia_rotulo": tendencia_rotulo,
        "tendencia_tone": tendencia_tone,
        "variacao_mensal_percentual": int(variacao_pct),
        "laudos_mes_atual": int(laudos_mes_atual),
        "laudos_mes_anterior": int(anterior),
        "historico_mensal": serie_mensal,
        "historico_diario": serie_diaria,
        "usuarios_ativos_total": int(usuarios_ativos),
        "usuarios_login_recente": int(usuarios_login_recente),
        "usuarios_sem_login_recente": int(max(int(usuarios_ativos) - int(usuarios_login_recente), 0)),
        "primeiros_acessos_pendentes": int(primeiros_acessos),
        "eventos_comerciais_60d": int(eventos_comerciais),
        "mix_equipe": {
            "admins_cliente": int(admins_cliente),
            "inspetores": int(inspetores),
            "revisores": int(revisores),
            "usuarios_total": int(usuarios_total),
        },
    }


__all__ = [
    "agora_utc_cliente",
    "resumo_saude_empresa_cliente",
]
