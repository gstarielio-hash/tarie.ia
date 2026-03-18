# criar_admin.py — rode com: python criar_admin.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from banco_dados import SessaoLocal, Empresa, Usuario, NivelAcesso, PlanoEmpresa
from seguranca import criar_hash_senha  # ← corrigido

banco = SessaoLocal()

try:
    empresa = Empresa(
        nome_fantasia="Tariel.ia Demo",
        cnpj="00.000.000/0001-00",
        plano_ativo=PlanoEmpresa.ILIMITADO.value,
    )
    banco.add(empresa)
    banco.flush()

    admin = Usuario(
        empresa_id=empresa.id,
        nome_completo="Administrador Tariel.ia",
        email="admin@tariel.ia",
        senha_hash=criar_hash_senha("Admin@2026"),  # ← corrigido
        nivel_acesso=int(NivelAcesso.DIRETORIA),
        ativo=True,
    )
    banco.add(admin)
    banco.commit()
    print(f"✅ Admin criado | id={admin.id} | email={admin.email}")
except Exception as e:
    banco.rollback()
    print(f"❌ Erro: {e}")
finally:
    banco.close()
