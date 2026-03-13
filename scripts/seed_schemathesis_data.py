from __future__ import annotations

import argparse
import base64
import sys
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.shared.database import (
    AnexoMesa,
    Laudo,
    LaudoRevisao,
    MensagemLaudo,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
)
from app.domains.chat.core_helpers import agora_utc
from nucleo.template_editor_word import (
    MODO_EDITOR_LEGADO,
    MODO_EDITOR_RICO,
    documento_editor_padrao,
    estilo_editor_padrao,
    gerar_pdf_base_placeholder_editor,
)

ASSET_TEMPLATE_ID = "seed-asset-logo"
PNG_SEED_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PY6RfwAAAABJRU5ErkJggg=="
)

def _obter_usuario_por_email(banco: Session, email: str) -> Usuario:
    usuario = banco.scalar(select(Usuario).where(Usuario.email == email))
    if usuario is None:
        raise RuntimeError(f"Usuário seed não encontrado: {email}")
    return usuario


def _obter_ou_criar_laudo_seed(
    banco: Session,
    *,
    inspetor: Usuario,
    preview: str,
    status_revisao: str = StatusRevisao.RASCUNHO.value,
    reabertura_pendente: bool = False,
) -> Laudo:
    laudo = banco.scalar(
        select(Laudo)
        .where(
            Laudo.usuario_id == inspetor.id,
            Laudo.primeira_mensagem == preview,
        )
        .order_by(Laudo.id.asc())
    )
    if laudo is not None:
        laudo.status_revisao = status_revisao
        laudo.reabertura_pendente_em = agora_utc() if reabertura_pendente else None
        return laudo

    laudo = Laudo(
        empresa_id=inspetor.empresa_id,
        usuario_id=inspetor.id,
        setor_industrial="geral",
        tipo_template="padrao",
        status_revisao=status_revisao,
        codigo_hash=uuid.uuid4().hex,
        custo_api_reais=Decimal("0.0000"),
        primeira_mensagem=preview,
        parecer_ia="Parecer técnico seed para cobertura automatizada.",
        modo_resposta="detalhado",
        is_deep_research=False,
        reabertura_pendente_em=agora_utc() if reabertura_pendente else None,
    )
    banco.add(laudo)
    banco.flush()
    return laudo


def _obter_ou_criar_pendencia_seed(banco: Session, *, laudo: Laudo, revisor: Usuario) -> MensagemLaudo:
    mensagem = banco.scalar(
        select(MensagemLaudo)
        .where(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
        )
        .order_by(MensagemLaudo.id.asc())
    )
    if mensagem is not None:
        return mensagem

    mensagem = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=revisor.id,
        tipo=TipoMensagem.HUMANO_ENG.value,
        conteudo="Pendência seed da mesa avaliadora.",
        lida=False,
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(mensagem)
    banco.flush()
    return mensagem


def _garantir_historico_chat_seed(banco: Session, *, laudo: Laudo, inspetor: Usuario) -> None:
    possui_texto_seed = banco.scalar(
        select(MensagemLaudo.id)
        .where(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.USER.value,
            MensagemLaudo.conteudo == "Mensagem seed do inspetor para historico principal.",
        )
        .limit(1)
    )

    possui_resposta_ia_seed = banco.scalar(
        select(MensagemLaudo.id)
        .where(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.IA.value,
            MensagemLaudo.conteudo == "Resposta seed da IA para historico principal.",
        )
        .limit(1)
    )

    mensagens = []
    if not possui_texto_seed:
        mensagens.append(
            MensagemLaudo(
                laudo_id=laudo.id,
                remetente_id=inspetor.id,
                tipo=TipoMensagem.USER.value,
                conteudo="Mensagem seed do inspetor para historico principal.",
                custo_api_reais=Decimal("0.0000"),
            )
        )

    if not possui_resposta_ia_seed:
        mensagens.append(
            MensagemLaudo(
                laudo_id=laudo.id,
                remetente_id=None,
                tipo=TipoMensagem.IA.value,
                conteudo="Resposta seed da IA para historico principal.",
                custo_api_reais=Decimal("0.0000"),
            )
        )

    if mensagens:
        banco.add_all(mensagens)
        banco.flush()


def _garantir_foto_seed(banco: Session, *, laudo: Laudo, inspetor: Usuario) -> None:
    possui_foto_seed = banco.scalar(
        select(MensagemLaudo.id)
        .where(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.USER.value,
            MensagemLaudo.conteudo == "[imagem]",
        )
        .limit(1)
    )
    if possui_foto_seed:
        return

    banco.add(
        MensagemLaudo(
            laudo_id=laudo.id,
            remetente_id=inspetor.id,
            tipo=TipoMensagem.USER.value,
            conteudo="[imagem]",
            custo_api_reais=Decimal("0.0000"),
        )
    )
    banco.flush()


def _garantir_revisoes_seed(banco: Session, *, laudo: Laudo) -> None:
    existentes = banco.scalars(
        select(LaudoRevisao)
        .where(LaudoRevisao.laudo_id == laudo.id)
        .order_by(LaudoRevisao.numero_versao.asc())
    ).all()

    if len(existentes) >= 2:
        return

    revisoes = [
        (1, "Versão base do laudo seed.", "Base"),
        (2, "Versão revisada do laudo seed com ajustes.", "Ajustes"),
    ]
    for numero, conteudo, resumo in revisoes:
        banco.add(
            LaudoRevisao(
                laudo_id=laudo.id,
                numero_versao=numero,
                origem="seed",
                resumo=f"Revisão {resumo}",
                conteudo=conteudo,
            )
        )
    banco.flush()


def _garantir_anexo_seed(banco: Session, *, laudo: Laudo, mensagem: MensagemLaudo, revisor: Usuario) -> AnexoMesa:
    anexo = banco.scalar(
        select(AnexoMesa)
        .where(
            AnexoMesa.laudo_id == laudo.id,
            AnexoMesa.mensagem_id == mensagem.id,
        )
        .order_by(AnexoMesa.id.asc())
    )
    if anexo is not None:
        return anexo

    pasta_seed = Path(tempfile.gettempdir()) / "tariel_control" / "schemathesis_seed"
    pasta_seed.mkdir(parents=True, exist_ok=True)
    caminho = pasta_seed / "mesa_seed.pdf"
    if not caminho.exists():
        caminho.write_bytes(b"%PDF-1.4\n% seed schemathesis\n")

    anexo = AnexoMesa(
        laudo_id=laudo.id,
        mensagem_id=mensagem.id,
        enviado_por_id=revisor.id,
        nome_original="mesa_seed.pdf",
        nome_arquivo="mesa_seed.pdf",
        mime_type="application/pdf",
        categoria="documento",
        tamanho_bytes=caminho.stat().st_size,
        caminho_arquivo=str(caminho),
    )
    banco.add(anexo)
    banco.flush()
    return anexo


def _obter_ou_criar_template_seed(
    banco: Session,
    *,
    revisor: Usuario,
    nome: str,
    codigo_template: str,
    versao: int,
    modo_editor: str,
    ativo: bool = False,
) -> TemplateLaudo:
    template = banco.scalar(
        select(TemplateLaudo)
        .where(
            TemplateLaudo.empresa_id == revisor.empresa_id,
            TemplateLaudo.codigo_template == codigo_template,
            TemplateLaudo.versao == versao,
        )
        .order_by(TemplateLaudo.id.asc())
    )
    caminho_pdf_base = gerar_pdf_base_placeholder_editor(
        empresa_id=revisor.empresa_id,
        codigo_template=codigo_template,
        versao=versao,
        titulo=nome,
    )

    if template is None:
        template = TemplateLaudo(
            empresa_id=revisor.empresa_id,
            criado_por_id=revisor.id,
            nome=nome,
            codigo_template=codigo_template,
            versao=versao,
            ativo=ativo,
            modo_editor=modo_editor,
            arquivo_pdf_base=caminho_pdf_base,
            mapeamento_campos_json={},
            documento_editor_json=documento_editor_padrao() if modo_editor == MODO_EDITOR_RICO else None,
            assets_json=[],
            estilo_json=estilo_editor_padrao() if modo_editor == MODO_EDITOR_RICO else None,
            observacoes="Template seed do Schemathesis.",
        )
        banco.add(template)
        banco.flush()
        return template

    template.nome = nome
    template.ativo = ativo
    template.modo_editor = modo_editor
    template.arquivo_pdf_base = caminho_pdf_base
    template.mapeamento_campos_json = template.mapeamento_campos_json or {}
    template.documento_editor_json = (
        documento_editor_padrao() if modo_editor == MODO_EDITOR_RICO else None
    )
    template.assets_json = template.assets_json if isinstance(template.assets_json, list) else []
    template.estilo_json = estilo_editor_padrao() if modo_editor == MODO_EDITOR_RICO else None
    template.observacoes = "Template seed do Schemathesis."
    banco.flush()
    return template


def _garantir_asset_template_seed(*, template: TemplateLaudo) -> None:
    pasta_seed = Path(tempfile.gettempdir()) / "tariel_control" / "schemathesis_seed" / "templates"
    pasta_seed.mkdir(parents=True, exist_ok=True)
    caminho = pasta_seed / f"{ASSET_TEMPLATE_ID}.png"
    if not caminho.exists():
        caminho.write_bytes(PNG_SEED_BYTES)

    assets = template.assets_json if isinstance(template.assets_json, list) else []
    asset_seed = {
        "id": ASSET_TEMPLATE_ID,
        "filename": "seed-asset-logo.png",
        "mime_type": "image/png",
        "path": str(caminho),
        "size_bytes": caminho.stat().st_size,
        "created_em": agora_utc().isoformat(),
    }
    restantes = [item for item in assets if not isinstance(item, dict) or item.get("id") != ASSET_TEMPLATE_ID]
    template.assets_json = [*restantes, asset_seed]


def main() -> int:
    parser = argparse.ArgumentParser(description="Semeia dados válidos para Schemathesis.")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--inspetor-email", default="inspetor@wf.com.br")
    parser.add_argument("--revisor-email", default="revisor@wf.com.br")
    args = parser.parse_args()

    engine = create_engine(args.database_url, future=True)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False, class_=Session)

    with SessionLocal() as banco:
        inspetor = _obter_usuario_por_email(banco, args.inspetor_email)
        revisor = _obter_usuario_por_email(banco, args.revisor_email)

        laudos = [
            _obter_ou_criar_laudo_seed(
                banco,
                inspetor=inspetor,
                preview="Schemathesis seed pronto para finalizacao",
                status_revisao=StatusRevisao.RASCUNHO.value,
            ),
            _obter_ou_criar_laudo_seed(
                banco,
                inspetor=inspetor,
                preview="Schemathesis seed operacional da mesa",
                status_revisao=StatusRevisao.RASCUNHO.value,
            ),
            _obter_ou_criar_laudo_seed(
                banco,
                inspetor=inspetor,
                preview="Schemathesis seed reabertura",
                status_revisao=StatusRevisao.AGUARDANDO.value,
                reabertura_pendente=True,
            ),
            _obter_ou_criar_laudo_seed(
                banco,
                inspetor=inspetor,
                preview="Schemathesis seed deletavel",
                status_revisao=StatusRevisao.RASCUNHO.value,
            ),
        ]

        mensagens = []
        anexos = []
        for laudo in laudos:
            mensagem = _obter_ou_criar_pendencia_seed(banco, laudo=laudo, revisor=revisor)
            mensagens.append(mensagem)
            anexos.append(_garantir_anexo_seed(banco, laudo=laudo, mensagem=mensagem, revisor=revisor))

        for laudo in laudos:
            _garantir_historico_chat_seed(banco, laudo=laudo, inspetor=inspetor)
            _garantir_revisoes_seed(banco, laudo=laudo)
        _garantir_foto_seed(banco, laudo=laudos[0], inspetor=inspetor)
        laudos[0].dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Seed Schemathesis",
                "local_inspecao": "Planta Seed",
            },
            "resumo_executivo": "Dados seed para previews contratuais.",
        }

        templates = [
            _obter_ou_criar_template_seed(
                banco,
                revisor=revisor,
                nome="Schemathesis Template Legado",
                codigo_template="schema_legado",
                versao=1,
                modo_editor=MODO_EDITOR_LEGADO,
                ativo=True,
            ),
            _obter_ou_criar_template_seed(
                banco,
                revisor=revisor,
                nome="Schemathesis Template Editor",
                codigo_template="schema_editor",
                versao=1,
                modo_editor=MODO_EDITOR_RICO,
            ),
            _obter_ou_criar_template_seed(
                banco,
                revisor=revisor,
                nome="Schemathesis Template Deletavel",
                codigo_template="schema_delete",
                versao=1,
                modo_editor=MODO_EDITOR_LEGADO,
            ),
        ]
        _garantir_asset_template_seed(template=templates[1])

        banco.commit()

        print(
            {
                "laudos": [laudo.id for laudo in laudos],
                "mensagens": [mensagem.id for mensagem in mensagens],
                "anexos": [anexo.id for anexo in anexos],
                "templates": [template.id for template in templates],
                "template_asset_id": ASSET_TEMPLATE_ID,
                "revisor_id": revisor.id,
                "inspetor_id": inspetor.id,
            }
        )

    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
