# Frontend Mapa

Mapa curto do frontend ativo.

## Shell global

- `templates/base.html`
- `static/js/shared/ui.js`
- `static/js/shared/api.js`
- `static/css/shared/global.css`
- `static/css/shared/layout.css`
- `static/css/shared/app_shell.css`

Use essa camada para:

- Home
- perfil do usuario
- modo foco
- dock flutuante
- toasts e shell visual

## Portal do inspetor

- `templates/index.html`
- `static/js/chat/chat_index_page.js`
- `static/js/chat/chat_perfil_usuario.js`
- `static/css/chat/chat_base.css`
- `static/css/chat/chat_mobile.css`
- `static/css/chat/chat_index.css`

Use essa camada para:

- widget da mesa
- composer principal
- historico do chat
- modal de nova inspecao
- gate de qualidade
- pendencias da mesa

## Portal do revisor

- `templates/painel_revisor.html`
- `static/css/revisor/painel_revisor.css`
- `static/js/revisor/revisor_painel_core.js`
- `static/js/revisor/revisor_painel_mesa.js`
- `static/js/revisor/revisor_painel_historico.js`
- `static/js/revisor/painel_revisor_page.js`
- `static/css/revisor/` quando houver estilo dedicado fora do template

Use essa camada para:

- inbox da revisao
- timeline do laudo
- resposta da mesa
- painel operacional da mesa
- biblioteca/editor de templates

## Regra de divisao de CSS

- `global.css`: tokens, tipografia, base
- `layout.css`: header, sidebar, estrutura
- `app_shell.css`: comportamentos e componentes globais do shell
- `chat_base.css`: nucleo do chat
- `chat_mobile.css`: overrides responsivos do chat
- `chat_index.css`: especificos da pagina `index.html`

## Regra de divisao de JS

- `shared/`: comportamento global reutilizavel
- `chat/`: comportamento do portal do inspetor
- `revisor/`: comportamento dedicado do portal do revisor

## Bugs comuns e por onde começar

- Home/perfil/modo foco: `base.html`, `ui.js`, `layout.css`, `app_shell.css`
- Mesa no inspetor: `index.html`, `chat_index_page.js`, `chat_index.css`
- Perfil do usuario: `chat_perfil_usuario.js`
- Corte visual mobile: `chat_mobile.css` e breakpoints em `layout.css`
- Duplicacao visual: checar se a regra esta no arquivo certo antes de editar

## Validacao rapida

```powershell
python -m pytest tests/test_smoke.py -q
$env:RUN_E2E="1"; python -m pytest tests/e2e/test_portais_playwright.py -q -k "home or perfil or modo_foco or mesa"
node --check static/js/chat/chat_index_page.js
node --check static/js/shared/ui.js
```
