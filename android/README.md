# Tariel Inspetor Mobile

Base mobile separada do produto para o app do inspetor, construída com React Native + Expo.

## Rodar localmente

```powershell
cd android
copy .env.example .env
npm install
npm run start
```

## Comandos principais

```powershell
npm run android
npm run android:prebuild
npm run android:dev
npm run android:preview
npm run android:preview:fresh
npm run maestro:smoke
npm run maestro:login
npm run maestro:history
npm run maestro:settings
npm run maestro:chat
npm run maestro:suite
npm run ios
npm run web
npm run typecheck
```

## Variáveis

- `EXPO_PUBLIC_API_BASE_URL`: base da API FastAPI usada pelo app.

## Escopo inicial

- login mobile do inspetor via token bearer
- bootstrap do usuário autenticado
- base visual da marca `tariel.ia`
- home mobile mais estruturada, com cards rápidos de contexto para fluxo, conexão, laudos e fila local
- pós-login refinado com chips de contexto, seção de laudos mais legível e composer com hierarquia visual própria
- chat-first do inspetor com histórico real do laudo
- contexto leve do laudo ativo no Chat e na Mesa para orientar a inspeção sem poluir a tela
- camera, imagem e documento direto no composer do chat
- aba compacta `Chat | Mesa` no mesmo laudo
- resposta para a mesa pelo app, com texto, foto, imagem e documento
- lista compacta de laudos recentes com troca rápida no header
- histórico lateral com resumo, busca e filtros rápidos de conversas visíveis, fixadas e recentes
- preview e abertura autenticada de anexos no chat e na mesa
- fila local offline para segurar texto, imagem e documento sem perder o fluxo
- retomada de pendências offline direto no composer do chat ou da mesa
- painel completo da fila offline para revisar, retomar e limpar pendências em campo
- reenvio individual de cada pendência offline quando a conexão voltar
- filtros e diagnóstico rápido da fila offline para separar Chat/Mesa e identificar falhas de reenvio
- backoff automático por pendência para evitar reenvio agressivo quando a rede volta instável
- priorização visual da fila offline para destacar falhas e envios prontos primeiro
- central de atividade do inspetor com badge, feed persistido e monitoramento leve da mesa/status
- cache de leitura offline para reabrir bootstrap, laudos, chat e mesa sem derrubar a sessão
- rascunhos persistidos por laudo no chat e na mesa para retomar de onde parou
- rascunhos persistidos de imagem e documento para não perder anexos preparados
- preparo para rotina de campo e captura nativa

## Próximas etapas

1. notificações push nativas
2. build Android/iOS com EAS
3. sincronismo offline mais rico para status e reabertura
4. escrita offline mais ampla para além do fluxo principal do chat
5. retry/backoff e observabilidade mais fina da fila em campo

## Rodando como app Android real

O fluxo acima com `npm run android` usa o Expo Go e é útil só para prototipar.
Para trabalhar como app Android nativo de verdade:

```powershell
cd android
npm run android:prebuild
npm run android:dev
```

Isso gera a pasta nativa `android/android`, instala o `Tariel Inspetor` no emulador/dispositivo
e passa a rodar como app Android nativo, sem depender do Expo Go. O comando `android:dev`
tenta usar automaticamente o JDK do Android Studio quando `JAVA_HOME` ainda nao estiver configurado.
Ele tambem corrige automaticamente o wrapper do Gradle para uma versao compativel com o stack atual do Expo/React Native.

## Rodando como APK preview sem URL

Para testar o app como ele vai se comportar fora do modo dev, com bundle embutido e sem depender de Metro:

```powershell
cd android
npm run android:preview
```

Se voce quiser regenerar a pasta nativa antes:

```powershell
cd android
npm run android:preview:fresh
```

O APK gerado e instalado usa a variante `release`, assina com a chave debug local e serve para validacao no emulador
ou no Android real antes de configurar a assinatura final da Play Store. Ao final da instalacao,
o script tambem abre automaticamente o `Tariel Inspetor` no dispositivo conectado.

## Smoke tests com Maestro

Para automatizar os fluxos principais do Android real:

```powershell
cd android
npm run maestro:smoke
```

Fluxos disponíveis:

- `npm run maestro:login`
- `npm run maestro:history`
- `npm run maestro:settings`
- `npm run maestro:chat`
- `npm run maestro:suite`

O comando base:

- sobe a API local do mobile, se ela ainda nao estiver ativa
- configura `adb reverse tcp:8000 tcp:8000`
- roda o fluxo escolhido dentro de [android/maestro](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/android/maestro) no dispositivo USB conectado

O runner PowerShell usado pelo npm fica em [run_mobile_maestro_smoke.ps1](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/scripts/run_mobile_maestro_smoke.ps1).
Para encadear a suíte completa existe também [run_mobile_maestro_suite.ps1](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/scripts/run_mobile_maestro_suite.ps1).

Cobertura atual:

- [login-smoke.yaml](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/android/maestro/login-smoke.yaml): login, shell, histórico, configurações e envio básico no chat
- [history-smoke.yaml](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/android/maestro/history-smoke.yaml): drawer de histórico, filtros e retomada de conversa
- [settings-smoke.yaml](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/android/maestro/settings-smoke.yaml): overview da engrenagem, navegação por seções e páginas internas
- [chat-smoke.yaml](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/android/maestro/chat-smoke.yaml): composer, envio e troca de abas do fluxo principal
