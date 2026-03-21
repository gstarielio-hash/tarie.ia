# =============================================================================
# HTTP SETUP SUPPORT
# Responsabilidade: OpenAPI, handlers globais e rotas operacionais do app shell
# =============================================================================

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.settings import env_str


def _sanitizar_para_json(valor: Any) -> Any:
    if valor is None or isinstance(valor, (str, int, float, bool)):
        return valor

    if isinstance(valor, dict):
        return {str(chave): _sanitizar_para_json(item) for chave, item in valor.items()}

    if isinstance(valor, (list, tuple, set)):
        return [_sanitizar_para_json(item) for item in valor]

    if hasattr(valor, "filename") or hasattr(valor, "content_type"):
        return {
            "__type__": valor.__class__.__name__,
            "filename": getattr(valor, "filename", None),
            "content_type": getattr(valor, "content_type", None),
        }

    return str(valor)


def _obter_propriedades_schema(schema_body: dict[str, Any]) -> dict[str, Any]:
    propriedades = schema_body.get("properties")
    if isinstance(propriedades, dict):
        return propriedades

    propriedades = {}
    schema_body["properties"] = propriedades
    return propriedades


def _aplicar_campo_binario(propriedades: dict[str, Any], nome_campo: str) -> None:
    campo = propriedades.get(nome_campo)
    if not isinstance(campo, dict):
        return

    campo.pop("contentMediaType", None)
    campo["format"] = "binary"
    campo["minLength"] = 1


def _aplicar_campos_binarios_em_bodies(components: dict[str, Any], campos: tuple[str, ...]) -> None:
    for nome_schema, schema_body in components.items():
        if not isinstance(schema_body, dict) or not str(nome_schema).startswith("Body_"):
            continue
        propriedades = _obter_propriedades_schema(schema_body)
        for nome_campo in campos:
            _aplicar_campo_binario(propriedades, nome_campo)


def _ajustar_openapi_contratos_inspetor(schema: dict[str, Any]) -> None:
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    paths = schema.setdefault("paths", {})
    hints_schemathesis = env_str("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1"

    ids_por_operacao = {
        ("get", "/app/api/laudo/{laudo_id}/gate-qualidade"): {"laudo_id": [1]},
        ("get", "/app/api/laudo/{laudo_id}/mensagens"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/mesa/anexos/{anexo_id}"): {"laudo_id": [2], "anexo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/mesa/mensagens"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/mesa/resumo"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/pendencias"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/pendencias/exportar-pdf"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/revisoes"): {"laudo_id": [2]},
        ("get", "/app/api/laudo/{laudo_id}/revisoes/diff"): {"laudo_id": [2]},
        ("patch", "/app/api/laudo/{laudo_id}/pendencias/{mensagem_id}"): {"laudo_id": [2], "mensagem_id": [2]},
        ("patch", "/app/api/laudo/{laudo_id}/pin"): {"laudo_id": [2]},
        ("post", "/app/api/laudo/{laudo_id}/finalizar"): {"laudo_id": [1]},
        ("post", "/app/api/laudo/{laudo_id}/mesa/anexo"): {"laudo_id": [2]},
        ("post", "/app/api/laudo/{laudo_id}/mesa/mensagem"): {"laudo_id": [2]},
        ("post", "/app/api/laudo/{laudo_id}/pendencias/marcar-lidas"): {"laudo_id": [2]},
        ("post", "/app/api/laudo/{laudo_id}/reabrir"): {"laudo_id": [3]},
        ("delete", "/app/api/laudo/{laudo_id}"): {"laudo_id": [4]},
        ("get", "/revisao/api/laudo/{laudo_id}/completo"): {"laudo_id": [1]},
        ("get", "/revisao/api/laudo/{laudo_id}/mensagens"): {"laudo_id": [1]},
        ("get", "/revisao/api/laudo/{laudo_id}/mesa/anexos/{anexo_id}"): {"laudo_id": [1], "anexo_id": [1]},
        ("get", "/revisao/api/laudo/{laudo_id}/pacote"): {"laudo_id": [1]},
        ("get", "/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf"): {"laudo_id": [1]},
        ("patch", "/revisao/api/laudo/{laudo_id}/pendencias/{mensagem_id}"): {"laudo_id": [1], "mensagem_id": [1]},
        ("post", "/revisao/api/laudo/{laudo_id}/avaliar"): {"laudo_id": [3]},
        ("post", "/revisao/api/laudo/{laudo_id}/marcar-whispers-lidos"): {"laudo_id": [1]},
        ("post", "/revisao/api/laudo/{laudo_id}/responder"): {"laudo_id": [2]},
        ("post", "/revisao/api/laudo/{laudo_id}/responder-anexo"): {"laudo_id": [2]},
        ("get", "/revisao/api/templates-laudo/{template_id}"): {"template_id": [1]},
        ("delete", "/revisao/api/templates-laudo/{template_id}"): {"template_id": [3]},
        ("get", "/revisao/api/templates-laudo/{template_id}/arquivo-base"): {"template_id": [1]},
        ("post", "/revisao/api/templates-laudo/{template_id}/publicar"): {"template_id": [1]},
        ("post", "/revisao/api/templates-laudo/{template_id}/preview"): {"template_id": [1]},
        ("get", "/revisao/api/templates-laudo/editor/{template_id}"): {"template_id": [2]},
        ("put", "/revisao/api/templates-laudo/editor/{template_id}"): {"template_id": [2]},
        ("post", "/revisao/api/templates-laudo/editor/{template_id}/assets"): {"template_id": [2]},
        ("get", "/revisao/api/templates-laudo/editor/{template_id}/assets/{asset_id}"): {
            "template_id": [2],
            "asset_id": ["seed-asset-logo"],
        },
        ("post", "/revisao/api/templates-laudo/editor/{template_id}/preview"): {"template_id": [2]},
        ("post", "/revisao/api/templates-laudo/editor/{template_id}/publicar"): {"template_id": [2]},
        ("get", "/cliente/api/chat/laudos/{laudo_id}/gate"): {"laudo_id": [1]},
        ("get", "/cliente/api/chat/laudos/{laudo_id}/mensagens"): {"laudo_id": [2]},
        ("post", "/cliente/api/chat/laudos/{laudo_id}/finalizar"): {"laudo_id": [1]},
        ("post", "/cliente/api/chat/laudos/{laudo_id}/reabrir"): {"laudo_id": [3]},
        ("patch", "/cliente/api/usuarios/{usuario_id}"): {"usuario_id": [4]},
        ("patch", "/cliente/api/usuarios/{usuario_id}/bloqueio"): {"usuario_id": [3]},
        ("post", "/cliente/api/usuarios/{usuario_id}/resetar-senha"): {"usuario_id": [3]},
        ("get", "/cliente/api/mesa/laudos/{laudo_id}/mensagens"): {"laudo_id": [1]},
        ("get", "/cliente/api/mesa/laudos/{laudo_id}/completo"): {"laudo_id": [1]},
        ("get", "/cliente/api/mesa/laudos/{laudo_id}/pacote"): {"laudo_id": [1]},
        ("get", "/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"): {"laudo_id": [1], "anexo_id": [1]},
        ("post", "/cliente/api/mesa/laudos/{laudo_id}/responder"): {"laudo_id": [2]},
        ("post", "/cliente/api/mesa/laudos/{laudo_id}/responder-anexo"): {"laudo_id": [2]},
        ("patch", "/cliente/api/mesa/laudos/{laudo_id}/pendencias/{mensagem_id}"): {"laudo_id": [1], "mensagem_id": [1]},
        ("post", "/cliente/api/mesa/laudos/{laudo_id}/avaliar"): {"laudo_id": [3]},
        ("post", "/cliente/api/mesa/laudos/{laudo_id}/marcar-whispers-lidos"): {"laudo_id": [1]},
    }

    body_iniciar = components.get("Body_api_iniciar_relatorio_app_api_laudo_iniciar_post")
    if isinstance(body_iniciar, dict):
        for nome_campo in ("tipo_template", "tipotemplate"):
            campo = body_iniciar.setdefault("properties", {}).get(nome_campo)
            if not isinstance(campo, dict):
                continue

            variantes = campo.get("anyOf")
            if not isinstance(variantes, list):
                continue

            aceita_vazio = any(isinstance(item, dict) and item.get("maxLength") == 0 for item in variantes)
            if not aceita_vazio:
                variantes.insert(0, {"type": "string", "maxLength": 0})

    _aplicar_campos_binarios_em_bodies(components, ("arquivo", "foto", "arquivo_base"))

    dados_chat = components.get("DadosChat")
    if isinstance(dados_chat, dict):
        props = dados_chat.setdefault("properties", {})
        for campo in ("mensagem", "dados_imagem", "texto_documento"):
            if isinstance(props.get(campo), dict):
                props[campo].setdefault("minLength", 0)
        dados_chat["anyOf"] = [
            {"properties": {"mensagem": {"minLength": 1}}},
            {"properties": {"dados_imagem": {"minLength": 1}}},
            {"properties": {"texto_documento": {"minLength": 1}}},
        ]

    if hints_schemathesis:
        dados_whisper = components.get("DadosWhisper")
        if isinstance(dados_whisper, dict):
            props = dados_whisper.setdefault("properties", {})
            for nome_campo, valores in {
                "laudo_id": [1],
                "destinatario_id": [2],
                "referencia_mensagem_id": [1],
            }.items():
                campo = props.get(nome_campo)
                if isinstance(campo, dict):
                    campo["enum"] = valores

    body_upload_template = components.get("Body_upload_template_laudo_revisao_api_templates_laudo_upload_post")
    if isinstance(body_upload_template, dict):
        props = _obter_propriedades_schema(body_upload_template)
        for nome_campo, tamanho_minimo in {"nome": 1, "codigo_template": 1}.items():
            campo = props.get(nome_campo)
            if isinstance(campo, dict):
                campo["minLength"] = tamanho_minimo

    dados_preview_template = components.get("DadosPreviewTemplateLaudo")
    if isinstance(dados_preview_template, dict):
        props = _obter_propriedades_schema(dados_preview_template)
        laudo_id = props.get("laudo_id")
        if isinstance(laudo_id, dict) and hints_schemathesis:
            laudo_id["enum"] = [1]
        dados_formulario = props.get("dados_formulario")
        if isinstance(dados_formulario, dict):
            dados_formulario["minProperties"] = 1

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if not isinstance(operation, dict):
                continue
            for parametro in operation.get("parameters", []):
                if not isinstance(parametro, dict):
                    continue
                if parametro.get("in") != "path":
                    continue
                if parametro.get("name") not in {"laudo_id", "mensagem_id", "anexo_id", "template_id", "asset_id", "usuario_id"}:
                    continue
                schema_param = parametro.setdefault("schema", {})
                if isinstance(schema_param, dict):
                    if parametro.get("name") != "asset_id":
                        schema_param["minimum"] = 1
                    if hints_schemathesis:
                        ids_fixos = ids_por_operacao.get((str(method).lower(), path), {})
                        if isinstance(ids_fixos, dict):
                            valor_enum = ids_fixos.get(parametro.get("name"))
                            if isinstance(valor_enum, list) and valor_enum:
                                schema_param["enum"] = valor_enum


def _limpar_openapi_para_rotas_de_api(schema: dict[str, Any]) -> None:
    paths = schema.setdefault("paths", {})
    prefixes_api = ("/api/", "/app/api/", "/revisao/api/", "/cliente/api/", "/admin/api/")
    rotas_operacionais = {"/health", "/ready"}

    schema["paths"] = {
        caminho: definicao
        for caminho, definicao in paths.items()
        if caminho in rotas_operacionais or any(caminho.startswith(prefixo) for prefixo in prefixes_api)
    }


def registrar_openapi_custom(app: FastAPI) -> None:
    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        _ajustar_openapi_contratos_inspetor(schema)
        _limpar_openapi_para_rotas_de_api(schema)
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi


def registrar_exception_handlers(
    app: FastAPI,
    *,
    logger: logging.Logger,
    sessao_local: Callable[[], Any],
    obter_dados_sessao_portal: Callable[..., dict[str, Any]],
    token_esta_ativo: Callable[[str], bool],
    obter_usuario_da_sessao: Callable[[Request, Session], Any | None],
    redirecionar_por_nivel: Callable[[Any], RedirectResponse],
    rota_api: Callable[[str], bool],
    pagina_html_erro: Callable[[str, str, str | None, int], HTMLResponse],
) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "detail": _sanitizar_para_json(exc.errors()),
                "correlation_id": getattr(request.state, "correlation_id", None),
            },
        )

    @app.exception_handler(404)
    async def nao_encontrado_handler(request: Request, exc: Exception) -> Response:
        correlation_id = getattr(request.state, "correlation_id", None)
        caminho = request.url.path

        if rota_api(caminho):
            detalhe: object = "Recurso não encontrado."
            if isinstance(exc, HTTPException):
                detalhe_exc = getattr(exc, "detail", None)
                if isinstance(detalhe_exc, str):
                    if detalhe_exc.strip().lower() not in {"not found"}:
                        detalhe = detalhe_exc
                elif isinstance(detalhe_exc, (dict, list)):
                    detalhe = detalhe_exc

            return JSONResponse(
                status_code=404,
                content={
                    "detail": detalhe,
                    "correlation_id": correlation_id,
                },
            )

        try:
            token = obter_dados_sessao_portal(
                request.session,
                caminho=request.url.path,
            ).get("token")
        except Exception:
            token = None

        if not token or not token_esta_ativo(token):
            return RedirectResponse(url="/app/login", status_code=302)

        try:
            with sessao_local() as banco:
                usuario = obter_usuario_da_sessao(request, banco)
                if usuario:
                    return redirecionar_por_nivel(usuario)
        except Exception:
            logger.warning("Falha ao consultar usuário no handler 404.", exc_info=True)

        return RedirectResponse(url="/app/login", status_code=302)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> Response:
        correlation_id = getattr(request.state, "correlation_id", None)
        caminho = request.url.path

        logger.exception(
            "Erro interno não tratado",
            extra={
                "path": caminho,
                "method": request.method,
            },
        )

        if rota_api(caminho):
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Erro interno do servidor.",
                    "correlation_id": correlation_id,
                },
            )

        return pagina_html_erro(
            "Erro interno",
            "O sistema encontrou um erro inesperado. Tente novamente em instantes.",
            correlation_id,
            500,
        )


def registrar_rotas_operacionais(
    app: FastAPI,
    *,
    dir_static: Path,
    app_versao: str,
    ambiente: str,
    em_producao: bool,
    redis_url: str | None,
    logger: logging.Logger,
    sessao_local: Callable[[], Any],
    obter_banco: Callable[..., Any],
    portal_por_caminho: Callable[[str | None], str | None],
    obter_dados_sessao_portal: Callable[..., dict[str, Any]],
    sessoes_ativas: dict[str, int],
    usuario_model: type[Any],
    describe_revisor_realtime: Callable[[], dict[str, Any]],
    token_esta_ativo: Callable[[str], bool],
    obter_usuario_da_sessao: Callable[[Request, Session], Any | None],
    redirecionar_por_nivel: Callable[[Any], RedirectResponse],
) -> None:
    @app.get("/app/trabalhador_servico.js", include_in_schema=False)
    async def service_worker() -> Response:
        caminho = dir_static / "js" / "shared" / "trabalhador_servico.js"
        if not caminho.is_file():
            return Response(status_code=404)

        return FileResponse(
            str(caminho),
            media_type="application/javascript",
            headers={
                "Service-Worker-Allowed": "/app/",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

    @app.get("/app/manifesto.json", include_in_schema=False)
    async def manifesto() -> Response:
        caminho = dir_static / "manifesto.json"
        if not caminho.is_file():
            return Response(status_code=404)

        return FileResponse(
            str(caminho),
            media_type="application/manifest+json",
            headers={
                "Cache-Control": "public, max-age=3600",
            },
        )

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> Response:
        for nome in ("img/favicon.ico", "img/favicon-32x32.png", "img/android-chrome-192x192.png"):
            caminho = dir_static / nome
            if caminho.is_file():
                return FileResponse(
                    str(caminho),
                    headers={"Cache-Control": "public, max-age=86400"},
                )
        return Response(status_code=404)

    @app.get("/health", include_in_schema=False)
    async def health_check() -> JSONResponse:
        return JSONResponse(
            {
                "status": "ok",
                "versao": app_versao,
                "ambiente": ambiente,
            }
        )

    @app.get("/ready", include_in_schema=False)
    async def readiness_check() -> JSONResponse:
        realtime_status = describe_revisor_realtime()
        detalhes = {
            "status": "ok",
            "banco": "ok",
            "rate_limit_storage": "memory" if not redis_url else "redis_configurado",
            "revisor_realtime_backend": realtime_status["backend"],
            "revisor_realtime_distributed": realtime_status["distributed"],
            "ambiente": ambiente,
            "versao": app_versao,
        }

        try:
            with sessao_local() as banco:
                banco.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Readiness falhou ao consultar banco")
            return JSONResponse(
                status_code=503,
                content={
                    "status": "erro",
                    "banco": "indisponivel",
                    "ambiente": ambiente,
                    "versao": app_versao,
                },
            )

        return JSONResponse(detalhes)

    if not em_producao:

        @app.get("/debug-sessao", include_in_schema=False)
        def debug_sessao(
            request: Request,
            banco: Session = Depends(obter_banco),
        ) -> dict[str, Any]:
            portal_atual = portal_por_caminho(request.url.path)
            token = obter_dados_sessao_portal(
                request.session,
                portal=portal_atual,
                caminho=request.url.path,
            ).get("token", "Nenhum token")
            usuario_id = sessoes_ativas.get(token, "Nenhum ID")

            if isinstance(usuario_id, int):
                usuario = banco.get(usuario_model, usuario_id)
                if usuario:
                    return {
                        "email": usuario.email,
                        "nivel_acesso": usuario.nivel_acesso,
                        "nome": getattr(
                            usuario,
                            "nome_completo",
                            getattr(usuario, "nome", ""),
                        ),
                        "status": "Sessão válida.",
                    }

            return {
                "erro": "Sessão não reconhecida ou expirada.",
                "token_recebido": token,
                "id_memoria": usuario_id,
            }

    @app.get("/", include_in_schema=False)
    def redirecionamento_raiz(
        request: Request,
        banco: Session = Depends(obter_banco),
    ) -> RedirectResponse:
        usuario = obter_usuario_da_sessao(request, banco)

        if usuario:
            logger.debug(
                "Redirecionando usuário autenticado",
                extra={
                    "email": usuario.email,
                    "nivel_acesso": usuario.nivel_acesso,
                },
            )
            return redirecionar_por_nivel(usuario)

        logger.debug("Sessão inválida ou inexistente. Redirecionando para /app/login")
        return RedirectResponse(url="/app/login", status_code=302)
