from __future__ import annotations

from app.domains.chat.templates_ai import (
    MAPA_VERIFICACOES_CBMGO,
    TITULOS_SECOES_CBMGO,
    CMAR,
    RelatorioCBMGO,
    RecomendacoesGerais,
    SegurancaEstrutural,
    VerificacaoDocumental,
)


def _item(condicao: str = "C", observacao: str = "") -> dict[str, str]:
    return {"condicao": condicao, "observacao": observacao}


def test_relatorio_cbmgo_aceita_payload_legado_sem_localizacao() -> None:
    payload = {
        "seguranca_estrutural": {
            "item_01_fissuras_trincas": _item("NC", "Fissura em viga A-02."),
            "item_02_corrosao_concreto": _item(),
            "item_03_revestimento_teto": _item(),
            "item_04_pisos": _item(),
            "item_05_vazamentos_subsolo": _item(),
            "item_06_infiltracoes": _item(),
            "item_07_esquadrias": _item(),
            "item_08_ferragens": _item(),
            "item_09_geometria": _item(),
            "item_10_deformacao": _item(),
            "item_11_armaduras_expostas": _item(),
            "item_12_recalques": _item(),
        },
        "cmar": {
            "item_01_piso": _item(),
            "item_02_paredes": _item(),
            "item_03_teto": _item(),
            "item_04_cobertura": _item(),
            "item_05_tratamento_retardante": _item(),
            "item_06_laudo_fabricante": _item(),
        },
        "verificacao_documental": {
            "item_01_plano_manutencao": _item(),
            "item_02_coerencia_plano": _item(),
            "item_03_adequacao_rotinas": _item(),
            "item_04_acesso_equipamentos": _item(),
            "item_05_seguranca_usuarios": _item(),
            "item_06_documentos_pertinentes": _item(),
        },
        "recomendacoes_gerais": {
            "item_01_interdicao": _item(),
            "item_02_mudanca_uso": _item(),
            "item_03_intervencao_imediata": _item(),
            "outros": "",
        },
        "resumo_executivo": "Resumo técnico inicial.",
    }

    relatorio = RelatorioCBMGO(**payload)

    assert relatorio.seguranca_estrutural.item_01_fissuras_trincas.condicao == "NC"
    assert relatorio.seguranca_estrutural.item_01_fissuras_trincas.localizacao == ""
    assert relatorio.resumo_executivo == "Resumo técnico inicial."


def test_relatorio_cbmgo_suporta_localizacao_e_dados_gerais() -> None:
    payload = {
        "informacoes_gerais": {
            "responsavel_pela_inspecao": "Gabriel Santos",
            "data_inspecao": "2026-03-09",
            "local_inspecao": "Unidade 1 - Goiânia/GO",
            "possui_cercon": "Sim",
            "tipologia": "Industrial",
        },
        "seguranca_estrutural": {
            "item_01_fissuras_trincas": {
                "condicao": "NC",
                "localizacao": "Pilar P3",
                "observacao": "Fissura diagonal de aproximadamente 2 mm.",
            },
            "item_02_corrosao_concreto": _item(),
            "item_03_revestimento_teto": _item(),
            "item_04_pisos": _item(),
            "item_05_vazamentos_subsolo": _item(),
            "item_06_infiltracoes": _item(),
            "item_07_esquadrias": _item(),
            "item_08_ferragens": _item(),
            "item_09_geometria": _item(),
            "item_10_deformacao": _item(),
            "item_11_armaduras_expostas": _item(),
            "item_12_recalques": _item(),
        },
        "cmar": {
            "item_01_piso": _item(),
            "item_02_paredes": _item(),
            "item_03_teto": _item(),
            "item_04_cobertura": _item(),
            "item_05_tratamento_retardante": _item(),
            "item_06_laudo_fabricante": _item(),
        },
        "trrf_observacoes": "TRRF em linha com memorial descritivo.",
        "verificacao_documental": {
            "item_01_plano_manutencao": _item(),
            "item_02_coerencia_plano": _item(),
            "item_03_adequacao_rotinas": _item(),
            "item_04_acesso_equipamentos": _item(),
            "item_05_seguranca_usuarios": _item(),
            "item_06_documentos_pertinentes": _item(),
        },
        "recomendacoes_gerais": {
            "item_01_interdicao": _item(),
            "item_02_mudanca_uso": _item(),
            "item_03_intervencao_imediata": _item(),
            "outros": "Sem outras recomendações.",
        },
        "coleta_assinaturas": {
            "responsavel_pela_inspecao": "Gabriel Santos",
            "responsavel_empresa_acompanhamento": "Carlos Lima",
        },
        "resumo_executivo": "Há um ponto NC em pilar que exige reparo e monitoramento.",
    }

    relatorio = RelatorioCBMGO(**payload)

    assert relatorio.informacoes_gerais.possui_cercon == "Sim"
    assert relatorio.seguranca_estrutural.item_01_fissuras_trincas.localizacao == "Pilar P3"
    assert "TRRF" in relatorio.trrf_observacoes


def test_mapa_de_verificacoes_cobre_campos_do_schema() -> None:
    mapa_seg = MAPA_VERIFICACOES_CBMGO["seguranca_estrutural"]
    mapa_cmar = MAPA_VERIFICACOES_CBMGO["cmar"]
    mapa_doc = MAPA_VERIFICACOES_CBMGO["verificacao_documental"]
    mapa_rec = MAPA_VERIFICACOES_CBMGO["recomendacoes_gerais"]

    campos_seg = set(SegurancaEstrutural.model_fields.keys())
    campos_cmar = set(CMAR.model_fields.keys())
    campos_doc = set(VerificacaoDocumental.model_fields.keys())
    campos_rec = set(k for k in RecomendacoesGerais.model_fields.keys() if k != "outros")

    assert campos_seg.issubset(set(mapa_seg.keys()))
    assert campos_cmar.issubset(set(mapa_cmar.keys()))
    assert campos_doc.issubset(set(mapa_doc.keys()))
    assert campos_rec.issubset(set(mapa_rec.keys()))
    assert set(TITULOS_SECOES_CBMGO.keys()) == {
        "seguranca_estrutural",
        "cmar",
        "verificacao_documental",
        "recomendacoes_gerais",
    }
