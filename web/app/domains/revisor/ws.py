from __future__ import annotations

from typing import Any

from fastapi import HTTPException, WebSocket, WebSocketDisconnect

from app.domains.revisor.base import _agora_utc, logger, roteador_revisor
from app.domains.revisor.realtime import ConnectionManager, manager
from app.shared.database import NivelAcesso, Usuario
from app.shared.security import (
    PORTAL_REVISOR,
    SESSOES_ATIVAS,
    obter_dados_sessao_portal,
    token_esta_ativo,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
)


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

    with rotas_revisor.SessaoLocal() as banco:
        usuario = banco.get(Usuario, usuario_id_int)
        if not usuario or usuario.empresa_id != empresa_id_int:
            raise HTTPException(status_code=401, detail="Sessão WebSocket inválida.")

        if usuario_tem_bloqueio_ativo(usuario):
            raise HTTPException(status_code=403, detail="Acesso bloqueado ao WebSocket.")

        if not usuario_tem_acesso_portal(usuario, PORTAL_REVISOR):
            raise HTTPException(status_code=403, detail="Acesso negado ao WebSocket.")

        nome = getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or nome

    if nivel_acesso_int not in {int(NivelAcesso.REVISOR), int(NivelAcesso.DIRETORIA)}:
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
