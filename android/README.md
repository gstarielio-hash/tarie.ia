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
- chat-first do inspetor com histórico real do laudo
- preparo para anexos, câmera e rotina de campo

## Próximas etapas

1. anexos, câmera e documento dentro do chat
2. mesa avaliadora dentro do app
3. lista de laudos do inspetor
4. notificações
5. build Android/iOS com EAS
