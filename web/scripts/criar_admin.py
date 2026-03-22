from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys

DIR_PROJETO = Path(__file__).resolve().parents[1]
if str(DIR_PROJETO) not in sys.path:
    sys.path.insert(0, str(DIR_PROJETO))

from app.shared.database import Empresa, NivelAcesso, PlanoEmpresa, SessaoLocal, Usuario, inicializar_banco  # noqa: E402
from app.shared.security import criar_hash_senha, gerar_senha_fortificada  # noqa: E402


EMAIL_PADRAO = "admin@tariel.ia"
NOME_PADRAO = "Administrador Tariel.ia"
EMPRESA_PADRAO = "Tariel.ia"
CNPJ_PADRAO = "11111111111111"


def _normalizar_email(valor: str) -> str:
    email = str(valor or "").strip().lower()
    if not email:
        raise ValueError("Informe um e-mail valido.")
    return email


def _normalizar_cnpj(valor: str) -> str:
    cnpj = re.sub(r"\D+", "", str(valor or ""))
    if len(cnpj) != 14:
        raise ValueError("Informe um CNPJ com 14 digitos.")
    return cnpj


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Cria ou atualiza um usuario Admin-CEO usando os modulos oficiais do backend.",
    )
    parser.add_argument("--email", default=EMAIL_PADRAO, help=f"E-mail do admin. Padrao: {EMAIL_PADRAO}")
    parser.add_argument("--nome", default=NOME_PADRAO, help=f"Nome do admin. Padrao: {NOME_PADRAO}")
    parser.add_argument("--senha", default="", help="Senha explicita. Se omitida, gera uma senha forte temporaria.")
    parser.add_argument("--empresa-nome", default=EMPRESA_PADRAO, help=f"Nome da empresa. Padrao: {EMPRESA_PADRAO}")
    parser.add_argument("--empresa-cnpj", default=CNPJ_PADRAO, help=f"CNPJ da empresa. Padrao: {CNPJ_PADRAO}")
    parser.add_argument("--yes", action="store_true", help="Confirma a operacao sem prompt interativo.")
    return parser


def _upsert_empresa(banco, *, nome: str, cnpj: str) -> tuple[Empresa, bool]:
    empresa = banco.query(Empresa).filter(Empresa.cnpj == cnpj).first()
    if empresa is None:
        empresa = Empresa(
            nome_fantasia=nome,
            cnpj=cnpj,
            plano_ativo=PlanoEmpresa.ILIMITADO.value,
            status_bloqueio=False,
        )
        banco.add(empresa)
        banco.flush()
        return empresa, True

    empresa.nome_fantasia = nome
    empresa.plano_ativo = PlanoEmpresa.ILIMITADO.value
    empresa.status_bloqueio = False
    empresa.motivo_bloqueio = None
    banco.flush()
    return empresa, False


def _upsert_admin(
    banco,
    *,
    empresa: Empresa,
    email: str,
    nome: str,
    senha: str,
) -> tuple[Usuario, bool]:
    usuario = banco.query(Usuario).filter(Usuario.email == email).first()
    senha_hash = criar_hash_senha(senha)

    if usuario is None:
        usuario = Usuario(
            empresa_id=int(empresa.id),
            nome_completo=nome,
            email=email,
            senha_hash=senha_hash,
            nivel_acesso=int(NivelAcesso.DIRETORIA),
            ativo=True,
            tentativas_login=0,
            status_bloqueio=False,
            senha_temporaria_ativa=False,
        )
        banco.add(usuario)
        banco.flush()
        return usuario, True

    usuario.empresa_id = int(empresa.id)
    usuario.nome_completo = nome
    usuario.senha_hash = senha_hash
    usuario.nivel_acesso = int(NivelAcesso.DIRETORIA)
    usuario.ativo = True
    usuario.tentativas_login = 0
    usuario.bloqueado_ate = None
    usuario.status_bloqueio = False
    usuario.senha_temporaria_ativa = False
    banco.flush()
    return usuario, False


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    email = _normalizar_email(args.email)
    nome = str(args.nome or "").strip() or NOME_PADRAO
    empresa_nome = str(args.empresa_nome or "").strip() or EMPRESA_PADRAO
    empresa_cnpj = _normalizar_cnpj(args.empresa_cnpj)
    senha_informada = str(args.senha or "").strip()
    senha = senha_informada or gerar_senha_fortificada()

    if not args.yes:
        confirmacao = input(
            f"Confirmar criacao/atualizacao do admin {email} na empresa {empresa_nome}? [y/N]: "
        ).strip().lower()
        if confirmacao not in {"y", "yes", "s", "sim"}:
            print("Operacao cancelada.")
            return 1

    inicializar_banco()

    with SessaoLocal() as banco:
        empresa, empresa_criada = _upsert_empresa(
            banco,
            nome=empresa_nome,
            cnpj=empresa_cnpj,
        )
        usuario, usuario_criado = _upsert_admin(
            banco,
            empresa=empresa,
            email=email,
            nome=nome,
            senha=senha,
        )
        banco.commit()
        banco.refresh(empresa)
        banco.refresh(usuario)

    print("Admin-CEO pronto.")
    print(f"Empresa: id={empresa.id} nome={empresa.nome_fantasia} cnpj={empresa.cnpj} criada={empresa_criada}")
    print(f"Usuario: id={usuario.id} email={usuario.email} criado={usuario_criado} nivel={usuario.nivel_acesso}")
    if senha_informada:
        print("Senha nao exibida porque foi informada manualmente.")
    else:
        print(f"Senha gerada: {senha}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
