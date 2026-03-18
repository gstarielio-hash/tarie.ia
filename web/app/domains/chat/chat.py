"""Rotas de chat IA (inspetor)."""

from __future__ import annotations

import asyncio
import io
import json
import os
import tempfile
import uuid
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Optional

from fastapi import Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

import app.domains.chat.routes as rotas_inspetor
from app.domains.chat.auth_helpers import usuario_nome
from app.domains.chat.app_context import logger
from app.domains.chat.chat_runtime import (
    LIMITE_DOC_BYTES,
    LIMITE_DOC_CHARS,
    LIMITE_PARECER,
    MIME_DOC_PERMITIDOS,
    MODO_DEEP,
    MODO_DETALHADO,
    PREFIXO_CITACOES,
    PREFIXO_METADATA,
    PREFIXO_MODO_HUMANO,
    TEM_DOCX,
    TEM_PYPDF,
    TIMEOUT_FILA_STREAM_SEGUNDOS,
    TIMEOUT_KEEPALIVE_SSE_SEGUNDOS,
    executor_stream,
    leitor_docx,
    leitor_pdf,
)
from app.domains.chat.core_helpers import (
    agora_utc,
    evento_sse,
    obter_preview_primeira_mensagem,
    resposta_json_ok,
)
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.media_helpers import (
    nome_documento_seguro,
    safe_remove_file,
    validar_historico_total,
    validar_imagem_base64,
)
from app.domains.chat.mensagem_helpers import (
    notificar_mesa_whisper,
    serializar_historico_mensagem,
)
from app.domains.chat.normalization import normalizar_tipo_template
from app.domains.chat.commands_helpers import (
    montar_resposta_comando_rapido,
    registrar_comando_rapido_historico,
)
from app.domains.chat.gate_helpers import garantir_gate_qualidade_laudo
from app.domains.chat.limits_helpers import (
    garantir_deep_research_habilitado,
    garantir_limite_laudos,
    garantir_upload_documento_habilitado,
)
from app.domains.chat.laudo_state_helpers import (
    laudo_permite_edicao_inspetor,
    laudo_possui_historico_visivel,
    laudo_tem_interacao,
    serializar_card_laudo,
)
from app.domains.chat.notifications import inspetor_notif_manager
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.chat.revisao_helpers import _registrar_revisao_laudo
from app.domains.chat.session_helpers import (
    aplicar_contexto_laudo_selecionado,
    exigir_csrf,
    laudo_id_sessao,
)
from app.domains.chat.template_helpers import selecionar_template_ativo_para_tipo
from app.domains.chat.schemas import DadosChat, DadosFeedback, DadosPDF
from app.domains.chat.templates_ai import RelatorioCBMGO
from app.shared.database import (
    CitacaoLaudo,
    Empresa,
    Laudo,
    MensagemLaudo,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_inspetor
from nucleo.gerador_laudos import GeradorLaudos
from nucleo.inspetor.comandos_chat import (
    analisar_comando_finalizacao,
    analisar_comando_rapido_chat,
    mensagem_para_mesa,
    remover_mencao_mesa,
)
from nucleo.inspetor.confianca_ia import (
    analisar_confianca_resposta_ia,
    normalizar_payload_confianca_ia,
)
from nucleo.inspetor.referencias_mensagem import compor_texto_com_referencia
from nucleo.template_editor_word import (
    MODO_EDITOR_RICO,
    documento_editor_padrao,
    estilo_editor_padrao,
    gerar_pdf_editor_rico_bytes,
    normalizar_modo_editor,
)
from nucleo.template_laudos import gerar_preview_pdf_template

roteador_chat = APIRouter()
RESPOSTA_LAUDO_NAO_ENCONTRADO = {404: {"description": "Laudo não encontrado."}}


async def sse_notificacoes_inspetor(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
):
    if os.getenv("SCHEMATHESIS_TEST_HINTS") == "1":

        async def gerador_hint():
            yield evento_sse({"tipo": "conectado", "usuario_id": usuario.id})

        return StreamingResponse(
            gerador_hint(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    fila = await inspetor_notif_manager.conectar(usuario.id)

    async def gerador():
        try:
            yield evento_sse({"tipo": "conectado", "usuario_id": usuario.id})

            while True:
                if await request.is_disconnected():
                    break

                try:
                    msg = await asyncio.wait_for(
                        fila.get(),
                        timeout=TIMEOUT_KEEPALIVE_SSE_SEGUNDOS,
                    )
                    yield evento_sse(msg)
                except asyncio.TimeoutError:
                    yield evento_sse({"tipo": "heartbeat"})
        finally:
            inspetor_notif_manager.desconectar(usuario.id, fila)

    return StreamingResponse(
        gerador(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
            banco.commit()
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

    laudo.atualizado_em = agora_utc()
    laudo.modo_resposta = dados.modo
    laudo.is_deep_research = dados.modo == MODO_DEEP

    if not laudo.primeira_mensagem:
        laudo.primeira_mensagem = obter_preview_primeira_mensagem(
            mensagem_limpa,
            nome_documento=nome_documento,
            tem_imagem=bool(dados_imagem_validos),
        )

    banco.commit()
    aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    laudo_id_atual = laudo.id
    empresa_id_atual = usuario.empresa_id
    usuario_id_atual = usuario.id
    usuario_nome_atual = usuario_nome(usuario)
    card_laudo_payload = serializar_card_laudo(banco, laudo) if primeira_interacao_real and laudo_possui_historico_visivel(banco, laudo) else None

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
            texto_resposta = "✅ **Relatório CBM-GO estruturado gerado!** As tabelas foram preenchidas."
            try:
                cliente_ia_ativo = rotas_inspetor.obter_cliente_ia_ativo()
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

        banco.commit()
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
    cliente_ia_ativo = rotas_inspetor.obter_cliente_ia_ativo()

    async def gerador_async():
        loop = asyncio.get_running_loop()
        fila: asyncio.Queue[Optional[str]] = asyncio.Queue()
        resposta_completa: list[str] = []
        metadados_custo: dict[str, Any] = {}
        citacoes_deep: list[dict[str, Any]] = []
        confianca_ia_payload: dict[str, Any] = {}

        def executar_stream() -> None:
            try:
                gerador_stream = cliente_ia_ativo.gerar_resposta_stream(
                    mensagem_limpa,
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


async def salvar_mensagem_ia(
    laudo_id: int,
    usuario_id: int,
    empresa_id: int,
    texto_final: str,
    metadados: Optional[dict[str, Any]],
    is_deep: bool = False,
    citacoes: Optional[list[dict[str, Any]]] = None,
    confianca_ia: Optional[dict[str, Any]] = None,
) -> None:
    if not (texto_final or "").strip():
        return

    with rotas_inspetor.SessaoLocal() as banco:
        try:
            custo_reais = Decimal("0")

            if metadados:
                try:
                    custo_reais = Decimal(str(metadados.get("custo_reais", "0")))
                except (InvalidOperation, TypeError, ValueError):
                    custo_reais = Decimal("0")

            banco.add(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo=texto_final,
                    custo_api_reais=custo_reais,
                )
            )

            laudo = banco.query(Laudo).filter(Laudo.id == laudo_id).first()
            if laudo:
                payload_confianca = normalizar_payload_confianca_ia(confianca_ia or {})
                if not payload_confianca:
                    payload_confianca = analisar_confianca_resposta_ia(texto_final)

                laudo.parecer_ia = texto_final[:LIMITE_PARECER]
                laudo.confianca_ia_json = payload_confianca or None
                laudo.custo_api_reais = (laudo.custo_api_reais or Decimal("0")) + custo_reais
                laudo.atualizado_em = agora_utc()
                _registrar_revisao_laudo(
                    banco,
                    laudo,
                    conteudo=texto_final,
                    origem="ia",
                    confianca=payload_confianca,
                )

                if is_deep and citacoes:
                    banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).delete(synchronize_session=False)

                    for citacao in citacoes:
                        referencia = str(citacao.get("referencia", "") or "")[:300].strip()
                        trecho = str(citacao.get("trecho", "") or "")[:300].strip() or None
                        url = str(citacao.get("url", "") or "")[:500].strip() or None

                        try:
                            ordem = int(citacao.get("ordem", 0) or 0)
                        except (TypeError, ValueError):
                            ordem = 0

                        if not referencia:
                            continue

                        banco.add(
                            CitacaoLaudo(
                                laudo_id=laudo_id,
                                referencia=referencia,
                                trecho=trecho,
                                url=url,
                                ordem=max(0, ordem),
                            )
                        )

            empresa = banco.query(Empresa).filter(Empresa.id == empresa_id).first()
            if empresa:
                if custo_reais > 0:
                    empresa.custo_gerado_reais = (empresa.custo_gerado_reais or Decimal("0")) + custo_reais

                empresa.mensagens_processadas = (empresa.mensagens_processadas or 0) + 1

            banco.commit()

        except Exception:
            logger.error(
                "Erro ao salvar mensagem IA | laudo_id=%s | usuario_id=%s",
                laudo_id,
                usuario_id,
                exc_info=True,
            )
            banco.rollback()


async def obter_mensagens_laudo(
    laudo_id: int,
    request: Request,
    cursor: Annotated[InteiroOpcionalNullish, Query()] = None,
    limite: int = Query(default=80, ge=20, le=200),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    estado_contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)
    card_laudo = serializar_card_laudo(banco, laudo) if laudo_possui_historico_visivel(banco, laudo) else None

    citacoes_laudo = banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).order_by(CitacaoLaudo.ordem.asc()).all()

    citacoes_list = [
        {
            "norma": cit.referencia,
            "trecho": cit.trecho or "",
            "artigo": "",
            "url": cit.url or "",
        }
        for cit in citacoes_laudo
    ]

    consulta_mensagens = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        ~MensagemLaudo.tipo.in_(
            (
                TipoMensagem.HUMANO_INSP.value,
                TipoMensagem.HUMANO_ENG.value,
            )
        ),
    )
    if cursor:
        consulta_mensagens = consulta_mensagens.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta_mensagens.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))
    cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None

    if not mensagens_pagina and not cursor:
        historico: list[dict[str, Any]] = []

        if laudo.primeira_mensagem:
            historico.append(
                {
                    "id": None,
                    "papel": "usuario",
                    "texto": laudo.primeira_mensagem,
                    "tipo": TipoMensagem.USER.value,
                }
            )

        if laudo.parecer_ia:
            historico.append(
                {
                    "id": None,
                    "papel": "assistente",
                    "texto": laudo.parecer_ia,
                    "modo": laudo.modo_resposta or MODO_DETALHADO,
                    "tipo": TipoMensagem.IA.value,
                    "citacoes": citacoes_list,
                    "confianca_ia": normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {}),
                }
            )

        return {
            "itens": historico,
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
            "estado": estado_contexto["estado"],
            "status_card": estado_contexto["status_card"],
            "permite_edicao": estado_contexto["permite_edicao"],
            "permite_reabrir": estado_contexto["permite_reabrir"],
            "laudo_card": card_laudo,
        }

    if not mensagens_pagina:
        return {
            "itens": [],
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
            "estado": estado_contexto["estado"],
            "status_card": estado_contexto["status_card"],
            "permite_edicao": estado_contexto["permite_edicao"],
            "permite_reabrir": estado_contexto["permite_reabrir"],
            "laudo_card": card_laudo,
        }

    ultima_ia_id = (
        banco.query(MensagemLaudo.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.IA.value,
        )
        .order_by(MensagemLaudo.id.desc())
        .limit(1)
        .scalar()
    )

    resultado: list[dict[str, Any]] = []
    for mensagem in mensagens_pagina:
        entrada = serializar_historico_mensagem(
            mensagem,
            laudo.modo_resposta or MODO_DETALHADO,
            citacoes_list if (mensagem.id == ultima_ia_id and citacoes_list) else None,
            normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
            if mensagem.id == ultima_ia_id and mensagem.tipo == TipoMensagem.IA.value
            else None,
        )
        resultado.append(entrada)

    return {
        "itens": resultado,
        "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
        "tem_mais": tem_mais,
        "laudo_id": laudo_id,
        "limite": limite,
        "estado": estado_contexto["estado"],
        "status_card": estado_contexto["status_card"],
        "permite_edicao": estado_contexto["permite_edicao"],
        "permite_reabrir": estado_contexto["permite_reabrir"],
        "laudo_card": card_laudo,
    }


async def rota_pdf(
    request: Request,
    dados: DadosPDF,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    nome_arquivo = f"Laudo_Tarielia_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo)

    laudo_id_candidato = dados.laudo_id or laudo_id_sessao(request)
    laudo: Laudo | None = None
    if laudo_id_candidato:
        laudo = obter_laudo_do_inspetor(banco, int(laudo_id_candidato), usuario)

    template_ativo: TemplateLaudo | None = None
    if laudo and isinstance(laudo.dados_formulario, dict) and laudo.dados_formulario:
        template_ativo = selecionar_template_ativo_para_tipo(
            banco,
            empresa_id=usuario.empresa_id,
            tipo_template=str(getattr(laudo, "tipo_template", "")),
        )

    try:
        if template_ativo:
            try:
                modo_editor = normalizar_modo_editor(getattr(template_ativo, "modo_editor", None))
                if modo_editor == MODO_EDITOR_RICO:
                    pdf_template = await gerar_pdf_editor_rico_bytes(
                        documento_editor_json=template_ativo.documento_editor_json or documento_editor_padrao(),
                        estilo_json=template_ativo.estilo_json or estilo_editor_padrao(),
                        assets_json=template_ativo.assets_json or [],
                        dados_formulario=laudo.dados_formulario or {},
                    )
                else:
                    pdf_template = gerar_preview_pdf_template(
                        caminho_pdf_base=template_ativo.arquivo_pdf_base,
                        mapeamento_campos=template_ativo.mapeamento_campos_json or {},
                        dados_formulario=laudo.dados_formulario or {},
                    )
                with open(caminho_pdf, "wb") as arquivo_saida:
                    arquivo_saida.write(pdf_template)
                return FileResponse(
                    path=caminho_pdf,
                    filename=f"Laudo_{template_ativo.codigo_template}_v{template_ativo.versao}.pdf",
                    media_type="application/pdf",
                    background=BackgroundTask(safe_remove_file, caminho_pdf),
                )
            except Exception:
                logger.warning(
                    "Falha ao gerar PDF pelo template ativo. Aplicando fallback legacy. | empresa_id=%s | usuario_id=%s | laudo_id=%s | template_id=%s",
                    usuario.empresa_id,
                    usuario.id,
                    laudo.id if laudo else None,
                    template_ativo.id,
                    exc_info=True,
                )

        GeradorLaudos.gerar_pdf_inspecao(
            dados=dados.model_dump(),
            caminho_saida=caminho_pdf,
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
        )

        return FileResponse(
            path=caminho_pdf,
            filename="laudo_art_wf.pdf",
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, caminho_pdf),
        )
    except Exception:
        logger.error("Falha ao gerar PDF.", exc_info=True)
        safe_remove_file(caminho_pdf)
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao gerar o PDF."},
        )


async def rota_upload_doc(
    request: Request,
    arquivo: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    if not usuario.empresa:
        raise HTTPException(status_code=403, detail="Empresa não configurada.")

    garantir_upload_documento_habilitado(usuario, banco)

    tipo = (arquivo.content_type or "").strip().lower()
    if tipo not in MIME_DOC_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Use PDF ou DOCX.")

    if tipo == "application/pdf" and not TEM_PYPDF:
        raise HTTPException(status_code=501, detail="Leitura de PDF indisponível.")

    if tipo != "application/pdf" and not TEM_DOCX:
        raise HTTPException(status_code=501, detail="Leitura de DOCX indisponível.")

    conteudo = await arquivo.read()
    if len(conteudo) > LIMITE_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande.")

    try:
        if tipo == "application/pdf":
            leitor = leitor_pdf.PdfReader(io.BytesIO(conteudo))
            texto = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
        else:
            documento = leitor_docx.Document(io.BytesIO(conteudo))
            texto = "\n".join(paragrafo.text for paragrafo in documento.paragraphs)
    except Exception:
        raise HTTPException(status_code=422, detail="Não foi possível extrair texto.")

    texto_bruto = (texto or "").strip()
    if not texto_bruto:
        raise HTTPException(status_code=422, detail="Documento sem texto extraível.")

    texto_truncado = texto_bruto[:LIMITE_DOC_CHARS]
    nome_seguro = nome_documento_seguro(arquivo.filename or "documento")

    return resposta_json_ok(
        {
            "texto": texto_truncado,
            "chars": len(texto_truncado),
            "nome": nome_seguro,
            "truncado": len(texto_bruto) > LIMITE_DOC_CHARS,
        }
    )


async def rota_feedback(
    request: Request,
    dados: DadosFeedback,
    usuario: Usuario = Depends(exigir_inspetor),
):
    exigir_csrf(request)

    logger.info(
        "Feedback recebido | tipo=%s | usuario_id=%s | trecho='%.80s'",
        dados.tipo,
        usuario.id,
        dados.trecho,
    )

    return resposta_json_ok({"ok": True})


chat_api = rota_chat
listar_mensagens_laudo = obter_mensagens_laudo
upload_documento = rota_upload_doc
gerar_pdf = rota_pdf
registrar_feedback = rota_feedback

roteador_chat.add_api_route(
    "/api/notificacoes/sse",
    sse_notificacoes_inspetor,
    methods=["GET"],
    responses={
        200: {
            "description": "Fluxo SSE de notificações do inspetor.",
            "content": {"text/event-stream": {}},
        },
    },
)
roteador_chat.add_api_route(
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
roteador_chat.add_api_route(
    "/api/laudo/{laudo_id}/mensagens",
    obter_mensagens_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_chat.add_api_route(
    "/api/gerar_pdf",
    rota_pdf,
    methods=["POST"],
    responses={
        200: {
            "description": "PDF gerado para o laudo.",
            "content": {"application/pdf": {}},
        },
        500: {"description": "Falha ao gerar o PDF."},
    },
)
roteador_chat.add_api_route(
    "/api/upload_doc",
    rota_upload_doc,
    methods=["POST"],
    responses={
        400: {"description": "Multipart inválido ou corpo malformado."},
        413: {"description": "Arquivo muito grande."},
        415: {"description": "Tipo de arquivo não suportado."},
        422: {"description": "Não foi possível extrair texto do documento."},
        501: {"description": "Parser do tipo de documento indisponível."},
    },
)
roteador_chat.add_api_route(
    "/api/feedback",
    rota_feedback,
    methods=["POST"],
)

__all__ = [
    "roteador_chat",
    "sse_notificacoes_inspetor",
    "rota_chat",
    "chat_api",
    "salvar_mensagem_ia",
    "obter_mensagens_laudo",
    "listar_mensagens_laudo",
    "rota_upload_doc",
    "upload_documento",
    "rota_pdf",
    "gerar_pdf",
    "rota_feedback",
    "registrar_feedback",
]
