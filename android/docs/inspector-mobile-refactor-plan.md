# Inspector Mobile Refactor Plan

Atualizado em 2026-03-20 para reduzir o acoplamento do app mobile sem um rewrite total.

## Status atual

- Fase 2 concluída:
  - sessão, login, logout e bootstrap saíram do root para `src/features/session/useInspectorSession.ts`
  - persistência local de sessão foi isolada em `src/features/session/sessionStorage.ts`
  - tipos de sessão ficaram centralizados em `src/features/session/sessionTypes.ts`
  - bootstrap recebeu cobertura inicial em `src/features/bootstrap/runBootstrapAppFlow.test.ts`
- Fase 3 iniciada:
  - o controlador principal do chat foi extraído para `src/features/chat/useInspectorChatController.ts`
  - o root agora só injeta dependências e consome ações como `abrirLaudoPorId`, `handleEnviarMensagem` e `abrirReferenciaNoChat`
  - highlight de mensagem, refresh de conversa/lista de laudos e reabertura de laudo saíram do componente raiz
- Fase 4 iniciada:
  - a mesa avaliadora ganhou um coordenador próprio em `src/features/mesa/useMesaController.ts`
  - carregamento da mesa, reset local, draft key, referência ativa, auto-scroll e envio da mesa saíram do root
  - a fila offline ganhou um controlador próprio em `src/features/offline/useOfflineQueueController.ts`
  - persistência local, retomada manual, sincronização unitária e auto-sync por retry saíram do root
  - a central de atividade ganhou um controlador próprio em `src/features/activity/useActivityCenterController.ts`
  - registro de notificações, snapshots de monitoramento, persistência local e polling saíram do root
  - lock do app e sincronização de permissões ganharam um controlador próprio em `src/features/security/useAppLockController.ts`
  - ciclo de `AppState`, refresh de permissões, desbloqueio e guards de permissões saíram do root
- Fase 7 iniciada:
  - a navegação interna de settings ganhou um hook próprio em `src/features/settings/useSettingsNavigation.ts`
  - `settingsDrawerPage`, `settingsDrawerSection`, `settingsSheet`, `confirmSheet` e seus resets básicos saíram do root
  - o estado local e os resets de apresentação de settings ganharam um hook próprio em `src/features/settings/useSettingsPresentation.ts`
  - drafts, coleções locais, 2FA/sessões/integradores e resets de exclusão/logout começaram a sair do root
  - os handlers de entrada que só preparam drafts e abrem páginas/sheets ganharam um hook próprio em `src/features/settings/useSettingsEntryActions.ts`
  - provedores, sessões, 2FA, compartilhamento de códigos e biometria ganharam um hook próprio em `src/features/settings/useSettingsSecurityActions.ts`
  - operações de manutenção, integradores, suporte e diagnóstico ganharam um hook próprio em `src/features/settings/useSettingsOperationsActions.ts`
  - toggles de backup, sincronização, uploads, voz, notificações e revisão de permissões ganharam um hook próprio em `src/features/settings/useSettingsToggleActions.ts`
  - a reautenticação sensível ganhou um hook próprio em `src/features/settings/useSettingsReauthActions.ts` apoiado por `src/features/settings/reauth.ts`
  - o fluxo de confirmação de `settingsSheet` foi concentrado em `src/features/settings/settingsSheetConfirmActions.ts`, incluindo o caso de foto de perfil
  - a sincronização local/remota de perfil e conta foi isolada em `src/features/settings/profileState.ts`
  - o controle de anexos e mídia saiu do root para `src/features/chat/useAttachmentController.ts`
  - os fluxos de histórico local saíram do root para `src/features/history/useHistoryController.ts`
  - os handlers locais de voz saíram do root para `src/features/chat/useVoiceInputController.ts`
  - shell dos drawers laterais, animações e pan responders saíram do root para `src/features/common/useSidePanelsController.ts`
  - login social, recuperação de senha e abertura de URLs externas saíram do root para `src/features/auth/useExternalAccessActions.ts`
  - o log local de eventos de segurança saiu do root para `src/features/security/useSecurityEventLog.ts`
  - o refresh manual virou uma ação isolada em `src/features/common/buildRefreshAction.ts`
  - exclusão local da conta saiu do root para `src/features/settings/buildAccountDeletionAction.ts`
  - a confirmação da `settingsSheet` foi encapsulada em `src/features/settings/buildSettingsSheetConfirmAction.ts`
  - confirmação crítica, limpeza local, seleção de modelo e exportação saíram do root para `src/features/settings/buildSettingsConfirmAndExportActions.ts`
  - o renderer final da `settingsSheet` saiu do root para `src/features/settings/buildSettingsSheetBodyRenderer.tsx`
  - o builder do painel de settings foi fatiado por grupos em `src/features/settings/buildInspectorSettingsDrawerSections.ts`, deixando o wrapper em `src/features/settings/buildInspectorSettingsDrawerPanelProps.ts` só como composição
  - o builder do layout autenticado foi fatiado em `src/features/common/buildAuthenticatedLayoutSections.ts`, deixando `src/features/common/buildAuthenticatedLayoutProps.ts` só como composição
  - o root agora entrega inputs agrupados para esses builders por meio de `src/features/settings/buildInspectorSettingsDrawerInput.ts` e `src/features/common/buildAuthenticatedLayoutInput.ts`, em vez de montar um objeto plano gigante
  - o derived state base foi quebrado em helpers puros por domínio dentro de `src/features/common/buildInspectorBaseDerivedStateSections.ts`, deixando `src/features/common/buildInspectorBaseDerivedState.ts` só como composição
  - a pilha de modais de sessão teve o wiring visual/callbacks separado em `src/features/common/buildInspectorSessionModalsSections.ts`, deixando `src/features/common/buildInspectorSessionModalsStackProps.ts` só como composição
  - o root passou a agrupar também os inputs de derived state e modais por meio de `src/features/common/buildInspectorBaseDerivedStateInput.ts` e `src/features/common/buildInspectorSessionModalsInput.ts`
  - a extração já nasceu com cobertura em `src/features/settings/useSettingsNavigation.test.ts`, `src/features/settings/useSettingsPresentation.test.ts`, `src/features/settings/useSettingsEntryActions.test.ts`, `src/features/settings/useSettingsSecurityActions.test.ts`, `src/features/settings/useSettingsOperationsActions.test.ts`, `src/features/settings/useSettingsToggleActions.test.ts`, `src/features/settings/useSettingsReauthActions.test.ts`, `src/features/settings/settingsSheetConfirmActions.test.ts`, `src/features/settings/profileState.test.ts`, `src/features/chat/useAttachmentController.test.ts`, `src/features/history/useHistoryController.test.ts`, `src/features/chat/useVoiceInputController.test.ts`, `src/features/common/buildInspectorBaseDerivedStateSections.test.ts` e `src/features/common/buildInspectorSessionModalsSections.test.ts`
- Ainda ficou no root nesta etapa:
  - composição final das props do layout autenticado e dos painéis
  - efeitos de sincronização/hidratação ainda coordenados no composition root
  - wiring entre domínios extraídos e a store global de settings
  - agrupamento manual dos objetos grandes que ainda alimentam `buildAuthenticatedLayoutInput.ts` e `buildInspectorSettingsDrawerInput.ts`

## Diagnóstico atual

- O app shell principal continua concentrado em `src/features/InspectorMobileApp.tsx`.
- O arquivo tem `4025` linhas e agora concentra mais composição do que regra, mas ainda acumula:
  - autenticação e bootstrap
  - sincronização de laudos/chat/mesa
  - fila offline
  - notificações e observabilidade
  - bloqueio de app e permissões
  - drafts e cache local
  - coordenação de settings
  - render e props da UI autenticada
- Isso torna mais caro:
  - corrigir regressão sem efeito colateral
  - cobrir regra com teste
  - evoluir layout e UX
  - fazer onboarding técnico

## Costuras já existentes

O plano deve aproveitar o que já foi extraído, em vez de recomeçar do zero:

- bootstrap: `src/features/bootstrap/runBootstrapAppFlow.ts`
- envio de mensagens: `src/features/chat/messageSendFlows.ts`
- monitoramento de atividade: `src/features/activity/monitorActivityFlow.ts`
- derived state/base layout: `src/features/common/buildInspectorBaseDerivedState.ts`
- seções do derived state/base layout: `src/features/common/buildInspectorBaseDerivedStateSections.ts`
- montagem do layout autenticado: `src/features/common/buildAuthenticatedLayoutProps.ts`
- seções da pilha de modais: `src/features/common/buildInspectorSessionModalsSections.ts`
- settings store: `src/settings/*`
- sync crítico de settings: `src/features/settings/useCriticalSettingsSync.ts`

Esses módulos já mostram a direção correta: lógica pura ou coordenadores isolados recebendo dependências e callbacks.

## Objetivo da refatoração

Chegar em um `InspectorMobileApp` enxuto, atuando como composition root:

- hidrata providers e hooks principais
- conecta callbacks entre domínios
- monta props do layout
- renderiza `LoginScreen` ou `InspectorAuthenticatedLayout`

Regra de negócio, efeitos e persistência devem sair do componente raiz.

## Princípios

1. Sem big bang.
2. Cada fase precisa manter o app entregável.
3. Toda extração nova deve nascer com teste ou com superfície testável.
4. Primeiro tirar regra e efeito; depois redesenhar UI.
5. Reaproveitar nomes e módulos já existentes quando fizer sentido.

## Arquitetura alvo incremental

Não é necessário mover tudo de uma vez. A meta é convergir para algo próximo disso:

```text
src/features/auth/
src/features/chat/
src/features/history/
src/features/mesa/
src/features/offline/
src/features/activity/
src/features/settings/
src/features/session/
src/features/security/
src/features/common/
src/settings/
```

Pastas novas recomendadas para abrir o caminho:

- `src/features/session/`
- `src/features/offline/`
- `src/features/mesa/`
- `src/features/security/`

## Ordem recomendada

### Fase 0. Congelar a superfície do app

Objetivo:

- parar de crescer `InspectorMobileApp.tsx` enquanto a refatoração ocorre

Ações:

- não adicionar novas regras diretamente no componente raiz
- qualquer lógica nova deve nascer em `features/*` como função ou hook
- manter comentários curtos nos pontos de composição do root

Critério de aceite:

- novas funcionalidades não aumentam a área de regra do root

### Fase 1. Abrir trilhos de teste para domínio

Objetivo:

- tornar a refatoração segura antes de mover mais código

Ações:

- ampliar a cobertura de funções puras e flows já extraídos
- priorizar:
  - `runBootstrapAppFlow.ts`
  - `messageSendFlows.ts`
  - `monitorActivityFlow.ts`
  - normalizadores e helpers de offline queue
  - helpers de cache/drafts

Testes mínimos sugeridos:

- bootstrap online, offline com cache e token inválido
- envio de chat com anexo imagem/documento
- fallback para fila offline quando a API falha
- sincronização da fila com backoff
- monitoramento gerando notificações de status e mesa

Critério de aceite:

- regras críticas do app não dependem mais de teste manual para regressão básica

### Fase 2. Extrair sessão e bootstrap

Objetivo:

- tirar do root a responsabilidade de autenticação, sessão e hidratação inicial

Arquivos novos sugeridos:

- `src/features/session/useInspectorSession.ts`
- `src/features/session/sessionTypes.ts`
- `src/features/session/sessionStorage.ts`

Responsabilidades do hook:

- login/logout
- bootstrap inicial
- leitura/escrita de token e email
- reset de sessão local
- status online/offline básico

O que deve sair do root:

- `email`, `senha`, `lembrar`, `mostrarSenha`, `statusApi`, `erro`, `carregando`, `entrando`, `session`
- `bootstrapApp`
- `handleLogin`
- `handleLogout`
- limpeza de persistência da conta

Critério de aceite:

- `InspectorMobileApp` só consome um objeto de sessão com `state` e `actions`

### Fase 3. Extrair conversa principal do inspetor

Objetivo:

- isolar o ciclo do chat do inspetor do resto do app

Arquivos novos sugeridos:

- `src/features/chat/useInspectorChatController.ts`
- `src/features/chat/chatCache.ts`
- `src/features/chat/chatDrafts.ts`

Responsabilidades:

- conversa atual
- abrir laudo
- carregar mensagens
- draft do chat
- anexo do chat
- envio de mensagem usando `messageSendFlows.ts`
- highlight e navegação por referência

O que deve sair do root:

- `conversa`, `mensagem`, `anexoRascunho`, `erroConversa`, `enviandoMensagem`
- `mensagemChatDestacadaId`, `layoutMensagensChatVersao`
- `abrirReferenciaNoChat`
- persistência e recuperação de draft do chat

Critério de aceite:

- o domínio do chat pode ser testado sem renderizar a tela completa

### Fase 4. Extrair mesa avaliadora e fila offline

Objetivo:

- separar dois domínios hoje muito acoplados ao chat

Arquivos novos sugeridos:

- `src/features/mesa/useMesaController.ts`
- `src/features/offline/useOfflineQueueController.ts`
- `src/features/offline/offlineQueueStorage.ts`
- `src/features/offline/offlineQueueUtils.ts`

Responsabilidades da mesa:

- carregar mensagens da mesa
- referência de mensagem ativa
- envio para mesa
- refresh da mesa do laudo atual

Responsabilidades da fila offline:

- criar item offline
- salvar/carregar fila
- backoff
- sincronizar item único
- sincronizar fila toda
- integração com rede e modo Wi-Fi only

O que deve sair do root:

- `mensagensMesa`, `mensagemMesa`, `anexoMesaRascunho`, `erroMesa`, `enviandoMesa`
- `filaOffline`, `sincronizandoFilaOffline`, `sincronizandoItemFilaId`
- `sincronizarItemFilaOffline`
- `sincronizarFilaOffline`
- helpers e efeitos de retry/backoff

Critério de aceite:

- chat e mesa deixam de compartilhar o mesmo bloco de efeito e estado

### Fase 5. Extrair activity center, notificações e monitoramento

Objetivo:

- isolar o que hoje mistura observabilidade, notificações locais e polling

Arquivos novos sugeridos:

- `src/features/activity/useActivityCenter.ts`
- `src/features/activity/activityStorage.ts`
- `src/features/activity/notificationPolicies.ts`

Responsabilidades:

- notificações locais persistidas
- monitoramento periódico
- decisão de notificar ou não
- policy de privacidade da notificação
- contadores da central de atividade

O que deve sair do root:

- `notificacoes`, `centralAtividadeAberta`, `monitorandoAtividade`
- `registrarNotificacoes`
- timers de monitoramento
- integração entre `runMonitorActivityFlow.ts` e estado do app

Critério de aceite:

- o monitor de atividade não depende do componente raiz para operar

### Fase 6. Extrair segurança, bloqueio e permissões

Objetivo:

- separar efeitos nativos e controles sensíveis da UI principal

Arquivos novos sugeridos:

- `src/features/security/useSecurityController.ts`
- `src/features/security/useAppLock.ts`
- `src/features/security/permissionPolicies.ts`

Responsabilidades:

- snapshot de permissões
- pedidos de permissão
- reautenticação sensível
- bloqueio ao voltar do background
- estado de 2FA/dispositivo local quando couber

O que deve sair do root:

- `bloqueioAppAtivo`
- `reautenticacaoExpiraEm`, `reautenticacaoStatus`, `reauthReason`
- atualização de permissões do sistema
- listeners de `AppState`

Critério de aceite:

- bloqueio de app e permissões são testáveis/inspecionáveis sem depender do layout inteiro

### Fase 7. Encapsular settings de apresentação

Objetivo:

- reduzir o volume de wiring entre store de settings e UI de settings

Arquivos novos sugeridos:

- `src/features/settings/useSettingsPresentation.ts`
- `src/features/settings/useSettingsNavigation.ts`

Responsabilidades:

- mapping entre `settingsState` e props de apresentação
- navegação interna do drawer
- estados efêmeros de sheets e confirmações

O que deve sair do root:

- drafts de conta
- `settingsDrawerPage`, `settingsDrawerSection`
- `settingsSheet`, `confirmSheet`
- handlers de navegação e edição que são puramente de settings

Observação:

- a store em `src/settings/*` já é uma base boa; aqui a meta é tirar wiring visual do root, não reinventar store global.

Critério de aceite:

- o root deixa de conhecer detalhes de navegação interna das configurações

Status atual:

- `useSettingsNavigation.ts` já cobre navegação do drawer, folhas efêmeras, confirmação e resets básicos
- `useSettingsPresentation.ts` já cobre o estado local de apresentação e resets de sessão/exclusão
- `useSettingsEntryActions.ts` já cobre handlers de abertura e preparação de drafts para perfil/plano/ajuda/documentos
- `useSettingsSecurityActions.ts` já cobre regra de segurança/acesso para provedores, sessões, 2FA e biometria
- a próxima fatia natural é tirar do root os handlers de regra e sincronização específicos de integrações, suporte e manutenção do app

### Fase 8. Enxugar o root e formalizar contratos

Objetivo:

- transformar `InspectorMobileApp.tsx` em composição previsível

Meta de shape:

- imports reduzidos
- poucos `useState` locais, idealmente só estados estritamente visuais de composição
- poucos `useEffect` locais
- handlers curtos, só costurando hooks

Critério de aceite:

- `InspectorMobileApp.tsx` deixa de ser o lugar onde a regra mora

## Sequência prática de execução

Ordem sugerida de PRs/commits:

1. testes de flows puros e helpers
2. `useInspectorSession`
3. `useInspectorChatController`
4. `useMesaController`
5. `useOfflineQueueController`
6. `useActivityCenter`
7. `useSecurityController`
8. `useSettingsPresentation`
9. limpeza final do root

Cada etapa deve:

- extrair uma responsabilidade
- manter comportamento
- adicionar ou atualizar teste
- reduzir linhas do root

## Métricas de sucesso

- `InspectorMobileApp.tsx` cai de `7919` linhas para algo próximo de `1200` a `1800`
- número de `useState` locais cai drasticamente
- número de `useEffect` locais cai drasticamente
- regressões de bootstrap/chat/offline passam em teste automatizado
- evolução visual passa a acontecer em componentes específicos, não no monólito

## O que não fazer

- não mover todas as pastas de uma vez
- não introduzir Redux/Zustand só para “organizar”
- não misturar redesign visual grande com refatoração estrutural no mesmo PR
- não reescrever flows já extraídos se eles já servem como seam de teste

## Primeira entrega recomendada

Se o trabalho começar agora, a primeira fatia com melhor custo/benefício é:

1. ampliar testes de `runBootstrapAppFlow.ts`
2. criar `useInspectorSession.ts`
3. mover login, logout, bootstrap e persistência de sessão para esse hook
4. deixar `InspectorMobileApp.tsx` só consumir `sessionState` e `sessionActions`

Esse primeiro corte já reduz risco estrutural sem tocar no visual do produto.
