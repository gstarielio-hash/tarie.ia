from __future__ import annotations

import os
import tempfile
import uuid
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.domains.chat.learning_helpers import listar_aprendizados_laudo, serializar_aprendizado_visual
from app.domains.chat.media_helpers import safe_remove_file
from app.domains.mesa.service import montar_pacote_mesa_laudo
from app.domains.revisor.base import (
    _agora_utc,
    _formatar_data_local,
    _gerar_pdf_placeholder_schemathesis,
    _listar_mensagens_laudo_paginadas,
)
from app.domains.revisor.common import _obter_laudo_empresa
from app.domains.revisor.service_contracts import ExportacaoPacoteMesaPdf, PacoteMesaCarregado
from app.shared.database import Usuario
from nucleo.gerador_laudos import GeradorLaudos


def validar_parametros_pacote_mesa(parametros: Iterable[str]) -> None:
    parametros_invalidos = set(parametros) - {
        "limite_whispers",
        "limite_pendencias",
        "limite_revisoes",
    }
    if not parametros_invalidos:
        return

    raise HTTPException(
        status_code=422,
        detail=[
            {
                "loc": ["query", nome_parametro],
                "msg": "Extra inputs are not permitted",
                "type": "extra_forbidden",
            }
            for nome_parametro in sorted(parametros_invalidos)
        ],
    )


def carregar_historico_chat_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    cursor: int | None,
    limite: int,
) -> dict[str, Any]:
    _obter_laudo_empresa(banco, laudo_id, empresa_id)

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


def carregar_laudo_completo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    incluir_historico: bool,
    cursor: int | None,
    limite: int,
) -> dict[str, Any]:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)

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
        whispers = [mensagem for mensagem in historico if mensagem["is_whisper"]]
        cursor_proximo = int(pagina["cursor_proximo"]) if pagina["cursor_proximo"] else None
        tem_mais = bool(pagina["tem_mais"])

    aprendizados_visuais = [
        serializar_aprendizado_visual(item)
        for item in listar_aprendizados_laudo(banco, laudo_id=laudo.id, empresa_id=empresa_id)
    ]

    return {
        "id": laudo.id,
        "hash": laudo.codigo_hash[-6:],
        "setor": laudo.setor_industrial,
        "status": laudo.status_revisao,
        "tipo_template": getattr(laudo, "tipo_template", "padrao"),
        "criado_em": laudo.criado_em.strftime("%d/%m/%Y %H:%M"),
        "dados_formulario": getattr(laudo, "dados_formulario", None),
        "historico": historico,
        "whispers": whispers,
        "aprendizados_visuais": aprendizados_visuais,
        "historico_paginado": {
            "incluir_historico": incluir_historico,
            "cursor_proximo": cursor_proximo,
            "tem_mais": tem_mais,
            "limite": limite,
        },
    }


def carregar_pacote_mesa_laudo_revisor(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
    limite_whispers: int,
    limite_pendencias: int,
    limite_revisoes: int,
) -> PacoteMesaCarregado:
    laudo = _obter_laudo_empresa(banco, laudo_id, empresa_id)
    pacote = montar_pacote_mesa_laudo(
        banco,
        laudo=laudo,
        limite_whispers=limite_whispers,
        limite_pendencias=limite_pendencias,
        limite_revisoes=limite_revisoes,
    )
    return PacoteMesaCarregado(laudo=laudo, pacote=pacote)


def gerar_exportacao_pacote_mesa_laudo_pdf(
    banco: Session,
    *,
    pacote_carregado: PacoteMesaCarregado,
    usuario: Usuario,
) -> ExportacaoPacoteMesaPdf:
    laudo = pacote_carregado.laudo
    pacote = pacote_carregado.pacote

    nome_arquivo_tmp = f"Pacote_Mesa_{laudo.id}_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo_tmp)

    nome_empresa = getattr(usuario.empresa, "nome_fantasia", None) or getattr(usuario.empresa, "razao_social", None) or f"Empresa #{usuario.empresa_id}"

    inspetor_nome = "Nao informado"
    if pacote.inspetor_id:
        inspetor = banco.get(Usuario, pacote.inspetor_id)
        if inspetor and inspetor.empresa_id == usuario.empresa_id:
            inspetor_nome = inspetor.nome

    revisoes_payload = [
        {
            "numero_versao": revisao.numero_versao,
            "origem": revisao.origem,
            "resumo": revisao.resumo,
            "confianca_geral": revisao.confianca_geral,
            "criado_em": _formatar_data_local(revisao.criado_em),
        }
        for revisao in pacote.revisoes_recentes
    ]
    pendencias_payload = [
        {
            "id": item.id,
            "tipo": item.tipo,
            "texto": item.texto,
            "criado_em": _formatar_data_local(item.criado_em),
            "referencia_mensagem_id": item.referencia_mensagem_id,
            "anexos": [anexo.model_dump(mode="json") for anexo in item.anexos],
        }
        for item in pacote.pendencias_abertas
    ]
    whispers_payload = [
        {
            "id": item.id,
            "tipo": item.tipo,
            "texto": item.texto,
            "criado_em": _formatar_data_local(item.criado_em),
            "referencia_mensagem_id": item.referencia_mensagem_id,
            "anexos": [anexo.model_dump(mode="json") for anexo in item.anexos],
        }
        for item in pacote.whispers_recentes
    ]

    try:
        if os.getenv("SCHEMATHESIS_TEST_HINTS", "0").strip() == "1":
            _gerar_pdf_placeholder_schemathesis(
                caminho_pdf,
                f"Pacote Mesa Laudo #{laudo.id}",
            )
        else:
            GeradorLaudos.gerar_pdf_pacote_mesa(
                caminho_saida=caminho_pdf,
                laudo_id=laudo.id,
                codigo_hash=pacote.codigo_hash,
                empresa=nome_empresa,
                inspetor=inspetor_nome,
                data_geracao=_formatar_data_local(_agora_utc()),
                tipo_template=pacote.tipo_template,
                setor_industrial=pacote.setor_industrial,
                status_revisao=pacote.status_revisao,
                status_conformidade=pacote.status_conformidade,
                ultima_interacao=_formatar_data_local(pacote.ultima_interacao_em),
                tempo_em_campo_minutos=pacote.tempo_em_campo_minutos,
                resumo_mensagens=pacote.resumo_mensagens.model_dump(mode="json"),
                resumo_evidencias=pacote.resumo_evidencias.model_dump(mode="json"),
                resumo_pendencias=pacote.resumo_pendencias.model_dump(mode="json"),
                pendencias_abertas=pendencias_payload,
                whispers_recentes=whispers_payload,
                revisoes_recentes=revisoes_payload,
                engenheiro_nome=usuario.nome,
                engenheiro_cargo="Engenheiro Revisor",
                engenheiro_crea=(str(usuario.crea or "").strip()[:40] or "Nao informado"),
                carimbo_texto="CARIMBO DIGITAL TARIEL.IA",
            )
    except Exception:
        safe_remove_file(caminho_pdf)
        raise

    return ExportacaoPacoteMesaPdf(
        caminho_pdf=caminho_pdf,
        filename=f"pacote_mesa_laudo_{laudo.id}.pdf",
    )


__all__ = [
    "carregar_historico_chat_revisor",
    "carregar_laudo_completo_revisor",
    "carregar_pacote_mesa_laudo_revisor",
    "gerar_exportacao_pacote_mesa_laudo_pdf",
    "validar_parametros_pacote_mesa",
]
