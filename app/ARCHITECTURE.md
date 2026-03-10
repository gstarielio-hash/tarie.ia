# Arquitetura (Modular Monolith)

## Domínios
- `app/domains/chat`: portal do inspetor, chat IA e fluxo de laudo
  - `routes.py`: implementação principal + `roteador_inspetor`
  - `schemas.py`: contratos pydantic do domínio
  - `auth.py`, `laudo.py`, `chat.py`, `mesa.py`, `pendencias.py`: agrupamento por responsabilidade
- `app/domains/mesa`: contratos e serviços da mesa avaliadora
- `app/domains/admin`: painel administrativo e serviços SaaS
- `app/domains/revisor`: painel de revisão/engenharia

## Compartilhado
- `app/shared/database.py`: models SQLAlchemy, engine e sessão
- `app/shared/security.py`: autenticação, sessão e RBAC
- `app/core/settings.py`: configuração central de ambiente

## Frontend (assets)
- `static/js/chat`: scripts do portal do inspetor/chat
- `static/js/admin`: scripts do portal administrativo
- `static/js/shared`: utilitários comuns, bootstrap e service worker

## Compatibilidade
Os módulos históricos no diretório raiz (`rotas_*.py`, `banco_dados.py`, `seguranca.py`, etc.)
foram mantidos como wrappers para preservar imports existentes durante a transição.
