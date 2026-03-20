# Aprendizado Visual de IA

## Objetivo

Criar uma base auditavel de referencias visuais para inspeções, em que:

- o inspetor registra a correcao em cima da foto
- o chat do app também captura automaticamente evidencias com imagem como rascunho
- a mesa avaliadora valida ou rejeita
- so o que a mesa validar entra no contexto futuro da IA

## Regra de autoridade

- `rascunho_inspetor`: correcao criada em campo pelo inspetor
- `validado_mesa`: referencia aprovada pela mesa e autorizada para consulta da IA
- `rejeitado_mesa`: referencia descartada e bloqueada para consulta

A resposta final da mesa sempre prevalece sobre a leitura inicial do inspetor.

## Persistencia

Tabela: `aprendizados_visuais_ia`

Campos centrais:

- empresa, laudo e mensagem de referencia
- resumo e contexto da evidencia
- correcao do inspetor
- parecer e sintese consolidada da mesa
- veredito do inspetor e veredito final da mesa
- pontos-chave, referencias de norma e marcacoes
- metadados da imagem salva

## Rotas

Portal do inspetor:

- `GET /app/api/laudo/{laudo_id}/aprendizados`
- `POST /app/api/laudo/{laudo_id}/aprendizados`
- mensagens do chat com imagem criam rascunhos automaticamente
- mensagens seguintes como `isso esta correto` ou `reavalie` atualizam o rascunho mais recente do laudo

Portal da mesa:

- `GET /revisao/api/laudo/{laudo_id}/aprendizados`
- `POST /revisao/api/aprendizados/{aprendizado_id}/validar`
- `GET /revisao/api/laudo/{laudo_id}/completo` agora inclui `aprendizados_visuais`

## Consulta pela IA

Antes de responder no chat, o backend:

1. busca aprendizados `validado_mesa` da mesma empresa
2. prioriza mesmo laudo, mesmo setor e termos em comum com a mensagem
3. monta um bloco `aprendizados_visuais_validados`
4. injeta esse bloco no contexto enviado ao modelo

Rascunhos do inspetor e itens rejeitados nao entram nesse contexto.

## Proximos passos

- expor essa trilha no mobile e no portal web do inspetor
- permitir revisao visual com marcacoes pela mesa
- adicionar busca semantica por embeddings quando a base crescer
- atrelar o toggle de consentimento para bloquear salvamento e reutilizacao quando desativado
