# Integração App <-> Mesa Avaliadora

Data: 2026-03-21

## Objetivo

Registrar o que foi entregue na integração entre o app Android do inspetor e a Mesa Avaliadora, quais contratos novos entraram e quais próximos passos ainda fazem sentido.

## O que foi feito

### 1. Idempotência de envio para a Mesa

Foi adicionada idempotência aditiva para mensagens e anexos enviados pelo app para a Mesa:

- `POST /app/api/laudo/{laudo_id}/mesa/mensagem`
- `POST /app/api/laudo/{laudo_id}/mesa/anexo`

Os endpoints agora aceitam `client_message_id`.

Quando o app ou a fila offline tenta reenviar a mesma ação, o backend reaproveita a mensagem já persistida em vez de duplicar o registro.

### 2. Metadados de entrega e correlação

As respostas da Mesa agora carregam metadados novos, sem quebrar o contrato antigo:

- `client_message_id`
- `criado_em_iso`
- `entrega_status`
- `request_id`
- `idempotent_replay`

Isso permite:

- reconciliar mensagem otimista com mensagem persistida
- rastrear retry da fila offline
- correlacionar chamadas mobile com persistência no backend

### 3. Resumo operacional da Mesa por laudo

Foi criado um endpoint aditivo:

- `GET /app/api/laudo/{laudo_id}/mesa/resumo`

Esse resumo devolve:

- total de mensagens
- mensagens não lidas
- pendências abertas
- pendências resolvidas
- última mensagem, horário e preview
- estado operacional do laudo para o app

### 4. Sync incremental da conversa da Mesa

O endpoint existente:

- `GET /app/api/laudo/{laudo_id}/mesa/mensagens`

agora também aceita `apos_id` e devolve:

- `cursor_ultimo_id`
- `resumo`
- `sync`

Com isso, o app consegue atualizar a conversa em delta quando já tem a thread carregada, sem precisar refazer o download completo em toda atualização.

### 5. Feed resumido para monitoramento mobile

Foi criado um endpoint novo:

- `GET /app/api/mobile/mesa/feed`

Ele recebe a lista de `laudo_ids` monitorados e um `cursor_atualizado_em`.

Esse feed devolve apenas os laudos alterados desde o cursor, com resumo da Mesa por laudo.

Na prática, isso reduz polling cego no app e evita abrir todas as conversas da Mesa a cada ciclo de monitoramento.

### 6. Android adaptado ao novo contrato

O app Android foi atualizado para:

- gerar `clientMessageId` ao enviar mensagem/anexo para a Mesa
- preservar `clientMessageId` na fila offline
- reutilizar esse id nos retries
- aplicar sync incremental na conversa da Mesa quando possível
- usar o feed resumido da Mesa para decidir quais laudos precisam de refresh completo

### 7. Persistência e migração

Foi adicionada coluna de idempotência no backend:

- `mensagens_laudo.client_message_id`

e uma migration Alembic correspondente para ambiente real.

## Arquivos principais alterados

### Backend web

- `web/app/domains/chat/mesa.py`
- `web/app/domains/chat/mesa_mobile_support.py`
- `web/app/domains/chat/mensagem_helpers.py`
- `web/app/domains/chat/schemas.py`
- `web/app/shared/db/models_laudo.py`
- `web/alembic/versions/ab4e8d1c9f32_mesa_mobile_idempotencia_sync.py`

### Android

- `android/src/config/mesaApi.ts`
- `android/src/features/chat/messageSendFlows.ts`
- `android/src/features/mesa/useMesaController.ts`
- `android/src/features/offline/useOfflineQueueController.ts`
- `android/src/features/activity/monitorActivityFlow.ts`
- `android/src/features/activity/useActivityCenterController.ts`
- `android/src/features/InspectorMobileApp.tsx`
- `android/src/types/mobile.ts`

### Testes

- `web/tests/test_mesa_mobile_sync.py`
- `android/src/config/mesaApi.test.ts`
- `android/src/features/offline/useOfflineQueueController.test.ts`
- `android/src/features/activity/monitorActivityFlow.test.ts`

## O que foi preservado

Nada do fluxo antigo foi removido.

Os contratos anteriores continuam válidos. Os novos campos e endpoints foram adicionados de forma compatível para não quebrar:

- web existente
- app mobile atual
- fila offline já existente

## O que ainda não foi feito

Não foi implementado provedor real de push server-side.

Hoje o projeto já tinha:

- preferências de push no app
- runtime local de notificações no Android

Mas não havia infraestrutura pronta no backend para:

- registrar token de dispositivo
- armazenar token por usuário/dispositivo
- despachar push via Expo/FCM/APNs

Por isso, a melhoria entregue foi:

- feed resumido
- sync incremental
- menor custo de monitoramento

em vez de inventar um backend de push do zero nesta passada.

## Próximos passos recomendados

### Prioridade alta

1. Rodar a migration em homologação e produção.
2. Validar retry real do app em rede instável com mensagens e anexos grandes.
3. Homologar o feed resumido da Mesa em ciclos longos de uso para medir redução de polling.

### Prioridade média

1. Criar endpoint de registro de token mobile por dispositivo.
2. Persistir `push_token`, `platform`, `app_version` e `last_seen_at`.
3. Ligar notificações server-side de eventos da Mesa com provedor real.

### Prioridade opcional

1. Expor estados de entrega mais ricos no app, como `queued`, `sent`, `persisted`, `read_by_mesa`.
2. Adicionar métricas operacionais por `client_message_id` e `request_id`.
3. Expandir o feed para outros eventos do laudo além da Mesa.

## Passos de deploy

Antes de subir esta entrega, garantir:

1. aplicar Alembic até `head`
2. subir backend com a nova migration
3. publicar a versão do app que já envia `clientMessageId`

## Validação executada

### Web

- `ruff check`: ok
- `mypy`: ok
- `pytest -q`: `253 passed, 37 skipped`

### Android

- `npm run lint`: ok
- `npm run typecheck`: ok
- `npm test -- --runInBand`: `24 suites`, `76 testes`

## Resumo executivo

A integração app <-> Mesa agora está mais robusta para uso real em rede instável:

- sem duplicar mensagem por retry
- com reconciliação melhor no app
- com sync incremental
- com monitoramento resumido por feed

O próximo salto técnico natural é push server-side real. Até lá, o comportamento atual já ficou muito mais estável e barato de sincronizar.
