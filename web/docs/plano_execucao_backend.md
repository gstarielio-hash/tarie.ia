# Plano de Execucao do Backend

Baseado na analise estrutural e na validacao tecnica rodada em `2026-03-21`.

Este arquivo e a referencia pratica para acompanhar o que ja foi validado, o que esta em andamento e o que ainda falta concluir no backend.

## Como usar

- Atualize o campo `Status` de cada item.
- Preencha `Evidencia` com data, commit, PR ou resultado objetivo.
- So marque um item como `VALIDADO` depois de rodar o bloco `Validacao`.
- Se um item depender de outro, nao marque como concluido por inferencia.

## Legenda de status

- `NAO_INICIADO`
- `EM_ANDAMENTO`
- `PARCIAL`
- `CONCLUIDO`
- `VALIDADO`
- `BLOQUEADO`

## Baseline ja validada

Status geral da baseline: `VALIDADO`

- [x] Estrutura principal do backend mapeada em `web/`, com organizacao por dominios em `app/`.
- [x] `python3 -m ruff check .`
  Evidencia: `All checks passed!`
- [x] `python3 scripts/check_chat_architecture.py`
  Evidencia: `CHECK_CHAT_ARCHITECTURE=OK`
- [x] `python3 -m mypy`
  Evidencia: `Success: no issues found in 51 source files`
- [x] `AMBIENTE=dev python3 -m pytest -q`
  Evidencia: `200 passed, 35 skipped in 32.11s`
- [x] `AMBIENTE=dev python3 -m pytest --cov=app --cov=main --cov-report=term-missing:skip-covered -q`
  Evidencia: cobertura total `79%`
- [x] Arquitetura modular ja existe em parte do backend.
  Evidencia: `app/domains/chat`, `app/domains/revisor`, `app/domains/admin`, `app/domains/cliente`, `app/shared`
- [x] Realtime do revisor ja suporta `memory` e `redis`.
- [x] Sessao autenticada ja persiste em banco e consegue reconstruir cache local.
- [ ] Fonte unica de verdade do backend concluida.
- [ ] Paridade total entre local, CI e producao concluida.

## Resumo executivo

Prioridade alta imediata:

1. Eliminar o uso operacional dos wrappers legados da raiz.
2. Padronizar transacoes e reduzir `commit()` espalhado.
3. Quebrar arquivos gigantes por fluxo e camada.
4. Reforcar gates de qualidade e alinhar runtime de Python.

Prioridade media:

1. Aumentar cobertura nas areas de autenticacao, admin, websocket e realtime.
2. Dividir a suite monolitica de testes criticos.
3. Endurecer scripts administrativos e onboarding.

## Fase 1 - Fonte unica de verdade e limpeza do legado

### B001 - Eliminar wrappers legados da raiz

- Status: `VALIDADO`
- Prioridade: `Alta`
- Ja validado:
  - A documentacao principal diz para usar `app/domains/*` e `app/shared/*`.
  - Ainda existem os arquivos legados `web/banco_dados.py`, `web/seguranca.py`, `web/rotas_admin.py`, `web/rotas_inspetor.py`, `web/servicos_saas.py`, `web/modelo.py`.
  - Ainda existem scripts que importam esses modulos legados.
- Fazer:
  - Mover utilitarios administrativos para `web/scripts/` ou outra pasta explicita de operacao.
  - Remover imports legados do runtime principal.
  - Remover wrappers antigos ou trocar por fail-fast explicito apontando para o modulo novo.
  - Ajustar a documentacao para nao conflitar com o repositorio real.
- Evidencia:
  - `2026-03-21`: wrappers da raiz convertidos para compatibilidade explicita apontando para `app/` e `web/scripts/`.
  - `2026-03-21`: wrappers legados de modulo da raiz passaram a falhar por padrao e so aceitam compatibilidade opt-in via `TARIEL_ALLOW_LEGACY_IMPORTS=1`.
  - `2026-03-21`: `rg` sem ocorrencias de imports legados operacionais.
  - `2026-03-21`: `tests/test_legacy_wrappers.py` passou cobrindo falha por padrao e reabilitacao controlada.
  - `2026-03-21`: `python3 -m ruff check .`, `python3 -m mypy` e `AMBIENTE=dev python3 -m pytest -q` passaram apos o endurecimento.
- Pronto quando:
  - Nenhum fluxo operacional do produto depender dos modulos legados da raiz.
  - O runtime principal usar apenas `app/` e `nucleo/`.
  - O repositorio deixar claro o que e legado, script auxiliar ou fonte de verdade.
- Validacao:

```bash
rg -n "from (banco_dados|seguranca|rotas_admin|rotas_inspetor|servicos_saas)|import (banco_dados|seguranca|rotas_admin|rotas_inspetor|servicos_saas)" web
```

Resultado esperado: sem uso em codigo operacional do produto.

### B002 - Consolidar CLIs administrativas e remover senhas hardcoded

- Status: `VALIDADO`
- Prioridade: `Alta`
- Ja validado:
  - `criar_admin.py` e `resetar_senha.py` usam senha fixa.
  - `modelo.py` ainda usa SDK legado do Gemini fora do fluxo principal.
- Fazer:
  - Criar CLIs administrativas seguras com argumentos explicitos e confirmacao.
  - Remover senhas fixas do repositorio.
  - Descontinuar ou mover utilitarios experimentais para uma area separada.
- Evidencia:
  - `2026-03-21`: adicionados `scripts/criar_admin.py`, `scripts/resetar_senha.py` e `scripts/listar_modelos_gemini.py`.
  - `2026-03-21`: removidas senhas hardcoded dos scripts legados da raiz.
  - `2026-03-21`: CLIs novos exigem confirmacao interativa por padrao e aceitam `--yes` para automacao controlada.
  - `2026-03-21`: `python3 scripts/criar_admin.py --help` e `python3 scripts/resetar_senha.py --help` validaram o contrato de uso.
  - `2026-03-21`: `rg -n "Admin@2026|google.generativeai" . --glob '!docs/plano_execucao_backend.md'` sem ocorrencias no codigo operacional.
- Pronto quando:
  - Nenhum script versionado do projeto principal depender de senha fixa previsivel.
  - Scripts administrativos estiverem em local coerente, com contrato de uso claro.
- Validacao:

```bash
rg -n "Admin@2026|google.generativeai" web --glob '!docs/plano_execucao_backend.md'
```

Resultado esperado: sem uso operacional ativo; no maximo referencias documentais controladas.

## Fase 2 - Refatoracao estrutural

### B003 - Reduzir `main.py` para composicao e bootstrap

- Status: `VALIDADO`
- Prioridade: `Alta`
- Ja validado:
  - `create_app()` ja existe.
  - Registro central de roteadores ja existe.
  - Middlewares, handlers, readiness, OpenAPI custom e bootstrap HTTP ja foram extraidos para modulos de suporte.
- Fazer:
  - Extrair middlewares para modulo proprio.
  - Extrair exception handlers para modulo proprio.
  - Extrair rotas operacionais (`health`, `ready`, `debug`) para modulo proprio.
  - Extrair ajustes de OpenAPI e helpers operacionais.
- Evidencia:
  - `2026-03-21`: criado `app/core/http_setup_support.py` para concentrar customizacao de OpenAPI, exception handlers globais e rotas operacionais do app shell.
  - `2026-03-21`: `main.py` caiu de `1211` para `753` linhas apos a extracao dos blocos de OpenAPI, handlers e endpoints operacionais.
  - `2026-03-21`: criados `app/core/logging_support.py` e `app/core/http_runtime_support.py` para concentrar logging, correlation id, CSP, politicas de cache e registro dos middlewares globais.
  - `2026-03-21`: `main.py` caiu de `753` para `418` linhas apos a extracao dos blocos de logging, runtime HTTP e middlewares de seguranca.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'health or ready or openapi or manifesto or assets_modulares'` passou com `8 passed, 16 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` passou com `198 passed, 35 skipped in 34.65s`.
- Pronto quando:
  - `main.py` ficar focado em criar a app, plugar infraestrutura e registrar modulos.
  - Regras operacionais e handlers nao ficarem mais embutidos no arquivo principal.
- Validacao:

```bash
wc -l web/main.py
rg -n "@app.get\\(\"/health|@app.get\\(\"/ready|@app.get\\(\"/debug-sessao" web/main.py
```

Resultado esperado: `main.py` substancialmente menor e sem handlers operacionais inline.

### B004 - Quebrar arquivos gigantes por fluxo e camada

- Status: `PARCIAL`
- Prioridade: `Alta`
- Ja validado:
  - O projeto ja esta modularizado por dominio.
  - Ainda existem arquivos muito grandes e com mistura de HTTP, regra de negocio e persistencia.
  - `cliente/routes.py` ja perdeu o bloco de dashboard/bootstrap para `cliente/dashboard.py`, reduzindo acoplamento na camada HTTP.
  - `revisor/templates_laudo.py` ja perdeu o bloco de suporte para `revisor/templates_laudo_support.py`, reduzindo mistura entre handler HTTP e regra auxiliar.
  - `chat/auth.py` ja perdeu o bloco de perfil/preferencias mobile para `chat/auth_mobile_support.py`, reduzindo mistura entre handler HTTP e normalizacao/persistencia auxiliar.
- Alvos imediatos:
  - `app/domains/cliente/routes.py`
  - `app/domains/revisor/templates_laudo.py`
  - `app/domains/chat/auth.py`
  - `app/shared/security.py`
  - `app/shared/database.py`
- Fazer:
  - Separar auth, troca de senha, dashboard, usuarios, planos e bridge do cliente.
  - Separar upload, preview, editor, status, assets e auditoria de templates do revisor.
  - Separar auth web, auth mobile e sessao do portal inspetor.
  - Separar modelos, dependencies, bootstrap e contratos na camada shared.
- Pronto quando:
  - Arquivos de rota cuidarem majoritariamente de HTTP e delegacao.
  - Regras de negocio estiverem em services/helpers coesos.
  - Os arquivos gigantes forem quebrados em modulos menores por responsabilidade.
- Evidencia:
  - `2026-03-21`: criado `app/domains/cliente/dashboard.py` para concentrar resumo da empresa, comparativo de planos, bootstrap e serializacao das listas de chat/mesa do portal cliente.
  - `2026-03-21`: `app/domains/cliente/routes.py` caiu de `2211` para `1369` linhas apos a extracao do bloco de dashboard/bootstrap.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'cliente or bootstrap or plano or mesa'` passou com `43 passed, 102 deselected`.
  - `2026-03-21`: criado `app/domains/revisor/templates_laudo_support.py` para concentrar status, serializacao, auditoria, catalogo e contexto da biblioteca de templates.
  - `2026-03-21`: `app/domains/revisor/templates_laudo.py` caiu de `1911` para `1402` linhas apos a extracao do bloco de suporte.
  - `2026-03-21`: `rg -n '^def ' app/domains/revisor/templates_laudo.py` passou sem ocorrencias, deixando o modulo focado em handlers HTTP.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'template or templates'` passou com `25 passed, 120 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'template or templates or openapi'` passou com `9 passed, 15 deselected`.
  - `2026-03-21`: criado `app/domains/revisor/templates_laudo_editor_routes.py` para concentrar create/save/assets/preview do editor rico.
  - `2026-03-21`: `app/domains/revisor/templates_laudo.py` caiu de `1382` para `1017` linhas apos delegar o fluxo do editor rico para o sub-roteador dedicado.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'template or templates'` permaneceu verde com `25 passed, 120 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'template or templates or openapi'` permaneceu verde com `9 passed, 15 deselected`.
  - `2026-03-21`: criado `app/domains/revisor/templates_laudo_management_routes.py` para concentrar publicacao, base recomendada, status em lote, exclusao em lote e clonagem da biblioteca.
  - `2026-03-21`: `app/domains/revisor/templates_laudo.py` caiu de `1017` para `436` linhas apos delegar o ciclo de biblioteca para o sub-roteador de gestao.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'template or templates'` permaneceu verde com `25 passed, 120 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'template or templates or openapi'` permaneceu verde com `9 passed, 15 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `198 passed, 35 skipped in 51.34s`.
  - `2026-03-21`: criado `app/domains/chat/auth_mobile_support.py` para concentrar serializacao de perfil, foto, configuracoes criticas e persistencia auxiliar do mobile inspetor.
  - `2026-03-21`: `app/domains/chat/auth.py` caiu de `1223` para `909` linhas apos a extracao do bloco mobile de suporte.
  - `2026-03-21`: `rg -n '^def ' app/domains/chat/auth.py` passou sem ocorrencias, deixando o modulo focado em handlers HTTP.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'inspetor or perfil or mobile or senha or login'` passou com `39 passed, 106 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'perfil or mobile or login_app or openapi'` passou com `7 passed, 17 deselected`.
  - `2026-03-21`: a listagem de laudos do app e da home do inspetor tambem saiu de `chat/auth.py`, zerando `banco.query(...)` no modulo.
  - `2026-03-21`: criado `app/shared/security_support.py` para concentrar estado de sessao, persistencia em banco e helpers multiportal do contrato de autenticacao.
  - `2026-03-21`: `app/shared/security.py` caiu de `1062` para `452` linhas apos a extracao do bloco de sessao/portal para o modulo de suporte.
  - `2026-03-21`: `rg -n '^def ' app/shared/security.py` passou mostrando apenas hashing, resolver de autenticacao, dependencias FastAPI e RBAC.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_tenant_access.py tests/test_regras_rotas_criticas.py -k 'sessao or login or troca_senha'` passou com `15 passed, 135 deselected`.
  - `2026-03-21`: criados `app/shared/db/models_base.py`, `app/shared/db/models_auth.py` e `app/shared/db/models_laudo.py` para separar base declarativa, modelos de identidade e modelos documentais.
  - `2026-03-21`: `app/shared/database.py` caiu de `1115` para `225` linhas apos virar agregador de runtime, contrato transacional e wrappers de bootstrap.
  - `2026-03-21`: `rg -n '^class |^def ' app/shared/database.py` passou mostrando apenas runtime, hooks de sessao, dependency FastAPI e wrappers de inicializacao.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_transaction_contract.py tests/test_tenant_access.py tests/test_smoke.py -k 'bootstrap or database_url_render or readiness or transaction or health or openapi or tenant'` passou com `17 passed, 15 deselected`.
  - `2026-03-21`: criado `app/domains/admin/portal_support.py` para concentrar CSRF, flash, renderizacao, sessao e fluxo de troca obrigatoria de senha do portal admin.
  - `2026-03-21`: `app/domains/admin/routes.py` caiu de `1112` para `800` linhas apos a extracao do suporte HTTP/sessao do portal admin.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'admin and (login or trocar_senha or metricas or novo_cliente or resetar_senha or adicionar_inspetor)'` passou com `5 passed, 140 deselected`.
  - `2026-03-21`: criado `app/domains/admin/client_routes.py` para concentrar onboarding, listagem, detalhe e mutacoes SaaS de clientes no portal admin.
  - `2026-03-21`: `app/domains/admin/routes.py` caiu de `801` para `306` linhas apos delegar o bloco de gestao de clientes para o sub-roteador dedicado.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'admin and (novo_cliente or cadastrar_empresa or resetar_senha or adicionar_inspetor or atualizar_crea or clientes)'` passou com `4 passed, 141 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'openapi or manifesto or assets_modulares or admin'` passou com `9 passed, 15 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `198 passed, 35 skipped in 34.50s`.
  - `2026-03-21`: criado `app/domains/chat/chat_runtime_support.py` para concentrar SSE de notificacoes do inspetor e persistencia final da resposta da IA, incluindo revisao automatica, citacoes deep e metricas de custo.
  - `2026-03-21`: `app/domains/chat/chat.py` caiu de `901` para `747` linhas apos a extracao do runtime assíncrono e da persistencia final.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'chat_stream_emite_confianca or resumo_exibe_confianca'` passou com `2 passed, 143 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'notificacoes or upload_doc or openapi'` passou com `5 passed, 19 deselected`.
  - `2026-03-21`: criado `app/domains/revisor/service_contracts.py`, `app/domains/revisor/service_messaging.py` e `app/domains/revisor/service_package.py` para separar contratos, respostas/pendencias da mesa e pacote/exportacao.
  - `2026-03-21`: `app/domains/revisor/service.py` caiu de `719` para `51` linhas apos virar fachada publica do dominio.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'revisor and (avaliar or whisper or responder or pacote or exportar or pendencia or mensagens or completo)'` passou com `15 passed, 118 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `200 passed, 35 skipped in 34.30s`.
  - `2026-03-21`: criados `app/domains/chat/auth_contracts.py`, `app/domains/chat/auth_portal_routes.py` e `app/domains/chat/auth_mobile_routes.py` para separar contratos, rotas web e rotas mobile do inspetor.
  - `2026-03-21`: `app/domains/chat/auth.py` caiu de `870` para `80` linhas apos virar fachada publica de composicao.
  - `2026-03-21`: criados `app/domains/chat/chat_stream_routes.py` e `app/domains/chat/chat_aux_routes.py` para separar o fluxo principal SSE/chat dos endpoints auxiliares de mensagens, PDF, upload e feedback.
  - `2026-03-21`: `app/domains/chat/chat.py` caiu de `749` para `56` linhas apos virar fachada publica do dominio.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'inspetor or perfil or mobile or login or senha or comando_rapido or finalizacao or upload_doc or gerar_pdf or chat_stream or resumo_exibe_confianca or avisa_mesa or canais_ia_e_mesa'` passou com `52 passed, 81 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'openapi or perfil or mobile or login_app or upload_doc or nomenclatura_admin_ceo_e_admin_cliente_fica_clara_nos_portais'` passou com `8 passed, 16 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `200 passed, 35 skipped in 32.11s` apos a extracao final do dominio de chat.
  - `2026-03-21`: criado `app/domains/cliente/route_support.py` para concentrar renderizacao, sessao, troca obrigatoria de senha e utilitarios do portal admin-cliente.
  - `2026-03-21`: `app/domains/cliente/routes.py` caiu de `1370` para `1141` linhas apos a extracao do suporte de portal e utilitarios de resposta/auditoria.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'cliente and (login or trocar_senha or usuarios or chat or mesa or plano)'` passou com `8 passed, 137 deselected`.
  - `2026-03-21`: criado `app/domains/cliente/chat_routes.py` para concentrar os endpoints de chat e mesa do portal admin-cliente.
  - `2026-03-21`: `app/domains/cliente/routes.py` caiu de `1141` para `586` linhas apos delegar chat/mesa para o sub-roteador dedicado.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'cliente and (chat or mesa)'` passou com `4 passed, 141 deselected`.
  - `2026-03-21`: `python3 -m pytest -q tests/test_smoke.py -k 'openapi or portal_bridge or cliente'` passou com `7 passed, 17 deselected`.
  - `2026-03-21`: criado `app/domains/cliente/management_routes.py` para concentrar auditoria, plano e gestao de usuarios do portal admin-cliente.
  - `2026-03-21`: `app/domains/cliente/routes.py` caiu de `586` para `256` linhas apos delegar auditoria, plano e usuarios para o sub-roteador de gestao.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'cliente and (plano or usuarios or auditoria)'` passou com `4 passed, 141 deselected`.
  - `2026-03-21`: criados `app/domains/cliente/dashboard_analytics.py` e `app/domains/cliente/dashboard_bootstrap.py` para separar analytics/comercial e feed/bootstrap do portal admin-cliente.
  - `2026-03-21`: `app/domains/cliente/dashboard.py` caiu de `875` para `25` linhas apos virar fachada publica do dominio.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_regras_rotas_criticas.py -k 'cliente and (bootstrap or plano or mesa or usuarios or auditoria)'` passou com `5 passed, 128 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `200 passed, 35 skipped in 31.74s` apos a extracao do dashboard do cliente.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `198 passed, 35 skipped in 37.64s`.
- Validacao:

```bash
wc -l web/app/domains/cliente/*.py web/app/domains/revisor/*.py web/app/domains/chat/*.py web/app/shared/*.py
```

Resultado esperado: reducao clara dos maiores arquivos e melhor distribuicao de responsabilidades.

### B005 - Reduzir acesso direto ao banco em rotas e helpers HTTP

- Status: `PARCIAL`
- Prioridade: `Alta`
- Ja validado:
  - `app/domains/admin/services.py` e `app/domains/mesa/service.py` ja concentram parte das regras.
  - Ainda ha bastante `banco.query(...)` espalhado por modulos de rota e helpers.
  - O portal cliente ja passou a delegar parte do estado agregado de dashboard/bootstrap para `app/domains/cliente/dashboard.py`.
  - O modulo de templates do revisor ja passou a delegar catalogo, auditoria e serializacao para `app/domains/revisor/templates_laudo_support.py`.
- Fazer:
  - Mover consultas de negocio para services/repositories/helpers de aplicacao.
  - Evitar que camada HTTP conheca detalhes demais de persistencia.
  - Padronizar estilo SQLAlchemy (`select()`/`scalars()` ou outro) em vez de misturar padroes.
- Pronto quando:
  - Rotas usarem majoritariamente chamadas de servico.
  - A camada HTTP parar de concentrar filtros, agregacoes e montagens de estado complexas.
- Evidencia:
  - `2026-03-21`: `/cliente/api/bootstrap`, `/cliente/api/empresa/resumo`, `/cliente/api/chat/laudos` e `/cliente/api/mesa/laudos` deixaram de montar estado complexo inline em `cliente/routes.py`.
  - `2026-03-21`: comparativo de planos, serializacao de usuarios e agregacoes de dashboard do portal cliente foram movidos para helper de aplicacao dedicado.
  - `2026-03-21`: `rg -n "banco\\.query\\(|db\\.query\\(" app/domains/cliente/routes.py app/domains/cliente/dashboard.py` passou sem ocorrencias.
  - `2026-03-21`: `/revisao/api/templates-laudo` e `/revisao/api/templates-laudo/auditoria` passaram a delegar catalogo e auditoria para helper dedicado.
  - `2026-03-21`: `app/domains/revisor/templates_laudo.py` deixou de concentrar helpers de serializacao, auditoria e contexto; o acesso direto a banco no arquivo ficou residual e restrito aos fluxos mutantes.
  - `2026-03-21`: `rg -n "banco\\.query\\(|db\\.query\\(" app/domains/revisor/templates_laudo.py` passou sem ocorrencias.
  - `2026-03-21`: `chat/auth.py` passou a delegar perfil, foto e configuracoes mobile para `app/domains/chat/auth_mobile_support.py`.
  - `2026-03-21`: `rg -n "banco\\.query\\(|db\\.query\\(" app/domains/chat/auth.py app/domains/chat/auth_mobile_support.py` passou sem ocorrencias.
  - `2026-03-21`: `chat/chat.py` passou a delegar SSE de notificacoes e persistencia final da resposta da IA para `app/domains/chat/chat_runtime_support.py`.
  - `2026-03-21`: `rg -n "banco\\.query\\(|db\\.query\\(" app/domains/chat/chat.py` passou sem ocorrencias.
  - `2026-03-21`: `chat/chat.py` passou a delegar o fluxo principal para `app/domains/chat/chat_stream_routes.py` e os endpoints auxiliares para `app/domains/chat/chat_aux_routes.py`, mantendo `chat.py` como fachada publica.
  - `2026-03-21`: `chat/auth.py` passou a delegar rotas web para `app/domains/chat/auth_portal_routes.py` e rotas mobile para `app/domains/chat/auth_mobile_routes.py`, mantendo `auth.py` como fachada publica.
  - `2026-03-21`: `chat/mesa.py`, `chat/chat_runtime_support.py` e `revisor/service_messaging.py` passaram a usar `select()`/`scalars()` e `delete()` nos pontos refatorados, reduzindo mistura de estilo ORM nos fluxos de mesa, citacoes deep e referencia de mensagens.
  - `2026-03-21`: `cliente/routes.py` passou a delegar sessao, renderizacao, troca obrigatoria de senha e utilitarios de resposta para `app/domains/cliente/route_support.py`.
  - `2026-03-21`: `cliente/routes.py` passou a delegar todo o fluxo de chat/mesa para `app/domains/cliente/chat_routes.py`, deixando o shell do portal focado em auth, painel e gestao administrativa.
  - `2026-03-21`: `cliente/routes.py` passou a delegar auditoria, plano e usuarios para `app/domains/cliente/management_routes.py`, deixando o shell do portal focado em auth, painel, bootstrap e composicao dos sub-roteadores.
  - `2026-03-21`: `rg -n "banco\\.query\\(|db\\.query\\(" app/domains/cliente/routes.py app/domains/cliente/chat_routes.py app/domains/cliente/management_routes.py` passou sem ocorrencias.
  - `2026-03-21`: `revisor/templates_laudo.py` passou a delegar o fluxo do editor rico para `app/domains/revisor/templates_laudo_editor_routes.py`, deixando o arquivo principal focado na biblioteca, publicacao, status, diff e preview geral.
  - `2026-03-21`: `revisor/templates_laudo.py` passou a delegar o ciclo da biblioteca para `app/domains/revisor/templates_laudo_management_routes.py`, deixando o arquivo principal focado em telas, consulta basica, upload, diff e preview geral.
- Validacao:

```bash
rg -n "banco\\.query\\(|db\\.query\\(" web/app
```

Resultado esperado: uso residual e concentrado em services/repositorios, nao em rotas.

## Fase 3 - Transacoes, sessao e estado distribuido

### B006 - Padronizar transacoes

- Status: `PARCIAL`
- Prioridade: `Alta`
- Ja validado:
  - `obter_banco()` faz `commit()` automatico no fim da request.
  - Ha `commit()` manual em varios fluxos internos.
- Fazer:
  - Escolher um padrao transacional unico.
  - Documentar onde pode existir `commit()` manual.
  - Remover commits em cascata no meio de fluxos que deveriam ser atomicos.
- Evidencia:
  - `2026-03-21`: `obter_banco()` passou a commitar apenas quando a sessao realmente carrega mutacoes pendentes.
  - `2026-03-21`: `app/shared/database.py` ganhou marcador transacional para diferenciar leitura simples, `flush()` sem commit e `commit()` manual ja concluido.
  - `2026-03-21`: o marcador transacional passou a cobrir tambem mutacoes bulk (`update`/`delete`) via ORM.
  - `2026-03-21`: fluxos de login dos portais admin, cliente, revisor e inspetor foram reordenados para persistir o estado do usuario antes da criacao de sessao.
  - `2026-03-21`: varios endpoints de `revisor/templates_laudo.py` trocaram `commit()` redundante por `flush()`.
  - `2026-03-21`: operacoes locais do inspetor em `chat/auth.py` trocaram `commit()` redundante por `flush()` onde a request ja fecha a transacao.
  - `2026-03-21`: `cliente/auditoria.py`, `chat/laudo_service.py`, `chat/laudo.py`, `chat/pendencias.py`, `chat/learning.py` e `revisor/learning_api.py` passaram a usar `flush()` quando a request ja fecha a transacao.
  - `2026-03-21`: `admin/services.py` passou a separar `flush()` para mutacoes locais da request e `commit()` apenas nos services que cruzam fronteira operacional.
  - `2026-03-21`: o comando rapido do inspetor em `chat/chat.py` passou a usar `flush()` no caminho sem efeito externo.
  - `2026-03-21`: `tests/test_transaction_contract.py` adicionado para proteger o contrato transacional.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_legacy_wrappers.py tests/test_transaction_contract.py tests/test_regras_rotas_criticas.py -k 'admin and (clientes or atualizar_crea or cadastrar_empresa or novo_cliente or resetar_senha) or cliente and (plano or usuarios) or resumo_exibe_confianca or comando_rapido'` passou com `13 passed, 125 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` passou com `200 passed, 35 skipped`.
- Pronto quando:
  - O projeto tiver um contrato claro de transacao.
  - Ficar facil saber onde ocorre persistencia parcial e onde nao pode ocorrer.
- Validacao:

```bash
rg -n "commit\\(" web/app web/main.py
```

Resultado esperado: `commit()` restrito a pontos deliberados e documentados.

### B007 - Simplificar e endurecer a camada de sessao/autenticacao

- Status: `PARCIAL`
- Prioridade: `Media`
- Ja validado:
  - Sessao e persistida em banco.
  - Cache local em memoria e reconstruido quando necessario.
  - Multiportal e RBAC ja existem.
- Fazer:
  - Definir com clareza o papel da memoria local versus banco.
  - Encapsular melhor o estado de sessao para reduzir acoplamento.
  - Aumentar cobertura de testes para fluxos de expiracao, invalidacao e troca de senha.
- Evidencia:
  - `2026-03-21`: criado `app/shared/security_support.py` para encapsular cache local, persistencia de sessoes, helpers de portal e renovacao/invalidacao do ciclo de sessao.
  - `2026-03-21`: `app/shared/security.py` passou a ficar focado no contrato publico, hashing, dependencias de autenticacao e RBAC.
  - `2026-03-21`: compatibilidade historica preservada com reexport dos estados e contratos usados pela suite critica.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_tenant_access.py tests/test_regras_rotas_criticas.py -k 'sessao or login or troca_senha'` passou com `15 passed, 135 deselected`.
- Pronto quando:
  - O desenho da sessao estiver claro para ambiente com mais de um worker.
  - Nao houver ambiguidade entre fonte de verdade em memoria e fonte de verdade persistida.
- Validacao:

```bash
python3 -m pytest -q tests/test_tenant_access.py tests/test_regras_rotas_criticas.py -k "sessao or login or troca_senha"
```

Resultado esperado: cobertura dedicada dos fluxos sensiveis de sessao.

### B008 - Consolidar realtime distribuido do revisor

- Status: `PARCIAL`
- Prioridade: `Media`
- Ja validado:
  - Backend `memory` e `redis` ja existem.
  - Existem testes unitarios dos transportes.
- Fazer:
  - Adicionar cobertura de integracao com Redis real.
  - Validar websocket e publish distribuido em pipeline ou suite dedicada.
  - Documentar fallback e comportamento em ambiente sem Redis.
- Pronto quando:
  - O fluxo distribuido estiver validado alem de teste unitario local.
  - O comportamento de startup e falha estiver previsivel.
- Validacao:

```bash
python3 -m pytest -q tests/test_revisor_realtime.py
```

Resultado esperado: manter cobertura unitaria e adicionar suite de integracao com Redis real.

## Fase 4 - Qualidade, cobertura e paridade de ambiente

### B009 - Ampliar static analysis e incluir `mypy` no CI

- Status: `VALIDADO`
- Prioridade: `Alta`
- Ja validado:
  - `ruff` passa.
  - `mypy` passa e agora cobre 51 arquivos.
  - O CI agora roda `mypy`.
- Fazer:
  - Incluir `mypy` no workflow de CI.
  - Expandir gradualmente a lista de arquivos tipados.
  - Aumentar o conjunto de regras do `ruff` de forma controlada.
- Evidencia:
  - `2026-03-21`: workflow `ci.yml` atualizado para executar `python -m mypy`.
  - `2026-03-21`: `python3 -m mypy` segue verde apos a introducao do job adicional de stack.
  - `2026-03-21`: `pyproject.toml` ampliado para incluir `chat/auth.py`, `revisor/auth_portal.py`, `chat/laudo_service.py`, `chat/pendencias.py`, `chat/learning.py`, `revisor/learning_api.py` e `cliente/auditoria.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `cliente/dashboard.py` e `cliente/routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `revisor/templates_laudo.py` e `revisor/templates_laudo_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `chat/auth_mobile_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/shared/security_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/core/http_setup_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/core/logging_support.py` e `app/core/http_runtime_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/shared/db/models_base.py`, `app/shared/db/models_auth.py` e `app/shared/db/models_laudo.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/admin/portal_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/chat/chat_runtime_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/cliente/route_support.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/cliente/chat_routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/cliente/management_routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/admin/client_routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/revisor/templates_laudo_editor_routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/revisor/templates_laudo_management_routes.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/chat/chat.py`, `app/domains/mesa/service.py`, `app/domains/revisor/panel.py` e `app/domains/revisor/service.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/revisor/service_contracts.py`, `app/domains/revisor/service_messaging.py` e `app/domains/revisor/service_package.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/cliente/dashboard_analytics.py` e `app/domains/cliente/dashboard_bootstrap.py`.
  - `2026-03-21`: `pyproject.toml` ampliado novamente para incluir `app/domains/chat/auth_contracts.py`, `app/domains/chat/auth_portal_routes.py`, `app/domains/chat/auth_mobile_routes.py`, `app/domains/chat/chat_stream_routes.py`, `app/domains/chat/chat_aux_routes.py` e `app/domains/chat/mesa.py`.
  - `2026-03-21`: gate local de tipagem validado com `Success: no issues found in 51 source files`.
- Pronto quando:
  - O CI barrar regressao de tipagem.
  - O escopo do `mypy` cobrir os modulos mais criticos do backend.
- Validacao:

```bash
python3 -m mypy
python3 -m ruff check .
```

Resultado esperado: sucesso com escopo maior e validacao automatica no CI.

### B010 - Unificar versao de Python entre doc, CI e producao

- Status: `VALIDADO`
- Prioridade: `Alta`
- Ja validado:
  - `README`, `pyproject.toml` e CI apontam para a linha `3.14`.
  - Render usa `3.14.3`.
  - O runtime oficial documentado ficou alinhado entre documentacao, pipeline e deploy.
- Fazer:
  - Escolher uma versao oficial minima e uma versao recomendada.
  - Alinhar `README`, CI, Render e ferramentas locais.
  - Evitar suporte implicito a quatro runtimes diferentes.
- Evidencia:
  - `2026-03-21`: `ci.yml` alinhado para Python `3.14`, em linha com `README`, `pyproject.toml` e `render.yaml`.
  - `2026-03-21`: `README.md` atualizado para refletir o estado real dos wrappers legados e dos scripts oficiais.
- Pronto quando:
  - A versao documentada for a mesma usada no CI e em producao.
  - O time souber exatamente qual runtime reproduz o ambiente oficial.
- Validacao:

```bash
python3 --version
sed -n '1,40p' web/README.md
sed -n '1,40p' .github/workflows/ci.yml
sed -n '1,40p' render.yaml
```

Resultado esperado: alinhamento explicito.

### B011 - Adicionar validacao com Postgres e Redis no pipeline

- Status: `PARCIAL`
- Prioridade: `Alta`
- Ja validado:
  - Local usa SQLite por padrao.
  - Producao usa Postgres e Redis.
  - O CI principal ainda valida o caminho rapido com SQLite.
- Fazer:
  - Criar job de CI com Postgres e Redis.
  - Rodar ao menos uma suite critica com `DATABASE_URL` e `REDIS_URL` reais.
  - Garantir readiness, migrations e realtime no ambiente mais proximo do deploy.
- Evidencia:
  - `2026-03-21`: workflow `ci.yml` ganhou job `backend-stack` com servicos de Postgres e Redis.
  - `2026-03-21`: smoke suite ajustada para validar `/ready` conforme o backend realtime configurado.
  - `2026-03-21`: `tests/test_revisor_realtime.py` passou a ter teste de integracao opt-in com Redis real via `REDIS_URL`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_smoke.py tests/test_revisor_realtime.py` passou localmente com `29 passed, 1 skipped`.
- Pronto quando:
  - O backend tiver cobertura automatica no stack principal de producao.
- Validacao:

```bash
python3 -m alembic upgrade head
AMBIENTE=dev python3 -m pytest -q tests/test_smoke.py tests/test_revisor_realtime.py
```

Resultado esperado: suite critica passa usando servicos reais no CI.

### B012 - Subir cobertura dos modulos mais arriscados

- Status: `PARCIAL`
- Prioridade: `Alta`
- Ja validado:
  - Cobertura total atual: `79%`.
  - Modulos mais fracos incluem `revisor/ws.py`, `chat/notifications.py`, `revisor/realtime.py`, `admin/services.py`, `admin/routes.py`.
- Fazer:
  - Adicionar testes para auth multiportal, falhas de admin, websocket, redis e realtime.
  - Cobrir fluxos de erro e nao apenas happy path.
  - Adicionar thresholds de cobertura quando a base estabilizar.
- Evidencia:
  - `2026-03-21`: `tests/test_revisor_realtime.py` ganhou teste de integracao opt-in com Redis real.
  - `2026-03-21`: `tests/test_admin_services.py` passou a cobrir o stub de onboarding para impedir vazamento de senha em log.
- Pronto quando:
  - Cobertura total do backend subir.
  - Nenhum modulo critico ficar sem teste de erro e sem teste de permissao.
- Validacao:

```bash
AMBIENTE=dev python3 -m pytest --cov=app --cov=main --cov-report=term-missing:skip-covered -q
```

Resultado esperado: cobertura total acima da baseline de `79%` e melhora visivel nos modulos criticos.

### B013 - Dividir a suite monolitica de rotas criticas

- Status: `PARCIAL`
- Prioridade: `Media`
- Ja validado:
  - `tests/test_regras_rotas_criticas.py` concentra grande parte dos cenarios e esta muito grande.
  - O primeiro bloco de fixture/helpers e cenarios de autenticacao/isolamento ja saiu do arquivo monolitico.
- Fazer:
  - Separar por portal ou dominio.
  - Mover fixtures e helpers compartilhados para `conftest.py` ou modulo dedicado.
  - Manter nomeacao clara de cenarios por comportamento.
- Evidencia:
  - `2026-03-21`: criado `tests/regras_rotas_criticas_support.py` para concentrar helpers compartilhados e utilitarios de setup da suite critica.
  - `2026-03-21`: criado `tests/conftest.py` para expor `ambiente_critico` como fixture compartilhado no pacote de testes.
  - `2026-03-21`: criado `tests/test_portais_acesso_critico.py` para separar os cenarios de CSRF, login mobile e isolamento entre portais.
  - `2026-03-21`: `tests/test_regras_rotas_criticas.py` caiu de `6417` para `5849` linhas apos a primeira extracao real.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_portais_acesso_critico.py tests/test_regras_rotas_criticas.py -k 'admin_cliente or sessao or login_mobile or csrf or portal_app or portal_admin or portal_revisao'` passou com `23 passed, 122 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `198 passed, 35 skipped in 33.32s`.
  - `2026-03-21`: criado `tests/test_cliente_portal_critico.py` para separar os cenarios do portal admin-cliente.
  - `2026-03-21`: `tests/test_regras_rotas_criticas.py` caiu de `5849` para `5376` linhas apos a segunda extracao real.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q tests/test_cliente_portal_critico.py tests/test_regras_rotas_criticas.py -k 'cliente or 404_em_rotas_api_app_retorna_json_sem_redirect or 404_em_rotas_api_revisao_retorna_json_sem_redirect'` passou com `12 passed, 121 deselected`.
  - `2026-03-21`: `AMBIENTE=dev python3 -m pytest -q` permaneceu verde com `200 passed, 35 skipped in 32.11s`.
- Pronto quando:
  - A suite critica ficar mais facil de navegar e manter.
  - Uma falha apontar com clareza a area quebrada.
- Validacao:

```bash
wc -l web/tests/test_regras_rotas_criticas.py
find web/tests -maxdepth 1 -type f | sort
```

Resultado esperado: arquivo monolitico reduzido ou substituido por arquivos menores e organizados.

## Fase 5 - Operacao e seguranca

### B014 - Endurecer onboarding, envio de credenciais e rotinas administrativas

- Status: `PARCIAL`
- Prioridade: `Media`
- Ja validado:
  - O envio de boas-vindas ainda e stub.
  - Em modo dev o stub nao registra mais senha plana no log.
  - Existem rotinas administrativas legadas fora de uma CLI controlada.
- Fazer:
  - Definir interface real de notificacao/boas-vindas.
  - Evitar logging de segredo fora de fluxo de desenvolvimento explicitamente isolado.
  - Formalizar o caminho seguro para bootstrap e reset administrativo.
- Evidencia:
  - `2026-03-21`: `_disparar_email_boas_vindas()` passou a redigir a credencial temporaria em log.
  - `2026-03-21`: `tests/test_admin_services.py` protege contra regressao de vazamento em log.
  - `2026-03-21`: `rg -n "Senha:|E-MAIL DE BOAS-VINDAS INTERCEPTADO|Admin@2026" . --glob '!docs/**'` sem ocorrencias no codigo operacional.
- Pronto quando:
  - O fluxo de onboarding nao depender de stub ambigao.
  - Nao houver segredo sensivel espalhado em script ou log por padrao.
- Validacao:

```bash
rg -n "Senha:|E-MAIL DE BOAS-VINDAS INTERCEPTADO|Admin@2026" web --glob '!docs/**'
```

Resultado esperado: nenhum segredo hardcoded em fluxo operacional.

## Ordem recomendada de execucao

1. `B001` e `B002`
2. `B006`
3. `B003`, `B004` e `B005`
4. `B009`, `B010` e `B011`
5. `B012` e `B013`
6. `B007`, `B008` e `B014`

## Checkpoint de saida

Antes de considerar o backend consolidado, este arquivo deve chegar no minimo ao seguinte estado:

- `B001`: `VALIDADO`
- `B002`: `VALIDADO`
- `B003`: `VALIDADO`
- `B004`: `VALIDADO`
- `B005`: `VALIDADO`
- `B006`: `VALIDADO`
- `B009`: `VALIDADO`
- `B010`: `VALIDADO`
- `B011`: `VALIDADO`
- `B012`: `VALIDADO`

Os itens `B007`, `B008`, `B013` e `B014` podem terminar depois, mas nao deveriam ficar sem dono nem sem data prevista.
