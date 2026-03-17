# AGENTS

Guia local para agentes e automacoes trabalharem nesta base com o minimo de exploracao desnecessaria.

## Antes de mexer

- Leia `PROJECT_MAP.md` para localizar o fluxo certo.
- Use `README.md` para setup e comandos globais.
- Use `app/ARCHITECTURE.md` e `app/domains/chat/ARCHITECTURE.md` quando a duvida for estrutural.
- Use `docs/checklist_qualidade.md` e `docs/regras_de_encerramento.md` quando o assunto for finalizar, bloquear ou reabrir laudo.
- Use `docs/mesa_avaliadora.md` e `docs/frontend_mapa.md` para navegar mais rapido em mesa e UI.

## Onde olhar primeiro por assunto

### Portal do inspetor

- Backend: `app/domains/chat/router.py`, `app/domains/chat/laudo.py`, `app/domains/chat/chat.py`
- Frontend: `templates/index.html`, `static/js/chat/chat_index_page.js`

### Mesa Avaliadora

- Backend inspetor: `app/domains/chat/mesa.py`
- Backend revisor: `app/domains/revisor/routes.py`
- Servicos/contratos: `app/domains/mesa/service.py`, `app/domains/mesa/contracts.py`
- UI inspetor: `templates/index.html`, `static/js/chat/chat_index_page.js`
- UI revisor: `templates/painel_revisor.html`

### Pendencias e pacote da mesa

- `app/domains/chat/pendencias.py`
- `app/domains/chat/pendencias_helpers.py`
- `app/domains/mesa/service.py`

### Portal do admin-cliente

- Backend: `app/domains/cliente/routes.py`, `app/domains/cliente/common.py`
- Templates: `templates/login_cliente.html`, `templates/cliente_portal.html`
- Servicos administrativos reutilizados: `app/domains/admin/services.py`
- Seguranca/sessao: `app/shared/security.py`, `app/shared/database.py`

### Portal do admin-ceo

- Backend: `app/domains/admin/routes.py`, `app/domains/admin/services.py`
- Templates: `templates/login.html`, `templates/dashboard.html`, `templates/clientes.html`, `templates/novo_cliente.html`
- Seguranca/sessao: `app/shared/security.py`, `app/shared/database.py`

### Gate de qualidade e bloqueio de encerramento

- `app/domains/chat/gate_helpers.py`
- `app/domains/chat/laudo.py`
- `templates/index.html`
- `docs/checklist_qualidade.md`
- `docs/regras_de_encerramento.md`

### Perfil / Home / modo foco

- `templates/base.html`
- `static/js/shared/ui.js`
- `static/js/chat/chat_perfil_usuario.js`
- `static/css/shared/layout.css`
- `static/css/shared/app_shell.css`

## Regras praticas de navegacao

- Se o problema for de persistencia, abra `app/shared/database.py` cedo.
- Se o problema for visual no chat do inspetor, comece por `chat_base.css`, `chat_mobile.css` e `chat_index.css`.
- Se o problema for de shell global, comece por `base.html`, `ui.js` e `app_shell.css`.
- Se o problema for de revisor, confira `templates/painel_revisor.html` antes de procurar JS separado.
- Se o problema for do portal `/cliente`, confira primeiro `app/domains/cliente/routes.py` e depois os wrappers reaproveitados em `chat`/`revisor`.

## Busca recomendada

```powershell
rg -n "termo" app templates static tests
sg run --lang python --pattern 'async def $NAME($$$): $$$' app/domains/chat/mesa.py
ctags --extras=+q --fields=+n -R app templates static tests
```

## Testes recomendados por impacto

- Contrato/template: `python -m pytest tests/test_smoke.py -q`
- Regra critica: `python -m pytest tests/test_regras_rotas_criticas.py -q`
- Fluxo real: `$env:RUN_E2E="1"; python -m pytest tests/e2e/test_portais_playwright.py -q`

## Evite

- Reintroduzir arquivos legados removidos da raiz.
- Espalhar regra nova em `app/domains/chat/routes.py`; use os modulos tematicos.
- Mexer em CSS do chat sem checar se a regra pertence ao shell, ao nucleo ou a pagina index.
