"""Sub-roteador de gestão administrativa do portal admin-cliente."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.admin.services import (
    alternar_bloqueio_usuario_empresa,
    alterar_plano,
    atualizar_usuario_empresa,
    criar_usuario_empresa,
    filtro_usuarios_gerenciaveis_cliente,
    resetar_senha_usuario_empresa,
)
from app.domains.cliente.auditoria import (
    listar_auditoria_empresa,
    serializar_registro_auditoria,
)
from app.domains.cliente.common import validar_csrf_cliente
from app.domains.cliente.dashboard import (
    ROLE_LABELS as _ROLE_LABELS,
    comparativo_plano_cliente as _comparativo_plano_cliente,
    resumo_empresa_cliente as _resumo_empresa_cliente,
    serializar_usuario_cliente as _serializar_usuario_cliente,
)
from app.domains.cliente.route_support import (
    _empresa_usuario,
    _registrar_auditoria_cliente_segura,
    _traduzir_erro_servico_cliente,
)
from app.shared.database import NivelAcesso, PlanoEmpresa, Usuario, obter_banco
from app.shared.security import exigir_admin_cliente

roteador_cliente_management = APIRouter()

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
NIVEL_MAP_CLIENTE = {
    "admin_cliente": NivelAcesso.ADMIN_CLIENTE,
    "inspetor": NivelAcesso.INSPETOR,
    "revisor": NivelAcesso.REVISOR,
}


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


@roteador_cliente_management.get("/api/auditoria")
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


@roteador_cliente_management.patch("/api/empresa/plano", responses=RESPOSTAS_PLANO_CLIENTE)
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


@roteador_cliente_management.post("/api/empresa/plano/interesse", responses=RESPOSTAS_PLANO_CLIENTE)
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


@roteador_cliente_management.get("/api/usuarios")
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


@roteador_cliente_management.post(
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

    try:
        novo, senha = criar_usuario_empresa(
            banco,
            empresa_id=int(usuario.empresa_id),
            nome=dados.nome,
            email=dados.email,
            nivel_acesso=NIVEL_MAP_CLIENTE[dados.nivel_acesso],
            telefone=dados.telefone,
            crea=dados.crea,
        )
    except ValueError as exc:
        raise _traduzir_erro_servico_cliente(exc) from exc
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


@roteador_cliente_management.patch("/api/usuarios/{usuario_id}", responses=RESPOSTAS_USUARIO_CLIENTE)
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


@roteador_cliente_management.patch("/api/usuarios/{usuario_id}/bloqueio", responses=RESPOSTAS_BLOQUEIO_CLIENTE)
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


@roteador_cliente_management.post("/api/usuarios/{usuario_id}/resetar-senha", responses=RESPOSTAS_BLOQUEIO_CLIENTE)
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
