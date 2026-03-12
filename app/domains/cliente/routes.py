"""Portal do admin-cliente multiempresa."""

from __future__ import annotations

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
    resetar_senha_usuario_empresa,
)
from app.domains.chat.chat import obter_mensagens_laudo, rota_chat
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
    Laudo,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
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
    int(NivelAcesso.DIRETORIA): "Admin WF",
}


class DadosPlanoCliente(BaseModel):
    plano: Literal["Inicial", "Intermediario", "Ilimitado"]

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
            "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao portal do cliente.",
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
    total_usuarios = banco.scalar(select(func.count(Usuario.id)).where(Usuario.empresa_id == empresa.id)) or 0
    total_laudos = banco.scalar(select(func.count(Laudo.id)).where(Laudo.empresa_id == empresa.id)) or 0
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

    uso_pct: int | None = None
    if isinstance(limites.laudos_mes, int) and limites.laudos_mes > 0:
        uso_pct = min(100, int(((empresa.mensagens_processadas or 0) / limites.laudos_mes) * 100))

    return {
        "id": int(empresa.id),
        "nome_fantasia": str(empresa.nome_fantasia or ""),
        "cnpj": str(empresa.cnpj or ""),
        "plano_ativo": str(empresa.plano_ativo or ""),
        "planos_disponiveis": [item.value for item in PlanoEmpresa],
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
        "uso_percentual": uso_pct,
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
            .where(Usuario.empresa_id == usuario.empresa_id)
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
        resumo=f"Plano alterado para {dados.plano}.",
        detalhe="Alteração imediata feita pelo portal admin-cliente.",
        payload={"plano": dados.plano},
    )
    return JSONResponse({"success": True, "empresa": _resumo_empresa_cliente(banco, usuario)})


@roteador_cliente.get("/api/usuarios")
async def api_listar_usuarios_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    usuarios = list(
        banco.scalars(
            select(Usuario)
            .where(Usuario.empresa_id == usuario.empresa_id)
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
    return await api_iniciar_relatorio(
        request=request,
        tipo_template=tipo_template,
        tipotemplate=None,
        usuario=usuario,
        banco=banco,
    )


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


@roteador_cliente.post("/api/chat/mensagem")
async def api_chat_enviar_cliente(
    dados: DadosChat,
    request: Request,
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    garantir_csrf_cliente(request)
    return await rota_chat(
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


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
    return await api_finalizar_relatorio(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )


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
    return await api_reabrir_laudo(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )


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
    return await obter_laudo_completo(
        laudo_id=laudo_id,
        incluir_historico=incluir_historico,
        cursor=cursor,
        limite=limite,
        usuario=usuario,
        banco=banco,
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
    return await obter_pacote_mesa_laudo(
        laudo_id=laudo_id,
        request=request,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
        usuario=usuario,
        banco=banco,
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
    return await responder_chat_campo(
        laudo_id=laudo_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


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
    return await responder_chat_campo_com_anexo(
        laudo_id=laudo_id,
        request=request,
        arquivo=arquivo,
        texto=texto,
        referencia_mensagem_id=referencia_mensagem_id,
        usuario=usuario,
        banco=banco,
    )


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
    return await atualizar_pendencia_mesa_revisor(
        laudo_id=laudo_id,
        mensagem_id=mensagem_id,
        dados=dados,
        request=request,
        usuario=usuario,
        banco=banco,
    )


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
    return await avaliar_laudo(
        laudo_id=laudo_id,
        request=request,
        acao=dados.acao,
        motivo=dados.motivo,
        csrf_token=request.headers.get("X-CSRF-Token", ""),
        usuario=usuario,
        banco=banco,
    )


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
