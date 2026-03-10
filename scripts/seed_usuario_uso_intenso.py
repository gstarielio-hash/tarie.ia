from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Final

DIR_PROJETO = Path(__file__).resolve().parents[1]
if str(DIR_PROJETO) not in sys.path:
    sys.path.insert(0, str(DIR_PROJETO))

from app.shared.database import Empresa, NivelAcesso, PlanoEmpresa, SessaoLocal, Usuario, inicializar_banco  # noqa: E402
from app.shared.security import criar_hash_senha  # noqa: E402


EMPRESA_NOME: Final[str] = "WF Lab Carga Local"
EMPRESA_CNPJ: Final[str] = "00.999.999/0001-91"
SENHA_PADRAO: Final[str] = "Stress@123456"


@dataclass(frozen=True)
class UsuarioCarga:
    email: str
    nome: str
    nivel: int
    senha: str
    crea: str | None = None


USUARIOS_CARGA: Final[tuple[UsuarioCarga, ...]] = (
    UsuarioCarga(
        email="stress.inspetor@wf.local",
        nome="Inspetor Carga Local",
        nivel=int(NivelAcesso.INSPETOR),
        senha=SENHA_PADRAO,
    ),
    UsuarioCarga(
        email="stress.inspetor2@wf.local",
        nome="Inspetor Carga Local 2",
        nivel=int(NivelAcesso.INSPETOR),
        senha=SENHA_PADRAO,
    ),
    UsuarioCarga(
        email="stress.revisor@wf.local",
        nome="Revisor Carga Local",
        nivel=int(NivelAcesso.REVISOR),
        senha=SENHA_PADRAO,
        crea="123456-SP",
    ),
    UsuarioCarga(
        email="stress.admin@wf.local",
        nome="Admin Carga Local",
        nivel=int(NivelAcesso.DIRETORIA),
        senha=SENHA_PADRAO,
    ),
)


def _garantir_empresa(banco) -> Empresa:
    empresa = (
        banco.query(Empresa)
        .filter((Empresa.nome_fantasia == EMPRESA_NOME) | (Empresa.cnpj == EMPRESA_CNPJ))
        .first()
    )
    if empresa:
        empresa.nome_fantasia = EMPRESA_NOME
        empresa.cnpj = EMPRESA_CNPJ
        empresa.plano_ativo = PlanoEmpresa.ILIMITADO.value
        empresa.status_bloqueio = False
        empresa.motivo_bloqueio = None
        empresa.segmento = "Inspecoes Industriais"
        empresa.cidade_estado = "Local/Dev"
        empresa.nome_responsavel = "Equipe QA"
        return empresa

    empresa = Empresa(
        nome_fantasia=EMPRESA_NOME,
        cnpj=EMPRESA_CNPJ,
        plano_ativo=PlanoEmpresa.ILIMITADO.value,
        status_bloqueio=False,
        segmento="Inspecoes Industriais",
        cidade_estado="Local/Dev",
        nome_responsavel="Equipe QA",
        observacoes="Empresa de carga local para testes intensos E2E.",
    )
    banco.add(empresa)
    banco.flush()
    return empresa


def _upsert_usuario(banco, empresa: Empresa, cfg: UsuarioCarga) -> Usuario:
    usuario = banco.query(Usuario).filter(Usuario.email == cfg.email).first()
    senha_hash = criar_hash_senha(cfg.senha)

    if usuario is None:
        usuario = Usuario(
            empresa_id=empresa.id,
            nome_completo=cfg.nome,
            email=cfg.email,
            crea=cfg.crea,
            senha_hash=senha_hash,
            nivel_acesso=cfg.nivel,
            ativo=True,
            tentativas_login=0,
            status_bloqueio=False,
            senha_temporaria_ativa=False,
        )
        banco.add(usuario)
        banco.flush()
        return usuario

    usuario.empresa_id = empresa.id
    usuario.nome_completo = cfg.nome
    usuario.crea = cfg.crea
    usuario.senha_hash = senha_hash
    usuario.nivel_acesso = cfg.nivel
    usuario.ativo = True
    usuario.tentativas_login = 0
    usuario.bloqueado_ate = None
    usuario.status_bloqueio = False
    usuario.senha_temporaria_ativa = False
    banco.flush()
    return usuario


def main() -> int:
    inicializar_banco()

    with SessaoLocal() as banco:
        empresa = _garantir_empresa(banco)
        usuarios: list[Usuario] = []
        for cfg in USUARIOS_CARGA:
            usuarios.append(_upsert_usuario(banco, empresa, cfg))
        banco.commit()

    print("Usuarios de carga local prontos.")
    print(f"Empresa: {empresa.id} | {EMPRESA_NOME} | {EMPRESA_CNPJ}")
    for item in usuarios:
        print(f"- id={item.id} email={item.email} nivel={item.nivel_acesso} senha={SENHA_PADRAO}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
