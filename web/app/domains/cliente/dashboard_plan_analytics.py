"""Analise de plano, capacidade e avisos do portal admin-cliente."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.shared.database import Empresa, LIMITES_PADRAO, LimitePlano, PlanoEmpresa

_PLANOS_ASCENDENTES = [
    PlanoEmpresa.INICIAL.value,
    PlanoEmpresa.INTERMEDIARIO.value,
    PlanoEmpresa.ILIMITADO.value,
]


def _capacidade_percentual(utilizado: int, limite: int | None) -> int | None:
    if not isinstance(limite, int) or limite <= 0:
        return None
    percentual = int(round((max(utilizado, 0) / limite) * 100))
    return max(0, min(percentual, 100))


def _capacidade_restante(utilizado: int, limite: int | None) -> int | None:
    if not isinstance(limite, int) or limite < 0:
        return None
    return max(limite - max(utilizado, 0), 0)


def _capacidade_excedente(utilizado: int, limite: int | None) -> int:
    if not isinstance(limite, int) or limite < 0:
        return 0
    return max(max(utilizado, 0) - limite, 0)


def _proximo_plano_cliente(plano_atual: str) -> str | None:
    plano = PlanoEmpresa.normalizar(plano_atual)
    try:
        indice = _PLANOS_ASCENDENTES.index(plano)
    except ValueError:
        return None
    proximo_indice = indice + 1
    if proximo_indice >= len(_PLANOS_ASCENDENTES):
        return None
    return _PLANOS_ASCENDENTES[proximo_indice]


def _limites_por_plano_cliente(banco: Session, plano: str) -> dict[str, Any]:
    plano_normalizado = PlanoEmpresa.normalizar(plano)
    limite = banco.get(LimitePlano, plano_normalizado)
    if limite:
        return {
            "plano": plano_normalizado,
            "laudos_mes": limite.laudos_mes,
            "usuarios_max": limite.usuarios_max,
            "upload_doc": bool(limite.upload_doc),
            "deep_research": bool(limite.deep_research),
            "integracoes_max": limite.integracoes_max,
            "retencao_dias": limite.retencao_dias,
        }

    padrao = LIMITES_PADRAO.get(plano_normalizado, LIMITES_PADRAO[PlanoEmpresa.INICIAL.value])
    return {
        "plano": plano_normalizado,
        "laudos_mes": padrao["laudos_mes"],
        "usuarios_max": padrao["usuarios_max"],
        "upload_doc": bool(padrao["upload_doc"]),
        "deep_research": bool(padrao["deep_research"]),
        "integracoes_max": padrao["integracoes_max"],
        "retencao_dias": padrao["retencao_dias"],
    }


def _descricao_delta_limite(rotulo: str, anterior: int | None, atual: int | None) -> str:
    if anterior is None and atual is None:
        return f"{rotulo} sem teto"
    if anterior is None and isinstance(atual, int):
        return f"{rotulo} agora limitados em {atual}"
    if isinstance(anterior, int) and atual is None:
        return f"{rotulo} agora sem teto"
    if not isinstance(anterior, int) or not isinstance(atual, int):
        return ""
    delta = atual - anterior
    if delta > 0:
        return f"+{delta} {rotulo}"
    if delta < 0:
        return f"{delta} {rotulo}"
    return f"{rotulo} mantidos"


def comparativo_plano_cliente(banco: Session, *, plano_atual: str, plano_destino: str) -> dict[str, Any]:
    atual = _limites_por_plano_cliente(banco, plano_atual)
    destino = _limites_por_plano_cliente(banco, plano_destino)
    delta_usuarios = None if atual["usuarios_max"] is None or destino["usuarios_max"] is None else int(destino["usuarios_max"]) - int(atual["usuarios_max"])
    delta_laudos = None if atual["laudos_mes"] is None or destino["laudos_mes"] is None else int(destino["laudos_mes"]) - int(atual["laudos_mes"])
    impacto_itens = [
        _descricao_delta_limite("vagas", atual["usuarios_max"], destino["usuarios_max"]),
        _descricao_delta_limite("laudos/mes", atual["laudos_mes"], destino["laudos_mes"]),
    ]
    if bool(destino["upload_doc"]) != bool(atual["upload_doc"]):
        impacto_itens.append("upload documental liberado" if destino["upload_doc"] else "upload documental desativado")
    if bool(destino["deep_research"]) != bool(atual["deep_research"]):
        impacto_itens.append("deep research liberado" if destino["deep_research"] else "deep research desativado")

    prioridade_atual = _PLANOS_ASCENDENTES.index(atual["plano"])
    prioridade_destino = _PLANOS_ASCENDENTES.index(destino["plano"])
    movimento = "upgrade" if prioridade_destino > prioridade_atual else "downgrade" if prioridade_destino < prioridade_atual else "manter"
    resumo = ", ".join([item for item in impacto_itens if item]) or "sem mudança material"

    return {
        "plano": destino["plano"],
        "atual": movimento == "manter",
        "movimento": movimento,
        "usuarios_max": destino["usuarios_max"],
        "laudos_mes": destino["laudos_mes"],
        "upload_doc": bool(destino["upload_doc"]),
        "deep_research": bool(destino["deep_research"]),
        "delta_usuarios": delta_usuarios,
        "delta_laudos": delta_laudos,
        "resumo_impacto": resumo,
    }


def catalogo_planos_cliente(banco: Session, plano_atual: str) -> list[dict[str, Any]]:
    proximo_plano = _proximo_plano_cliente(plano_atual)
    return [
        {
            **comparativo_plano_cliente(banco, plano_atual=plano_atual, plano_destino=plano),
            "sugerido": bool(proximo_plano and plano == proximo_plano),
        }
        for plano in _PLANOS_ASCENDENTES
    ]


def avaliar_capacidade_empresa(
    *,
    plano_atual: str,
    total_usuarios: int,
    usuarios_limite: int | None,
    laudos_mes_atual: int,
    laudos_limite: int | None,
) -> dict[str, Any]:
    usuarios_pct = _capacidade_percentual(total_usuarios, usuarios_limite)
    laudos_pct = _capacidade_percentual(laudos_mes_atual, laudos_limite)
    usuarios_restantes = _capacidade_restante(total_usuarios, usuarios_limite)
    laudos_restantes = _capacidade_restante(laudos_mes_atual, laudos_limite)
    usuarios_excedente = _capacidade_excedente(total_usuarios, usuarios_limite)
    laudos_excedente = _capacidade_excedente(laudos_mes_atual, laudos_limite)

    metricas: list[dict[str, Any]] = []
    if usuarios_pct is not None:
        metricas.append(
            {
                "chave": "usuarios",
                "label": "usuarios",
                "percentual": usuarios_pct,
                "restantes": usuarios_restantes,
                "excedente": usuarios_excedente,
                "limite": usuarios_limite,
            }
        )
    if laudos_pct is not None:
        metricas.append(
            {
                "chave": "laudos",
                "label": "laudos do mes",
                "percentual": laudos_pct,
                "restantes": laudos_restantes,
                "excedente": laudos_excedente,
                "limite": laudos_limite,
            }
        )

    principal = max(metricas, key=lambda item: (int(item["percentual"]), int(item["excedente"])), default=None)
    proximo_plano = _proximo_plano_cliente(plano_atual)
    gargalo = principal["chave"] if principal else "operacao"

    if principal is None:
        return {
            "usuarios_percentual": usuarios_pct,
            "usuarios_restantes": usuarios_restantes,
            "usuarios_excedente": usuarios_excedente,
            "laudos_percentual": laudos_pct,
            "laudos_restantes": laudos_restantes,
            "laudos_excedente": laudos_excedente,
            "capacidade_percentual": None,
            "capacidade_status": "ilimitado",
            "capacidade_tone": "aprovado",
            "capacidade_badge": "Plano sem teto",
            "capacidade_acao": "A empresa nao esta operando com limite rigido de usuarios ou laudos neste plano.",
            "capacidade_gargalo": "sem teto",
            "plano_sugerido": None,
            "plano_sugerido_motivo": "",
        }

    percentual = int(principal["percentual"])
    if int(principal["excedente"]) > 0 or int(principal["restantes"] or 0) <= 0:
        status_capacidade = "critico"
        tone = "ajustes"
        badge = "Expandir plano agora"
        acao = (
            f"O limite de {principal['label']} ja foi atingido. {principal['excedente']} acima do contratado exigem ajuste imediato do plano."
            if int(principal["excedente"]) > 0
            else f"O limite de {principal['label']} chegou no teto. Ajuste o plano antes de travar a operacao."
        )
    elif percentual >= 85:
        status_capacidade = "atencao"
        tone = "aguardando"
        badge = "Planejar upgrade"
        acao = f"A empresa consumiu {percentual}% da capacidade de {principal['label']}. Vale ajustar o plano antes do proximo pico operacional."
    elif percentual >= 70:
        status_capacidade = "monitorar"
        tone = "aberto"
        badge = "Monitorar capacidade"
        acao = f"A capacidade de {principal['label']} entrou na faixa de atencao. Monitore a evolucao da equipe e da fila para nao ser pego de surpresa."
    else:
        status_capacidade = "estavel"
        tone = "aprovado"
        badge = "Capacidade estavel"
        acao = "A empresa ainda tem folga operacional para crescer dentro do plano atual."

    motivo_upgrade = ""
    if proximo_plano and status_capacidade in {"critico", "atencao", "monitorar"}:
        motivo_upgrade = f"O plano {proximo_plano} abre mais folga para {principal['label']} sem interromper a operacao da empresa."

    return {
        "usuarios_percentual": usuarios_pct,
        "usuarios_restantes": usuarios_restantes,
        "usuarios_excedente": usuarios_excedente,
        "laudos_percentual": laudos_pct,
        "laudos_restantes": laudos_restantes,
        "laudos_excedente": laudos_excedente,
        "capacidade_percentual": percentual,
        "capacidade_status": status_capacidade,
        "capacidade_tone": tone,
        "capacidade_badge": badge,
        "capacidade_acao": acao,
        "capacidade_gargalo": gargalo,
        "plano_sugerido": proximo_plano,
        "plano_sugerido_motivo": motivo_upgrade,
    }


def avisos_operacionais_empresa(
    *,
    empresa: Empresa,
    usuarios_restantes: int | None,
    usuarios_excedente: int,
    usuarios_max: int | None,
    laudos_restantes: int | None,
    laudos_excedente: int,
    laudos_mes_limite: int | None,
    laudos_mes_atual: int,
    plano_sugerido: str | None,
) -> list[dict[str, Any]]:
    avisos: list[dict[str, Any]] = []

    if isinstance(usuarios_max, int):
        if usuarios_excedente > 0 or (usuarios_restantes is not None and usuarios_restantes <= 0):
            avisos.append(
                {
                    "canal": "admin",
                    "tone": "ajustes",
                    "badge": "Novos acessos bloqueados",
                    "titulo": "A equipe ja estourou o teto do plano",
                    "detalhe": (
                        f"A empresa usa mais acessos do que o plano suporta. {usuarios_excedente} acima do contratado pedem ajuste imediato."
                        if usuarios_excedente > 0
                        else "Nao sera possivel criar novos usuarios ate ampliar o plano ou reduzir a equipe ativa."
                    ),
                    "acao": (
                        f"Migre para {plano_sugerido} antes de continuar expandindo a equipe."
                        if plano_sugerido
                        else "Revise o contrato antes de liberar novos acessos."
                    ),
                }
            )
        elif usuarios_restantes is not None and usuarios_restantes <= 1:
            avisos.append(
                {
                    "canal": "admin",
                    "tone": "aguardando",
                    "badge": "Ultima vaga livre",
                    "titulo": "A expansao da equipe esta no limite",
                    "detalhe": "Resta apenas uma vaga antes de travar novos cadastros da empresa.",
                    "acao": (
                        f"Se ainda houver onboarding pela frente, deixe {plano_sugerido} pronto como proximo passo."
                        if plano_sugerido
                        else "Monitore a equipe antes de novos cadastros."
                    ),
                }
            )

    if isinstance(laudos_mes_limite, int):
        if laudos_excedente > 0 or (laudos_restantes is not None and laudos_restantes <= 0):
            avisos.extend(
                [
                    {
                        "canal": "chat",
                        "tone": "ajustes",
                        "badge": "Chat no teto do plano",
                        "titulo": "Novos laudos ficaram bloqueados",
                        "detalhe": (
                            f"O contrato mensal de laudos ja foi estourado em {laudos_excedente}."
                            if laudos_excedente > 0
                            else "A criacao de novos laudos sera bloqueada ate trocar o plano ou virar a janela mensal."
                        ),
                        "acao": (
                            f"Amplie para {plano_sugerido} para liberar novas aberturas imediatamente."
                            if plano_sugerido
                            else "Aguarde a proxima janela ou revise o contrato."
                        ),
                    },
                    {
                        "canal": "mesa",
                        "tone": "ajustes",
                        "badge": "Fila nova comprometida",
                        "titulo": "A Mesa pode perder fluxo novo",
                        "detalhe": "Sem novos laudos saindo do chat, a entrada fresca da mesa diminui e o ritmo operacional cai.",
                        "acao": (
                            f"Expanda o plano para {plano_sugerido} e mantenha a fila da mesa respirando."
                            if plano_sugerido
                            else "Reveja o contrato para manter a entrada de laudos."
                        ),
                    },
                ]
            )
        elif laudos_restantes is not None and laudos_restantes <= 5:
            avisos.extend(
                [
                    {
                        "canal": "chat",
                        "tone": "aguardando",
                        "badge": "Poucos laudos restantes",
                        "titulo": "O chat esta perto do teto mensal",
                        "detalhe": (
                            f"Restam {laudos_restantes} laudos antes do bloqueio de novas aberturas. "
                            f"A empresa ja usou {laudos_mes_atual} de {laudos_mes_limite}."
                        ),
                        "acao": (
                            f"Planeje a subida para {plano_sugerido} antes do proximo pico." if plano_sugerido else "Monitore a fila antes do proximo pico."
                        ),
                    },
                    {
                        "canal": "mesa",
                        "tone": "aguardando",
                        "badge": "Entrada da mesa sob pressao",
                        "titulo": "A janela de novos laudos esta curta",
                        "detalhe": "Se o chat bater o limite, a mesa deixa de receber novos laudos com a mesma cadencia.",
                        "acao": (
                            f"Antecipe o upgrade para {plano_sugerido} e evite secar a fila."
                            if plano_sugerido
                            else "Acompanhe a velocidade da fila nesta semana."
                        ),
                    },
                ]
            )

    if not avisos and bool(empresa.status_bloqueio):
        avisos.append(
            {
                "canal": "admin",
                "tone": "ajustes",
                "badge": "Empresa bloqueada",
                "titulo": "A operacao central foi bloqueada",
                "detalhe": "Enquanto a empresa permanecer bloqueada, o chat e a mesa ficam sujeitos a restricoes de acesso.",
                "acao": "Revise o bloqueio antes de retomar a operacao normal.",
            }
        )

    return avisos


__all__ = [
    "avaliar_capacidade_empresa",
    "avisos_operacionais_empresa",
    "catalogo_planos_cliente",
    "comparativo_plano_cliente",
]
