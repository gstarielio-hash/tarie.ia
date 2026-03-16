"""Portal do admin-cliente multiempresa."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
import secrets
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.admin.services import (
    alternar_bloqueio_usuario_empresa,
    alterar_plano,
    atualizar_usuario_empresa,
    criar_usuario_empresa,
    filtro_usuarios_gerenciaveis_cliente,
    resetar_senha_usuario_empresa,
)
from app.domains.chat.chat import obter_mensagens_laudo, rota_chat, rota_upload_doc
from app.domains.chat.laudo import (
    RESPOSTA_GATE_QUALIDADE_REPROVADO,
    RESPOSTA_LAUDO_NAO_ENCONTRADO,
    api_finalizar_relatorio,
    api_iniciar_relatorio,
    api_obter_gate_qualidade_laudo,
    api_reabrir_laudo,
    api_status_relatorio,
)
from app.domains.chat.laudo_state_helpers import serializar_card_laudo
from app.domains.chat.limits_helpers import contar_laudos_mes
from app.domains.chat.normalization import TIPOS_TEMPLATE_VALIDOS
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.chat.schemas import DadosChat
from app.domains.cliente.auditoria import (
    listar_auditoria_empresa,
    registrar_auditoria_empresa,
    serializar_registro_auditoria,
)
from app.domains.cliente.common import (
    CHAVE_CSRF_CLIENTE,
    contexto_base_cliente,
    garantir_csrf_cliente,
    validar_csrf_cliente,
)
from app.domains.revisor.routes import (
    DadosPendenciaMesa,
    DadosRespostaChat,
    RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
    avaliar_laudo,
    baixar_anexo_mesa_revisor,
    marcar_whispers_lidos,
    obter_historico_chat_revisor,
    obter_laudo_completo,
    obter_pacote_mesa_laudo,
    responder_chat_campo,
    responder_chat_campo_com_anexo,
    atualizar_pendencia_mesa_revisor,
)
from app.shared.database import (
    Empresa,
    LIMITES_PADRAO,
    Laudo,
    LimitePlano,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    RegistroAuditoriaEmpresa,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import (
    PORTAL_CLIENTE,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    exigir_admin_cliente,
    obter_dados_sessao_portal,
    obter_usuario_html,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)

logger = logging.getLogger("tariel.cliente")

roteador_cliente = APIRouter()
templates = Jinja2Templates(directory="templates")

URL_LOGIN = "/cliente/login"
URL_PAINEL = "/cliente/painel"
PORTAL_TROCA_SENHA_CLIENTE = "cliente"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"
RESPOSTAS_USUARIO_CLIENTE = {
    400: {"description": "Dados inválidos para o usuário da empresa."},
    404: {"description": "Usuário não encontrado para esta empresa."},
    409: {"description": "Conflito ao alterar o cadastro da empresa."},
}
RESPOSTAS_BLOQUEIO_CLIENTE = {
    404: {"description": "Usuário não encontrado para esta empresa."},
}
RESPOSTAS_PLANO_CLIENTE = {
    400: {"description": "Plano inválido."},
    404: {"description": "Empresa não encontrada."},
}
RESPOSTAS_CHAT_CLIENTE = {
    **RESPOSTA_LAUDO_NAO_ENCONTRADO,
    403: {"description": "Laudo não pertence à empresa do admin-cliente."},
}
RESPOSTAS_GATE_CLIENTE = {
    **RESPOSTAS_CHAT_CLIENTE,
    **RESPOSTA_GATE_QUALIDADE_REPROVADO,
}
RESPOSTAS_MESA_CLIENTE = {
    **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
}
RESPOSTAS_MESA_CLIENTE_COM_PENDENCIA = {
    **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
    404: {"description": "Pendência da mesa não encontrada."},
}
RESPOSTAS_MESA_CLIENTE_COM_ANEXO = {
    **RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
    400: {"description": "Upload inválido."},
    413: {"description": "Arquivo acima do limite."},
    415: {"description": "Tipo de arquivo não suportado."},
}
RESPOSTAS_MESA_CLIENTE_DOWNLOAD = {
    200: {
        "description": "Arquivo do anexo da mesa.",
        "content": {
            "application/pdf": {},
            "image/png": {},
            "image/jpeg": {},
            "image/webp": {},
            "application/octet-stream": {},
        },
    },
    404: {"description": "Anexo da mesa não encontrado."},
}

_ROLE_LABELS = {
    int(NivelAcesso.INSPETOR): "Inspetor",
    int(NivelAcesso.REVISOR): "Mesa Avaliadora",
    int(NivelAcesso.ADMIN_CLIENTE): "Admin-Cliente",
    int(NivelAcesso.DIRETORIA): "Admin-CEO",
}
_PLANOS_ASCENDENTES = [
    PlanoEmpresa.INICIAL.value,
    PlanoEmpresa.INTERMEDIARIO.value,
    PlanoEmpresa.ILIMITADO.value,
]


class DadosPlanoCliente(BaseModel):
    plano: Literal["Inicial", "Intermediario", "Ilimitado"]

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosInteressePlanoCliente(BaseModel):
    plano: Literal["Inicial", "Intermediario", "Ilimitado"]
    origem: Literal["admin", "chat", "mesa"] = "admin"

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosCriarUsuarioCliente(BaseModel):
    nome: str = Field(..., min_length=3, max_length=150)
    email: str = Field(..., min_length=5, max_length=254)
    nivel_acesso: Literal["admin_cliente", "inspetor", "revisor"]
    telefone: str = Field(default="", max_length=30)
    crea: str = Field(default="", max_length=40)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosAtualizarUsuarioCliente(BaseModel):
    nome: str | None = Field(default=None, min_length=3, max_length=150)
    email: str | None = Field(default=None, min_length=5, max_length=254)
    telefone: str | None = Field(default=None, max_length=30)
    crea: str | None = Field(default=None, max_length=40)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosMesaAvaliacaoCliente(BaseModel):
    acao: Literal["aprovar", "rejeitar"]
    motivo: str = Field(default="", max_length=600)

    model_config = ConfigDict(str_strip_whitespace=True)


def _usuario_nome(usuario: Usuario) -> str:
    return getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Cliente #{usuario.id}"


def _capacidade_percentual(utilizado: int, limite: int | None) -> int | None:
    if not isinstance(limite, int) or limite <= 0:
        return None
    percentual = int(round((max(utilizado, 0) / limite) * 100))
    return max(0, min(percentual, 100))


def _agora_utc_cliente() -> datetime:
    return datetime.now(timezone.utc)


def _inicio_mes_utc(valor: datetime) -> datetime:
    return valor.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _deslocar_mes_utc(valor: datetime, quantidade: int) -> datetime:
    base = _inicio_mes_utc(valor)
    total = base.year * 12 + (base.month - 1) + int(quantidade)
    ano = total // 12
    mes = total % 12 + 1
    return base.replace(year=ano, month=mes)


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


def _comparativo_plano_cliente(banco: Session, *, plano_atual: str, plano_destino: str) -> dict[str, Any]:
    atual = _limites_por_plano_cliente(banco, plano_atual)
    destino = _limites_por_plano_cliente(banco, plano_destino)
    delta_usuarios = (
        None
        if atual["usuarios_max"] is None or destino["usuarios_max"] is None
        else int(destino["usuarios_max"]) - int(atual["usuarios_max"])
    )
    delta_laudos = (
        None
        if atual["laudos_mes"] is None or destino["laudos_mes"] is None
        else int(destino["laudos_mes"]) - int(atual["laudos_mes"])
    )
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


def _catalogo_planos_cliente(banco: Session, plano_atual: str) -> list[dict[str, Any]]:
    proximo_plano = _proximo_plano_cliente(plano_atual)
    return [
        {
            **_comparativo_plano_cliente(banco, plano_atual=plano_atual, plano_destino=plano),
            "sugerido": bool(proximo_plano and plano == proximo_plano),
        }
        for plano in _PLANOS_ASCENDENTES
    ]


def _avisos_operacionais_empresa(
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
                        f"A empresa usa mais acessos do que o plano suporta. "
                        f"{usuarios_excedente} acima do contratado pedem ajuste imediato."
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
                            f"Planeje a subida para {plano_sugerido} antes do proximo pico."
                            if plano_sugerido
                            else "Monitore a fila antes do proximo pico."
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


def _serie_laudos_mensal_empresa(banco: Session, *, empresa_id: int, meses: int = 6) -> list[dict[str, Any]]:
    agora = _agora_utc_cliente()
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


def _serie_laudos_diaria_empresa(banco: Session, *, empresa_id: int, dias: int = 14) -> list[dict[str, Any]]:
    janela = max(dias, 1)
    agora = _agora_utc_cliente()
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


def _resumo_saude_empresa_cliente(
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
    serie_mensal = _serie_laudos_mensal_empresa(banco, empresa_id=int(empresa.id), meses=6)
    serie_diaria = _serie_laudos_diaria_empresa(banco, empresa_id=int(empresa.id), dias=14)

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

    janela_login = _agora_utc_cliente() - timedelta(days=14)
    usuarios_ativos = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == int(empresa.id),
            filtro_usuarios_gerenciaveis_cliente(),
            Usuario.ativo.is_(True),
        )
    ) or 0
    usuarios_login_recente = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == int(empresa.id),
            filtro_usuarios_gerenciaveis_cliente(),
            Usuario.ativo.is_(True),
            Usuario.ultimo_login.is_not(None),
            Usuario.ultimo_login >= janela_login,
        )
    ) or 0
    primeiros_acessos = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == int(empresa.id),
            filtro_usuarios_gerenciaveis_cliente(),
            Usuario.senha_temporaria_ativa.is_(True),
        )
    ) or 0
    eventos_comerciais = banco.scalar(
        select(func.count(RegistroAuditoriaEmpresa.id)).where(
            RegistroAuditoriaEmpresa.empresa_id == int(empresa.id),
            RegistroAuditoriaEmpresa.portal == PORTAL_CLIENTE,
            RegistroAuditoriaEmpresa.criado_em >= (_agora_utc_cliente() - timedelta(days=60)),
            RegistroAuditoriaEmpresa.acao.in_(["plano_alterado", "plano_interesse_registrado"]),
        )
    ) or 0

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
        saude_texto = "A empresa tem atividade consistente e sinais claros para planejar o proximo passo." if atual or usuarios_login_recente else "Ainda ha pouca movimentacao recente; acompanhe os primeiros usos e a ativacao do time."

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


def _avaliar_capacidade_empresa(
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
            f"O limite de {principal['label']} ja foi atingido. "
            f"{principal['excedente']} acima do contratado exigem ajuste imediato do plano."
            if int(principal["excedente"]) > 0
            else f"O limite de {principal['label']} chegou no teto. Ajuste o plano antes de travar a operacao."
        )
    elif percentual >= 85:
        status_capacidade = "atencao"
        tone = "aguardando"
        badge = "Planejar upgrade"
        acao = (
            f"A empresa consumiu {percentual}% da capacidade de {principal['label']}. "
            "Vale ajustar o plano antes do proximo pico operacional."
        )
    elif percentual >= 70:
        status_capacidade = "monitorar"
        tone = "aberto"
        badge = "Monitorar capacidade"
        acao = (
            f"A capacidade de {principal['label']} entrou na faixa de atencao. "
            "Monitore a evolucao da equipe e da fila para nao ser pego de surpresa."
        )
    else:
        status_capacidade = "estavel"
        tone = "aprovado"
        badge = "Capacidade estavel"
        acao = "A empresa ainda tem folga operacional para crescer dentro do plano atual."

    motivo_upgrade = ""
    if proximo_plano and status_capacidade in {"critico", "atencao", "monitorar"}:
        motivo_upgrade = (
            f"O plano {proximo_plano} abre mais folga para {principal['label']} "
            "sem interromper a operacao da empresa."
        )

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


def _aplicar_headers_no_cache(response: HTMLResponse | RedirectResponse) -> None:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


def _render_template(request: Request, nome_template: str, contexto: dict[str, Any], *, status_code: int = 200) -> HTMLResponse:
    resposta = templates.TemplateResponse(
        request,
        nome_template,
        {**contexto_base_cliente(request), **contexto},
        status_code=status_code,
    )
    _aplicar_headers_no_cache(resposta)
    return resposta


def _render_login_cliente(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "login_cliente.html",
        {"erro": erro},
        status_code=status_code,
    )


def _redirect_login_cliente() -> RedirectResponse:
    resposta = RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)
    _aplicar_headers_no_cache(resposta)
    return resposta


def _mensagem_portal_correto(usuario: Usuario) -> str:
    nivel = int(usuario.nivel_acesso or 0)
    if nivel == int(NivelAcesso.INSPETOR):
        return "Este usuário deve acessar /app/login."
    if nivel == int(NivelAcesso.REVISOR):
        return "Este usuário deve acessar /revisao/login."
    if nivel == int(NivelAcesso.DIRETORIA):
        return "Este usuário deve acessar /admin/login."
    return "Acesso negado para este portal."


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    request.session.clear()
    token_csrf = secrets.token_urlsafe(32)
    request.session[CHAVE_CSRF_CLIENTE] = token_csrf
    request.session["csrf_token"] = token_csrf
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_CLIENTE
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Usuario | None:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_CLIENTE:
        return None

    usuario_id = request.session.get(CHAVE_TROCA_SENHA_UID)
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        _limpar_fluxo_troca_senha(request)
        return None

    usuario = banco.get(Usuario, usuario_id_int)
    if not usuario or not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        _limpar_fluxo_troca_senha(request)
        return None
    if not bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _limpar_fluxo_troca_senha(request)
        return None
    if usuario_tem_bloqueio_ativo(usuario):
        _limpar_fluxo_troca_senha(request)
        return None
    return usuario


def _validar_nova_senha(senha_atual: str, nova_senha: str, confirmar_senha: str) -> str:
    senha_atual = senha_atual or ""
    nova_senha = nova_senha or ""
    confirmar_senha = confirmar_senha or ""

    if not senha_atual or not nova_senha or not confirmar_senha:
        return "Preencha senha atual, nova senha e confirmação."
    if nova_senha != confirmar_senha:
        return "A confirmação da nova senha não confere."
    if len(nova_senha) < 8:
        return "A nova senha deve ter no mínimo 8 caracteres."
    if nova_senha == senha_atual:
        return "A nova senha deve ser diferente da senha temporária."
    return ""


def _render_troca_senha(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "trocar_senha.html",
        {
            "erro": erro,
            "titulo_pagina": "Troca Obrigatória de Senha",
            "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao portal admin-cliente.",
            "acao_form": "/cliente/trocar-senha",
            "rota_login": URL_LOGIN,
        },
        status_code=status_code,
    )


def _empresa_usuario(banco: Session, usuario: Usuario) -> Empresa:
    empresa = banco.get(Empresa, int(usuario.empresa_id))
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return empresa


def _serializar_usuario_cliente(usuario: Usuario) -> dict[str, Any]:
    nivel = int(usuario.nivel_acesso or 0)
    return {
        "id": int(usuario.id),
        "nome": _usuario_nome(usuario),
        "email": str(usuario.email or ""),
        "telefone": str(usuario.telefone or ""),
        "crea": str(usuario.crea or ""),
        "nivel_acesso": nivel,
        "papel": _ROLE_LABELS.get(nivel, f"Nível {nivel}"),
        "ativo": bool(usuario.ativo),
        "senha_temporaria_ativa": bool(getattr(usuario, "senha_temporaria_ativa", False)),
        "ultimo_login": usuario.ultimo_login.isoformat() if getattr(usuario, "ultimo_login", None) else "",
        "ultimo_login_label": (
            usuario.ultimo_login.astimezone().strftime("%d/%m/%Y %H:%M")
            if getattr(usuario, "ultimo_login", None)
            else "Nunca"
        ),
    }


def _traduzir_erro_servico_cliente(exc: ValueError) -> HTTPException:
    detalhe = str(exc).strip() or "Operação inválida."
    detalhe_lower = detalhe.lower()

    if "não encontrado" in detalhe_lower or "nao encontrado" in detalhe_lower:
        status_code = status.HTTP_404_NOT_FOUND
    elif (
        "já cadastrado" in detalhe_lower
        or "ja cadastrado" in detalhe_lower
        or "já em uso" in detalhe_lower
        or "ja em uso" in detalhe_lower
        or "limite de usuários" in detalhe_lower
        or "limite de usuarios" in detalhe_lower
        or "conflito" in detalhe_lower
    ):
        status_code = status.HTTP_409_CONFLICT
    else:
        status_code = status.HTTP_400_BAD_REQUEST

    return HTTPException(status_code=status_code, detail=detalhe)


def _mapa_contagem_por_laudo(
    banco: Session,
    *,
    laudo_ids: list[int],
    tipo: str,
    apenas_nao_lidas: bool = False,
) -> dict[int, int]:
    ids_validos = [int(item) for item in laudo_ids if int(item or 0) > 0]
    if not ids_validos:
        return {}

    consulta = (
        banco.query(MensagemLaudo.laudo_id, func.count(MensagemLaudo.id))
        .filter(
            MensagemLaudo.laudo_id.in_(ids_validos),
            MensagemLaudo.tipo == tipo,
        )
    )
    if apenas_nao_lidas:
        consulta = consulta.filter(MensagemLaudo.lida.is_(False))

    return {int(laudo_id): int(total) for laudo_id, total in consulta.group_by(MensagemLaudo.laudo_id).all()}


def _serializar_laudo_chat(banco: Session, laudo: Laudo) -> dict[str, Any]:
    payload = serializar_card_laudo(banco, laudo)
    payload.update(
        {
            "usuario_id": int(laudo.usuario_id) if laudo.usuario_id else None,
            "atualizado_em": laudo.atualizado_em.isoformat() if laudo.atualizado_em else "",
            "tipo_template_label": TIPOS_TEMPLATE_VALIDOS.get(str(laudo.tipo_template or "padrao"), "Inspeção"),
        }
    )
    return payload


def _serializar_laudo_mesa(
    banco: Session,
    laudo: Laudo,
    *,
    pendencias_abertas: int,
    whispers_nao_lidos: int,
) -> dict[str, Any]:
    payload = serializar_card_laudo(banco, laudo)
    payload.update(
        {
            "pendencias_abertas": int(pendencias_abertas),
            "whispers_nao_lidos": int(whispers_nao_lidos),
            "usuario_id": int(laudo.usuario_id) if laudo.usuario_id else None,
            "revisado_por": int(laudo.revisado_por) if laudo.revisado_por else None,
            "atualizado_em": laudo.atualizado_em.isoformat() if laudo.atualizado_em else "",
        }
    )
    return payload


def _rebase_urls_anexos_cliente(payload: Any, *, laudo_id: int) -> Any:
    if isinstance(payload, dict):
        anexos = payload.get("anexos")
        if isinstance(anexos, list):
            for anexo in anexos:
                if not isinstance(anexo, dict):
                    continue
                try:
                    anexo_id = int(anexo.get("id") or 0)
                except (TypeError, ValueError):
                    anexo_id = 0
                if anexo_id > 0:
                    anexo["url"] = f"/cliente/api/mesa/laudos/{int(laudo_id)}/anexos/{anexo_id}"

        for valor in payload.values():
            _rebase_urls_anexos_cliente(valor, laudo_id=laudo_id)
        return payload

    if isinstance(payload, list):
        for item in payload:
            _rebase_urls_anexos_cliente(item, laudo_id=laudo_id)

    return payload


def _resumo_empresa_cliente(banco: Session, usuario: Usuario) -> dict[str, Any]:
    empresa = _empresa_usuario(banco, usuario)
    limites = empresa.obter_limites(banco)
    plano_atual = str(empresa.plano_ativo or "")
    total_usuarios = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == empresa.id,
                filtro_usuarios_gerenciaveis_cliente(),
            )
        )
        or 0
    )
    total_laudos = banco.scalar(select(func.count(Laudo.id)).where(Laudo.empresa_id == empresa.id)) or 0
    laudos_mes_atual = contar_laudos_mes(banco, int(empresa.id))
    admins_cliente = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == empresa.id,
            Usuario.nivel_acesso == int(NivelAcesso.ADMIN_CLIENTE),
        )
    ) or 0
    inspetores = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == empresa.id,
            Usuario.nivel_acesso == int(NivelAcesso.INSPETOR),
        )
    ) or 0
    revisores = banco.scalar(
        select(func.count(Usuario.id)).where(
            Usuario.empresa_id == empresa.id,
            Usuario.nivel_acesso == int(NivelAcesso.REVISOR),
        )
    ) or 0
    capacidade = _avaliar_capacidade_empresa(
        plano_atual=plano_atual,
        total_usuarios=int(total_usuarios),
        usuarios_limite=limites.usuarios_max,
        laudos_mes_atual=int(laudos_mes_atual),
        laudos_limite=limites.laudos_mes,
    )
    planos_catalogo = _catalogo_planos_cliente(banco, plano_atual)
    avisos_operacionais = _avisos_operacionais_empresa(
        empresa=empresa,
        usuarios_restantes=capacidade["usuarios_restantes"],
        usuarios_excedente=int(capacidade["usuarios_excedente"]),
        usuarios_max=limites.usuarios_max,
        laudos_restantes=capacidade["laudos_restantes"],
        laudos_excedente=int(capacidade["laudos_excedente"]),
        laudos_mes_limite=limites.laudos_mes,
        laudos_mes_atual=int(laudos_mes_atual),
        plano_sugerido=capacidade["plano_sugerido"],
    )
    saude_operacional = _resumo_saude_empresa_cliente(
        banco,
        empresa=empresa,
        usuarios_total=int(total_usuarios),
        admins_cliente=int(admins_cliente),
        inspetores=int(inspetores),
        revisores=int(revisores),
        capacidade_status=str(capacidade["capacidade_status"]),
        capacidade_tone=str(capacidade["capacidade_tone"]),
        laudos_mes_atual=int(laudos_mes_atual),
    )

    return {
        "id": int(empresa.id),
        "nome_fantasia": str(empresa.nome_fantasia or ""),
        "cnpj": str(empresa.cnpj or ""),
        "plano_ativo": plano_atual,
        "planos_disponiveis": [item.value for item in PlanoEmpresa],
        "planos_catalogo": planos_catalogo,
        "segmento": str(empresa.segmento or ""),
        "cidade_estado": str(empresa.cidade_estado or ""),
        "nome_responsavel": str(empresa.nome_responsavel or ""),
        "observacoes": str(empresa.observacoes or ""),
        "status_bloqueio": bool(empresa.status_bloqueio),
        "laudos_mes_limite": limites.laudos_mes,
        "usuarios_max": limites.usuarios_max,
        "upload_doc": bool(limites.upload_doc),
        "deep_research": bool(limites.deep_research),
        "mensagens_processadas": int(empresa.mensagens_processadas or 0),
        "laudos_mes_atual": int(laudos_mes_atual),
        "laudos_restantes": capacidade["laudos_restantes"],
        "laudos_excedente": int(capacidade["laudos_excedente"]),
        "laudos_percentual": capacidade["laudos_percentual"],
        "usuarios_em_uso": int(total_usuarios),
        "usuarios_restantes": capacidade["usuarios_restantes"],
        "usuarios_excedente": int(capacidade["usuarios_excedente"]),
        "usuarios_percentual": capacidade["usuarios_percentual"],
        "uso_percentual": capacidade["capacidade_percentual"],
        "capacidade_status": capacidade["capacidade_status"],
        "capacidade_tone": capacidade["capacidade_tone"],
        "capacidade_badge": capacidade["capacidade_badge"],
        "capacidade_acao": capacidade["capacidade_acao"],
        "capacidade_gargalo": capacidade["capacidade_gargalo"],
        "plano_sugerido": capacidade["plano_sugerido"],
        "plano_sugerido_motivo": capacidade["plano_sugerido_motivo"],
        "avisos_operacionais": avisos_operacionais,
        "saude_operacional": saude_operacional,
        "total_usuarios": int(total_usuarios),
        "total_laudos": int(total_laudos),
        "admins_cliente": int(admins_cliente),
        "inspetores": int(inspetores),
        "revisores": int(revisores),
    }


def _listar_laudos_chat_usuario(banco: Session, usuario: Usuario) -> list[dict[str, Any]]:
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
            )
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(40)
        ).all()
    )
    return [_serializar_laudo_chat(banco, laudo) for laudo in laudos]


def _listar_laudos_mesa_empresa(banco: Session, usuario: Usuario) -> list[dict[str, Any]]:
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(Laudo.empresa_id == usuario.empresa_id)
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(60)
        ).all()
    )
    laudo_ids = [int(laudo.id) for laudo in laudos]
    pendencias_abertas = _mapa_contagem_por_laudo(
        banco,
        laudo_ids=laudo_ids,
        tipo=TipoMensagem.HUMANO_ENG.value,
        apenas_nao_lidas=True,
    )
    whispers_nao_lidos = _mapa_contagem_por_laudo(
        banco,
        laudo_ids=laudo_ids,
        tipo=TipoMensagem.HUMANO_INSP.value,
        apenas_nao_lidas=True,
    )
    return [
        _serializar_laudo_mesa(
            banco,
            laudo,
            pendencias_abertas=pendencias_abertas.get(int(laudo.id), 0),
            whispers_nao_lidos=whispers_nao_lidos.get(int(laudo.id), 0),
        )
        for laudo in laudos
    ]


def _bootstrap_cliente(banco: Session, usuario: Usuario) -> dict[str, Any]:
    usuarios = list(
        banco.scalars(
            select(Usuario)
            .where(
                Usuario.empresa_id == usuario.empresa_id,
                filtro_usuarios_gerenciaveis_cliente(),
            )
            .order_by(Usuario.nivel_acesso.desc(), Usuario.nome_completo.asc())
        ).all()
    )
    return {
        "empresa": _resumo_empresa_cliente(banco, usuario),
        "usuarios": [_serializar_usuario_cliente(item) for item in usuarios],
        "chat": {
            "tipos_template": TIPOS_TEMPLATE_VALIDOS,
            "laudos": _listar_laudos_chat_usuario(banco, usuario),
        },
        "mesa": {
            "laudos": _listar_laudos_mesa_empresa(banco, usuario),
        },
        "auditoria": {
            "itens": [
                serializar_registro_auditoria(item)
                for item in listar_auditoria_empresa(banco, empresa_id=int(usuario.empresa_id))
            ]
        },
    }


def _registrar_auditoria_cliente_segura(
    banco: Session,
    *,
    empresa_id: int,
    ator_usuario_id: int | None,
    acao: str,
    resumo: str,
    detalhe: str = "",
    alvo_usuario_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    registrar_auditoria_empresa(
        banco,
        empresa_id=empresa_id,
        ator_usuario_id=ator_usuario_id,
        acao=acao,
        resumo=resumo,
        detalhe=detalhe,
        alvo_usuario_id=alvo_usuario_id,
        payload=payload,
    )


def _payload_json_resposta(resposta: Any) -> dict[str, Any]:
    if not isinstance(resposta, JSONResponse):
        return {}
    try:
        bruto = resposta.body.decode("utf-8")
        payload = json.loads(bruto or "{}")
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _resumir_texto_auditoria(texto: str, *, limite: int = 160) -> str:
    valor = " ".join(str(texto or "").split())
    if len(valor) <= limite:
        return valor
    return f"{valor[: limite - 3].rstrip()}..."


def _titulo_laudo_cliente(banco: Session, *, empresa_id: int, laudo_id: int) -> str:
    laudo = banco.get(Laudo, int(laudo_id))
    if laudo is None or int(getattr(laudo, "empresa_id", 0) or 0) != int(empresa_id):
        return f"Laudo #{laudo_id}"
    payload = serializar_card_laudo(banco, laudo)
    return str(payload.get("titulo") or f"Laudo #{laudo_id}")


@roteador_cliente.get("/", include_in_schema=False)
async def raiz_cliente(
    request: Request,
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.get("/login", response_class=HTMLResponse)
async def tela_login_cliente(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    usuario = obter_usuario_html(request, banco)
    if usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)
    return _render_login_cliente(request)


@roteador_cliente.post("/login")
async def processar_login_cliente(
    request: Request,
    email: str = Form(default=""),
    senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    lembrar: bool = Form(default=False),
    banco: Session = Depends(obter_banco),
):
    email_normalizado = (email or "").strip().lower()
    senha = senha or ""

    if not email_normalizado or not senha:
        return _render_login_cliente(
            request,
            erro="Preencha e-mail e senha.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not validar_csrf_cliente(request, csrf_token):
        return _render_login_cliente(
            request,
            erro="Requisição inválida.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))
    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            usuario.incrementar_tentativa_falha()
            banco.commit()
        return _render_login_cliente(
            request,
            erro="Credenciais inválidas.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return _render_login_cliente(
            request,
            erro=_mensagem_portal_correto(usuario),
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return _render_login_cliente(
            request,
            erro="Acesso bloqueado. Contate o administrador da empresa.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    token_anterior = obter_dados_sessao_portal(request.session, portal=PORTAL_CLIENTE).get("token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/cliente/trocar-senha", status_code=status.HTTP_303_SEE_OTHER)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_CLIENTE,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=_usuario_nome(usuario),
    )
    token_csrf = secrets.token_urlsafe(32)
    request.session[CHAVE_CSRF_CLIENTE] = token_csrf
    request.session["csrf_token"] = token_csrf

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning("Falha ao registrar sucesso de login do admin-cliente | usuario_id=%s", usuario.id, exc_info=True)

    banco.commit()
    logger.info("Login admin-cliente | usuario_id=%s | empresa_id=%s", usuario.id, usuario.empresa_id)
    return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.get("/trocar-senha", response_class=HTMLResponse)
async def tela_troca_senha_cliente(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)
    return _render_troca_senha(request)


@roteador_cliente.post("/trocar-senha")
async def processar_troca_senha_cliente(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request, csrf_token):
        return _render_troca_senha(request, erro="Requisição inválida.", status_code=status.HTTP_400_BAD_REQUEST)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, erro=erro_validacao, status_code=status.HTTP_400_BAD_REQUEST)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, erro="Senha temporária inválida.", status_code=status.HTTP_401_UNAUTHORIZED)

    lembrar = bool(request.session.get(CHAVE_TROCA_SENHA_LEMBRAR, False))
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    banco.commit()

    _limpar_fluxo_troca_senha(request)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_CLIENTE,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=_usuario_nome(usuario),
    )
    token_csrf = secrets.token_urlsafe(32)
    request.session[CHAVE_CSRF_CLIENTE] = token_csrf
    request.session["csrf_token"] = token_csrf

    logger.info("Troca obrigatória de senha concluída | admin_cliente_id=%s", usuario.id)
    return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.post("/logout")
async def logout_cliente(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not validar_csrf_cliente(request, csrf_token):
        return _redirect_login_cliente()

    token = obter_dados_sessao_portal(request.session, portal=PORTAL_CLIENTE).get("token")
    encerrar_sessao(token)
    request.session.clear()
    return _redirect_login_cliente()


@roteador_cliente.get("/painel", response_class=HTMLResponse)
async def painel_cliente(
    request: Request,
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
    banco: Session = Depends(obter_banco),
):
    if not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return _redirect_login_cliente()

    empresa = _empresa_usuario(banco, usuario)
    return _render_template(
        request,
        "cliente_portal.html",
        {
            "usuario": usuario,
            "empresa": empresa,
        },
    )


@roteador_cliente.get("/api/bootstrap")
async def api_bootstrap_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return JSONResponse(_bootstrap_cliente(banco, usuario))


@roteador_cliente.get("/api/empresa/resumo")
async def api_empresa_resumo_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return JSONResponse(_resumo_empresa_cliente(banco, usuario))


@roteador_cliente.get("/api/auditoria")
async def api_auditoria_cliente(
    limite: int = Query(default=12, ge=1, le=50),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    itens = [
        serializar_registro_auditoria(item)
        for item in listar_auditoria_empresa(banco, empresa_id=int(usuario.empresa_id), limite=limite)
    ]
    return JSONResponse({"itens": itens})


@roteador_cliente.patch("/api/empresa/plano", responses=RESPOSTAS_PLANO_CLIENTE)
async def api_alterar_plano_cliente(
    dados: DadosPlanoCliente,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    empresa_atual = _empresa_usuario(banco, usuario)
    plano_anterior = PlanoEmpresa.normalizar(empresa_atual.plano_ativo)
    comparativo = _comparativo_plano_cliente(banco, plano_atual=plano_anterior, plano_destino=dados.plano)

    try:
        alterar_plano(banco, int(usuario.empresa_id), dados.plano)
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
    logger.info(
        "Plano alterado pelo admin-cliente | empresa_id=%s | usuario_id=%s | plano=%s",
        usuario.empresa_id,
        usuario.id,
        dados.plano,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="plano_alterado",
        resumo=f"Plano alterado de {plano_anterior} para {comparativo['plano']}.",
        detalhe=f"Impacto esperado: {comparativo['resumo_impacto']}. Alteração imediata feita pelo portal admin-cliente.",
        payload={
            "plano_anterior": plano_anterior,
            "plano_novo": comparativo["plano"],
            "movimento": comparativo["movimento"],
            "impacto_resumido": comparativo["resumo_impacto"],
            "delta_usuarios": comparativo["delta_usuarios"],
            "delta_laudos": comparativo["delta_laudos"],
            "upload_doc": comparativo["upload_doc"],
            "deep_research": comparativo["deep_research"],
        },
    )
    return JSONResponse({"success": True, "empresa": _resumo_empresa_cliente(banco, usuario)})


@roteador_cliente.post("/api/empresa/plano/interesse", responses=RESPOSTAS_PLANO_CLIENTE)
async def api_registrar_interesse_plano_cliente(
    dados: DadosInteressePlanoCliente,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    empresa = _empresa_usuario(banco, usuario)
    plano_atual = PlanoEmpresa.normalizar(empresa.plano_ativo)
    comparativo = _comparativo_plano_cliente(banco, plano_atual=plano_atual, plano_destino=dados.plano)
    origem = str(dados.origem or "admin").strip().lower()

    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="plano_interesse_registrado",
        resumo=f"Interesse registrado em migrar para {comparativo['plano']}.",
        detalhe=f"Origem {origem}. Impacto esperado: {comparativo['resumo_impacto']}.",
        payload={
            "plano_anterior": plano_atual,
            "plano_sugerido": comparativo["plano"],
            "origem": origem,
            "movimento": comparativo["movimento"],
            "impacto_resumido": comparativo["resumo_impacto"],
            "delta_usuarios": comparativo["delta_usuarios"],
            "delta_laudos": comparativo["delta_laudos"],
        },
    )
    return JSONResponse(
        {
            "success": True,
            "plano": comparativo,
            "empresa": _resumo_empresa_cliente(banco, usuario),
        }
    )


@roteador_cliente.get("/api/usuarios")
async def api_listar_usuarios_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    usuarios = list(
        banco.scalars(
            select(Usuario)
            .where(
                Usuario.empresa_id == usuario.empresa_id,
                filtro_usuarios_gerenciaveis_cliente(),
            )
            .order_by(Usuario.nivel_acesso.desc(), Usuario.nome_completo.asc())
        ).all()
    )
    return JSONResponse({"itens": [_serializar_usuario_cliente(item) for item in usuarios]})


@roteador_cliente.post(
    "/api/usuarios",
    status_code=status.HTTP_201_CREATED,
    responses=RESPOSTAS_USUARIO_CLIENTE,
)
async def api_criar_usuario_cliente(
    dados: DadosCriarUsuarioCliente,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    nivel_map = {
        "admin_cliente": NivelAcesso.ADMIN_CLIENTE,
        "inspetor": NivelAcesso.INSPETOR,
        "revisor": NivelAcesso.REVISOR,
    }
    try:
        novo, senha = criar_usuario_empresa(
            banco,
            empresa_id=int(usuario.empresa_id),
            nome=dados.nome,
            email=dados.email,
            nivel_acesso=nivel_map[dados.nivel_acesso],
            telefone=dados.telefone,
            crea=dados.crea,
        )
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
    logger.info(
        "Usuário criado pelo admin-cliente | empresa_id=%s | admin_cliente_id=%s | usuario_id=%s",
        usuario.empresa_id,
        usuario.id,
        novo.id,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        alvo_usuario_id=int(novo.id),
        acao="usuario_criado",
        resumo=f"Usuário {novo.nome} criado como {_ROLE_LABELS.get(int(novo.nivel_acesso), 'Usuário')}.",
        detalhe=f"Cadastro criado com e-mail {novo.email}.",
        payload={
            "email": novo.email,
            "nivel_acesso": int(novo.nivel_acesso),
        },
    )
    return JSONResponse(
        {
            "success": True,
            "usuario": _serializar_usuario_cliente(novo),
            "senha_temporaria": senha,
        },
        status_code=status.HTTP_201_CREATED,
    )


@roteador_cliente.patch("/api/usuarios/{usuario_id}", responses=RESPOSTAS_USUARIO_CLIENTE)
async def api_atualizar_usuario_cliente(
    usuario_id: int,
    dados: DadosAtualizarUsuarioCliente,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    try:
        atualizado = atualizar_usuario_empresa(
            banco,
            empresa_id=int(usuario.empresa_id),
            usuario_id=usuario_id,
            nome=dados.nome,
            email=dados.email,
            telefone=dados.telefone,
            crea=dados.crea,
        )
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        alvo_usuario_id=int(atualizado.id),
        acao="usuario_atualizado",
        resumo=f"Cadastro de {atualizado.nome} atualizado.",
        detalhe="Dados básicos do usuário foram editados pelo admin-cliente.",
        payload={
            "email": atualizado.email,
            "telefone": atualizado.telefone or "",
            "crea": atualizado.crea or "",
        },
    )
    return JSONResponse({"success": True, "usuario": _serializar_usuario_cliente(atualizado)})


@roteador_cliente.patch("/api/usuarios/{usuario_id}/bloqueio", responses=RESPOSTAS_BLOQUEIO_CLIENTE)
async def api_bloqueio_usuario_cliente(
    usuario_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    try:
        atualizado = alternar_bloqueio_usuario_empresa(banco, int(usuario.empresa_id), usuario_id)
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        alvo_usuario_id=int(atualizado.id),
        acao="usuario_bloqueio_alterado",
        resumo=f"{atualizado.nome} {'desbloqueado' if atualizado.ativo else 'bloqueado'} no portal.",
        detalhe="Status operacional alterado pelo admin-cliente.",
        payload={"ativo": bool(atualizado.ativo)},
    )
    return JSONResponse({"success": True, "usuario": _serializar_usuario_cliente(atualizado)})


@roteador_cliente.post("/api/usuarios/{usuario_id}/resetar-senha", responses=RESPOSTAS_BLOQUEIO_CLIENTE)
async def api_resetar_senha_usuario_cliente(
    usuario_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    try:
        senha = resetar_senha_usuario_empresa(banco, int(usuario.empresa_id), usuario_id)
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
    logger.info(
        "Senha resetada pelo admin-cliente | empresa_id=%s | admin_cliente_id=%s | usuario_id=%s",
        usuario.empresa_id,
        usuario.id,
        usuario_id,
    )
    usuario_resetado = banco.get(Usuario, int(usuario_id))
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        alvo_usuario_id=int(usuario_id),
        acao="senha_resetada",
        resumo=f"Senha temporária regenerada para {getattr(usuario_resetado, 'nome', f'Usuário #{usuario_id}')}.",
        detalhe="O próximo login exigirá nova troca de senha.",
        payload={"usuario_id": int(usuario_id)},
    )
    return JSONResponse({"success": True, "senha_temporaria": senha})


@roteador_cliente.get("/api/chat/status")
async def api_chat_status_cliente(
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    return await api_status_relatorio(request=request, usuario=usuario, banco=banco)


@roteador_cliente.get("/api/chat/laudos")
async def api_chat_laudos_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return JSONResponse({"itens": _listar_laudos_chat_usuario(banco, usuario)})


@roteador_cliente.post("/api/chat/laudos")
async def api_chat_criar_laudo_cliente(
    request: Request,
    tipo_template: str = Form(default="padrao"),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await api_iniciar_relatorio(
        request=request,
        tipo_template=tipo_template,
        tipotemplate=None,
        usuario=usuario,
        banco=banco,
    )
    payload = _payload_json_resposta(resposta)
    laudo_id = int(payload.get("laudo_id") or 0)
    if laudo_id > 0:
        _registrar_auditoria_cliente_segura(
            banco,
            empresa_id=int(usuario.empresa_id),
            ator_usuario_id=int(usuario.id),
            acao="chat_laudo_criado",
            resumo=f"{_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)} criado no chat.",
            detalhe=f"Template {str(tipo_template or 'padrao').strip() or 'padrao'} iniciado pelo admin-cliente.",
            payload={"laudo_id": laudo_id, "tipo_template": str(tipo_template or 'padrao').strip() or 'padrao'},
        )
    return resposta


@roteador_cliente.get("/api/chat/laudos/{laudo_id}/mensagens", responses=RESPOSTAS_CHAT_CLIENTE)
async def api_chat_mensagens_cliente(
    laudo_id: int,
    request: Request,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=80, ge=20, le=200),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    payload = await obter_mensagens_laudo(
        laudo_id=laudo_id,
        request=request,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload)


@roteador_cliente.post(
    "/api/chat/upload_doc",
    responses={
        200: {"description": "Documento processado com sucesso."},
        403: {"description": "Upload documental indisponível para a empresa."},
        413: {"description": "Arquivo acima do limite."},
        415: {"description": "Tipo de arquivo não suportado."},
        422: {"description": "Não foi possível extrair texto do documento."},
    },
)
async def api_chat_upload_doc_cliente(
    request: Request,
    arquivo: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    return await rota_upload_doc(
        request=request,
        arquivo=arquivo,
        usuario=usuario,
        banco=banco,
    )


@roteador_cliente.post("/api/chat/mensagem")
async def api_chat_enviar_cliente(
    dados: DadosChat,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await rota_chat(
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    laudo_id = int(dados.laudo_id or 0)
    if laudo_id > 0:
        _registrar_auditoria_cliente_segura(
            banco,
            empresa_id=int(usuario.empresa_id),
            ator_usuario_id=int(usuario.id),
            acao="chat_mensagem_enviada",
            resumo=f"Mensagem enviada no chat de {_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)}.",
            detalhe=_resumir_texto_auditoria(dados.mensagem or "Mensagem operacional enviada pelo admin-cliente."),
            payload={
                "laudo_id": laudo_id,
                "setor": dados.setor,
                "modo": dados.modo,
                "referencia_mensagem_id": dados.referencia_mensagem_id,
            },
        )
    return resposta


@roteador_cliente.get("/api/chat/laudos/{laudo_id}/gate", responses=RESPOSTAS_GATE_CLIENTE)
async def api_chat_gate_cliente(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    return await api_obter_gate_qualidade_laudo(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )


@roteador_cliente.post(
    "/api/chat/laudos/{laudo_id}/finalizar",
    responses={
        **RESPOSTAS_CHAT_CLIENTE,
        400: {"description": "Laudo em estado inválido para finalização."},
        **RESPOSTA_GATE_QUALIDADE_REPROVADO,
    },
)
async def api_chat_finalizar_cliente(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await api_finalizar_relatorio(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="chat_laudo_finalizado",
        resumo=f"{_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)} finalizado no chat.",
        detalhe="O laudo foi encaminhado pelo portal admin-cliente.",
        payload={"laudo_id": int(laudo_id)},
    )
    return resposta


@roteador_cliente.post(
    "/api/chat/laudos/{laudo_id}/reabrir",
    responses={**RESPOSTAS_CHAT_CLIENTE, 400: {"description": "Laudo sem ajustes liberados para reabertura."}},
)
async def api_chat_reabrir_cliente(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await api_reabrir_laudo(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="chat_laudo_reaberto",
        resumo=f"{_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)} reaberto no chat.",
        detalhe="O admin-cliente voltou o laudo para continuidade operacional.",
        payload={"laudo_id": int(laudo_id)},
    )
    return resposta


@roteador_cliente.get("/api/mesa/laudos")
async def api_mesa_laudos_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return JSONResponse({"itens": _listar_laudos_mesa_empresa(banco, usuario)})


@roteador_cliente.get("/api/mesa/laudos/{laudo_id}/mensagens", responses=RESPOSTAS_MESA_CLIENTE)
async def api_mesa_mensagens_cliente(
    laudo_id: int,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    payload = await obter_historico_chat_revisor(
        laudo_id=laudo_id,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(_rebase_urls_anexos_cliente(payload, laudo_id=laudo_id))


@roteador_cliente.get("/api/mesa/laudos/{laudo_id}/completo", responses=RESPOSTAS_MESA_CLIENTE)
async def api_mesa_completo_cliente(
    laudo_id: int,
    incluir_historico: bool = Query(default=False),
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    resposta = await obter_laudo_completo(
        laudo_id=laudo_id,
        incluir_historico=incluir_historico,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
    )
    payload = _payload_json_resposta(resposta)
    return JSONResponse(
        _rebase_urls_anexos_cliente(payload, laudo_id=laudo_id),
        status_code=getattr(resposta, "status_code", 200),
    )


@roteador_cliente.get("/api/mesa/laudos/{laudo_id}/pacote", responses=RESPOSTAS_MESA_CLIENTE)
async def api_mesa_pacote_cliente(
    laudo_id: int,
    request: Request,
    limite_whispers: int = Query(default=80, ge=20, le=300),
    limite_pendencias: int = Query(default=80, ge=20, le=300),
    limite_revisoes: int = Query(default=10, ge=1, le=50),
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    resposta = await obter_pacote_mesa_laudo(
        laudo_id=laudo_id,
        request=request,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
        usuario=usuario,
        banco=banco,
    )
    payload = _payload_json_resposta(resposta)
    return JSONResponse(
        _rebase_urls_anexos_cliente(payload, laudo_id=laudo_id),
        status_code=getattr(resposta, "status_code", 200),
    )


@roteador_cliente.post(
    "/api/mesa/laudos/{laudo_id}/responder",
    responses={**RESPOSTAS_MESA_CLIENTE, 400: {"description": "Mensagem inválida."}},
)
async def api_mesa_responder_cliente(
    laudo_id: int,
    dados: DadosRespostaChat,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await responder_chat_campo(
        laudo_id=laudo_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="mesa_resposta_enviada",
        resumo=f"Resposta enviada na mesa de {_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)}.",
        detalhe=_resumir_texto_auditoria(dados.texto),
        payload={"laudo_id": int(laudo_id), "referencia_mensagem_id": dados.referencia_mensagem_id},
    )
    return resposta


@roteador_cliente.post(
    "/api/mesa/laudos/{laudo_id}/responder-anexo",
    responses=RESPOSTAS_MESA_CLIENTE_COM_ANEXO,
)
async def api_mesa_responder_anexo_cliente(
    laudo_id: int,
    request: Request,
    arquivo: UploadFile = File(...),
    texto: str = Form(default=""),
    referencia_mensagem_id: Annotated[InteiroOpcionalNullish, Form()] = None,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await responder_chat_campo_com_anexo(
        laudo_id=laudo_id,
        request=request,
        arquivo=arquivo,
        texto=texto,
        referencia_mensagem_id=referencia_mensagem_id,
        usuario=usuario,
        banco=banco,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="mesa_resposta_com_anexo",
        resumo=f"Anexo enviado na mesa de {_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)}.",
        detalhe=_resumir_texto_auditoria(texto or f"Arquivo {getattr(arquivo, 'filename', 'anexo')} enviado pelo admin-cliente."),
        payload={
            "laudo_id": int(laudo_id),
            "arquivo": str(getattr(arquivo, "filename", "") or ""),
            "referencia_mensagem_id": referencia_mensagem_id,
        },
    )
    return resposta


@roteador_cliente.patch(
    "/api/mesa/laudos/{laudo_id}/pendencias/{mensagem_id}",
    responses=RESPOSTAS_MESA_CLIENTE_COM_PENDENCIA,
)
async def api_mesa_pendencia_cliente(
    laudo_id: int,
    mensagem_id: int,
    dados: DadosPendenciaMesa,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await atualizar_pendencia_mesa_revisor(
        laudo_id=laudo_id,
        mensagem_id=mensagem_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="mesa_pendencia_atualizada",
        resumo=f"Pendência de {_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)} {'resolvida' if dados.lida else 'reaberta'}.",
        detalhe="A pendência foi atualizada pelo admin-cliente.",
        payload={"laudo_id": int(laudo_id), "mensagem_id": int(mensagem_id), "lida": bool(dados.lida)},
    )
    return resposta


@roteador_cliente.post(
    "/api/mesa/laudos/{laudo_id}/avaliar",
    responses={
        **RESPOSTAS_MESA_CLIENTE,
        400: {"description": "Ação inválida ou motivo obrigatório."},
    },
)
async def api_mesa_avaliar_cliente(
    laudo_id: int,
    dados: DadosMesaAvaliacaoCliente,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    resposta = await avaliar_laudo(
        laudo_id=laudo_id,
        request=request,
        acao=dados.acao,
        motivo=dados.motivo,
        csrf_token=request.headers.get("X-CSRF-Token", ""),
        usuario=usuario,
        banco=banco,
    )
    payload = _payload_json_resposta(resposta)
    acao_normalizada = str(payload.get("acao") or dados.acao or "").strip().lower()
    _registrar_auditoria_cliente_segura(
        banco,
        empresa_id=int(usuario.empresa_id),
        ator_usuario_id=int(usuario.id),
        acao="mesa_laudo_avaliado",
        resumo=f"{_titulo_laudo_cliente(banco, empresa_id=int(usuario.empresa_id), laudo_id=laudo_id)} {'aprovado' if acao_normalizada == 'aprovar' else 'devolvido'} pela mesa.",
        detalhe=_resumir_texto_auditoria(str(payload.get('motivo') or dados.motivo or "Avaliação registrada pelo admin-cliente.")),
        payload={"laudo_id": int(laudo_id), "acao": acao_normalizada or str(dados.acao or ""), "motivo": str(payload.get("motivo") or dados.motivo or "")},
    )
    return resposta


@roteador_cliente.post("/api/mesa/laudos/{laudo_id}/marcar-whispers-lidos", responses=RESPOSTAS_MESA_CLIENTE)
async def api_mesa_marcar_whispers_lidos_cliente(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    return await marcar_whispers_lidos(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )


@roteador_cliente.get(
    "/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}",
    responses=RESPOSTAS_MESA_CLIENTE_DOWNLOAD,
)
async def api_mesa_baixar_anexo_cliente(
    laudo_id: int,
    anexo_id: int,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return await baixar_anexo_mesa_revisor(
        laudo_id=laudo_id,
        anexo_id=anexo_id,
        usuario=usuario,
        banco=banco,
    )
