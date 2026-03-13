# Project Map

Mapa curto para navegar no Tariel Control sem gastar contexto a toa.

## Entradas principais

- `main.py`: sobe a app FastAPI e registra os portais.
- `templates/base.html`: shell base do frontend e carregamento dos assets compartilhados.
- `templates/index.html`: portal do inspetor.
- `templates/painel_revisor.html`: portal da mesa/revisor.
- `templates/cliente_portal.html`: portal do admin-cliente multiempresa.

## Backend por dominio

- `app/domains/chat`: portal do inspetor, laudo, chat IA, mesa e pendencias.
- `app/domains/revisor`: painel da engenharia, whispers, avaliacao e operacao da mesa.
- `app/domains/mesa`: contratos e servicos do pacote da mesa avaliadora.
- `app/domains/admin`: portal do admin-ceo, empresas, assinaturas e gestao SaaS.
- `app/domains/cliente`: portal do admin-cliente, empresa, usuarios, chat e mesa company-scoped.
- `app/shared`: models SQLAlchemy, seguranca, sessao e utilitarios globais.

## Arquivos que mais servem de ponto de entrada

- `app/domains/chat/router.py`: agrega os subrouters do portal do inspetor.
- `app/domains/chat/laudo.py`: ciclo de vida do laudo.
- `app/domains/chat/chat.py`: chat IA, historico e anexos gerais.
- `app/domains/chat/mesa.py`: canal inspetor <-> mesa avaliadora.
- `app/domains/chat/pendencias.py`: pendencias da mesa e exportacoes.
- `app/domains/revisor/routes.py`: painel do revisor, inbox, whispers e resposta da mesa.
- `app/domains/cliente/routes.py`: portal `/cliente`, wrappers company-scoped e gestao do admin-cliente.
- `app/domains/mesa/service.py`: montagem do pacote operacional da mesa.
- `app/shared/database.py`: models e relacionamentos. Comece aqui quando a duvida for de dado persistido.

## Frontend ativo

### Inspetor

- `templates/index.html`
- `static/js/chat/chat_index_page.js`
- `static/js/chat/chat_perfil_usuario.js`
- `static/js/shared/ui.js`
- `static/js/shared/api.js`

### Revisor

- `templates/painel_revisor.html`
- `static/js/revisor/` se surgir JS dedicado fora do template inline

### Admin-Cliente

- `templates/login_cliente.html`
- `templates/cliente_portal.html`
- `app/domains/cliente/routes.py`
- `app/domains/cliente/common.py`

### Admin-CEO

- `templates/login.html`
- `templates/dashboard.html`
- `templates/clientes.html`
- `templates/novo_cliente.html`
- `app/domains/admin/routes.py`

### CSS ativo

- `static/css/shared/global.css`: tokens globais, tipografia e base.
- `static/css/shared/layout.css`: header, sidebar e estrutura principal.
- `static/css/shared/app_shell.css`: dock, shell global, overlays e toasts.
- `static/css/chat/chat_base.css`: nucleo do chat.
- `static/css/chat/chat_mobile.css`: overrides do chat em mobile.
- `static/css/chat/chat_index.css`: regras especificas da pagina do inspetor.

## Fluxos e onde mexer

### Mesa Avaliadora

- Inspetor envia/recebe: `app/domains/chat/mesa.py`
- Serializacao de mensagens: `app/domains/chat/mensagem_helpers.py`
- Pendencias da mesa: `app/domains/chat/pendencias_helpers.py`
- Pacote e contratos: `app/domains/mesa/contracts.py`, `app/domains/mesa/service.py`
- UI inspetor: `templates/index.html`, `static/js/chat/chat_index_page.js`
- UI revisor: `templates/painel_revisor.html`

### Portal Admin-Cliente

- Login/troca de senha: `templates/login_cliente.html`, `templates/trocar_senha.html`, `app/domains/cliente/routes.py`
- Aba Admin: `app/domains/cliente/routes.py`, `app/domains/admin/services.py`, `templates/cliente_portal.html`
- Aba Chat: `app/domains/cliente/routes.py`, `app/domains/chat/chat.py`, `app/domains/chat/laudo.py`
- Aba Mesa: `app/domains/cliente/routes.py`, `app/domains/revisor/routes.py`, `app/domains/mesa/service.py`

### Perfil do usuario

- Backend/sessao: `app/domains/chat/session_helpers.py`
- UI: `static/js/chat/chat_perfil_usuario.js`
- Shell base: `templates/base.html`

### Modo foco / Home / shell do app

- `templates/base.html`
- `static/js/shared/ui.js`
- `static/css/shared/app_shell.css`
- `static/css/shared/layout.css`

### Gate de qualidade / checklist / bloqueio de encerramento

- `app/domains/chat/gate_helpers.py`
- `app/domains/chat/laudo.py`
- `templates/index.html`
- `static/js/chat/chat_index_page.js`

### Anexos

- Chat geral: `app/domains/chat/media_helpers.py`, `app/domains/chat/chat.py`
- Mesa avaliadora: `app/domains/mesa/attachments.py`, `app/domains/chat/mesa.py`, `app/domains/revisor/routes.py`

## Testes que pagam melhor

- `tests/test_smoke.py`: contratos de template e guards simples.
- `tests/test_regras_rotas_criticas.py`: regras de negocio e rotas mais sensiveis.
- `tests/e2e/test_portais_playwright.py`: fluxos completos de inspetor, revisor e mesa.

## Comandos de navegacao rapida

```powershell
rg -n "mesa|pendencia|whisper" app templates static tests
ctags --version
sg --version
sg run --lang python --pattern 'async def $NAME($$$): $$$' app/domains/chat/mesa.py
python -m pytest tests/test_regras_rotas_criticas.py -q -k "mesa or pendencias"
$env:RUN_E2E="1"; python -m pytest tests/e2e/test_portais_playwright.py -q -k "mesa"
```

## Documentacao que ja existe

- `README.md`: setup local e pipeline.
- `app/ARCHITECTURE.md`: visao geral da arquitetura modular.
- `app/domains/chat/ARCHITECTURE.md`: mapa interno do dominio `chat`.
- `docs/checklist_qualidade.md`: gate de qualidade real por template.
- `docs/regras_de_encerramento.md`: bloqueio de finalizacao e reabertura.
- `docs/mesa_avaliadora.md`: fluxo operacional da mesa.
- `docs/frontend_mapa.md`: divisao ativa do frontend.

## Nota sobre legado

Nao volte a usar wrappers antigos removidos da raiz. A fonte de verdade atual esta em `app/domains/*`, `app/shared/*`, `templates/*`, `static/js/*` e `static/css/*`.
