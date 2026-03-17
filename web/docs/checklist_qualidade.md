# Checklist de Qualidade

Fonte de verdade atual do gate de qualidade antes do envio do laudo para a mesa.

## Fonte de verdade no codigo

- `app/domains/chat/gate_helpers.py`
- `app/domains/chat/laudo.py`
- `app/domains/chat/laudo_state_helpers.py`

## Regras por template

| Template | Textos minimos | Evidencias minimas | Fotos minimas | Respostas IA minimas | Formulario estruturado |
| --- | ---: | ---: | ---: | ---: | --- |
| `padrao` | 1 | 2 | 1 | 1 | nao |
| `avcb` | 2 | 3 | 2 | 1 | nao |
| `spda` | 2 | 3 | 2 | 1 | nao |
| `pie` | 2 | 3 | 2 | 1 | nao |
| `rti` | 2 | 3 | 2 | 1 | nao |
| `nr12maquinas` | 2 | 3 | 2 | 1 | nao |
| `nr13` | 2 | 3 | 2 | 1 | nao |
| `cbmgo` | 2 | 3 | 2 | 1 | sim |

## O que conta como item valido

### Escopo inicial

- Usa `laudo.primeira_mensagem`.
- Precisa ter conteudo util com ao menos 8 caracteres alfanumericos.
- Nao vale:
  - `Nova conversa`
  - `imagem enviada`
  - `[imagem]`
  - textos de relatorio iniciado

### Texto de campo

- Mensagem do usuario ou do inspetor.
- Precisa ter conteudo util com ao menos 8 caracteres alfanumericos.
- Nao vale:
  - comando de sistema
  - foto placeholder
  - documento placeholder

### Foto

Hoje o gate reconhece foto por placeholders:

- `[imagem]`
- `imagem enviada`
- `[foto]`

### Documento

- Segue a deteccao de `mensagem_representa_documento(...)` em `media_helpers.py`.

### Evidencia consolidada

- Soma qualquer item que conte como texto, foto ou documento.

### Parecer da IA

- Conta mensagens `TipoMensagem.IA`.

## Checklist retornado pela API

Os itens atuais gerados pelo gate sao:

- `campo_escopo_inicial`
- `campo_parecer_ia`
- `evidencias_textuais`
- `evidencias_minimas`
- `fotos_essenciais`
- `formulario_estruturado` apenas quando o template exigir

## Roteiro estruturado do template

O payload do gate agora tambem devolve `roteiro_template`, com:

- `titulo`
- `descricao`
- `itens`

Cada item do roteiro traz:

- `id`
- `categoria`
- `titulo`
- `descricao`
- `obrigatorio`

Esse roteiro nao substitui o bloqueio do gate; ele organiza a coleta minima esperada por tipo de inspecao e aparece no modal do inspetor.

## HTTP e comportamento

### Consultar gate

- `GET /app/api/laudo/{laudo_id}/gate-qualidade`
- Retorna `200` se aprovado
- Retorna `422` se reprovado

### Finalizar laudo

- `POST /app/api/laudo/{laudo_id}/finalizar`
- Se reprovado, retorna `422` com `detail` contendo o payload completo do gate
- Se aprovado:
  - `status_revisao = AGUARDANDO`
  - `encerrado_pelo_inspetor_em = agora`
  - `reabertura_pendente_em = None`

### Reabrir laudo

- `POST /app/api/laudo/{laudo_id}/reabrir`
- So permitido quando `permite_reabrir = true`
- Hoje isso significa `status_card == "ajustes"`

## Regras de estado que importam

`permite_edicao`:

- verdadeiro apenas quando `status_revisao == RASCUNHO`

`permite_reabrir`:

- verdadeiro apenas quando o card do laudo esta em `ajustes`
- isso acontece quando:
  - `status_revisao == REJEITADO`, ou
  - `status_revisao == AGUARDANDO` e existe `reabertura_pendente_em`

## Observacao especial do template CBMGO

Na finalizacao, o sistema tenta gerar `dados_formulario` estruturados antes de validar o gate.

- Se a geracao falhar, o sistema registra warning e segue.
- Mesmo assim, o gate continua exigindo `dados_formulario` para aprovar o template `cbmgo`.

## Frontend que expoe isso

- `templates/index.html`
- `static/js/chat/chat_index_page.js`

Elementos principais:

- `#btn-finalizar-inspecao`
- `#modal-gate-qualidade`
- `#lista-gate-faltantes`
- `#lista-gate-checklist`

Evento usado no front:

- `tariel:gate-qualidade-falhou`

## Testes bons para consultar

- `tests/test_regras_rotas_criticas.py`
  - gate reprovado
  - finalizacao bloqueada
  - finalizacao aprovada
  - reabertura
- `tests/e2e/test_portais_playwright.py`
  - `test_e2e_finalizar_sem_evidencias_aciona_gate_qualidade`
