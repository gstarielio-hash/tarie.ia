from __future__ import annotations

import bcrypt

from app.shared.security import (
    criar_hash_senha,
    hash_precisa_upgrade,
    verificar_senha,
    verificar_senha_com_upgrade,
)


def test_hash_moderno_usa_argon2_e_suporta_senha_longa() -> None:
    senha = "SenhaAtualizada@" + ("x" * 180)
    senha_hash = criar_hash_senha(senha)

    assert senha_hash.startswith("$argon2id$")
    assert verificar_senha(senha, senha_hash) is True
    assert hash_precisa_upgrade(senha_hash) is False


def test_hash_bcrypt_legado_verifica_e_retorna_upgrade() -> None:
    senha = "Dev@123456"
    hash_legado = bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    senha_valida, hash_atualizado = verificar_senha_com_upgrade(senha, hash_legado)

    assert senha_valida is True
    assert hash_precisa_upgrade(hash_legado) is True
    assert hash_atualizado is not None
    assert hash_atualizado.startswith("$argon2id$")
    assert verificar_senha(senha, hash_atualizado) is True


def test_hash_invalido_nao_quebra_verificacao() -> None:
    assert verificar_senha("Senha@123456", "hash-invalido") is False
    assert verificar_senha_com_upgrade("Senha@123456", "hash-invalido") == (False, None)
