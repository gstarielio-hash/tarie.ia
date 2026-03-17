# Mesa Avaliadora

Resumo operacional do fluxo da Mesa Avaliadora.

## O que e

Canal bilateral entre inspetor e revisor/engenharia, separado do chat IA.

## Backend principal

- `app/domains/chat/mesa.py`: API do inspetor para listar, enviar mensagem e enviar anexo.
- `app/domains/revisor/routes.py`: fachada compatível das rotas HTTP do revisor.
- `app/domains/revisor/auth_portal.py`: login/logout e troca obrigatória de senha da mesa.
- `app/domains/revisor/ws.py`: gerenciador de conexões e WebSocket de whispers.
- `app/domains/revisor/base.py`: schemas e helpers compartilhados do domínio revisor.
- `app/domains/revisor/panel.py`: composição do painel HTML e filtros do inbox da mesa.
- `app/domains/revisor/mesa_api.py`: responder, avaliar, pendências, histórico, pacote e anexos.
- `app/domains/revisor/service.py`: mutações e leituras operacionais da mesa usadas pelas rotas do revisor.
- `app/domains/revisor/realtime.py`: adaptador de WebSocket/SSE e notificações entre mesa e inspetor, com backend `memory` ou `redis`.
- `app/domains/chat/mensagem_helpers.py`: serializacao e notificacao da mesa.
- `app/domains/chat/pendencias_helpers.py`: pendencias abertas, resolvidas e payloads.
- `app/domains/mesa/service.py`: pacote operacional da mesa.
- `app/domains/mesa/contracts.py`: contratos do pacote.
- `app/domains/mesa/attachments.py`: validacao, persistencia e serializacao de anexos.

## Persistencia

- `app/shared/database.py`
  - `MensagemLaudo`
  - `AnexoMesa`
  - relacionamento `mensagem.anexos_mesa`
  - relacionamento `laudo.anexos_mesa`

## Frontend principal

### Inspetor

- `templates/index.html`
- `static/js/chat/chat_index_page.js`

Controles principais:

- `#btn-mesa-widget-toggle`
- `#painel-mesa-widget`
- `#mesa-widget-input`
- `#mesa-widget-btn-anexo`
- `#mesa-widget-input-anexo`

### Revisor

- `templates/painel_revisor.html`

Controles principais:

- `#mesa-operacao-painel`
- `#input-resposta`
- `#btn-enviar-msg`
- `#btn-anexo-resposta`
- `#input-anexo-resposta`

## Regras importantes

- Mesa nao usa o mesmo fluxo do chat IA.
- Anexo da mesa e protegido e nao deve virar arquivo publico em `static/`.
- Mensagem da mesa pode ser so texto, so anexo ou texto + anexo.
- Pendencia da mesa pode ser resolvida e reaberta.
- Whisper e o sinal de atividade/notificacao da mesa para o revisor.

## Testes que mais ajudam

- `tests/test_regras_rotas_criticas.py -k "mesa or pendencias or pacote or anexo"`
- `tests/e2e/test_portais_playwright.py -k "mesa"`

## Quando um bug cair aqui

1. Confirmar se o problema e do inspetor, do revisor ou do pacote.
2. Ver se envolve texto, anexo, pendencia ou whisper.
3. Abrir primeiro `mesa.py`, `panel.py` ou `mesa_api.py` e a UI correspondente.
