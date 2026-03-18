from __future__ import annotations

from nucleo.inspetor.confianca_ia import (
    CONFIANCA_MEDIA,
    analisar_confianca_resposta_ia,
    normalizar_payload_confianca_ia,
    _titulo_confianca_humano,
)


def test_normaliza_payload_vazio_ou_invalido() -> None:
    assert normalizar_payload_confianca_ia(None) == {}
    assert normalizar_payload_confianca_ia([]) == {}
    assert normalizar_payload_confianca_ia({}) == {}


def test_normaliza_payload_com_geral_invalido_cai_para_media() -> None:
    payload = normalizar_payload_confianca_ia(
        {
            "geral": "invalido",
            "secoes": [{"titulo": "Secao 1", "confianca": "x"}],
            "pontos_validacao_humana": ["  item de validacao  "],
        }
    )

    assert payload["geral"] == CONFIANCA_MEDIA
    assert payload["secoes"][0]["confianca"] == CONFIANCA_MEDIA
    assert payload["pontos_validacao_humana"] == ["item de validacao"]


def test_analise_de_confianca_gera_estrutura_padrao() -> None:
    texto = """
## Inspecao eletrica
Foi verificado item NR-10 com medicao 220V e checklist completo.
Evidencia fotografica anexada e referencia ao laudo tecnico.

## Observacao complementar
Talvez exista variacao no quadro secundario, necessario validar em campo.
"""

    resultado = analisar_confianca_resposta_ia(texto)

    assert resultado
    assert resultado["geral"] in {"alta", "media", "baixa"}
    assert isinstance(resultado["secoes"], list) and resultado["secoes"]
    assert isinstance(resultado["pontos_validacao_humana"], list)
    assert "gerado_em" in resultado


def test_titulo_humano_da_confianca() -> None:
    assert _titulo_confianca_humano("alta") == "Alta"
    assert _titulo_confianca_humano("media") == "Media"
    assert _titulo_confianca_humano("baixa") == "Baixa"
    assert _titulo_confianca_humano("desconhecido") == "Media"
