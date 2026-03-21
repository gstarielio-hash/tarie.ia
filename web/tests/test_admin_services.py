from unittest.mock import patch

import pytest

import app.domains.admin.services as admin_services
from app.shared.database import LimitePlano, NivelAcesso, PlanoEmpresa, SessaoAtiva, Usuario
from app.shared.security import criar_sessao, token_esta_ativo, verificar_senha


def test_stub_boas_vindas_nao_vaza_senha_em_log_dev(monkeypatch) -> None:
    monkeypatch.setattr(admin_services, "_MODO_DEV", True)
    monkeypatch.setattr(admin_services, "_BACKEND_NOTIFICACAO_BOAS_VINDAS", "log")

    with patch.object(admin_services.logger, "info") as logger_info:
        aviso = admin_services._disparar_email_boas_vindas(
            "cliente@empresa.test",
            "Empresa Teste",
            "Senha@123456",
        )

    mensagem = logger_info.call_args.args[0]
    assert "[BACKEND LOG] BOAS-VINDAS INTERCEPTADO" in mensagem
    assert "cliente@empresa.test" in mensagem
    assert "Empresa Teste" in mensagem
    assert "[REDACTED]" in mensagem
    assert "Senha@123456" not in mensagem
    assert aviso is not None
    assert "Entrega automática" in aviso


def test_boas_vindas_strict_falha_com_aviso_explicito(monkeypatch) -> None:
    monkeypatch.setattr(admin_services, "_BACKEND_NOTIFICACAO_BOAS_VINDAS", "strict")

    with pytest.raises(RuntimeError, match="Entrega automática de boas-vindas não configurada"):
        admin_services._disparar_email_boas_vindas(
            "cliente@empresa.test",
            "Empresa Teste",
            "Senha@123456",
        )


def test_registrar_novo_cliente_cria_empresa_e_admin_temporario(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    disparos: list[tuple[str, str, str]] = []

    monkeypatch.setattr(
        admin_services,
        "_disparar_email_boas_vindas",
        lambda email, empresa, senha: disparos.append((email, empresa, senha)),
    )

    with SessionLocal() as banco:
        empresa, senha_temporaria, aviso = admin_services.registrar_novo_cliente(
            banco,
            nome="Nova Empresa",
            cnpj="11222333000181",
            email_admin="novo-admin@empresa.test",
            plano=PlanoEmpresa.ILIMITADO.value,
            segmento="Industrial",
            cidade_estado="Goiania/GO",
            nome_responsavel="Responsavel Teste",
        )

        usuario = banco.query(Usuario).filter(Usuario.email == "novo-admin@empresa.test").one()

        assert empresa.id is not None
        assert usuario.empresa_id == empresa.id
        assert int(usuario.nivel_acesso) == int(NivelAcesso.ADMIN_CLIENTE)
        assert usuario.senha_temporaria_ativa is True
        assert verificar_senha(senha_temporaria, usuario.senha_hash) is True

    assert disparos == [("novo-admin@empresa.test", "Nova Empresa", senha_temporaria)]
    assert aviso is None


def test_criar_usuario_empresa_respeita_limite_do_plano(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        limite = banco.get(LimitePlano, PlanoEmpresa.ILIMITADO.value)
        assert limite is not None
        limite.usuarios_max = 3
        banco.commit()

    with SessionLocal() as banco:
        with pytest.raises(ValueError, match="Limite de usuários do plano atingido"):
            admin_services.criar_usuario_empresa(
                banco,
                empresa_id=ids["empresa_a"],
                nome="Novo Inspetor",
                email="novo-inspetor@empresa-a.test",
                nivel_acesso=NivelAcesso.INSPETOR,
            )


def test_resetar_senha_inspetor_revoga_sessoes_ativas(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    token = criar_sessao(ids["inspetor_a"], lembrar=True)

    with SessionLocal() as banco:
        assert banco.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == ids["inspetor_a"]).count() == 1

    with SessionLocal() as banco:
        nova_senha = admin_services.resetar_senha_inspetor(banco, ids["inspetor_a"])
        usuario = banco.get(Usuario, ids["inspetor_a"])
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is True
        assert usuario.tentativas_login == 0
        assert usuario.status_bloqueio is False
        assert verificar_senha(nova_senha, usuario.senha_hash) is True

    with SessionLocal() as banco:
        assert banco.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == ids["inspetor_a"]).count() == 0

    assert token_esta_ativo(token) is False
