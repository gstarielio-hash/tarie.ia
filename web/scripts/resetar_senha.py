from __future__ import annotations

import argparse
from pathlib import Path
import sys

DIR_PROJETO = Path(__file__).resolve().parents[1]
if str(DIR_PROJETO) not in sys.path:
    sys.path.insert(0, str(DIR_PROJETO))

from app.shared.database import SessaoLocal, Usuario, inicializar_banco  # noqa: E402
from app.shared.security import criar_hash_senha, encerrar_todas_sessoes_usuario, gerar_senha_fortificada  # noqa: E402


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Reseta a senha de um usuario usando os modulos oficiais do backend.",
    )
    parser.add_argument("--listar", action="store_true", help="Lista usuarios e encerra.")
    alvo = parser.add_mutually_exclusive_group()
    alvo.add_argument("--email", default="", help="Busca o usuario por e-mail.")
    alvo.add_argument("--user-id", type=int, default=0, help="Busca o usuario por ID.")
    parser.add_argument("--nova-senha", default="", help="Senha explicita. Se omitida, gera uma senha forte.")
    tipo = parser.add_mutually_exclusive_group()
    tipo.add_argument("--senha-temporaria", dest="senha_temporaria", action="store_true", help="Marca a senha como temporaria.")
    tipo.add_argument("--senha-definitiva", dest="senha_temporaria", action="store_false", help="Marca a senha como definitiva.")
    parser.add_argument("--yes", action="store_true", help="Confirma a operacao sem prompt interativo.")
    parser.set_defaults(senha_temporaria=True)
    return parser


def _listar_usuarios() -> None:
    with SessaoLocal() as banco:
        usuarios = banco.query(Usuario).order_by(Usuario.id.asc()).all()

    if not usuarios:
        print("Nenhum usuario encontrado.")
        return

    print("Usuarios cadastrados:")
    for usuario in usuarios:
        print(
            f"- id={usuario.id} email={usuario.email} nivel={usuario.nivel_acesso} "
            f"empresa_id={usuario.empresa_id} ativo={usuario.ativo}"
        )


def _buscar_usuario(*, email: str, user_id: int) -> Usuario | None:
    with SessaoLocal() as banco:
        if email:
            return banco.query(Usuario).filter(Usuario.email == email.strip().lower()).first()
        if user_id > 0:
            return banco.get(Usuario, int(user_id))
    return None


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    inicializar_banco()

    if args.listar:
        _listar_usuarios()
        return 0

    email = str(args.email or "").strip().lower()
    user_id = int(args.user_id or 0)
    if not email and user_id <= 0:
        parser.error("Informe --email, --user-id ou use --listar.")

    usuario = _buscar_usuario(email=email, user_id=user_id)
    if usuario is None:
        print("Usuario nao encontrado.", file=sys.stderr)
        return 1

    senha_informada = str(args.nova_senha or "").strip()
    nova_senha = senha_informada or gerar_senha_fortificada()

    if not args.yes:
        identificador = usuario.email or f"id={usuario.id}"
        confirmacao = input(
            f"Confirmar reset de senha para {identificador}? [y/N]: "
        ).strip().lower()
        if confirmacao not in {"y", "yes", "s", "sim"}:
            print("Operacao cancelada.")
            return 1

    with SessaoLocal() as banco:
        usuario_db = banco.get(Usuario, int(usuario.id))
        if usuario_db is None:
            print("Usuario nao encontrado para atualizacao.", file=sys.stderr)
            return 1

        usuario_db.senha_hash = criar_hash_senha(nova_senha)
        usuario_db.tentativas_login = 0
        usuario_db.bloqueado_ate = None
        usuario_db.status_bloqueio = False
        usuario_db.senha_temporaria_ativa = bool(args.senha_temporaria)
        banco.commit()

    sessoes_encerradas = encerrar_todas_sessoes_usuario(int(usuario.id))

    print("Senha atualizada.")
    print(f"Usuario: id={usuario.id} email={usuario.email}")
    print(f"Sessoes encerradas: {sessoes_encerradas}")
    print(f"Senha temporaria ativa: {bool(args.senha_temporaria)}")
    if senha_informada:
        print("Senha nao exibida porque foi informada manualmente.")
    else:
        print(f"Nova senha gerada: {nova_senha}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
