from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fpdf import FPDF
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.domains.mesa.attachments import (
    serializar_anexos_mesa,
    texto_mensagem_mesa_visivel,
)
from app.domains.revisor.common import CHAVE_CSRF_REVISOR, _contexto_base
from app.domains.revisor.templates_laudo import roteador_templates_laudo
from app.shared.database import (
    AnexoMesa,
    Laudo,
    MensagemLaudo,
    NivelAcesso,
    TipoMensagem,
    Usuario,
)
from app.shared.security import (
    PORTAL_REVISOR,
    limpar_sessao_portal,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
)
from nucleo.inspetor.referencias_mensagem import extrair_referencia_do_texto

logger = logging.getLogger("app.domains.revisor.routes")

roteador_revisor = APIRouter(prefix="/revisao")
templates = Jinja2Templates(directory="templates")
PORTAL_TROCA_SENHA_REVISOR = "revisor"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"
RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR = {404: {"description": "Laudo não encontrado."}}
roteador_revisor.include_router(roteador_templates_laudo)


class DadosRespostaChat(BaseModel):
    texto: str = Field(..., min_length=1, max_length=8000)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosWhisper(BaseModel):
    laudo_id: int = Field(..., ge=1)
    destinatario_id: int = Field(..., ge=1)
    mensagem: str = Field(..., min_length=1, max_length=4000)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosPendenciaMesa(BaseModel):
    lida: StrictBool = True

    model_config = ConfigDict(extra="ignore")


class DadosLaudoEstruturado(BaseModel):
    nr_tipo: str
    dados_json: dict[str, Any]
    historico: list[dict[str, Any]]


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_data_utc(data: datetime | None) -> datetime | None:
    if data is None:
        return None
    if data.tzinfo is None:
        return data.replace(tzinfo=timezone.utc)
    return data.astimezone(timezone.utc)


def _formatar_data_local(valor: datetime | None, *, incluir_ano: bool = True) -> str:
    data_utc = _normalizar_data_utc(valor)
    if data_utc is None:
        return "-"
    formato = "%d/%m/%Y %H:%M" if incluir_ano else "%d/%m %H:%M"
    return data_utc.astimezone().strftime(formato)


def _gerar_pdf_placeholder_schemathesis(caminho_saida: str, titulo: str) -> None:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font("helvetica", "B", 14)
    pdf.multi_cell(0, 8, titulo.encode("latin-1", errors="replace").decode("latin-1"))
    pdf.ln(2)
    pdf.set_font("helvetica", "", 10)
    pdf.multi_cell(
        0,
        6,
        "Placeholder de contrato automatizado gerado no modo Schemathesis.",
    )
    pdf.output(caminho_saida)


def _resumo_tempo_em_campo(inicio: datetime | None) -> tuple[str, str]:
    inicio_utc = _normalizar_data_utc(inicio)
    if inicio_utc is None:
        return ("Sem referência", "sla-ok")

    delta = _agora_utc() - inicio_utc
    if delta.total_seconds() < 0:
        delta = timedelta(0)

    total_minutos = int(delta.total_seconds() // 60)
    dias, resto_minutos = divmod(total_minutos, 24 * 60)
    horas, minutos = divmod(resto_minutos, 60)

    if dias > 0:
        label = f"{dias}d {horas}h"
    elif horas > 0:
        label = f"{horas}h {minutos}m"
    else:
        label = f"{max(minutos, 1)}m"

    if total_minutos >= 48 * 60:
        status = "sla-critico"
    elif total_minutos >= 24 * 60:
        status = "sla-atencao"
    else:
        status = "sla-ok"

    return (label, status)


def _minutos_em_campo(inicio: datetime | None) -> int:
    inicio_utc = _normalizar_data_utc(inicio)
    if inicio_utc is None:
        return 0
    delta = _agora_utc() - inicio_utc
    if delta.total_seconds() < 0:
        return 0
    return int(delta.total_seconds() // 60)


def _normalizar_termo_busca(valor: str) -> str:
    texto = " ".join((valor or "").strip().split())
    if not texto:
        return ""
    return texto[:80]


def _texto_limpo_mensagem(
    conteudo: str,
    *,
    anexos: list[AnexoMesa] | None = None,
) -> str:
    return texto_mensagem_mesa_visivel(conteudo, anexos=anexos)


def _nome_resolvedor_mensagem(mensagem: MensagemLaudo) -> str:
    if not mensagem.resolvida_por_id:
        return ""

    if mensagem.resolvida_por is not None:
        return (
            getattr(mensagem.resolvida_por, "nome", None) or getattr(mensagem.resolvida_por, "nome_completo", None) or f"Usuário #{mensagem.resolvida_por_id}"
        )

    return f"Usuário #{mensagem.resolvida_por_id}"


def _contar_mensagens_nao_lidas_por_laudo(
    banco: Session,
    *,
    laudo_ids: list[int],
    tipo: TipoMensagem,
) -> dict[int, int]:
    ids_validos = [int(item) for item in laudo_ids if int(item or 0) > 0]
    if not ids_validos:
        return {}

    linhas = (
        banco.query(MensagemLaudo.laudo_id, func.count(MensagemLaudo.id))
        .filter(
            MensagemLaudo.laudo_id.in_(ids_validos),
            MensagemLaudo.tipo == tipo.value,
            MensagemLaudo.lida.is_(False),
        )
        .group_by(MensagemLaudo.laudo_id)
        .all()
    )
    return {int(laudo_id): int(total or 0) for laudo_id, total in linhas if int(laudo_id or 0) > 0}


def _marcar_whispers_lidos_laudo(banco: Session, *, laudo_id: int) -> int:
    return int(
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
            MensagemLaudo.lida.is_(False),
        )
        .update({"lida": True}, synchronize_session=False)
    )


def _registrar_mensagem_revisor(
    banco: Session,
    *,
    laudo_id: int,
    usuario_id: int,
    tipo: TipoMensagem,
    conteudo: str,
) -> MensagemLaudo:
    msg = MensagemLaudo(
        laudo_id=laudo_id,
        remetente_id=usuario_id,
        tipo=tipo.value,
        conteudo=conteudo.strip(),
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(msg)
    return msg


def _serializar_mensagem(m: MensagemLaudo, com_data_longa: bool = False) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(m.conteudo)
    anexos_payload = serializar_anexos_mesa(getattr(m, "anexos_mesa", None), portal="revisao")
    payload: dict[str, Any] = {
        "id": m.id,
        "tipo": m.tipo,
        "texto": texto_mensagem_mesa_visivel(m.conteudo, anexos=getattr(m, "anexos_mesa", None)) if m.is_whisper else texto_limpo,
        "data": (m.criado_em.strftime("%d/%m/%Y %H:%M") if com_data_longa else m.criado_em.strftime("%d/%m %H:%M")),
        "is_whisper": m.is_whisper,
        "remetente_id": m.remetente_id,
    }
    if referencia_mensagem_id:
        payload["referencia_mensagem_id"] = referencia_mensagem_id
    if anexos_payload:
        payload["anexos"] = anexos_payload
    return payload


def _listar_mensagens_laudo_paginadas(
    banco: Session,
    *,
    laudo_id: int,
    cursor: int | None,
    limite: int,
    com_data_longa: bool = False,
) -> dict[str, Any]:
    consulta = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id)
    consulta = consulta.options(selectinload(MensagemLaudo.anexos_mesa))
    if cursor:
        consulta = consulta.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))

    return {
        "itens": [_serializar_mensagem(m, com_data_longa=com_data_longa) for m in mensagens_pagina],
        "tem_mais": tem_mais,
        "cursor_proximo": mensagens_pagina[0].id if tem_mais and mensagens_pagina else None,
    }


def _validar_destinatario_whisper(
    banco: Session,
    *,
    destinatario_id: int,
    empresa_id: int,
    laudo: Laudo,
) -> Usuario:
    destinatario = banco.get(Usuario, destinatario_id)
    if not destinatario or destinatario.empresa_id != empresa_id:
        raise HTTPException(status_code=404, detail="Destinatário inválido.")

    if destinatario.nivel_acesso != int(NivelAcesso.INSPETOR):
        raise HTTPException(status_code=400, detail="Destinatário deve ser um inspetor.")

    if laudo.usuario_id and destinatario.id != laudo.usuario_id:
        raise HTTPException(
            status_code=400,
            detail="Destinatário não corresponde ao inspetor responsável pelo laudo.",
        )

    return destinatario


async def _notificar_inspetor_sse(
    *,
    inspetor_id: int | None,
    laudo_id: int,
    tipo: str,
    texto: str,
    mensagem_id: int | None = None,
    referencia_mensagem_id: int | None = None,
    de_usuario_id: int | None = None,
    de_nome: str = "",
) -> None:
    from app.domains.revisor.realtime import notificar_inspetor_sse

    await notificar_inspetor_sse(
        inspetor_id=inspetor_id,
        laudo_id=laudo_id,
        tipo=tipo,
        texto=texto,
        mensagem_id=mensagem_id,
        referencia_mensagem_id=referencia_mensagem_id,
        de_usuario_id=de_usuario_id,
        de_nome=de_nome,
    )


def _render_login_revisor(
    request: Request,
    *,
    erro: str = "",
    status_code: int = status.HTTP_200_OK,
) -> HTMLResponse:
    contexto = _contexto_base(request)
    if erro:
        contexto["erro"] = erro
    return templates.TemplateResponse(request, "login_revisor.html", contexto, status_code=status_code)


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    limpar_sessao_portal(request.session, portal=PORTAL_REVISOR)
    request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_REVISOR
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Usuario | None:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_REVISOR:
        return None

    usuario_id = request.session.get(CHAVE_TROCA_SENHA_UID)
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        _limpar_fluxo_troca_senha(request)
        return None

    usuario = banco.get(Usuario, usuario_id_int)
    if not usuario:
        _limpar_fluxo_troca_senha(request)
        return None
    if not usuario_tem_acesso_portal(usuario, PORTAL_REVISOR):
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


def _render_troca_senha_revisor(
    request: Request,
    *,
    erro: str = "",
    status_code: int = status.HTTP_200_OK,
) -> HTMLResponse:
    contexto = _contexto_base(request)
    contexto.update(
        {
            "erro": erro,
            "titulo_pagina": "Troca Obrigatória de Senha",
            "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao painel de revisão.",
            "acao_form": "/revisao/trocar-senha",
            "rota_login": "/revisao/login",
        }
    )
    return templates.TemplateResponse(request, "trocar_senha.html", contexto, status_code=status_code)


__all__ = [
    "CHAVE_CSRF_REVISOR",
    "CHAVE_TROCA_SENHA_LEMBRAR",
    "CHAVE_TROCA_SENHA_PORTAL",
    "CHAVE_TROCA_SENHA_UID",
    "DadosLaudoEstruturado",
    "DadosPendenciaMesa",
    "DadosRespostaChat",
    "DadosWhisper",
    "PORTAL_TROCA_SENHA_REVISOR",
    "RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR",
    "_agora_utc",
    "_contar_mensagens_nao_lidas_por_laudo",
    "_formatar_data_local",
    "_gerar_pdf_placeholder_schemathesis",
    "_iniciar_fluxo_troca_senha",
    "_limpar_fluxo_troca_senha",
    "_listar_mensagens_laudo_paginadas",
    "_marcar_whispers_lidos_laudo",
    "_minutos_em_campo",
    "_nome_resolvedor_mensagem",
    "_normalizar_termo_busca",
    "_notificar_inspetor_sse",
    "_registrar_mensagem_revisor",
    "_render_login_revisor",
    "_render_troca_senha_revisor",
    "_resumo_tempo_em_campo",
    "_serializar_mensagem",
    "_texto_limpo_mensagem",
    "_usuario_pendente_troca_senha",
    "_validar_destinatario_whisper",
    "_validar_nova_senha",
    "logger",
    "roteador_revisor",
    "templates",
]
