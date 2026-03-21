"""Bootstrap, seed e migração versionada da camada de persistência."""

from __future__ import annotations

import re

from app.core.settings import env_str


def _database_module():
    from app.shared import database as banco_dados

    return banco_dados


def _aplicar_migracoes_versionadas() -> None:
    try:
        from alembic import command
        from alembic.config import Config as AlembicConfig
    except (ModuleNotFoundError, ImportError) as erro:
        raise RuntimeError("Falha ao importar Alembic. Execute 'pip install -r requirements.txt' no .venv ativo.") from erro

    banco_dados = _database_module()
    if not banco_dados._ALEMBIC_INI.exists() or not banco_dados._ALEMBIC_DIR.exists():
        raise RuntimeError("Estrutura do Alembic não encontrada. Esperado: alembic.ini e pasta alembic/.")

    from sqlalchemy import inspect, text

    config = AlembicConfig(str(banco_dados._ALEMBIC_INI))
    config.set_main_option("script_location", banco_dados._ALEMBIC_DIR.as_posix())
    config.set_main_option("sqlalchemy.url", banco_dados.URL_BANCO)

    with banco_dados.motor_banco.begin() as conn:
        inspetor = inspect(conn)
        tabelas_existentes = set(inspetor.get_table_names())
        tabelas_esperadas = set(banco_dados.Base.metadata.tables.keys())
        sem_versionamento = "alembic_version" not in tabelas_existentes
        versao_vazia = False

        if not sem_versionamento:
            versao_vazia = conn.execute(text("SELECT COUNT(1) FROM alembic_version")).scalar_one() == 0

        tabelas_sem_versionamento = tabelas_existentes - {"alembic_version"}
        schema_legado_pronto = tabelas_esperadas.issubset(tabelas_sem_versionamento)

        config.attributes["connection"] = conn
        if schema_legado_pronto and (sem_versionamento or versao_vazia):
            banco_dados.logger.warning("Schema legado detectado sem versionamento Alembic. Aplicando stamp no head.")
            command.stamp(config, "head")
        else:
            command.upgrade(config, "head")


def inicializar_banco() -> None:
    banco_dados = _database_module()
    try:
        _aplicar_migracoes_versionadas()
        seed_limites_plano()
        _bootstrap_admin_inicial_producao()

        if not banco_dados._EM_PRODUCAO and banco_dados._SEED_DEV_BOOTSTRAP:
            _seed_dev()
        elif not banco_dados._EM_PRODUCAO:
            banco_dados.logger.info(
                "Seed DEV desabilitado (SEED_DEV_BOOTSTRAP=0). Nenhum usuário/senha de seed foi criado."
            )

        from sqlalchemy import text

        with banco_dados.motor_banco.connect() as conn:
            conn.execute(text("SELECT 1"))

        banco_dados.logger.info("Banco de dados inicializado com sucesso.")
    except Exception:
        banco_dados.logger.critical("Falha ao inicializar o banco.", exc_info=True)
        raise


def _seed_dev() -> None:
    from sqlalchemy import select

    from app.shared.security import criar_hash_senha

    banco_dados = _database_module()
    senha_padrao_seed = env_str("SEED_DEV_SENHA_PADRAO", "Dev@123456")
    senha_admin = env_str("SEED_ADMIN_SENHA", senha_padrao_seed)
    senha_admin_cliente = env_str("SEED_CLIENTE_SENHA", senha_padrao_seed)
    senha_inspetor = env_str("SEED_INSPETOR_SENHA", senha_padrao_seed)
    senha_revisor = env_str("SEED_REVISOR_SENHA", senha_padrao_seed)

    if senha_padrao_seed == "Dev@123456":
        banco_dados.logger.warning("Seed DEV usando senha padrão compartilhada. Não use isso fora de desenvolvimento.")

    with banco_dados.SessaoLocal() as banco:
        empresa = banco.scalar(select(banco_dados.Empresa).where(banco_dados.Empresa.cnpj == "00000000000000"))
        if not empresa:
            empresa = banco_dados.Empresa(
                nome_fantasia="Empresa Demo (DEV)",
                cnpj="00000000000000",
                plano_ativo=banco_dados.PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa)
            banco.flush()

        empresa_admin = banco.scalar(select(banco_dados.Empresa).where(banco_dados.Empresa.cnpj == "99999999999999"))
        if not empresa_admin:
            empresa_admin = banco_dados.Empresa(
                nome_fantasia="Tariel.ia Interno (DEV)",
                cnpj="99999999999999",
                plano_ativo=banco_dados.PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa_admin)
            banco.flush()

        usuarios_seed = [
            (
                empresa_admin.id,
                "admin@tariel.ia",
                "Diretoria Dev",
                int(banco_dados.NivelAcesso.DIRETORIA),
                senha_admin,
            ),
            (
                empresa.id,
                "admin-cliente@tariel.ia",
                "Admin-Cliente Dev",
                int(banco_dados.NivelAcesso.ADMIN_CLIENTE),
                senha_admin_cliente,
            ),
            (
                empresa.id,
                "inspetor@tariel.ia",
                "Inspetor Dev",
                int(banco_dados.NivelAcesso.INSPETOR),
                senha_inspetor,
            ),
            (
                empresa.id,
                "revisor@tariel.ia",
                "Engenheiro Revisor (Dev)",
                int(banco_dados.NivelAcesso.REVISOR),
                senha_revisor,
            ),
        ]

        for empresa_destino_id, email, nome, nivel, senha in usuarios_seed:
            usuario = banco.scalar(select(banco_dados.Usuario).where(banco_dados.Usuario.email == email))
            if usuario:
                usuario.empresa_id = empresa_destino_id
                usuario.nome_completo = nome
                usuario.nivel_acesso = nivel
                usuario.senha_hash = criar_hash_senha(senha)
                usuario.ativo = True
                usuario.tentativas_login = 0
                usuario.bloqueado_ate = None
                continue

            banco.add(
                banco_dados.Usuario(
                    empresa_id=empresa_destino_id,
                    nome_completo=nome,
                    email=email,
                    senha_hash=criar_hash_senha(senha),
                    nivel_acesso=nivel,
                )
            )

        banco.commit()
        banco_dados.logger.info("Seed DEV garantido com sucesso.")


def _bootstrap_admin_inicial_producao() -> None:
    banco_dados = _database_module()
    if not banco_dados._EM_PRODUCAO:
        return

    email_admin = env_str("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    senha_admin = env_str("BOOTSTRAP_ADMIN_PASSWORD", "").strip()
    nome_admin = env_str("BOOTSTRAP_ADMIN_NOME", "Administrador Tariel.ia").strip() or "Administrador Tariel.ia"
    nome_empresa = env_str("BOOTSTRAP_EMPRESA_NOME", "Tariel.ia").strip() or "Tariel.ia"
    cnpj_empresa = re.sub(r"\D+", "", env_str("BOOTSTRAP_EMPRESA_CNPJ", "11111111111111"))

    if not email_admin or not senha_admin:
        banco_dados.logger.info(
            "Bootstrap inicial de produção ignorado: configure BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD para criar o primeiro acesso."
        )
        return

    if len(cnpj_empresa) != 14:
        banco_dados.logger.warning("BOOTSTRAP_EMPRESA_CNPJ inválido. Usando placeholder 11111111111111.")
        cnpj_empresa = "11111111111111"

    from sqlalchemy import func, select

    from app.shared.security import criar_hash_senha

    with banco_dados.SessaoLocal() as banco:
        empresa = banco.scalar(select(banco_dados.Empresa).where(banco_dados.Empresa.cnpj == cnpj_empresa))
        if not empresa:
            empresa = banco_dados.Empresa(
                nome_fantasia=nome_empresa,
                cnpj=cnpj_empresa,
                plano_ativo=banco_dados.PlanoEmpresa.ILIMITADO.value,
            )
            banco.add(empresa)
            banco.flush()

        usuario = banco.scalar(select(banco_dados.Usuario).where(banco_dados.Usuario.email == email_admin))
        if usuario:
            usuario.empresa_id = int(empresa.id)
            usuario.nome_completo = nome_admin
            usuario.senha_hash = criar_hash_senha(senha_admin)
            usuario.nivel_acesso = int(banco_dados.NivelAcesso.DIRETORIA)
            usuario.ativo = True
            usuario.tentativas_login = 0
            usuario.bloqueado_ate = None
            usuario.status_bloqueio = False
            usuario.senha_temporaria_ativa = False
        else:
            total_usuarios = int(banco.scalar(select(func.count()).select_from(banco_dados.Usuario)) or 0)
            if total_usuarios > 0:
                banco_dados.logger.info(
                    "Bootstrap inicial de produção criando Admin-CEO %s mesmo com outros usuários já cadastrados.",
                    email_admin,
                )

            banco.add(
                banco_dados.Usuario(
                    empresa_id=int(empresa.id),
                    nome_completo=nome_admin,
                    email=email_admin,
                    senha_hash=criar_hash_senha(senha_admin),
                    nivel_acesso=int(banco_dados.NivelAcesso.DIRETORIA),
                    ativo=True,
                    senha_temporaria_ativa=False,
                )
            )
        banco.commit()
        banco_dados.logger.info("Bootstrap inicial de produção concluído para %s.", email_admin)


def seed_limites_plano() -> None:
    banco_dados = _database_module()
    with banco_dados.SessaoLocal() as banco:
        for plano_valor, limites in banco_dados.LIMITES_PADRAO.items():
            registro = banco.get(banco_dados.LimitePlano, plano_valor)
            if not registro:
                registro = banco_dados.LimitePlano(plano=plano_valor)
                banco.add(registro)

            for campo, valor in limites.items():
                setattr(registro, campo, valor)

        try:
            banco.commit()
        except Exception:
            banco.rollback()
            raise
