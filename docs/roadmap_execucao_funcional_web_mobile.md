# Roadmap de Execução Funcional Web + Mobile

Atualizado em 2026-03-20 para guiar a evolução funcional do produto sem focar em estética.

## Objetivo

Melhorar o produto em três frentes ao mesmo tempo, mas na ordem correta:

1. reduzir risco técnico
2. preparar a base para SaaS e escala comercial
3. aumentar valor funcional do produto para venda e operação

Este documento é a rotina oficial de execução para backend e frontend de `web/` e `android/`.

## Regra de prioridade

Sempre seguir esta ordem:

1. integridade técnica
2. contrato de domínio
3. automação de validação
4. funcionalidade de produto
5. lapidação de UX funcional

Não parar para refatoração cosmética quando existir dívida que impacta:

- multiempresa
- permissão por papel
- sincronização offline
- contratos entre backend e mobile
- fluxos críticos de login, laudo, mesa, histórico e settings

## Modo de execução sem aprovação

O agente deve executar este roadmap de forma autônoma, sem pedir aprovação entre etapas, desde que a mudança:

- não exija credenciais externas novas
- não exija decisão de negócio irreversível
- não destrua dados existentes
- não conflite com alterações locais inesperadas do usuário

O agente só deve parar para perguntar quando houver:

- migração destrutiva ou ambígua de banco
- necessidade de segredo/token/conta de terceiro
- escolha de produto que altera regra comercial
- conflito direto com mudanças locais não feitas pelo agente

Fora esses casos, a rotina é:

1. implementar
2. validar
3. atualizar documentação
4. commitar
5. seguir para a próxima etapa

## Política de commit automático

Cada mudança relevante deve terminar em commit feito pelo agente, sem depender de aprovação manual do usuário.

Regras:

1. toda etapa funcional concluída deve gerar um commit
2. a mensagem do commit deve explicar claramente o que foi feito
3. quando uma fase for grande, dividir em múltiplos commits pequenos e coerentes
4. não acumular várias mudanças não relacionadas em um único commit se isso prejudicar revisão
5. sempre validar antes do commit com os checks adequados da fase

Formato esperado:

- `refactor: ...` para reorganização estrutural
- `feat: ...` para funcionalidade nova
- `fix: ...` para correção
- `test: ...` para cobertura
- `docs: ...` para documentação operacional
- `ci: ...` para workflow e automação

Obrigação operacional:

- o agente deve implementar, validar, commitar e seguir para a próxima etapa de forma autônoma
- o usuário não precisa aprovar commit por commit
- o agente só deve interromper esse fluxo nos casos de bloqueio real já definidos neste documento

## Estado atual resumido

- `web/` já possui esteira sólida com `ruff`, `pytest` crítico e workflow em `.github/workflows/ci.yml`
- `android/` já possui `eslint`, `typecheck`, `jest`, `prettier`, hooks locais e CI básica
- a Fase 1.1 de tipagem forte do mobile foi concluída em 2026-03-20, incluindo bootstrap, builders centrais, `settings` helpers e drawer builders
- a Fase 1.2 também foi concluída em 2026-03-20, com `api.ts` reduzido a fachada e módulos separados por domínio
- a Fase 1.3 foi concluída em 2026-03-20 com cobertura automatizada mínima para sessão, histórico, fila offline, settings sensível e helpers da API mobile
- a Fase 2.1 do web começou em 2026-03-20 com guard compartilhado de tenant em `web/app/shared/tenant_access.py`, reaproveitado por `chat`, `revisor` e `cliente`
- a Fase 2.2 do web avançou em 2026-03-20 com `web/app/domains/cliente/portal_bridge.py` consumindo `web/app/domains/chat/laudo_service.py` em vez de handlers HTTP de `chat.laudo`
- a Fase 2.2 do web também isolou leitura de mensagens e upload documental em `web/app/domains/chat/chat_service.py`, reduzindo a dependência da bridge do cliente sobre `chat/chat.py`
- o app mobile continua com composition root grande, mas o próximo foco técnico principal passa a ser o backend web para SaaS
- o backend web está funcional, porém ainda concentra muita regra em routers e na camada de banco/modelos

## Macroetapas

### Fase 0. Guardrails e baseline

Objetivo:

- manter uma linha segura de evolução contínua

Passos:

1. manter `make web-ci`, `make mobile-ci` e `git diff --check` sempre verdes
2. commitar em checkpoints pequenos por fase
3. atualizar documentação ao final de cada fase relevante
4. não adicionar lógica nova direto em arquivos já monolíticos se houver módulo novo disponível

Critério de aceite:

- nenhuma fase termina com worktree quebrado
- toda fase deixa a esteira verde

## Fase 1. Fechar risco técnico do mobile

Objetivo:

- tornar o app mobile mais confiável para crescer sem regressão silenciosa

### 1.1 Tipagem forte nos builders e contracts

Problema atual:

- ainda há `Record<string, any>`, `as any` e contratos frouxos em builders e composição

Arquivos prioritários:

- `android/src/features/common/buildInspectorBaseDerivedState.ts`
- `android/src/features/common/buildInspectorBaseDerivedStateSections.ts`
- `android/src/features/common/buildAuthenticatedLayoutProps.ts`
- `android/src/features/common/buildAuthenticatedLayoutSections.ts`
- `android/src/features/common/buildInspectorSessionModalsStackProps.ts`
- `android/src/features/common/buildInspectorSessionModalsSections.ts`
- `android/src/features/InspectorAuthenticatedLayout.tsx`
- `android/src/features/bootstrap/runBootstrapAppFlow.ts`

Passos:

1. criar tipos explícitos para inputs e outputs dos builders
2. substituir `Record<string, any>` por interfaces locais por domínio
3. remover `as any` em composição de layout e modais
4. tipar `runBootstrapAppFlow` com cache, fila, notificações e conversa reais
5. promover tipos compartilhados quando fizer sentido em `android/src/types/mobile.ts` ou `android/src/features/chat/types.ts`

Critério de aceite:

- zero `Record<string, any>` nos builders centrais
- zero `as any` em `InspectorAuthenticatedLayout.tsx`
- `typecheck` verde sem afrouxar regra

Status em 2026-03-20:

- concluído
- commits de referência:
  - `e20a158` `refactor: type mobile bootstrap cache and session contracts`
  - `9202731` `refactor: type mobile authenticated layout and session modals`
  - `e93463b` `refactor: type mobile inspector derived state builders`
  - `0678776` `refactor: type mobile activity refresh and login helpers`
  - `80c3382` `refactor: type mobile settings confirm and export flows`
  - `681a927` `refactor: type mobile settings local preference helpers`
  - `73b7e1e` `refactor: type mobile settings drawer builders`

### 1.2 Quebrar o cliente de API do mobile por domínio

Problema atual:

- `android/src/config/api.ts` mistura descoberta de ambiente, auth, helpers HTTP e chamadas de domínio

Passos:

1. separar em:
   - `android/src/config/apiCore.ts`
   - `android/src/config/authApi.ts`
   - `android/src/config/chatApi.ts`
   - `android/src/config/mesaApi.ts`
   - `android/src/config/settingsApi.ts`
2. manter `api.ts` temporariamente como facade pequena, se necessário
3. isolar parsing SSE e construção de headers
4. centralizar normalização de erros
5. criar testes unitários para helpers de URL, auth e parsing SSE

Critério de aceite:

- `api.ts` deixa de ser monolito
- chamadas por domínio ficam localizáveis
- contratos do mobile com backend ficam mais claros

Status em 2026-03-20:

- concluído
- commits de referência:
  - `6f1a50b` `refactor: split mobile api client by domain`
  - `0568ec1` `test: cover mobile api url and sse helpers`

### 1.3 Fechar cobertura de costura mobile

Problema atual:

- já existe boa cobertura de helper e hook, mas ainda faltam costuras de fluxo completo

Passos:

1. cobrir login/bootstrap, histórico, fila offline e settings sensível com testes de integração leve
2. aumentar cobertura de regressão nos controllers novos
3. testar cenários de falha de rede e fallback offline

Critério de aceite:

- fluxo crítico do mobile tem cobertura mínima automatizada
- regressão de costura não depende só de teste manual

Status em 2026-03-20:

- concluído
- referências principais:
  - `0f36161` `test: cover mobile session and offline queue flows`
  - `0568ec1` `test: cover mobile api url and sse helpers`
  - suíte mobile total: `22 suites`, `71 testes`, tudo verde em `make mobile-ci`

## Fase 2. Hardenizar backend web para SaaS

Objetivo:

- preparar o backend para multiempresa, permissão fina e menos acoplamento

### 2.1 Separar boundary de tenant e permissão

Problema atual:

- parte da regra de empresa/permissão está espalhada entre routers e helpers

Arquivos prioritários:

- `web/app/domains/cliente/routes.py`
- `web/app/domains/chat/auth.py`
- `web/app/domains/revisor/routes.py`
- `web/app/shared/security.py`

Passos:

1. mapear operações sensíveis por portal
2. criar camada de autorização por ação e por papel
3. extrair validação de escopo de empresa para funções reutilizáveis
4. impedir reaproveitamento implícito de endpoint/serviço entre portais sem contrato explícito

Critério de aceite:

- ações críticas têm validação clara de papel e empresa
- regras de permissão deixam de ficar escondidas em router

Status em 2026-03-20:

- em andamento
- concluído nesta fatia:
  - validação compartilhada de empresa/laudo em `web/app/shared/tenant_access.py`
  - reaproveitamento do guard por `web/app/domains/chat/laudo_access_helpers.py`
  - reaproveitamento do guard por `web/app/domains/revisor/common.py`
  - uso do guard para empresa do usuário em `web/app/domains/cliente/routes.py`
  - checks compartilhados de papel/portal em `web/app/shared/security.py`
  - remoção da duplicação de `NIVEIS_PERMITIDOS_APP` no portal inspetor
  - cobertura crítica em `web/tests/test_tenant_access.py`
- commit de referência:
  - `50f598d` `refactor: centralize web tenant access guards`
  - `edafa9f` `refactor: centralize web role checks in security helpers`
- próximo corte:
  - extrair autorização por ação/papel em cima de `security.py`
  - reduzir o reaproveitamento direto de rotas HTTP entre `cliente`, `chat` e `revisor`

### 2.2 Reduzir acoplamento entre portais

Problema atual:

- `cliente/routes.py` importa diretamente regras e contratos de `chat` e `revisor`

Passos:

1. identificar casos de reaproveitamento HTTP indevido
2. extrair serviços compartilhados de domínio para módulos neutros
3. deixar cada router apenas adaptar request/response
4. manter testes críticos verdes a cada extração

Critério de aceite:

- routers deixam de orquestrar domínio alheio
- serviços compartilhados ficam reutilizáveis sem acoplamento de portal

Status em 2026-03-20:

- em andamento
- concluído nesta fatia:
  - criação da façade explícita `web/app/domains/cliente/portal_bridge.py`
  - `web/app/domains/cliente/routes.py` deixou de importar handlers de `chat` e `revisor` diretamente
  - `web/tests/test_smoke.py` ganhou trava arquitetural para manter esse boundary
  - extração do ciclo de laudo para `web/app/domains/chat/laudo_service.py`
  - `web/app/domains/chat/laudo.py` passou a adaptar apenas CSRF/HTTP para o serviço neutro
  - `web/app/domains/cliente/portal_bridge.py` deixou de depender dos handlers HTTP de `chat.laudo`
  - extração de leitura de mensagens e upload documental para `web/app/domains/chat/chat_service.py`
  - `web/app/domains/chat/chat.py` passou a adaptar apenas HTTP para esses dois fluxos
  - `web/app/domains/cliente/portal_bridge.py` deixou de depender de `obter_mensagens_laudo` e `rota_upload_doc`
- commit de referência:
  - `2f76328` `refactor: isolate cliente portal cross-domain bridge`
  - `8f93edd` `refactor: point cliente bridge to core revisor modules`
  - `9dac5ee` `refactor: extract laudo cycle service for cliente bridge`
  - `1567339` `refactor: extract cliente chat read and upload services`
- próximo corte:
  - extrair serviço neutro para o fluxo principal de `rota_chat`
  - reduzir a dependência restante de `web/app/domains/cliente/portal_bridge.py` a zero sobre `web/app/domains/chat/chat.py`

### 2.3 Desmembrar camada de banco e modelos

Problema atual:

- `web/app/shared/database.py` concentra engine, enums, models e bootstrap

Passos:

1. separar em:
   - `web/app/shared/db/engine.py`
   - `web/app/shared/db/session.py`
   - `web/app/shared/db/enums.py`
   - `web/app/shared/db/models/*.py`
   - `web/app/shared/db/bootstrap.py`
2. manter compatibilidade de imports por etapa
3. mover seeds e utilidades de inicialização para módulos próprios

Critério de aceite:

- camada de persistência fica navegável
- modelagem deixa de depender de um arquivo monolítico

## Fase 3. Contrato único entre backend, web e mobile

Objetivo:

- reduzir drift entre API, app mobile e portais web

Passos:

1. revisar `android/src/types/mobile.ts` e alinhar com respostas reais do backend
2. criar schemas/responses mais explícitos no backend para endpoints móveis e críticos
3. tipar melhor payloads compartilhados de laudo, mesa, notificações e settings
4. quando viável, gerar tipos ou documentar contratos canônicos em arquivo dedicado

Critério de aceite:

- mudança de contrato fica explícita
- mobile e web deixam de depender de suposição informal

## Fase 4. Cobertura real de fluxo em CI

Objetivo:

- fazer a automação pegar regressão de comportamento, não só de sintaxe

Passos:

1. adicionar smoke Maestro na CI do mobile
2. manter a suite pequena no início:
   - login
   - histórico
   - settings
   - envio básico no chat
3. separar fluxo obrigatório por PR e fluxo estendido em agenda/nightly, se necessário
4. revisar se Playwright web já cobre os portais mais sensíveis

Critério de aceite:

- pipeline cobre fluxo real de usuário
- regressão funcional simples falha na CI

## Fase 5. Fechar lacunas funcionais do produto

Objetivo:

- melhorar o valor operacional do produto sem mexer em estética por si só

### 5.1 Mobile

Passos:

1. push notifications nativas com controle real de permissão e fallback
2. sincronização offline mais rica para status, reabertura e refresh de contexto
3. fila offline com observabilidade melhor por causa, canal e severidade
4. onboarding funcional inicial no app
5. diagnóstico de sessão, conectividade e sincronização mais previsível

Critério de aceite:

- app suporta rotina de campo com menos perda de contexto
- o inspetor entende melhor falha, espera e próximo passo

### 5.2 Web

Passos:

1. reforçar fluxos críticos de portal cliente, portal inspetor e portal revisor
2. estabilizar ações de mesa, aprovação, ajuste, reabertura e anexos
3. consolidar regras do editor/template workflow
4. preparar onboarding funcional do cliente/empresa
5. amarrar plano, limite e uso no portal cliente com comportamento claro

Critério de aceite:

- portais funcionam melhor como produto operacional
- fluxo comercial deixa de depender de operação manual escondida

## Fase 6. Preparação comercial e de operação

Objetivo:

- transformar a base em produto vendável e observável

Passos:

1. modelar onboarding por empresa
2. explicitar plano, limite, consumo e caminhos de upgrade
3. registrar métricas de negócio:
   - onboarding iniciado
   - onboarding concluído
   - uso por empresa
   - tentativa de upgrade
   - falhas críticas por fluxo
4. revisar retenção, auditoria e eventos de segurança
5. consolidar canais de suporte e exportação de diagnóstico

Critério de aceite:

- produto pronto para vender, acompanhar uso e operar suporte

## Ordem prática de execução

Executar nesta sequência:

1. Fase 1.1
2. Fase 1.2
3. Fase 1.3
4. Fase 2.1
5. Fase 2.2
6. Fase 2.3
7. Fase 3
8. Fase 4
9. Fase 5
10. Fase 6

## Checkpoints de commit

Commits recomendados:

1. `refactor: type mobile builders and bootstrap contracts`
2. `refactor: split mobile api client by domain`
3. `test: add mobile flow coverage and ci smoke`
4. `refactor: isolate tenant and permission boundaries in web`
5. `refactor: split web persistence layer`
6. `feat: add functional onboarding and commercial instrumentation`

## Comandos de validação por fase

Sempre rodar:

```bash
make web-ci
make mobile-ci
git diff --check
```

Quando houver mudança relevante de fluxo mobile:

```bash
cd android
npm run maestro:login
npm run maestro:history
npm run maestro:settings
npm run maestro:chat
```

## O que não priorizar agora

Não entrar forte em:

- redesign visual geral
- troca de identidade visual
- refactor cosmético de pasta sem ganho estrutural
- otimização prematura de microperformance

Esses itens só entram depois que contratos, permissão, multiempresa e automação funcional estiverem mais sólidos.

## Próximo passo oficial

Começar pela Fase 1.1:

- remover `any` e `Record<string, any>` dos builders centrais do mobile
- tipar `runBootstrapAppFlow`
- tipar `InspectorAuthenticatedLayout` e o stack de modais

Esse é o ponto de entrada com melhor retorno entre risco técnico, SaaS e evolução de produto.
