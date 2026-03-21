from __future__ import annotations

from typing import Any

from fastapi import HTTPException, WebSocket, WebSocketDisconnect

from app.domains.revisor.base import _agora_utc, logger, roteador_revisor
from app.domains.revisor.realtime import ConnectionManager, manager
from app.shared.database import NivelAcesso, Usuario
from app.shared.security import (
    PORTAL_REVISOR,
    obter_dados_sessao_portal,
    token_esta_ativo,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
)

_DETALHE_SESSAO_WS_INVALIDA = "Sessão WebSocket inválida."


def _erro_ws(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _usuario_ws_da_sessao(websocket: WebSocket) -> dict[str, Any]:
    import app.domains.revisor.routes as rotas_revisor

    sessao = getattr(websocket, "session", None) or {}
    dados_sessao = obter_dados_sessao_portal(sessao, portal=PORTAL_REVISOR)

    token = dados_sessao.get("token")
    usuario_id = dados_sessao.get("usuario_id")
    empresa_id = dados_sessao.get("empresa_id")
    nivel_acesso = dados_sessao.get("nivel_acesso")
    nome = dados_sessao.get("nome") or sessao.get("nome_completo") or "Revisor"

    if not token or not token_esta_ativo(token):
        raise _erro_ws(401, _DETALHE_SESSAO_WS_INVALIDA)

    if not usuario_id or not empresa_id or nivel_acesso is None:
        raise _erro_ws(401, _DETALHE_SESSAO_WS_INVALIDA)

    try:
        usuario_id_int = int(usuario_id)
        empresa_id_int = int(empresa_id)
        nivel_acesso_int = int(nivel_acesso)
    except (TypeError, ValueError):
        raise _erro_ws(401, _DETALHE_SESSAO_WS_INVALIDA) from None

    with rotas_revisor.SessaoLocal() as banco:
        usuario = banco.get(Usuario, usuario_id_int)
        if not usuario or usuario.empresa_id != empresa_id_int:
            raise _erro_ws(401, _DETALHE_SESSAO_WS_INVALIDA)

        if usuario_tem_bloqueio_ativo(usuario):
            raise _erro_ws(403, "Acesso bloqueado ao WebSocket.")

        if not usuario_tem_acesso_portal(usuario, PORTAL_REVISOR):
            raise _erro_ws(403, "Acesso negado ao WebSocket.")

        nome = getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or nome

    if nivel_acesso_int not in {int(NivelAcesso.REVISOR), int(NivelAcesso.DIRETORIA)}:
        raise _erro_ws(403, "Acesso negado ao WebSocket.")

    return {
        "usuario_id": usuario_id_int,
        "empresa_id": empresa_id_int,
        "nivel_acesso": nivel_acesso_int,
        "nome": nome,
    }


def _payload_ws_valido(payload: Any) -> dict[str, Any] | None:
    return payload if isinstance(payload, dict) else None


def _resolver_payload_broadcast_mesa(payload: dict[str, Any], *, nome_padrao: str) -> tuple[int | None, dict[str, Any] | None]:
    try:
        valor_laudo_id = payload.get("laudo_id")
        if valor_laudo_id is None:
            return None, None
        laudo_id = int(str(valor_laudo_id))
    except (TypeError, ValueError):
        return None, None

    mensagem = {
        "tipo": "whisper_ping",
        "laudo_id": laudo_id,
        "inspetor": str(payload.get("inspetor") or nome_padrao)[:120],
        "preview": str(payload.get("preview", ""))[:120],
        "timestamp": _agora_utc().isoformat(),
    }
    return laudo_id, mensagem


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

    async def _enviar_erro_ws(detail: str) -> bool:
        return await _enviar_ws_seguro({"tipo": "erro", "detail": detail})

    async def _fechar_ws_seguro(code: int) -> None:
        try:
            await websocket.close(code=code)
        except (WebSocketDisconnect, RuntimeError):
            return
        except Exception:
            logger.debug("Falha ao fechar WebSocket de whispers.", exc_info=True)

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
                bruto = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                if not await _enviar_erro_ws("Payload WebSocket inválido."):
                    break
                continue

            data = _payload_ws_valido(bruto)
            if data is None:
                if not await _enviar_erro_ws("Payload WebSocket inválido."):
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
                laudo_id, payload_broadcast = _resolver_payload_broadcast_mesa(data, nome_padrao=str(dados_usuario.get("nome") or "Revisor"))
                if laudo_id is None or payload_broadcast is None:
                    if not await _enviar_erro_ws("laudo_id inválido para broadcast_mesa."):
                        break
                    continue

                await manager.broadcast_empresa(
                    empresa_id=empresa_id,
                    mensagem=payload_broadcast,
                )
                continue

            if not await _enviar_erro_ws("Ação WebSocket inválida."):
                break

    except HTTPException as exc:
        await _fechar_ws_seguro(4401 if exc.status_code == 401 else 4403)
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        pass
    except Exception:
        logger.warning("Erro inesperado no WebSocket de whispers.", exc_info=True)
    finally:
        if conexao_ativa and empresa_id is not None and usuario_id is not None:
            manager.disconnect(empresa_id, usuario_id, websocket)


__all__ = [
    "ConnectionManager",
    "_usuario_ws_da_sessao",
    "manager",
    "websocket_whispers",
]
