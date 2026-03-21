"""Fluxo principal de chat e stream do inspetor."""

from __future__ import annotations

import asyncio
import json
import uuid
from decimal import Decimal
from typing import Any

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.domains.chat.auth_helpers import usuario_nome
from app.domains.chat.app_context import logger
from app.domains.chat.chat_runtime import (
    MODO_DEEP,
    PREFIXO_CITACOES,
    PREFIXO_METADATA,
    PREFIXO_MODO_HUMANO,
    TIMEOUT_FILA_STREAM_SEGUNDOS,
    executor_stream,
)
from app.domains.chat.chat_runtime_support import salvar_mensagem_ia
from app.domains.chat.commands_helpers import montar_resposta_comando_rapido, registrar_comando_rapido_historico
from app.domains.chat.core_helpers import agora_utc, evento_sse, obter_preview_primeira_mensagem
from app.domains.chat.gate_helpers import garantir_gate_qualidade_laudo
from app.domains.chat.ia_runtime import obter_cliente_ia_ativo
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.laudo_state_helpers import (
    laudo_permite_edicao_inspetor,
    laudo_possui_historico_visivel,
    laudo_tem_interacao,
    serializar_card_laudo,
)
from app.domains.chat.learning_helpers import (
    anexar_contexto_aprendizado_na_mensagem,
    construir_contexto_aprendizado_para_ia,
    registrar_aprendizado_visual_automatico_chat,
)
from app.domains.chat.limits_helpers import (
    garantir_deep_research_habilitado,
    garantir_limite_laudos,
    garantir_upload_documento_habilitado,
)
from app.domains.chat.media_helpers import nome_documento_seguro, validar_historico_total, validar_imagem_base64
from app.domains.chat.mensagem_helpers import notificar_mesa_whisper
from app.domains.chat.normalization import normalizar_tipo_template
from app.domains.chat.schemas import DadosChat
from app.domains.chat.session_helpers import aplicar_contexto_laudo_selecionado, exigir_csrf
from app.shared.database import (
    Laudo,
    MensagemLaudo,
    StatusRevisao,
    TipoMensagem,
    Usuario,
    commit_ou_rollback_operacional,
    obter_banco,
)
from app.shared.security import exigir_inspetor
from nucleo.inspetor.comandos_chat import (
    analisar_comando_finalizacao,
    analisar_comando_rapido_chat,
    mensagem_para_mesa,
    remover_mencao_mesa,
)
from nucleo.inspetor.confianca_ia import analisar_confianca_resposta_ia
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia

roteador_chat_stream = APIRouter()


async def rota_chat(
    dados: DadosChat,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    validar_historico_total(dados.historico)

    mensagem_limpa = (dados.mensagem or "").strip()
    comando_rapido, argumento_comando_rapido = analisar_comando_rapido_chat(mensagem_limpa)
    dados_imagem_validos = validar_imagem_base64(dados.dados_imagem)
    texto_documento = (dados.texto_documento or "").strip()
    nome_documento = nome_documento_seguro(dados.nome_documento)

    if not mensagem_limpa and not dados_imagem_validos and not texto_documento:
        raise HTTPException(
            status_code=400,
            detail="Envie texto, imagem ou documento.",
        )

    if texto_documento:
        garantir_upload_documento_habilitado(usuario, banco)

    if dados.modo == MODO_DEEP:
        garantir_deep_research_habilitado(usuario, banco)

    laudo_id_requisitado = dados.laudo_id

    if not laudo_id_requisitado:
        garantir_limite_laudos(usuario, banco)

    laudo: Laudo | None = None
    primeira_interacao_real = False
    if dados.laudo_id:
        laudo = obter_laudo_do_inspetor(banco, dados.laudo_id, usuario)
        primeira_interacao_real = not laudo_tem_interacao(banco, laudo.id)

        if not laudo_permite_edicao_inspetor(laudo):
            if laudo.status_revisao == StatusRevisao.APROVADO.value:
                detalhe = "Laudo aprovado não pode ser editado."
            elif laudo.status_revisao == StatusRevisao.REJEITADO.value:
                detalhe = "Laudo em ajustes precisa ser reaberto antes de receber novas mensagens."
            elif getattr(laudo, "reabertura_pendente_em", None):
                detalhe = "Laudo com ajustes da mesa precisa ser reaberto antes de continuar."
            else:
                detalhe = "Laudo aguardando avaliação não pode receber novas mensagens."
            raise HTTPException(
                status_code=400,
                detail=detalhe,
            )

    if comando_rapido:
        if dados_imagem_validos or texto_documento:
            raise HTTPException(
                status_code=400,
                detail="Comandos rápidos não aceitam imagem ou documento.",
            )

        if comando_rapido == "enviar_mesa":
            if not laudo:
                raise HTTPException(
                    status_code=400,
                    detail="A conversa com a mesa avaliadora só é permitida após iniciar uma nova inspeção.",
                )
            if not argumento_comando_rapido:
                raise HTTPException(
                    status_code=400,
                    detail="Use /enviar_mesa seguido da mensagem para a mesa avaliadora.",
                )
            mensagem_limpa = f"@insp {argumento_comando_rapido}"
        else:
            if not laudo:
                raise HTTPException(
                    status_code=400,
                    detail="Esse comando exige um relatório ativo.",
                )

            texto_comando = montar_resposta_comando_rapido(
                banco=banco,
                laudo=laudo,
                comando=comando_rapido,
                argumento=argumento_comando_rapido,
            )
            registrar_comando_rapido_historico(
                banco=banco,
                laudo=laudo,
                usuario=usuario,
                comando=comando_rapido,
                argumento=argumento_comando_rapido,
                resposta=texto_comando,
            )
            banco.flush()
            aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

            return JSONResponse(
                {
                    "texto": texto_comando,
                    "tipo": "comando_rapido",
                    "comando": f"/{comando_rapido}",
                    "laudo_id": laudo.id,
                    "laudo_card": serializar_card_laudo(banco, laudo),
                }
            )

    if not laudo:
        laudo = Laudo(
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
            setor_industrial=dados.setor,
            tipo_template="padrao",
            codigo_hash=uuid.uuid4().hex,
            primeira_mensagem=None,
            modo_resposta=dados.modo,
            is_deep_research=(dados.modo == MODO_DEEP),
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(laudo)
        primeira_interacao_real = True

        try:
            banco.flush()
        except Exception:
            banco.rollback()
            logger.error("Falha ao criar laudo.", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Erro ao criar sessão de laudo.",
            )

    aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }

    historico_dict = [msg.model_dump() for msg in dados.historico]

    eh_comando_finalizar, tipo_template_finalizacao = analisar_comando_finalizacao(
        mensagem_limpa,
        normalizar_tipo_template=normalizar_tipo_template,
    )

    eh_whisper_para_mesa = mensagem_para_mesa(mensagem_limpa)
    referencia_mensagem_id = None
    texto_exibicao = ""

    if eh_whisper_para_mesa:
        tipo_msg_usuario = TipoMensagem.HUMANO_INSP.value
        texto_exibicao = remover_mencao_mesa(mensagem_limpa)
        if not texto_exibicao:
            raise HTTPException(status_code=400, detail="Mensagem para a mesa está vazia.")
        referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
        texto_salvar = compor_texto_com_referencia(texto_exibicao, referencia_mensagem_id)
    elif eh_comando_finalizar:
        tipo_msg_usuario = TipoMensagem.USER.value
        texto_salvar = "*(Inspetor solicitou encerramento e geração do laudo)*"
        texto_exibicao = texto_salvar
    else:
        tipo_msg_usuario = TipoMensagem.USER.value
        texto_salvar = mensagem_limpa or nome_documento or "[imagem]"
        texto_exibicao = texto_salvar

    mensagem_usuario = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        tipo=tipo_msg_usuario,
        conteudo=texto_salvar,
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(mensagem_usuario)
    banco.flush()

    laudo.atualizado_em = agora_utc()
    laudo.modo_resposta = dados.modo
    laudo.is_deep_research = dados.modo == MODO_DEEP

    if not laudo.primeira_mensagem:
        laudo.primeira_mensagem = obter_preview_primeira_mensagem(
            mensagem_limpa,
            nome_documento=nome_documento,
            tem_imagem=bool(dados_imagem_validos),
        )

    if tipo_msg_usuario == TipoMensagem.USER.value and not eh_comando_finalizar:
        registrar_aprendizado_visual_automatico_chat(
            banco,
            empresa_id=usuario.empresa_id,
            laudo_id=laudo.id,
            criado_por_id=usuario.id,
            setor_industrial=str(laudo.setor_industrial or "geral"),
            mensagem_id=int(mensagem_usuario.id),
            mensagem_chat=mensagem_limpa,
            dados_imagem=dados_imagem_validos,
            referencia_mensagem_id=int(dados.referencia_mensagem_id or 0) or None,
        )

    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar mensagem inicial do stream de chat.",
    )
    aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    laudo_id_atual = laudo.id
    empresa_id_atual = usuario.empresa_id
    usuario_id_atual = usuario.id
    usuario_nome_atual = usuario_nome(usuario)
    card_laudo_payload = serializar_card_laudo(banco, laudo) if primeira_interacao_real and laudo_possui_historico_visivel(banco, laudo) else None
    contexto_aprendizado_ia = construir_contexto_aprendizado_para_ia(
        banco,
        empresa_id=empresa_id_atual,
        laudo_id=laudo_id_atual,
        setor_industrial=str(laudo.setor_industrial or "geral"),
        mensagem_atual=mensagem_limpa,
    )
    mensagem_para_ia = anexar_contexto_aprendizado_na_mensagem(
        mensagem_limpa,
        contexto_aprendizado=contexto_aprendizado_ia,
    )

    if eh_whisper_para_mesa:

        async def gerador_humano():
            payload_inicial = {"laudo_id": laudo_id_atual}
            if card_laudo_payload:
                payload_inicial["laudo_card"] = card_laudo_payload
            yield evento_sse(payload_inicial)

            await notificar_mesa_whisper(
                empresa_id=empresa_id_atual,
                laudo_id=laudo_id_atual,
                inspetor_id=usuario_id_atual,
                inspetor_nome=usuario_nome_atual,
                preview=texto_exibicao,
            )

            yield evento_sse(
                {
                    "tipo": TipoMensagem.HUMANO_INSP.value,
                    "tipo_humano": TipoMensagem.HUMANO_INSP.value,
                    "texto": texto_exibicao,
                    "remetente": "inspetor",
                    "destinatario": "engenharia",
                    "laudo_id": laudo_id_atual,
                    "mensagem_id": mensagem_usuario.id,
                    "referencia_mensagem_id": referencia_mensagem_id,
                }
            )
            yield "data: [FIM]\n\n"

        return StreamingResponse(
            gerador_humano(),
            media_type="text/event-stream",
            headers=headers,
        )

    if eh_comando_finalizar:
        laudo.tipo_template = tipo_template_finalizacao
        laudo.atualizado_em = agora_utc()

        texto_resposta = "✅ **Sessão finalizada!** O laudo foi encaminhado para o engenheiro revisor."

        if tipo_template_finalizacao == "cbmgo":
            from app.domains.chat.templates_ai import RelatorioCBMGO

            texto_resposta = "✅ **Relatório CBM-GO estruturado gerado!** As tabelas foram preenchidas."
            try:
                cliente_ia_ativo = obter_cliente_ia_ativo()
                dados_json = await cliente_ia_ativo.gerar_json_estruturado(
                    schema_pydantic=RelatorioCBMGO,
                    historico=historico_dict,
                    dados_imagem=dados_imagem_validos,
                    texto_documento=texto_documento,
                )
                laudo.dados_formulario = dados_json
            except Exception:
                logger.error(
                    "Falha ao gerar JSON estruturado CBM-GO.",
                    exc_info=True,
                )
                texto_resposta = "❌ O laudo foi enviado ao revisor, mas houve falha ao estruturar as tabelas CBM-GO."

        garantir_gate_qualidade_laudo(banco, laudo)

        laudo.status_revisao = StatusRevisao.AGUARDANDO.value
        laudo.encerrado_pelo_inspetor_em = agora_utc()
        laudo.reabertura_pendente_em = None
        banco.add(
            MensagemLaudo(
                laudo_id=laudo.id,
                tipo=TipoMensagem.IA.value,
                conteudo=texto_resposta,
                custo_api_reais=Decimal("0.0000"),
            )
        )

        commit_ou_rollback_operacional(
            banco,
            logger_operacao=logger,
            mensagem_erro="Falha ao confirmar finalizacao do laudo no stream de chat.",
        )
        aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

        async def gerador_envio():
            yield evento_sse(
                {
                    "laudo_id": laudo.id,
                    "laudo_card": serializar_card_laudo(banco, laudo),
                }
            )
            yield evento_sse({"texto": texto_resposta})
            yield "data: [FIM]\n\n"

        return StreamingResponse(
            gerador_envio(),
            media_type="text/event-stream",
            headers=headers,
        )

    eh_deep = dados.modo == MODO_DEEP
    cliente_ia_ativo = obter_cliente_ia_ativo()

    async def gerador_async():
        loop = asyncio.get_running_loop()
        fila: asyncio.Queue[str | None] = asyncio.Queue()
        resposta_completa: list[str] = []
        metadados_custo: dict[str, Any] = {}
        citacoes_deep: list[dict[str, Any]] = []
        confianca_ia_payload: dict[str, Any] = {}

        def executar_stream() -> None:
            try:
                gerador_stream = cliente_ia_ativo.gerar_resposta_stream(
                    mensagem_para_ia,
                    dados_imagem_validos or None,
                    dados.setor,
                    empresa_id=empresa_id_atual,
                    historico=historico_dict,
                    modo=dados.modo,
                    texto_documento=texto_documento or None,
                    nome_documento=nome_documento or None,
                )

                for pedaco in gerador_stream:
                    asyncio.run_coroutine_threadsafe(fila.put(pedaco), loop)
            except Exception:
                logger.error("Erro no stream da IA.", exc_info=True)
                asyncio.run_coroutine_threadsafe(
                    fila.put("\n\n**[Erro]** Falha interna."),
                    loop,
                )
            finally:
                asyncio.run_coroutine_threadsafe(fila.put(None), loop)

        payload_inicial = {"laudo_id": laudo_id_atual}
        if card_laudo_payload:
            payload_inicial["laudo_card"] = card_laudo_payload
        yield evento_sse(payload_inicial)
        future = loop.run_in_executor(executor_stream, executar_stream)

        try:
            while True:
                try:
                    pedaco = await asyncio.wait_for(
                        fila.get(),
                        timeout=TIMEOUT_FILA_STREAM_SEGUNDOS,
                    )
                except asyncio.TimeoutError:
                    yield evento_sse({"texto": "\n\n**[Timeout]** A IA demorou muito."})
                    break

                if pedaco is None:
                    break

                if pedaco.startswith(PREFIXO_METADATA):
                    try:
                        metadados_custo = json.loads(pedaco[len(PREFIXO_METADATA) :])
                    except Exception:
                        metadados_custo = {}
                    continue

                if pedaco.startswith(PREFIXO_CITACOES):
                    try:
                        citacoes_deep = json.loads(pedaco[len(PREFIXO_CITACOES) :])
                        if not isinstance(citacoes_deep, list):
                            citacoes_deep = []
                    except Exception:
                        citacoes_deep = []

                    if citacoes_deep:
                        yield evento_sse({"citacoes": citacoes_deep})
                    continue

                if pedaco.startswith(PREFIXO_MODO_HUMANO):
                    continue

                resposta_completa.append(pedaco)
                yield evento_sse({"texto": pedaco})

            texto_final_stream = "".join(resposta_completa)
            if texto_final_stream.strip():
                confianca_ia_payload = analisar_confianca_resposta_ia(texto_final_stream)
                if confianca_ia_payload:
                    yield evento_sse({"confianca_ia": confianca_ia_payload})

            yield "data: [FIM]\n\n"
        except asyncio.CancelledError:
            future.cancel()
            raise
        finally:
            await salvar_mensagem_ia(
                laudo_id=laudo_id_atual,
                usuario_id=usuario_id_atual,
                empresa_id=empresa_id_atual,
                texto_final="".join(resposta_completa),
                metadados=metadados_custo,
                is_deep=eh_deep,
                citacoes=citacoes_deep if eh_deep else None,
                confianca_ia=confianca_ia_payload or None,
            )

    return StreamingResponse(
        gerador_async(),
        media_type="text/event-stream",
        headers=headers,
    )


roteador_chat_stream.add_api_route(
    "/api/chat",
    rota_chat,
    methods=["POST"],
    responses={
        200: {
            "description": "Resposta do chat em JSON ou fluxo SSE.",
            "content": {
                "application/json": {},
                "text/event-stream": {},
            },
        },
        400: {"description": "Payload do chat inválido para a operação solicitada."},
    },
)


__all__ = [
    "rota_chat",
    "roteador_chat_stream",
]
