# Sistema Visual Tariel

Este documento define a estetica oficial da Tariel para o app mobile e serve como base de reaproveito para as aplicacoes web.

Fonte canonica no codigo:
- `android/src/theme/tokens.ts`
- `android/src/features/InspectorMobileApp.styles.ts`
- `web/static/css/shared/global.css`
- `web/static/css/shared/auth_shell.css`
- `web/static/css/shared/layout.css`
- `web/static/css/chat/chat_base.css`
- `web/static/css/chat/chat_index.css`

## Direcao

A linguagem visual da Tariel e **industrial-premium**:
- tecnica, confiavel e limpa
- calor humano no fundo e nas superficies
- precisao e autoridade nos contrastes escuros
- destaque laranja usado para acao, nao para decoracao

Em resumo: **ivory quente + navy profundo + laranja Tariel + tipografia firme + interfaces claras e objetivas**.

## Principios

1. A interface precisa parecer operacional, nao lúdica.
2. O contraste principal vem da relacao entre superfícies claras e blocos em `ink`.
3. O laranja existe para orientar acao, status prioritario e foco de marca.
4. A hierarquia deve usar no maximo 3 niveis visuais por tela.
5. Cards, chips e paineis devem parecer do mesmo sistema, nao familias diferentes.

## Paleta Oficial

### Base escura

- `ink900`: `#091019`
- `ink800`: `#12233C`
- `ink700`: `#16293D`
- `ink600`: `#2E4C6B`

Uso:
- headers ativos
- tabs selecionadas
- paineis de alto contraste
- estados de foco estrutural

### Superficies claras

- `surfaceCanvas`: `#FFF9F3`
- `surfaceSoft`: `#FCF8F2`
- `surface`: `#F6EFE7`
- `surfacePanel`: `#FFFDF9`
- `surfacePanelRaised`: `#FFFFFF`
- `surfaceMuted`: `#F2E8DD`

Uso:
- `surfaceCanvas`: fundo de tela e campos importantes
- `surfacePanel`: cards principais
- `surfacePanelRaised`: componentes dentro de cards
- `surfaceMuted`: trilhos, controles segmentados e camadas de apoio

### Bordas

- `surfaceStroke`: `#E5D7C8`
- `surfaceStrokeStrong`: `#DCC7B3`

Regra:
- borda normal para componentes internos
- borda forte para containers principais, drawers e modais

### Acentos

- `accent`: `#F47B20`
- `accentSoft`: `#FFB36B`
- `accentMuted`: `#FFD8B2`
- `accentWash`: `#FFF1E4`

Uso:
- CTA primario
- badges de prioridade
- detalhe de marca
- onboarding e entrada

Regra:
- nao usar laranja como cor estrutural de fundo em telas densas
- em telas operacionais, preferir `ink800` para estado ativo e deixar o laranja para destaque pontual

### Feedback

- `success`: `#2FB979`
- `successSoft`: `#BCE8D0`
- `successWash`: `#EEF9F3`
- `danger`: `#E75A5A`
- `dangerSoft`: `#F6CACA`
- `dangerWash`: `#FDEEEE`

## Hierarquia de Superficie

Usar sempre esta ordem:

1. `surfaceCanvas` ou gradiente claro como fundo geral
2. `surfacePanel` para cards principais
3. `surfacePanelRaised` para elementos dentro do card

Evitar:
- card dentro de card dentro de card
- misturar `accentWash` como base de toda a tela
- usar borda forte em todos os elementos ao mesmo tempo

## Tipografia

Tom tipografico:
- forte
- editorial
- objetivo

Tokens principais:
- `eyebrow`: `11 / 800 / uppercase / letterSpacing 1.1`
- `label`: `12 / 700`
- `body`: `14 / line-height 20`
- `bodySm`: `12 / line-height 18`
- `titleSm`: `16 / 800`
- `titleMd`: `22 / 800`
- `titleLg`: `28 / 800 / line-height 34`

Regras:
- titulos usam peso `800`
- texto corrido nunca compete com o titulo
- `eyebrow` e para contexto, nao para volume
- evitar excesso de tudo em caixa alta

## Espacamento e Forma

Espacamento base:
- `8, 12, 16, 20, 24, 32`

Raios:
- `xs 8`
- `sm 12`
- `md 16`
- `lg 24`
- `xl 28`
- `pill 999`

Regra:
- campos e controles: `md`
- cards importantes: `lg` ou `xl`
- pills e badges: `pill`

## Sombras

Sombras oficiais:
- `soft`: elementos internos e botoes secundarios
- `card`: cards principais leves
- `panel`: formularios e containers relevantes
- `floating`: drawers, modais e sobreposicoes
- `accent`: CTA primario

Regra:
- sombra complementa profundidade; nao substitui borda
- nunca combinar sombra pesada com muitas bordas decorativas

## Componentes

### Login

Padrao:
- fundo em gradiente claro
- marca isolada acima do card
- card principal com header textual curto
- CTA primario forte em laranja

Nao fazer:
- encher o login de chips e status
- usar mais de um bloco protagonista

### Chips e filtros

Padrao:
- estado inativo claro
- estado ativo em `ink800`
- contagem interna com contraste local

Motivo:
- reduz o excesso de laranja
- melhora leitura em telas de operacao

### Cards operacionais

Padrao:
- `surfacePanel` ou `surfacePanelRaised`
- borda `surfaceStroke` ou `surfaceStrokeStrong`
- sombra `soft`

Uso de `accentWash`, `successWash` e `dangerWash`:
- apenas para contexto de estado
- nunca como linguagem universal

### Composer, drawers e modais

Padrao:
- containers com borda forte
- superficies claras bem definidas
- CTA final em laranja
- scrim escuro neutro

## Gradientes e Fundo

Gradiente claro oficial do app:
- `surfaceCanvas`
- `surfaceSoft`
- `surface`

O gradiente deve ser discreto. Ele cria atmosfera, nao decoracao.

## Motion

Movimento recomendado:
- entrada curta e limpa
- halos e overlays suaves
- sem microanimacao excessiva

Duracao ideal:
- entre `180ms` e `520ms`, dependendo do contexto

## Regras de Marca

- a marca Tariel deve aparecer com seguranca, nao repeticao excessiva
- o simbolo funciona melhor em pontos de entrada, estados vazios importantes e assinatura de sistema
- evitar repetir o logo em toda secao secundaria

## Traducao Para Web

Ao levar esta estetica para o web:

- converter os tokens para variaveis CSS com os mesmos nomes semanticos
- manter `ink800` como estado ativo estrutural
- manter `accent` para CTA, destaque e foco de marca
- usar `surfacePanel` e `surfacePanelRaised` como base para cards e tabelas
- respeitar a mesma escala de espacamento e raio
- usar a mesma regra de hierarquia: fundo, painel principal, elemento interno

Implementacao base ja aplicada no portal do inspetor:

- `global.css`: tokens semanticos Tariel e atmosfera geral do shell
- `auth_shell.css`: logins com base clara quente + hero ink
- `layout.css`: header, sidebar e acoes do shell autenticado
- `chat_base.css`: welcome state, cards, mensagens e composer
- `chat_index.css`: barra de status, pendencias, modais e avisos operacionais

Mapeamento minimo sugerido:

- `--tariel-ink-900`
- `--tariel-ink-800`
- `--tariel-surface-canvas`
- `--tariel-surface-panel`
- `--tariel-surface-panel-raised`
- `--tariel-stroke`
- `--tariel-stroke-strong`
- `--tariel-accent`
- `--tariel-accent-wash`
- `--tariel-success`
- `--tariel-danger`

## O Que Nao Fazer

- nao voltar para interface toda branca sem profundidade
- nao transformar o laranja em cor de tudo
- nao misturar multiplas linguagens de card na mesma tela
- nao usar sombra pesada em todos os elementos
- nao usar tipografia leve e sem contraste em telas operacionais
- nao criar paginas web com outra identidade e depois “adicionar laranja” no fim

## Decisao Final

A identidade Tariel deve sempre transmitir:
- clareza operacional
- confianca tecnica
- calor controlado
- premium sem exibicionismo

Se uma tela estiver bonita mas nao parecer Tariel, ela esta errada.
