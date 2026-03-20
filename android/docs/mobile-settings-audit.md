# Mobile Settings Audit

Atualizado em 2026-03-19 para a fase 3 de conta, seguranca, suporte e acabamento final das configuracoes do app mobile Tariel.

## Stack detectado

- Runtime: Expo 55 (`expo` `~55.0.6`) sobre React Native `0.83.2` e React `19.2.0`
- Linguagem: TypeScript
- App shell atual: `src/features/InspectorMobileApp.tsx` ainda concentra boa parte do estado global
- Tema: tokens em `src/theme/tokens` + resolucao de claro/escuro em tempo real no app
- Navegacao: sem React Navigation; a area de configuracoes usa drawer/paginas internas controladas por `settingsDrawerPage` e `settingsDrawerSection`
- Store global existente antes da fase: `useState` local no app monolitico, sem Redux/Zustand/MobX
- Store nova desta fase: `src/settings/store/SettingsStoreProvider.tsx`

## Arquivos e telas encontrados

### Hub e navegacao de configuracoes

- `src/features/settings/SettingsDrawerPanel.tsx`
- `src/features/settings/SettingsOverviewContent.tsx`
- `src/features/settings/settingsNavigationMeta.ts`
- `src/features/settings/buildInspectorSettingsDrawerPanelProps.ts`

### Paginas e secoes visuais existentes

- Hub principal de configuracoes
- Conta e acesso
- Experiencia do app
- Preferencias da IA
- Aparencia
- Notificacoes
- Seguranca e privacidade
- Protecao no dispositivo
- Permissoes
- Privacidade em notificacoes
- Controles de dados
- Seguranca de arquivos
- Sistema e suporte
- Fala
- Sistema
- Suporte
- Modais/overlays de email, senha, foto de perfil e confirmacoes em `src/features/settings/SettingsOverlayModals.tsx`

## Componentes reutilizaveis detectados

### Base ja existente no repositorio

- `src/features/settings/SettingsPrimitives.tsx`
- `src/features/settings/SettingsDrawerPanel.tsx`
- `src/features/settings/SettingsOverlayModals.tsx`

### Fundacao criada nesta fase

- `src/settings/components/SettingsScreen.tsx`
- `src/settings/components/SettingsSection.tsx`
- `src/settings/components/SettingsRows.tsx`
- `src/settings/components/SettingsModal.tsx`
- `src/settings/components/ProfileAvatarPicker.tsx`

## Perfil, sessao e pontos de leitura/escrita

- Bootstrap e sessao autenticada: `src/features/bootstrap/runBootstrapAppFlow.ts` e `src/config/api.ts` (`/app/api/mobile/bootstrap`, `/app/api/mobile/auth/logout`)
- Perfil da conta: `src/features/settings/settingsBackend.ts`
- Escrita de perfil/foto/senha: `src/config/api.ts`
- Mapeamento de usuario autenticado para settings: `src/settings/repository/settingsRemoteAdapter.ts`

## Endpoints e clients encontrados

### Suportados hoje

- `POST /app/api/mobile/bootstrap`
- `POST /app/api/mobile/auth/logout`
- `GET/PUT /app/api/mobile/account/profile`
- `POST /app/api/mobile/account/password`
- `POST /app/api/mobile/account/photo`
- `POST /app/api/mobile/support/report`
- `GET/PUT /app/api/mobile/account/settings`

### Observacao importante sobre preferencias

- O endpoint `/app/api/mobile/account/settings` cobre apenas o snapshot critico legado de configuracoes:
  - notificacoes principais
  - privacidade basica
  - permissoes
  - modelo de IA
- Nao existe endpoint remoto generico para o schema completo novo de settings.

## Persistencia local e offline detectados

- `expo-secure-store` ja era usado para token e email autenticado
- `expo-file-system/legacy` ja era usado para:
  - preferencias locais
  - fila offline
  - cache de leitura
  - notificacoes locais
- Existe fila offline real no app
- Existe cache local de bootstrap/leitura real no app

## Capabilities detectadas nesta fase

### Entregues

- Dominio tipado de settings em `src/settings/schema/*`
- Defaults, versao de schema e migracao automatica
- Repository local com persistencia em arquivo
- Store/provider global de settings com hydrate no bootstrap
- Hooks/selectors em `src/settings/hooks/useSettings.ts`
- Adapter remoto para:
  - merge de usuario autenticado
  - leitura/escrita do snapshot critico suportado pelo backend
- Aplicacao live de:
  - tema
  - densidade
  - tamanho de fonte
  - cor de enfase
- Persistencia funcional de:
  - preferencias de IA basicas
  - fala local
  - notificacoes locais
  - consentimentos de analytics/crash
  - sincronizacao apenas em Wi-Fi
  - regiao/economia de dados/modo de bateria
- Integracao inicial com perfil autenticado:
  - nome
  - nome de exibicao
  - email
  - telefone
  - foto
- Conta e acesso funcional com:
  - edicao real de nome, nome de exibicao e telefone
  - edicao real de email
  - troca de senha com validacao local
  - upload real de avatar com validacao e rollback seguro
  - logout com confirmacao
  - resumo honesto de workspace e conta corporativa
- Sistema e suporte finalizados com:
  - central de ajuda em app
  - canal de suporte real via `bootstrap.app.suporte_whatsapp` quando publicado
  - relato de bug/feedback com envio real para `POST /app/api/mobile/support/report`
  - tela Sobre com versao, build, plataforma e ambiente da API
  - exportacao de diagnostico local
- Navegacao funcional entre as telas de settings existentes
- Deep link interno para secoes duplicadas do mesmo dominio
- Racionalizacao visual do overview para reduzir duplicidade entre atalhos top-level e paginas internas

### Integrações reais de efeito funcional

- `analyticsOptIn` controla `configureObservability`
- `crashReportsOptIn` controla `configureCrashReports`
- `wifiOnlySync` bloqueia sync de fila/atividade fora de Wi-Fi
- `speech` controla toggles locais de transcricao/leitura e fallback para ajustes do sistema
- `notifications.vibrationEnabled` influencia o feedback de vibracao em notificacoes locais
- `GET/PUT /app/api/mobile/account/profile` agora alimenta a edicao real de:
  - nome completo
  - email
  - telefone
- `POST /app/api/mobile/account/photo` atualiza o avatar remoto e invalida cache da imagem no app
- `POST /app/api/mobile/account/password` executa a troca real de senha
- `POST /app/api/mobile/auth/logout` encerra a sessao mobile com limpeza local do estado sensivel
- `POST /app/api/mobile/support/report` recebe bug report e feedback com contexto de build/plataforma/workspace
- `bootstrap.usuario` fornece o workspace atual real (`empresa_nome`, `empresa_id`, `nivel_acesso`) mostrado em modo read-only

## Gaps reais encontrados

- Nao ha endpoint remoto para salvar o schema completo novo de settings
- Billing/assinatura nao tem backend mobile util para gerenciamento no app
- Nao ha troca de multi-workspace no backend mobile atual; o app apenas mostra o workspace ativo do bootstrap
- Nao ha suporte remoto real encontrado para:
  - contas conectadas
  - sessoes remotas do usuario
  - 2FA
  - exclusao definitiva da conta via mobile
- Nao foram encontradas rotas remotas explicitas para termos, privacidade ou licencas; os documentos continuam internos/exportaveis no app
- A stack atual nao possui autenticacao biometrica nativa integrada; `expo-local-authentication` nao esta presente neste modulo
- Idioma completo do app ainda nao existe porque a camada de i18n nao esta implementada
- Configuracoes nativas avancadas de voz/TTS/STT nao tem integracao completa nesta fase

## Fallbacks honestos aplicados

- Billing e pagamentos foram removidos/hidratados para nao aparecerem como recursos ativos
- Plano, upgrade, historico de pagamentos e gerenciar pagamento permanecem ocultos por ausencia de backend real
- Conta e acesso agora mostra apenas o que o app realmente suporta: perfil, email, telefone, senha, workspace read-only e logout
- Idioma do aplicativo ficou como informativo/read-only ate existir i18n real
- Workspace aparece como snapshot corporativo read-only vindo do bootstrap
- Seguranca deixou de expor na navegacao e na busca blocos sem suporte real:
  - contas conectadas
  - sessoes remotas
  - 2FA
  - verificacao de identidade dedicada
  - atividade de seguranca dedicada
  - exclusao de conta
- A biometria local deixou de ser exposta como ajuste ativo porque nao existe integracao nativa real nesta build
- O canal de suporte so aparece quando `bootstrap.app.suporte_whatsapp` vem preenchido
- Termos, privacidade e licencas continuam como conteudo interno/exportavel, sem fingir links externos inexistentes
- Fala usa preferencias locais e abre ajustes do sistema quando isso faz mais sentido do que prometer capacidade nativa inexistente

## Arquitetura de settings criada na fase 1

- `src/settings/schema/types.ts`
- `src/settings/schema/defaults.ts`
- `src/settings/schema/options.ts`
- `src/settings/migrations/migrateSettingsDocument.ts`
- `src/settings/repository/settingsRepository.ts`
- `src/settings/repository/settingsRemoteAdapter.ts`
- `src/settings/store/SettingsStoreProvider.tsx`
- `src/settings/hooks/useSettings.ts`

## Notas de auditoria

- Nao foi encontrado `PROJECT_MAP.md` neste modulo mobile `android/`
- O app ainda tem forte concentracao de estado em `src/features/InspectorMobileApp.tsx`
- A fase 3 conclui a parte madura de conta/acesso/suporte sem reescrever o app inteiro
