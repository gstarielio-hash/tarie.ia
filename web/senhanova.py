# resetar_senha.py
from banco_dados import SessaoLocal, Usuario
from seguranca import criar_hash_senha

banco = SessaoLocal()

# Lista todos os usuários cadastrados
usuarios = banco.query(Usuario).all()
print("\nUsuários encontrados:")
for u in usuarios:
    print(f"  ID: {u.id} | Email: {u.email} | Nível: {u.nivel_acesso} | Empresa ID: {u.empresa_id}")

# Redefine a senha do primeiro usuário de nível 99 (Diretoria)
admin = banco.query(Usuario).filter(Usuario.nivel_acesso == 99).first()

if admin:
    nova_senha = "Admin@2026"
    admin.senha_hash = criar_hash_senha(nova_senha)
    banco.commit()
    print(f"\n✅ Senha redefinida!")
    print(f"   Email: {admin.email}")
    print(f"   Nova senha: {nova_senha}")
else:
    print("\n⚠️ Nenhum usuário de Diretoria encontrado.")
    print("   Rode o criar_admin.py para criar um.")

banco.close()
