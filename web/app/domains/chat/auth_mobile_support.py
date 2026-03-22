"""Helpers de perfil e preferências do portal/app do inspetor."""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.chat.auth_helpers import usuario_nome
from app.domains.chat.laudo_state_helpers import laudo_possui_historico_visivel, serializar_card_laudo
from app.domains.chat.normalization import normalizar_email
from app.shared.database import Laudo, PreferenciaMobileUsuario, Usuario
from app.shared.security import PORTAL_INSPETOR, definir_sessao_portal, obter_dados_sessao_portal

logger = logging.getLogger(__name__)

PASTA_FOTOS_PERFIL = Path(env_str("PASTA_UPLOADS_PERFIS", "static/uploads/perfis")).expanduser()
MIME_FOTO_PERMITIDOS = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_FOTO_PERFIL_BYTES = 4 * 1024 * 1024

SONS_NOTIFICACAO_PERMITIDOS = {"Ping", "Sino curto", "Silencioso"}
RETENCAO_DADOS_PERMITIDA = {"30 dias", "90 dias", "1 ano", "Até excluir"}
MODELOS_IA_PERMITIDOS = {"rápido", "equilibrado", "avançado"}
CONFIGURACOES_CRITICAS_MOBILE_PADRAO: dict[str, dict[str, object]] = {
    "notificacoes": {
        "notifica_respostas": True,
        "notifica_push": True,
        "som_notificacao": "Ping",
        "vibracao_ativa": True,
        "emails_ativos": False,
    },
    "privacidade": {
        "mostrar_conteudo_notificacao": False,
        "ocultar_conteudo_bloqueado": True,
        "mostrar_somente_nova_mensagem": True,
        "salvar_historico_conversas": True,
        "compartilhar_melhoria_ia": False,
        "retencao_dados": "90 dias",
    },
    "permissoes": {
        "microfone_permitido": True,
        "camera_permitida": True,
        "arquivos_permitidos": True,
        "notificacoes_permitidas": True,
        "biometria_permitida": True,
    },
    "experiencia_ia": {
        "modelo_ia": "equilibrado",
    },
}


def email_valido_basico(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def normalizar_telefone(telefone: str) -> str:
    valor = str(telefone or "").strip()
    if not valor:
        return ""
    valor = re.sub(r"[^0-9()+\-\s]", "", valor)
    return valor[:30]


def _registro(valor: object) -> dict[str, object]:
    if isinstance(valor, dict):
        return valor
    return {}


def _normalizar_bool(valor: object, padrao: bool) -> bool:
    return valor if isinstance(valor, bool) else padrao


def _normalizar_texto_opcao(valor: object, opcoes: set[str], padrao: str) -> str:
    texto = str(valor or "").strip()
    if texto in opcoes:
        return texto
    return padrao


def normalizar_configuracoes_criticas_mobile(payload: object) -> dict[str, dict[str, object]]:
    base = _registro(payload)
    notificacoes_raw = _registro(base.get("notificacoes"))
    privacidade_raw = _registro(base.get("privacidade"))
    permissoes_raw = _registro(base.get("permissoes"))
    experiencia_ia_raw = _registro(base.get("experiencia_ia"))

    notificacoes: dict[str, object] = {
        "notifica_respostas": _normalizar_bool(
            notificacoes_raw.get("notifica_respostas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["notifica_respostas"]),
        ),
        "notifica_push": _normalizar_bool(
            notificacoes_raw.get("notifica_push"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["notifica_push"]),
        ),
        "som_notificacao": _normalizar_texto_opcao(
            notificacoes_raw.get("som_notificacao"),
            SONS_NOTIFICACAO_PERMITIDOS,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["som_notificacao"]),
        ),
        "vibracao_ativa": _normalizar_bool(
            notificacoes_raw.get("vibracao_ativa"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["vibracao_ativa"]),
        ),
        "emails_ativos": _normalizar_bool(
            notificacoes_raw.get("emails_ativos"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["emails_ativos"]),
        ),
    }

    privacidade: dict[str, object] = {
        "mostrar_conteudo_notificacao": _normalizar_bool(
            privacidade_raw.get("mostrar_conteudo_notificacao"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["mostrar_conteudo_notificacao"]),
        ),
        "ocultar_conteudo_bloqueado": _normalizar_bool(
            privacidade_raw.get("ocultar_conteudo_bloqueado"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["ocultar_conteudo_bloqueado"]),
        ),
        "mostrar_somente_nova_mensagem": _normalizar_bool(
            privacidade_raw.get("mostrar_somente_nova_mensagem"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["mostrar_somente_nova_mensagem"]),
        ),
        "salvar_historico_conversas": _normalizar_bool(
            privacidade_raw.get("salvar_historico_conversas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["salvar_historico_conversas"]),
        ),
        "compartilhar_melhoria_ia": _normalizar_bool(
            privacidade_raw.get("compartilhar_melhoria_ia"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["compartilhar_melhoria_ia"]),
        ),
        "retencao_dados": _normalizar_texto_opcao(
            privacidade_raw.get("retencao_dados"),
            RETENCAO_DADOS_PERMITIDA,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["retencao_dados"]),
        ),
    }

    permissoes: dict[str, object] = {
        "microfone_permitido": _normalizar_bool(
            permissoes_raw.get("microfone_permitido"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["microfone_permitido"]),
        ),
        "camera_permitida": _normalizar_bool(
            permissoes_raw.get("camera_permitida"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["camera_permitida"]),
        ),
        "arquivos_permitidos": _normalizar_bool(
            permissoes_raw.get("arquivos_permitidos"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["arquivos_permitidos"]),
        ),
        "notificacoes_permitidas": _normalizar_bool(
            permissoes_raw.get("notificacoes_permitidas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["notificacoes_permitidas"]),
        ),
        "biometria_permitida": _normalizar_bool(
            permissoes_raw.get("biometria_permitida"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["biometria_permitida"]),
        ),
    }

    experiencia_ia: dict[str, object] = {
        "modelo_ia": _normalizar_texto_opcao(
            experiencia_ia_raw.get("modelo_ia"),
            MODELOS_IA_PERMITIDOS,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["experiencia_ia"]["modelo_ia"]),
        ),
    }

    return {
        "notificacoes": notificacoes,
        "privacidade": privacidade,
        "permissoes": permissoes,
        "experiencia_ia": experiencia_ia,
    }


def serializar_preferencias_mobile_usuario(preferencia: PreferenciaMobileUsuario | None) -> dict[str, dict[str, object]]:
    if not preferencia:
        return normalizar_configuracoes_criticas_mobile(CONFIGURACOES_CRITICAS_MOBILE_PADRAO)
    return normalizar_configuracoes_criticas_mobile(
        {
            "notificacoes": preferencia.notificacoes_json,
            "privacidade": preferencia.privacidade_json,
            "permissoes": preferencia.permissoes_json,
            "experiencia_ia": preferencia.experiencia_ia_json,
        }
    )


def serializar_perfil_usuario(usuario: Usuario) -> dict[str, str]:
    return {
        "nome_completo": str(usuario.nome_completo or "").strip(),
        "email": str(usuario.email or "").strip(),
        "telefone": str(getattr(usuario, "telefone", "") or "").strip(),
        "foto_perfil_url": str(getattr(usuario, "foto_perfil_url", "") or "").strip(),
        "empresa_nome": str(getattr(getattr(usuario, "empresa", None), "nome_fantasia", "") or "Sua empresa").strip(),
    }


def serializar_usuario_mobile(usuario: Usuario) -> dict[str, object]:
    perfil = serializar_perfil_usuario(usuario)
    return {
        "id": int(usuario.id),
        "nome_completo": perfil["nome_completo"],
        "email": perfil["email"],
        "telefone": perfil["telefone"],
        "foto_perfil_url": perfil["foto_perfil_url"],
        "empresa_nome": perfil["empresa_nome"],
        "empresa_id": int(usuario.empresa_id or 0),
        "nivel_acesso": int(usuario.nivel_acesso),
    }


def _caminho_foto_perfil_local(url_foto: str | None) -> Path | None:
    valor = str(url_foto or "").strip()
    if not valor.startswith("/static/uploads/perfis/"):
        return None

    base = PASTA_FOTOS_PERFIL.resolve()
    caminho = Path(valor.lstrip("/")).resolve()
    if base == caminho or base in caminho.parents:
        return caminho
    return None


def _remover_foto_perfil_antiga(url_foto: str | None) -> None:
    caminho = _caminho_foto_perfil_local(url_foto)
    if not caminho:
        return
    try:
        if caminho.exists() and caminho.is_file():
            caminho.unlink()
    except Exception:
        logger.warning("Falha ao remover foto de perfil antiga.", exc_info=True)


def atualizar_nome_sessao_inspetor(request: Request, usuario: Usuario) -> None:
    dados_sessao = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    token = dados_sessao.get("token")
    if not token:
        return

    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )


def atualizar_perfil_usuario_em_banco(
    *,
    usuario: Usuario,
    banco: Session,
    nome_completo: str,
    email_bruto: str,
    telefone_bruto: str,
) -> None:
    nome = str(nome_completo or "").strip()
    email = normalizar_email(str(email_bruto or ""))
    telefone = normalizar_telefone(str(telefone_bruto or ""))

    if len(nome) < 3:
        raise HTTPException(status_code=400, detail="Informe um nome com pelo menos 3 caracteres.")

    if not email or not email_valido_basico(email):
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")

    usuario_conflito = banco.scalar(
        select(Usuario).where(
            Usuario.email == email,
            Usuario.id != usuario.id,
        )
    )
    if usuario_conflito:
        raise HTTPException(status_code=409, detail="Este e-mail já está em uso por outro usuário.")

    usuario.nome_completo = nome[:150]
    usuario.email = email[:254]
    usuario.telefone = telefone or None

    banco.flush()
    banco.refresh(usuario)


async def atualizar_foto_perfil_usuario_em_banco(
    *,
    usuario: Usuario,
    banco: Session,
    foto: UploadFile,
) -> None:
    mime = str(foto.content_type or "").strip().lower()
    if mime not in MIME_FOTO_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Formato inválido. Use PNG, JPG ou WebP.")

    conteudo = await foto.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo de foto vazio.")
    if len(conteudo) > MAX_FOTO_PERFIL_BYTES:
        raise HTTPException(status_code=413, detail="A foto deve ter no máximo 4MB.")

    extensao_por_mime = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    extensao = extensao_por_mime.get(mime, ".jpg")

    pasta_empresa = PASTA_FOTOS_PERFIL / str(usuario.empresa_id)
    pasta_empresa.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"user_{usuario.id}_{uuid.uuid4().hex[:16]}{extensao}"
    caminho_destino = pasta_empresa / nome_arquivo
    caminho_destino.write_bytes(conteudo)

    _remover_foto_perfil_antiga(getattr(usuario, "foto_perfil_url", None))
    usuario.foto_perfil_url = f"/static/uploads/perfis/{usuario.empresa_id}/{nome_arquivo}"
    banco.flush()
    banco.refresh(usuario)


def obter_preferencia_mobile_usuario(banco: Session, *, usuario_id: int) -> PreferenciaMobileUsuario | None:
    return banco.scalar(select(PreferenciaMobileUsuario).where(PreferenciaMobileUsuario.usuario_id == int(usuario_id)))


def salvar_configuracoes_criticas_mobile_usuario(
    banco: Session,
    *,
    usuario: Usuario,
    payload: object,
) -> dict[str, dict[str, object]]:
    configuracoes = normalizar_configuracoes_criticas_mobile(payload)
    preferencia = obter_preferencia_mobile_usuario(banco, usuario_id=int(usuario.id))
    if not preferencia:
        preferencia = PreferenciaMobileUsuario(usuario_id=usuario.id)
        banco.add(preferencia)

    preferencia.notificacoes_json = configuracoes["notificacoes"]
    preferencia.privacidade_json = configuracoes["privacidade"]
    preferencia.permissoes_json = configuracoes["permissoes"]
    preferencia.experiencia_ia_json = configuracoes["experiencia_ia"]
    banco.flush()
    banco.refresh(preferencia)

    logger.info(
        "Preferencias mobile criticas atualizadas | usuario_id=%s | notificacoes=%s | privacidade=%s | permissoes=%s | experiencia_ia=%s",
        usuario.id,
        preferencia.notificacoes_json,
        preferencia.privacidade_json,
        preferencia.permissoes_json,
        preferencia.experiencia_ia_json,
    )

    return serializar_preferencias_mobile_usuario(preferencia)


def listar_cards_laudos_mobile_inspetor(
    banco: Session,
    *,
    usuario: Usuario,
    limite: int = 30,
) -> list[dict[str, object]]:
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
            )
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(max(1, int(limite)))
        ).all()
    )
    return [
        serializar_card_laudo(banco, laudo)
        for laudo in laudos
        if laudo_possui_historico_visivel(banco, laudo) or laudo.status_revisao != "rascunho"
    ]


def listar_laudos_recentes_portal_inspetor(
    banco: Session,
    *,
    usuario: Usuario,
    limite_consulta: int = 40,
    limite_resultado: int = 20,
) -> list[Laudo]:
    laudos_consulta = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
            )
            .order_by(
                Laudo.pinado.desc(),
                Laudo.criado_em.desc(),
            )
            .limit(max(1, int(limite_consulta)))
        ).all()
    )

    laudos_recentes: list[Laudo] = []
    for laudo in laudos_consulta:
        if not laudo_possui_historico_visivel(banco, laudo):
            continue
        resumo_card = serializar_card_laudo(banco, laudo)
        setattr(laudo, "card_status", resumo_card["status_card"])
        setattr(laudo, "card_status_label", resumo_card["status_card_label"])
        laudos_recentes.append(laudo)
        if len(laudos_recentes) >= max(1, int(limite_resultado)):
            break
    return laudos_recentes
