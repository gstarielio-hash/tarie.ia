# Arquitetura (Modular Monolith)

## Domínios
- `app/domains/chat`: portal do inspetor, chat IA e fluxo de laudo
  - `routes.py`: implementação principal + `roteador_inspetor`
  - `schemas.py`: contratos pydantic do domínio
  - `auth.py`, `laudo.py`, `chat.py`, `mesa.py`, `pendencias.py`: roteadores ativos por responsabilidade
- `app/domains/mesa`: contratos e serviços da mesa avaliadora
- `app/domains/admin`: painel administrativo e serviços SaaS
- `app/domains/revisor`: painel de revisão/engenharia

## Compartilhado
- `app/shared/database.py`: models SQLAlchemy, engine e sessão
- `app/shared/security.py`: autenticação, sessão e RBAC
- `app/core/settings.py`: configuração central de ambiente (`AMBIENTE` validado em um único lugar)

## Frontend (assets)
- `static/js/chat`: scripts do portal do inspetor/chat
- `static/js/admin`: scripts do portal administrativo
- `static/js/revisor`: scripts do portal da mesa/revisão
- `static/js/shared`: utilitários comuns, bootstrap e service worker
- `static/css/revisor`: estilos específicos da biblioteca de templates de laudo

## Compatibilidade
Os wrappers legados da raiz foram removidos nesta fase de consolidação.
Todos os imports devem apontar para `app/domains/*` e `app/shared/*`.
