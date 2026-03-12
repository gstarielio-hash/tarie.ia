# Mesa Avaliadora

Resumo operacional do fluxo da Mesa Avaliadora.

## O que e

Canal bilateral entre inspetor e revisor/engenharia, separado do chat IA.

## Backend principal

- `app/domains/chat/mesa.py`: API do inspetor para listar, enviar mensagem e enviar anexo.
- `app/domains/revisor/routes.py`: resposta do revisor, whispers, painel operacional e download de anexos.
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
3. Abrir primeiro `mesa.py`, `routes.py` e a UI correspondente.
