from __future__ import annotations

from nucleo.inspetor.comandos_chat import (
    analisar_comando_finalizacao,
    analisar_comando_rapido_chat,
    mensagem_para_mesa,
    remover_mencao_mesa,
)


def test_detecta_mensagem_para_mesa_por_prefixo() -> None:
    assert mensagem_para_mesa("@insp validar extintor da linha 3")
    assert mensagem_para_mesa("mesa: revisar item NR12")
    assert not mensagem_para_mesa("mensagem comum para a IA")


def test_remove_prefixo_da_mesa_sem_perder_conteudo() -> None:
    texto = remover_mencao_mesa("@insp: validar aterramento principal")
    assert texto == "validar aterramento principal"


def test_parser_de_comandos_rapidos_suporta_argumento() -> None:
    comando, argumento = analisar_comando_rapido_chat("/pendencias abertas")
    assert comando == "pendencias"
    assert argumento == "abertas"


def test_parser_de_comandos_rapidos_ignora_comando_desconhecido() -> None:
    comando, argumento = analisar_comando_rapido_chat("/nao_existe teste")
    assert comando == ""
    assert argumento == ""


def test_parser_finalizacao_aceita_formato_novo_e_legado() -> None:
    def _normalizar(valor: str) -> str:
        return str(valor or "").strip().lower()

    ok_novo, tipo_novo = analisar_comando_finalizacao(
        "COMANDO_SISTEMA FINALIZARLAUDOAGORA TIPO NR13",
        normalizar_tipo_template=_normalizar,
    )
    assert ok_novo is True
    assert tipo_novo == "nr13"

    ok_legado, tipo_legado = analisar_comando_finalizacao(
        "[COMANDO_SISTEMA]: FINALIZAR_LAUDO_AGORA | TIPO: SPDA",
        normalizar_tipo_template=_normalizar,
    )
    assert ok_legado is True
    assert tipo_legado == "spda"

