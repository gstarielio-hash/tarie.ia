"""Rotas de pendências de revisão (mesa)."""

from __future__ import annotations

import os
import tempfile
import uuid

from fastapi import Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.domains.chat.media_helpers import safe_remove_file
from app.domains.chat.pendencias_helpers import (
    listar_pendencias_mesa_laudo,
    normalizar_filtro_pendencias,
    normalizar_paginacao_pendencias,
    obter_assinatura_mesa_para_pdf,
    serializar_pendencia_mesa,
)
from app.domains.chat.routes import (
    agora_utc,
    exigir_csrf,
    obter_laudo_do_inspetor,
    resposta_json_ok,
    usuario_nome,
)
from app.domains.chat.schemas import DadosPendencia
from app.shared.database import MensagemLaudo, TipoMensagem, Usuario, obter_banco
from app.shared.security import exigir_inspetor
from nucleo.gerador_laudos import GeradorLaudos

roteador_pendencias = APIRouter()


async def obter_pendencias_laudo(
    laudo_id: int,
    filtro: str = "abertas",
    pagina: int = 1,
    tamanho: int = 25,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    filtro_normalizado = normalizar_filtro_pendencias(filtro)
    pagina_segura, tamanho_seguro = normalizar_paginacao_pendencias(pagina, tamanho)

    pendencias, total, abertas, total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo_id,
        filtro=filtro_normalizado,
        pagina=pagina_segura,
        tamanho=tamanho_seguro,
    )
    resolvidas = max(total - abertas, 0)
    total_exibido = (pagina_segura - 1) * tamanho_seguro + len(pendencias)
    tem_mais = total_exibido < total_filtrado

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "filtro": filtro_normalizado,
            "pagina": pagina_segura,
            "tamanho": tamanho_seguro,
            "abertas": abertas,
            "resolvidas": resolvidas,
            "total": total,
            "total_filtrado": total_filtrado,
            "tem_mais": tem_mais,
            "pendencias": [serializar_pendencia_mesa(item) for item in pendencias],
        }
    )


async def marcar_pendencias_laudo_como_lidas(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    resolucao_em = agora_utc()

    marcadas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .update(
            {
                "lida": True,
                "resolvida_por_id": usuario.id,
                "resolvida_em": resolucao_em,
            },
            synchronize_session=False,
        )
    )
    banco.commit()

    return resposta_json_ok({"ok": True, "laudo_id": laudo_id, "marcadas": int(marcadas)})


async def atualizar_pendencia_laudo(
    laudo_id: int,
    mensagem_id: int,
    dados: DadosPendencia,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    mensagem = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.id == mensagem_id,
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
        )
        .first()
    )
    if not mensagem:
        raise HTTPException(status_code=404, detail="Pendência não encontrada.")

    marcando_como_lida = bool(dados.lida)
    mensagem.lida = marcando_como_lida

    if marcando_como_lida:
        mensagem.resolvida_por_id = usuario.id
        mensagem.resolvida_em = agora_utc()
    else:
        mensagem.resolvida_por_id = None
        mensagem.resolvida_em = None

    banco.commit()
    banco.refresh(mensagem)

    resolvedor_nome = ""
    if mensagem.resolvida_por_id:
        resolvedor_nome = (
            getattr(mensagem.resolvida_por, "nome", None)
            or getattr(mensagem.resolvida_por, "nome_completo", None)
            or f"Usuário #{mensagem.resolvida_por_id}"
        )

    return resposta_json_ok(
        {
            "ok": True,
            "laudo_id": laudo_id,
            "mensagem_id": mensagem.id,
            "lida": bool(mensagem.lida),
            "resolvida_por_id": mensagem.resolvida_por_id,
            "resolvida_por_nome": resolvedor_nome,
            "resolvida_em": mensagem.resolvida_em.isoformat() if mensagem.resolvida_em else "",
        }
    )


async def exportar_pendencias_laudo_pdf(
    laudo_id: int,
    filtro: str = "abertas",
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    filtro_normalizado = normalizar_filtro_pendencias(filtro)

    pendencias_filtradas, total, abertas, _total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo_id,
        filtro=filtro_normalizado,
        pagina=1,
        tamanho=400,
    )
    resolvidas = max(total - abertas, 0)
    pendencias_payload = [serializar_pendencia_mesa(item) for item in pendencias_filtradas]

    nome_arquivo = f"Pendencias_Mesa_{laudo_id}_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo)

    nome_empresa = ""
    if usuario.empresa:
        nome_empresa = (
            getattr(usuario.empresa, "nome_fantasia", None)
            or getattr(usuario.empresa, "razao_social", None)
            or ""
        )
    assinatura_mesa = obter_assinatura_mesa_para_pdf(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
    )

    try:
        GeradorLaudos.gerar_pdf_pendencias_mesa(
            caminho_saida=caminho_pdf,
            laudo_id=laudo_id,
            filtro=filtro_normalizado,
            empresa=nome_empresa or f"Empresa #{usuario.empresa_id}",
            inspetor=usuario_nome(usuario),
            data_geracao=agora_utc().astimezone().strftime("%d/%m/%Y %H:%M"),
            total=total,
            abertas=abertas,
            resolvidas=resolvidas,
            pendencias=pendencias_payload,
            engenheiro_nome=assinatura_mesa["nome"],
            engenheiro_cargo=assinatura_mesa["cargo"],
            engenheiro_crea=assinatura_mesa["crea"],
            carimbo_texto=assinatura_mesa["carimbo"],
        )

        return FileResponse(
            path=caminho_pdf,
            filename=f"pendencias_laudo_{laudo_id}_{filtro_normalizado}.pdf",
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, caminho_pdf),
        )
    except Exception:
        safe_remove_file(caminho_pdf)
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao exportar o PDF de pendencias."},
        )


listar_pendencias_laudo = obter_pendencias_laudo
marcar_pendencias_como_lidas = marcar_pendencias_laudo_como_lidas
exportar_pendencias_pdf = exportar_pendencias_laudo_pdf

roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias",
    obter_pendencias_laudo,
    methods=["GET"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/marcar-lidas",
    marcar_pendencias_laudo_como_lidas,
    methods=["POST"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
    atualizar_pendencia_laudo,
    methods=["PATCH"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/exportar-pdf",
    exportar_pendencias_laudo_pdf,
    methods=["GET"],
)

__all__ = [
    "roteador_pendencias",
    "obter_pendencias_laudo",
    "listar_pendencias_laudo",
    "marcar_pendencias_laudo_como_lidas",
    "marcar_pendencias_como_lidas",
    "atualizar_pendencia_laudo",
    "exportar_pendencias_laudo_pdf",
    "exportar_pendencias_pdf",
]
