# ==========================================
# TARIEL CONTROL TOWER — ROTAS_REVISOR.PY
# Responsabilidade: Mesa Avaliadora + Whisper System (Engenharia ↔ Inspetor)
# ==========================================

from __future__ import annotations

import json
import logging
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.shared.database import (
    Laudo,
    MensagemLaudo,
    NivelAcesso,
    SessaoLocal,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from nucleo.template_laudos import (
    gerar_preview_pdf_template,
    mapeamento_cbmgo_padrao,
    normalizar_codigo_template,
    normalizar_mapeamento_campos,
    salvar_pdf_template_base,
)
from nucleo.inspetor.referencias_mensagem import (
    compor_texto_com_referencia,
    extrair_referencia_do_texto,
)
from app.shared.security import (
    PORTAL_REVISOR,
    SESSOES_ATIVAS,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    exigir_revisor,
    limpar_sessao_portal,
    obter_dados_sessao_portal,
    obter_usuario_html,
    token_esta_ativo,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)

logger = logging.getLogger(__name__)

roteador_revisor = APIRouter(prefix="/revisao")
templates = Jinja2Templates(directory="templates")
PORTAL_TROCA_SENHA_REVISOR = "revisor"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"
CHAVE_CSRF_REVISOR = "csrf_token_revisor"


# ── Schemas ───────────────────────────────────────────────────────────────────


class DadosRespostaChat(BaseModel):
    texto: str = Field(..., min_length=1, max_length=8000)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosWhisper(BaseModel):
    laudo_id: int
    destinatario_id: int
    mensagem: str = Field(..., min_length=1, max_length=4000)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class DadosLaudoEstruturado(BaseModel):
    nr_tipo: str
    dados_json: dict[str, Any]
    historico: list[dict[str, Any]]


class DadosPreviewTemplateLaudo(BaseModel):
    laudo_id: int | None = Field(default=None, ge=1)
    dados_formulario: dict[str, Any] | None = Field(default=None)

    model_config = ConfigDict(extra="ignore")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_data_utc(data: datetime | None) -> datetime | None:
    if data is None:
        return None
    if data.tzinfo is None:
        return data.replace(tzinfo=timezone.utc)
    return data.astimezone(timezone.utc)


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


def _contexto_base(request: Request) -> dict[str, Any]:
    if CHAVE_CSRF_REVISOR not in request.session:
        request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    return {
        "request": request,
        "csrf_token": request.session[CHAVE_CSRF_REVISOR],
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
    }


def _validar_csrf(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get(CHAVE_CSRF_REVISOR) or request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def _obter_laudo_empresa(banco: Session, laudo_id: int, empresa_id: int) -> Laudo:
    laudo = banco.get(Laudo, laudo_id)
    if not laudo or laudo.empresa_id != empresa_id:
        raise HTTPException(status_code=404, detail="Laudo não encontrado.")
    return laudo


def _obter_template_laudo_empresa(
    banco: Session,
    *,
    template_id: int,
    empresa_id: int,
) -> TemplateLaudo:
    template = banco.get(TemplateLaudo, template_id)
    if not template or template.empresa_id != empresa_id:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    return template


def _serializar_template_laudo(item: TemplateLaudo, incluir_mapeamento: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": item.id,
        "nome": item.nome,
        "codigo_template": item.codigo_template,
        "versao": item.versao,
        "ativo": bool(item.ativo),
        "observacoes": item.observacoes or "",
        "criado_em": item.criado_em.isoformat() if item.criado_em else None,
        "atualizado_em": item.atualizado_em.isoformat() if item.atualizado_em else None,
        "criado_por_id": item.criado_por_id,
    }
    if incluir_mapeamento:
        payload["mapeamento_campos_json"] = item.mapeamento_campos_json or {}
    return payload


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
    payload: dict[str, Any] = {
        "id": m.id,
        "tipo": m.tipo,
        "texto": texto_limpo,
        "data": (m.criado_em.strftime("%d/%m/%Y %H:%M") if com_data_longa else m.criado_em.strftime("%d/%m %H:%M")),
        "is_whisper": m.is_whisper,
        "remetente_id": m.remetente_id,
    }
    if referencia_mensagem_id:
        payload["referencia_mensagem_id"] = referencia_mensagem_id
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
    if cursor:
        consulta = consulta.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))

    return {
        "itens": [
            _serializar_mensagem(m, com_data_longa=com_data_longa)
            for m in mensagens_pagina
        ],
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
    if not inspetor_id:
        return

    try:
        from app.domains.chat.routes import inspetor_notif_manager

        payload = {
            "tipo": (tipo or "mensagem_eng").strip().lower(),
            "laudo_id": int(laudo_id),
            "mensagem_id": int(mensagem_id or 0) if mensagem_id else None,
            "referencia_mensagem_id": int(referencia_mensagem_id or 0) if referencia_mensagem_id else None,
            "de_usuario_id": int(de_usuario_id or 0) if de_usuario_id else None,
            "de_nome": (de_nome or "Mesa Avaliadora").strip()[:120],
            "texto": (texto or "").strip()[:300],
            "timestamp": _agora_utc().isoformat(),
        }

        await inspetor_notif_manager.notificar(int(inspetor_id), payload)
    except Exception:
        logger.warning(
            "Falha ao notificar inspetor via SSE | inspetor_id=%s | laudo_id=%s",
            inspetor_id,
            laudo_id,
            exc_info=True,
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
    if int(usuario.nivel_acesso) < int(NivelAcesso.REVISOR):
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


# ── Telas HTML ────────────────────────────────────────────────────────────────


@roteador_revisor.get("/login", response_class=HTMLResponse)
async def tela_login_revisor(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    usuario = obter_usuario_html(request, banco)
    if usuario and usuario.nivel_acesso >= int(NivelAcesso.REVISOR):
        return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)

    return _render_login_revisor(request)


@roteador_revisor.get("/trocar-senha", response_class=HTMLResponse)
async def tela_troca_senha_revisor(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)
    return _render_troca_senha_revisor(request)


@roteador_revisor.post("/trocar-senha")
async def processar_troca_senha_revisor(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        return _render_troca_senha_revisor(
            request,
            erro="Requisição inválida.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha_revisor(request, erro=erro_validacao, status_code=status.HTTP_400_BAD_REQUEST)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha_revisor(
            request,
            erro="Senha temporária inválida.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

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
        portal=PORTAL_REVISOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Revisor #{usuario.id}",
    )
    request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    logger.info("Troca obrigatória de senha concluída | usuario_id=%s", usuario.id)
    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post("/login")
async def processar_login_revisor(
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
        return _render_login_revisor(
            request,
            erro="Preencha e-mail e senha.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not _validar_csrf(request, csrf_token):
        return _render_login_revisor(
            request,
            erro="Requisição inválida.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))

    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            usuario.incrementar_tentativa_falha()
            banco.commit()

        return _render_login_revisor(
            request,
            erro="Credenciais inválidas.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if usuario.nivel_acesso < int(NivelAcesso.REVISOR):
        return _render_login_revisor(
            request,
            erro="Acesso negado. Use o portal correto para sua função.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return _render_login_revisor(
            request,
            erro="Acesso bloqueado. Contate o suporte.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    token_anterior = obter_dados_sessao_portal(
        request.session,
        portal=PORTAL_REVISOR,
    ).get("token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/revisao/trocar-senha", status_code=status.HTTP_303_SEE_OTHER)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_REVISOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Revisor #{usuario.id}",
    )
    request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning(
                "Falha ao registrar sucesso de login revisor | usuario_id=%s",
                usuario.id,
                exc_info=True,
            )

    banco.commit()
    logger.info("Login revisor | usuario_id=%s | email=%s", usuario.id, email_normalizado)
    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post("/logout")
async def logout_revisor(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not _validar_csrf(request, csrf_token):
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)

    token = obter_dados_sessao_portal(request.session, portal=PORTAL_REVISOR).get("token")
    encerrar_sessao(token)
    limpar_sessao_portal(request.session, portal=PORTAL_REVISOR)
    request.session.pop(CHAVE_CSRF_REVISOR, None)
    return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.get("/painel", response_class=HTMLResponse)
async def painel_revisor(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    inspetores_empresa = (
        banco.query(Usuario)
        .filter(
            Usuario.empresa_id == usuario.empresa_id,
            Usuario.nivel_acesso == int(NivelAcesso.INSPETOR),
            Usuario.ativo.is_(True),
        )
        .order_by(Usuario.nome_completo.asc(), Usuario.id.asc())
        .all()
    )

    filtro_inspetor_id: int | None = None
    valor_filtro_bruto = (request.query_params.get("inspetor") or "").strip()
    if valor_filtro_bruto:
        try:
            valor_filtro = int(valor_filtro_bruto)
            if valor_filtro > 0:
                ids_inspetores = {item.id for item in inspetores_empresa}
                if valor_filtro in ids_inspetores:
                    filtro_inspetor_id = valor_filtro
        except ValueError:
            filtro_inspetor_id = None

    filtros_laudo: list[Any] = [Laudo.empresa_id == usuario.empresa_id]
    if filtro_inspetor_id is not None:
        filtros_laudo.append(Laudo.usuario_id == filtro_inspetor_id)

    filtro_busca = _normalizar_termo_busca(request.query_params.get("q") or "")
    if filtro_busca:
        padrao = f"%{filtro_busca}%"
        filtros_laudo.append(
            or_(
                Laudo.codigo_hash.ilike(padrao),
                Laudo.primeira_mensagem.ilike(padrao),
                Laudo.setor_industrial.ilike(padrao),
                Laudo.tipo_template.ilike(padrao),
            )
        )

    whispers_pendentes_db = (
        banco.query(MensagemLaudo)
        .join(Laudo)
        .filter(
            MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
            MensagemLaudo.lida.is_(False),
            *filtros_laudo,
            Laudo.status_revisao.in_(
                [
                    StatusRevisao.RASCUNHO.value,
                    StatusRevisao.AGUARDANDO.value,
                ]
            ),
        )
        .order_by(MensagemLaudo.criado_em.desc())
        .limit(10)
        .all()
    )

    whispers_pendentes = [
        {
            "laudo_id": item.laudo_id,
            "hash": (getattr(item.laudo, "codigo_hash", "") or str(item.laudo_id))[-6:],
            "texto": (item.conteudo or "").strip(),
            "timestamp": item.criado_em.isoformat() if item.criado_em else "",
        }
        for item in whispers_pendentes_db
    ]

    laudos_em_andamento = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao == StatusRevisao.RASCUNHO.value,
        )
        .order_by(Laudo.criado_em.asc().nullsfirst(), Laudo.atualizado_em.asc().nullsfirst())
        .all()
    )

    laudos_em_andamento_payload = []
    for item in laudos_em_andamento:
        referencia = item.criado_em or item.atualizado_em
        minutos_em_campo = _minutos_em_campo(referencia)
        tempo_label, tempo_status = _resumo_tempo_em_campo(referencia)
        inspetor_nome = (
            item.usuario.nome
            if item.usuario is not None
            else (f"Inspetor #{item.usuario_id}" if item.usuario_id else "Inspetor não identificado")
        )
        atualizado_em = item.atualizado_em or item.criado_em
        laudos_em_andamento_payload.append(
            {
                "id": item.id,
                "hash_curto": (item.codigo_hash or str(item.id))[-6:],
                "primeira_mensagem": item.primeira_mensagem,
                "atualizado_em": atualizado_em,
                "inspetor_nome": inspetor_nome,
                "tempo_em_campo": tempo_label,
                "tempo_em_campo_status": tempo_status,
                "_minutos_em_campo": minutos_em_campo,
            }
        )

    prioridade_sla = {
        "sla-critico": 0,
        "sla-atencao": 1,
        "sla-ok": 2,
    }
    laudos_em_andamento_payload.sort(
        key=lambda item: (
            prioridade_sla.get(str(item.get("tempo_em_campo_status")), 99),
            -int(item.get("_minutos_em_campo") or 0),
            int(item.get("id") or 0),
        )
    )
    for item in laudos_em_andamento_payload:
        item.pop("_minutos_em_campo", None)

    laudos_pendentes = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao == StatusRevisao.AGUARDANDO.value,
        )
        .order_by(Laudo.atualizado_em.asc().nullsfirst(), Laudo.criado_em.asc())
        .all()
    )

    laudos_avaliados = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao.in_(
                [
                    StatusRevisao.APROVADO.value,
                    StatusRevisao.REJEITADO.value,
                ]
            ),
        )
        .order_by(Laudo.atualizado_em.desc().nullslast(), Laudo.criado_em.desc())
        .limit(10)
        .all()
    )

    return templates.TemplateResponse(
        request,
        "painel_revisor.html",
        {
            **_contexto_base(request),
            "usuario": usuario,
            "inspetores_empresa": inspetores_empresa,
            "filtro_inspetor_id": filtro_inspetor_id,
            "filtro_busca": filtro_busca,
            "whispers_pendentes": whispers_pendentes,
            "laudos_em_andamento": laudos_em_andamento_payload,
            "laudos_pendentes": laudos_pendentes,
            "laudos_avaliados": laudos_avaliados,
        },
    )


@roteador_revisor.get("/templates-laudo", response_class=HTMLResponse)
async def tela_templates_laudo(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
):
    contexto = _contexto_base(request)
    contexto.update(
        {
            "usuario": usuario,
            "mapeamento_cbmgo_padrao_json": json.dumps(
                mapeamento_cbmgo_padrao(),
                ensure_ascii=False,
                indent=2,
            ),
            "dados_preview_exemplo_json": json.dumps(
                {
                    "informacoes_gerais": {
                        "responsavel_pela_inspecao": "Nome do Inspetor",
                        "data_inspecao": datetime.now().strftime("%d/%m/%Y"),
                        "local_inspecao": "Unidade Industrial",
                    },
                    "resumo_executivo": "Resumo técnico preliminar da inspeção.",
                    "trrf_observacoes": "Observações TRRF para validação da mesa.",
                },
                ensure_ascii=False,
                indent=2,
            ),
        }
    )
    return templates.TemplateResponse(request, "revisor_templates_laudo.html", contexto)


# ── APIs ──────────────────────────────────────────────────────────────────────


@roteador_revisor.get("/api/templates-laudo")
async def listar_templates_laudo(
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    templates_db = (
        banco.query(TemplateLaudo)
        .filter(TemplateLaudo.empresa_id == usuario.empresa_id)
        .order_by(
            TemplateLaudo.codigo_template.asc(),
            TemplateLaudo.versao.desc(),
            TemplateLaudo.id.desc(),
        )
        .all()
    )

    return {"itens": [_serializar_template_laudo(item) for item in templates_db]}


@roteador_revisor.get("/api/templates-laudo/{template_id}")
async def detalhar_template_laudo(
    template_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    return _serializar_template_laudo(template, incluir_mapeamento=True)


@roteador_revisor.get("/api/templates-laudo/{template_id}/arquivo-base")
async def baixar_pdf_base_template_laudo(
    template_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )
    return FileResponse(
        path=template.arquivo_pdf_base,
        filename=f"template_{template.codigo_template}_v{template.versao}.pdf",
        media_type="application/pdf",
    )


@roteador_revisor.post("/api/templates-laudo/upload")
async def upload_template_laudo(
    request: Request,
    nome: str = Form(...),
    codigo_template: str = Form(...),
    versao: int = Form(default=1),
    observacoes: str = Form(default=""),
    mapeamento_campos_json: str = Form(default=""),
    ativo: bool = Form(default=False),
    csrf_token: str = Form(default=""),
    arquivo_base: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    nome_limpo = str(nome or "").strip()[:180]
    codigo_limpo = normalizar_codigo_template(codigo_template)
    observacoes_limpas = str(observacoes or "").strip()

    if not nome_limpo:
        raise HTTPException(status_code=400, detail="Nome do template é obrigatório.")
    if versao < 1:
        raise HTTPException(status_code=400, detail="Versão deve ser maior ou igual a 1.")

    nome_arquivo = str(arquivo_base.filename or "").strip().lower()
    if not nome_arquivo.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF.")

    mapeamento_payload: dict[str, Any] = {}
    if mapeamento_campos_json.strip():
        try:
            bruto = json.loads(mapeamento_campos_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="mapeamento_campos_json inválido.") from exc
        if not isinstance(bruto, dict):
            raise HTTPException(status_code=400, detail="mapeamento_campos_json deve ser um objeto JSON.")
        mapeamento_payload = normalizar_mapeamento_campos(bruto)
    elif codigo_limpo in {"cbmgo", "cbmgo_cmar", "checklist_cbmgo"}:
        mapeamento_payload = mapeamento_cbmgo_padrao()

    duplicado = (
        banco.query(TemplateLaudo.id)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == codigo_limpo,
            TemplateLaudo.versao == versao,
        )
        .first()
    )
    if duplicado:
        raise HTTPException(status_code=409, detail="Já existe template com este código e versão.")

    arquivo_bytes = await arquivo_base.read()
    try:
        caminho_pdf_base = salvar_pdf_template_base(
            arquivo_bytes,
            empresa_id=usuario.empresa_id,
            codigo_template=codigo_limpo,
            versao=versao,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if ativo:
        ativos_mesmo_codigo = (
            banco.query(TemplateLaudo)
            .filter(
                TemplateLaudo.empresa_id == usuario.empresa_id,
                TemplateLaudo.codigo_template == codigo_limpo,
                TemplateLaudo.ativo.is_(True),
            )
            .all()
        )
        for item in ativos_mesmo_codigo:
            item.ativo = False

    template = TemplateLaudo(
        empresa_id=usuario.empresa_id,
        criado_por_id=usuario.id,
        nome=nome_limpo,
        codigo_template=codigo_limpo,
        versao=versao,
        ativo=bool(ativo),
        arquivo_pdf_base=caminho_pdf_base,
        mapeamento_campos_json=mapeamento_payload,
        observacoes=observacoes_limpas or None,
    )
    banco.add(template)
    banco.commit()
    banco.refresh(template)

    return JSONResponse(
        status_code=201,
        content=_serializar_template_laudo(template, incluir_mapeamento=True),
    )


@roteador_revisor.post("/api/templates-laudo/{template_id}/publicar")
async def publicar_template_laudo(
    template_id: int,
    request: Request,
    csrf_token: str = Form(default=""),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    ativos_mesmo_codigo = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == usuario.empresa_id,
            TemplateLaudo.codigo_template == template.codigo_template,
            TemplateLaudo.ativo.is_(True),
            TemplateLaudo.id != template.id,
        )
        .all()
    )
    for item in ativos_mesmo_codigo:
        item.ativo = False

    template.ativo = True
    banco.commit()

    return {"ok": True, "template_id": template.id, "status": "publicado"}


@roteador_revisor.post("/api/templates-laudo/{template_id}/preview")
async def preview_template_laudo(
    template_id: int,
    dados: DadosPreviewTemplateLaudo,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    template = _obter_template_laudo_empresa(
        banco,
        template_id=template_id,
        empresa_id=usuario.empresa_id,
    )

    dados_formulario: dict[str, Any] = {}
    if dados.laudo_id:
        laudo = _obter_laudo_empresa(banco, dados.laudo_id, usuario.empresa_id)
        dados_formulario = laudo.dados_formulario or {}
    elif isinstance(dados.dados_formulario, dict):
        dados_formulario = dados.dados_formulario

    if not dados_formulario:
        raise HTTPException(
            status_code=400,
            detail="Envie dados_formulario ou um laudo_id com estrutura preenchida.",
        )

    try:
        pdf_preview = gerar_preview_pdf_template(
            caminho_pdf_base=template.arquivo_pdf_base,
            mapeamento_campos=template.mapeamento_campos_json or {},
            dados_formulario=dados_formulario,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception:
        logger.error(
            "Falha ao gerar preview do template | template_id=%s | empresa_id=%s",
            template.id,
            usuario.empresa_id,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Falha ao gerar preview do template.")

    nome_arquivo = f"preview_template_{template.codigo_template}_v{template.versao}.pdf"
    return Response(
        content=pdf_preview,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'},
    )


@roteador_revisor.post("/api/laudo/{laudo_id}/avaliar")
async def avaliar_laudo(
    laudo_id: int,
    request: Request,
    acao: str = Form(...),
    motivo: str = Form(default=""),
    csrf_token: str = Form(...),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")

    laudo = _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)

    if laudo.status_revisao != StatusRevisao.AGUARDANDO.value:
        raise HTTPException(
            status_code=400,
            detail="Laudo não está aguardando avaliação.",
        )

    acao = acao.strip().lower()
    motivo = motivo.strip()
    texto_notificacao_inspetor = ""
    mensagem_notificacao: MensagemLaudo | None = None

    if acao == "aprovar":
        laudo.status_revisao = StatusRevisao.APROVADO.value
        laudo.revisado_por = usuario.id
        laudo.motivo_rejeicao = None
        laudo.atualizado_em = _agora_utc()
        texto_notificacao_inspetor = "✅ Seu laudo foi aprovado pela mesa avaliadora."

        mensagem_notificacao = _registrar_mensagem_revisor(
            banco,
            laudo_id=laudo.id,
            usuario_id=usuario.id,
            tipo=TipoMensagem.HUMANO_ENG,
            conteudo="✅ **APROVADO!** Laudo finalizado e liberado com ART.",
        )
        logger.info("Laudo aprovado | laudo=%s | revisor=%s", laudo_id, usuario.nome)

    elif acao == "rejeitar":
        if not motivo:
            raise HTTPException(status_code=400, detail="Motivo obrigatório.")

        laudo.status_revisao = StatusRevisao.REJEITADO.value
        laudo.revisado_por = usuario.id
        laudo.motivo_rejeicao = motivo
        laudo.atualizado_em = _agora_utc()
        texto_notificacao_inspetor = f"⚠️ Seu laudo foi rejeitado. Motivo: {motivo}"

        mensagem_notificacao = _registrar_mensagem_revisor(
            banco,
            laudo_id=laudo.id,
            usuario_id=usuario.id,
            tipo=TipoMensagem.HUMANO_ENG,
            conteudo=f"⚠️ **REJEITADO** Motivo: {motivo}\n\nCorrija e reenvie.",
        )
        logger.info("Laudo rejeitado | laudo=%s | revisor=%s", laudo_id, usuario.nome)

    else:
        raise HTTPException(status_code=400, detail="Ação inválida.")

    banco.commit()
    await _notificar_inspetor_sse(
        inspetor_id=laudo.usuario_id,
        laudo_id=laudo.id,
        tipo="mensagem_eng",
        texto=texto_notificacao_inspetor,
        mensagem_id=mensagem_notificacao.id if mensagem_notificacao else None,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )
    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post("/api/whisper/responder")
async def whisper_responder(
    dados: DadosWhisper,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    laudo = _obter_laudo_empresa(banco, dados.laudo_id, usuario.empresa_id)
    destinatario = _validar_destinatario_whisper(
        banco,
        destinatario_id=dados.destinatario_id,
        empresa_id=usuario.empresa_id,
        laudo=laudo,
    )
    referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
    if referencia_mensagem_id:
        referencia_existe = (
            banco.query(MensagemLaudo.id)
            .filter(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_mensagem_id,
            )
            .first()
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    texto_mensagem = (dados.mensagem or "").strip()
    mensagem_salva = _registrar_mensagem_revisor(
        banco,
        laudo_id=laudo.id,
        usuario_id=usuario.id,
        tipo=TipoMensagem.HUMANO_ENG,
        conteudo=compor_texto_com_referencia(
            f"💬 **Engenharia:** {texto_mensagem}",
            referencia_mensagem_id,
        ),
    )
    laudo.atualizado_em = _agora_utc()
    banco.commit()

    await manager.send_to_user(
        empresa_id=usuario.empresa_id,
        user_id=destinatario.id,
        mensagem={
            "tipo": "whisper_resposta",
            "laudo_id": laudo.id,
            "de_usuario_id": usuario.id,
            "de_nome": usuario.nome,
            "mensagem_id": mensagem_salva.id,
            "referencia_mensagem_id": referencia_mensagem_id,
            "preview": texto_mensagem[:120],
            "timestamp": _agora_utc().isoformat(),
        },
    )

    await _notificar_inspetor_sse(
        inspetor_id=destinatario.id,
        laudo_id=laudo.id,
        tipo="whisper_eng",
        texto=texto_mensagem,
        mensagem_id=mensagem_salva.id,
        referencia_mensagem_id=referencia_mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    logger.info(
        "Whisper enviado | laudo=%s | revisor=%s | destinatario_id=%s",
        dados.laudo_id,
        usuario.nome,
        destinatario.id,
    )
    return JSONResponse({"success": True, "destinatario_id": destinatario.id})


@roteador_revisor.post("/api/laudo/{laudo_id}/responder")
async def responder_chat_campo(
    laudo_id: int,
    dados: DadosRespostaChat,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    laudo = _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)
    texto_limpo = dados.texto.strip()
    referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None

    if not texto_limpo:
        raise HTTPException(status_code=400, detail="Mensagem vazia.")

    if referencia_mensagem_id:
        referencia_existe = (
            banco.query(MensagemLaudo.id)
            .filter(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_mensagem_id,
            )
            .first()
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    mensagem_salva = _registrar_mensagem_revisor(
        banco,
        laudo_id=laudo.id,
        usuario_id=usuario.id,
        tipo=TipoMensagem.HUMANO_ENG,
        conteudo=compor_texto_com_referencia(texto_limpo, referencia_mensagem_id),
    )
    laudo.atualizado_em = _agora_utc()
    banco.commit()

    await _notificar_inspetor_sse(
        inspetor_id=laudo.usuario_id,
        laudo_id=laudo.id,
        tipo="mensagem_eng",
        texto=texto_limpo,
        mensagem_id=mensagem_salva.id,
        referencia_mensagem_id=referencia_mensagem_id,
        de_usuario_id=usuario.id,
        de_nome=usuario.nome,
    )

    logger.info(
        "Chat engenharia | laudo=%s | revisor=%s | len=%d",
        laudo_id,
        usuario.nome,
        len(texto_limpo),
    )
    return JSONResponse({"success": True})


@roteador_revisor.post("/api/laudo/{laudo_id}/marcar-whispers-lidos")
async def marcar_whispers_lidos(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)

    total = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
            MensagemLaudo.lida.is_(False),
        )
        .update({"lida": True}, synchronize_session=False)
    )
    banco.commit()

    return JSONResponse({"success": True, "marcadas": total})


# ── WebSocket ─────────────────────────────────────────────────────────────────


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, dict[int, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))

    async def connect(self, empresa_id: int, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self._connections[empresa_id][user_id].add(websocket)

    def disconnect(self, empresa_id: int, user_id: int, websocket: WebSocket):
        user_conns = self._connections.get(empresa_id, {}).get(user_id, set())
        user_conns.discard(websocket)

        if not user_conns and empresa_id in self._connections:
            self._connections[empresa_id].pop(user_id, None)

        if empresa_id in self._connections and not self._connections[empresa_id]:
            self._connections.pop(empresa_id, None)

    async def _send_json_seguro(
        self,
        *,
        empresa_id: int,
        user_id: int,
        websocket: WebSocket,
        mensagem: dict[str, Any],
    ) -> bool:
        try:
            await websocket.send_json(mensagem)
            return True
        except (WebSocketDisconnect, RuntimeError):
            # Conexão caiu ou foi fechada enquanto tentávamos enviar.
            self.disconnect(empresa_id, user_id, websocket)
            return False
        except Exception:
            logger.warning(
                "Falha ao enviar mensagem WS; removendo socket morto.",
                extra={
                    "empresa_id": empresa_id,
                    "user_id": user_id,
                },
                exc_info=True,
            )
            self.disconnect(empresa_id, user_id, websocket)
            return False

    async def send_to_user(self, empresa_id: int, user_id: int, mensagem: dict[str, Any]):
        conexoes = list(self._connections.get(empresa_id, {}).get(user_id, set()))
        if not conexoes:
            return

        for connection in conexoes:
            await self._send_json_seguro(
                empresa_id=empresa_id,
                user_id=user_id,
                websocket=connection,
                mensagem=mensagem,
            )

    async def broadcast_empresa(self, empresa_id: int, mensagem: dict[str, Any]):
        empresa_conexoes = self._connections.get(empresa_id, {})
        if not empresa_conexoes:
            return

        for user_id, connections in list(empresa_conexoes.items()):
            for connection in list(connections):
                await self._send_json_seguro(
                    empresa_id=empresa_id,
                    user_id=user_id,
                    websocket=connection,
                    mensagem=mensagem,
                )


manager = ConnectionManager()


def _usuario_ws_da_sessao(websocket: WebSocket) -> dict[str, Any]:
    sessao = getattr(websocket, "session", None) or {}
    dados_sessao = obter_dados_sessao_portal(sessao, portal=PORTAL_REVISOR)

    token = dados_sessao.get("token")
    usuario_id = dados_sessao.get("usuario_id")
    empresa_id = dados_sessao.get("empresa_id")
    nivel_acesso = dados_sessao.get("nivel_acesso")
    nome = dados_sessao.get("nome") or sessao.get("nome_completo") or "Revisor"

    if not token or not token_esta_ativo(token):
        raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.")

    if not usuario_id or not empresa_id or nivel_acesso is None:
        raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.")

    try:
        usuario_id_int = int(usuario_id)
        empresa_id_int = int(empresa_id)
        nivel_acesso_int = int(nivel_acesso)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.") from None

    if SESSOES_ATIVAS.get(token) != usuario_id_int:
        raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.")

    with SessaoLocal() as banco:
        usuario = banco.get(Usuario, usuario_id_int)
        if not usuario or usuario.empresa_id != empresa_id_int:
            raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.")

        if usuario_tem_bloqueio_ativo(usuario):
            raise HTTPException(status_code=403, detail="Acesso bloqueado ao WebSocket.")

        if int(usuario.nivel_acesso) < int(NivelAcesso.REVISOR):
            raise HTTPException(status_code=403, detail="Acesso negado ao WebSocket.")

        nome = getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or nome

    if nivel_acesso_int < int(NivelAcesso.REVISOR):
        raise HTTPException(status_code=403, detail="Acesso negado ao WebSocket.")

    return {
        "usuario_id": usuario_id_int,
        "empresa_id": empresa_id_int,
        "nivel_acesso": nivel_acesso_int,
        "nome": nome,
    }


@roteador_revisor.websocket("/ws/whispers")
async def websocket_whispers(websocket: WebSocket):
    empresa_id = None
    usuario_id = None
    conexao_ativa = False

    async def _enviar_ws_seguro(payload: dict[str, Any]) -> bool:
        try:
            await websocket.send_json(payload)
            return True
        except (WebSocketDisconnect, RuntimeError):
            return False
        except Exception:
            logger.warning("Falha ao enviar payload pelo WebSocket de whispers.", exc_info=True)
            return False

    try:
        dados_usuario = _usuario_ws_da_sessao(websocket)
        empresa_id = dados_usuario["empresa_id"]
        usuario_id = dados_usuario["usuario_id"]

        await manager.connect(empresa_id, usuario_id, websocket)
        conexao_ativa = True

        if not await _enviar_ws_seguro(
            {
                "tipo": "whisper_ready",
                "usuario_id": usuario_id,
                "empresa_id": empresa_id,
                "timestamp": _agora_utc().isoformat(),
            }
        ):
            return

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                if not await _enviar_ws_seguro(
                    {
                        "tipo": "erro",
                        "detail": "Payload WebSocket inválido.",
                    }
                ):
                    break
                continue

            acao = (data.get("acao") or "").strip().lower()

            if acao == "ping":
                if not await _enviar_ws_seguro(
                    {
                        "tipo": "pong",
                        "timestamp": _agora_utc().isoformat(),
                    }
                ):
                    break
                continue

            if acao == "broadcast_mesa":
                try:
                    laudo_id = int(data.get("laudo_id"))
                except (TypeError, ValueError):
                    if not await _enviar_ws_seguro(
                        {
                            "tipo": "erro",
                            "detail": "laudo_id inválido para broadcast_mesa.",
                        }
                    ):
                        break
                    continue

                await manager.broadcast_empresa(
                    empresa_id=empresa_id,
                    mensagem={
                        "tipo": "whisper_ping",
                        "laudo_id": laudo_id,
                        "inspetor": str(data.get("inspetor", ""))[:120],
                        "preview": str(data.get("preview", ""))[:120],
                        "timestamp": _agora_utc().isoformat(),
                    },
                )
                continue

            if not await _enviar_ws_seguro(
                {
                    "tipo": "erro",
                    "detail": "Ação WebSocket inválida.",
                }
            ):
                break

    except HTTPException as exc:
        try:
            await websocket.close(code=4401 if exc.status_code == 401 else 4403)
        except Exception:
            pass
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # Socket já encerrado internamente pelo servidor/cliente.
        pass
    except Exception:
        logger.warning("Erro inesperado no WebSocket de whispers.", exc_info=True)
    finally:
        if conexao_ativa and empresa_id is not None and usuario_id is not None:
            manager.disconnect(empresa_id, usuario_id, websocket)


# ── APIs Laudo ────────────────────────────────────────────────────────────────


@roteador_revisor.get("/api/laudo/{laudo_id}/mensagens")
async def obter_historico_chat_revisor(
    laudo_id: int,
    cursor: int | None = Query(default=None, gt=0),
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)

    pagina = _listar_mensagens_laudo_paginadas(
        banco,
        laudo_id=laudo_id,
        cursor=cursor,
        limite=limite,
        com_data_longa=False,
    )

    return {
        "itens": pagina["itens"],
        "cursor_proximo": int(pagina["cursor_proximo"]) if pagina["cursor_proximo"] else None,
        "tem_mais": bool(pagina["tem_mais"]),
        "laudo_id": laudo_id,
        "limite": limite,
    }


@roteador_revisor.get("/api/laudo/{laudo_id}/completo")
async def obter_laudo_completo(
    laudo_id: int,
    incluir_historico: bool = Query(default=False),
    cursor: int | None = Query(default=None, gt=0),
    limite: int = Query(default=60, ge=20, le=200),
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    laudo = _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)

    historico: list[dict[str, Any]] = []
    whispers: list[dict[str, Any]] = []
    cursor_proximo: int | None = None
    tem_mais = False

    if incluir_historico:
        pagina = _listar_mensagens_laudo_paginadas(
            banco,
            laudo_id=laudo_id,
            cursor=cursor,
            limite=limite,
            com_data_longa=True,
        )
        historico = pagina["itens"]
        whispers = [m for m in historico if m["is_whisper"]]
        cursor_proximo = int(pagina["cursor_proximo"]) if pagina["cursor_proximo"] else None
        tem_mais = bool(pagina["tem_mais"])

    return JSONResponse(
        {
            "id": laudo.id,
            "hash": laudo.codigo_hash[-6:],
            "setor": laudo.setor_industrial,
            "status": laudo.status_revisao,
            "tipo_template": getattr(laudo, "tipo_template", "padrao"),
            "criado_em": laudo.criado_em.strftime("%d/%m/%Y %H:%M"),
            "dados_formulario": getattr(laudo, "dados_formulario", None),
            "historico": historico,
            "whispers": whispers,
            "historico_paginado": {
                "incluir_historico": incluir_historico,
                "cursor_proximo": cursor_proximo,
                "tem_mais": tem_mais,
                "limite": limite,
            },
        }
    )
