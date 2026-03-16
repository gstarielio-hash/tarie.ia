# Tariel.ia

Aplicação SaaS de inspeções industriais com backend FastAPI, SQLAlchemy, templates Jinja2 e assets estáticos.

## Roadmap do produto

Backlog mestre da etapa antiga (priorizado e com status):

- `ROADMAP_BACKLOG.md`

## Stack detectada

- Python 3.14
- FastAPI + Uvicorn
- SQLAlchemy + Alembic (SQLite por padrão)
- Integrações opcionais: Google Gemini e Google Vision
- Qualidade: Ruff, Mypy, Pytest

## Estrutura por domínios

- `app/domains/chat`: portal do inspetor, chat IA e fluxo de laudos
- `app/domains/mesa`: contratos e serviços da mesa avaliadora
- `app/domains/admin`: painel administrativo e serviços SaaS
- `app/domains/revisor`: painel da engenharia/revisão
- `app/shared`: banco de dados, segurança e utilitários compartilhados
- `static/js/chat`, `static/js/admin`, `static/js/revisor`, `static/js/shared`: organização de scripts por domínio
- `static/css/revisor`: estilos dedicados da biblioteca de templates da mesa avaliadora

Observação: os wrappers legados da raiz foram removidos. Use apenas os módulos em `app/` (`app/domains/*` e `app/shared/*`).

## Setup local (do zero)

1. Criar e ativar ambiente virtual:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Instalar dependências:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

3. Configurar variáveis de ambiente:

```powershell
Copy-Item .env.example .env
```

Segurança: nunca versione `.env` nem credenciais JSON (`visao_wf.local.json`/equivalentes).

4. Ajustar no `.env` principalmente:

- `AMBIENTE` (obrigatório: `dev`, `development`, `local`, `producao`, `production` ou `prod`)
- `CHAVE_API_GEMINI` (necessária para recursos de IA)
- `GOOGLE_APPLICATION_CREDENTIALS` (arquivo de credenciais da Vision API, se usar OCR)
- `CHAVE_SECRETA_APP` (obrigatória em produção)
- `SEED_DEV_BOOTSTRAP` (`0` por padrão; use `1` apenas quando quiser criar usuários seed em dev)

5. Bootstrap de seed dev (opcional e explícito):

```powershell
# 1) Habilite temporariamente no .env
SEED_DEV_BOOTSTRAP=1

# 2) Suba a aplicação para executar o bootstrap
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 3) Volte para 0 após criar os dados de dev
SEED_DEV_BOOTSTRAP=0
```

## Realtime distribuído da mesa

Por padrão, o realtime do portal do revisor usa backend em memória.
Isso funciona bem em desenvolvimento e em instância única.

Para preparar múltiplos workers/instâncias, habilite o backend distribuído:

```powershell
REDIS_URL=redis://localhost:6379/0
REVISOR_REALTIME_BACKEND=redis
REVISOR_REALTIME_CHANNEL_PREFIX=tariel:revisor
```

Observações:

- `REVISOR_REALTIME_BACKEND=memory` continua sendo o padrão.
- `REVISOR_REALTIME_BACKEND=redis` falha rápido no startup se `REDIS_URL` não estiver configurado.
- `/ready` agora expõe `revisor_realtime_backend` e `revisor_realtime_distributed` para facilitar operação.

## Deploy no Render

O blueprint de produção fica na raiz do repositório em `../render.yaml`.
Ele usa `rootDir: web`, então o serviço do Render executa build, migrations e `uvicorn`
diretamente a partir desta pasta sem precisar de wrappers com `cd`.
O mesmo blueprint também provisiona o Key Value `tarie-ia-realtime` e injeta `REDIS_URL`
no serviço web para o realtime distribuído da mesa.

## Pipeline de validação

Execução completa recomendada (varredura recursiva com evidência por subpasta):

```powershell
.\validar_pipeline.ps1
```

Esse script valida, nesta ordem:

- `ruff format`
- `ruff check`
- `scripts/check_chat_architecture.py` (guarda de arquitetura do domínio chat)
- `mypy`
- `pytest`
- `compileall` recursivo
- `node --check` em todos os `.js`
- parse de templates Jinja2 (`templates/**/*.html`)
- parse de arquivos JSON

Se quiser executar manualmente a parte Python:

```powershell
python -m ruff format .
python -m ruff check .
python scripts/check_chat_architecture.py
python -m mypy
python -m pytest -q
python -m compileall -q .
```

### GitHub Actions

- `ci.yml`: lint + guarda de arquitetura + suíte crítica de testes.
- `e2e-local-stress.yml` (manual): stress E2E intenso local (sequencial + paralelo) com Playwright.

## Testes E2E (Playwright)

Os testes E2E estão em `tests/e2e` e sobem a aplicação automaticamente em uma porta local com:

- banco SQLite temporário (não usa seu banco real),
- seed DEV habilitado (`SEED_DEV_BOOTSTRAP=1`) para usuários de teste.

Usuários seed usados nos E2E:

- `admin@tariel.ia` / `Dev@123456`
- `admin-cliente@tariel.ia` / `Dev@123456`
- `inspetor@tariel.ia` / `Dev@123456`
- `revisor@tariel.ia` / `Dev@123456`

Executar:

```powershell
$env:RUN_E2E="1"
python -m pytest tests/e2e -q --browser chromium
```

Com trace/vídeo/screenshot em falha:

```powershell
.\tests\e2e\run_playwright.ps1
```

Por padrão os E2E ficam desativados (skip) quando `RUN_E2E` não é `1`.

## Bancada avançada de testes

Ferramentas adicionais instaladas na `.venv`:

- `pytest-xdist`: execução paralela
- `pytest-cov`: cobertura
- `pytest-html` + `allure-pytest`: relatórios
- `hypothesis` + `schemathesis`: propriedade e schema/API fuzzing
- `locust`: carga
- `pytest-timeout` + `pytest-randomly`: robustez da suíte
- `Faker` + `factory-boy`: dados de teste

Scripts prontos:

```powershell
# pytest em paralelo (mantém ordem estável por padrão)
.\scripts\run_pytest_parallel.ps1 tests

# cobertura HTML/XML
.\scripts\run_pytest_coverage.ps1 tests

# relatório HTML + JUnit + Allure results
.\scripts\run_pytest_report.ps1 tests

# schema/property-based contra FastAPI local temporário
.\scripts\run_schemathesis.ps1 -Portal inspetor
.\scripts\run_schemathesis.ps1 -Portal revisor
.\scripts\run_schemathesis.ps1 -Portal admin

# carga básica com login seed e relatório HTML/CSV
.\scripts\run_locust.ps1 -Users 8 -SpawnRate 2 -RunTime 1m
```

Saídas geradas:

- cobertura: `.test-artifacts/coverage`
- relatórios pytest: `.test-artifacts/reports`
- schemathesis: `.test-artifacts/schemathesis`
- locust: `.test-artifacts/locust`

Observação: `pytest-randomly` está instalado, mas os scripts de execução contínua desabilitam a randomização por padrão para evitar flake desnecessário no dia a dia. Se quiser forçar ordem aleatória, use `-RandomOrder` nos scripts de pytest.

## Migrações de banco (Alembic)

Comandos principais:

```powershell
# aplicar migrações até o head
python -m alembic upgrade head

# criar nova revisão autogerada
python -m alembic revision --autogenerate -m "descricao_da_mudanca"
```

## Start

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Também disponível em:

```powershell
.\iniciar_sistema.bat
```

## Preview online (URL pública temporária)

Para testar no navegador fora do `localhost` (celular, cliente, time):

```powershell
.\scripts\start_online_preview.ps1
```

O script:

- sobe a app local na porta `8000`;
- abre um túnel Cloudflare (`trycloudflare.com`);
- imprime a URL pública no terminal;
- opcionalmente já abre o navegador.

Por padrão, ele usa um banco SQLite isolado em `.tmp_online/preview_online.db` (não mexe no banco principal).
Se quiser forçar o banco do projeto:

```powershell
.\scripts\start_online_preview.ps1 -UseProjectDatabase
```

Para encerrar tudo:

```powershell
.\scripts\stop_online_preview.ps1
```
`run_schemathesis.ps1` carrega automaticamente [schemathesis_hooks.py](C:/Users/gabri/Desktop/Tariel/Tariel%20Control/scripts/schemathesis_hooks.py) para desserializar respostas binárias (`PDF`, imagens e `octet-stream`) e evitar warnings desnecessários no contrato.

## Deploy inicial no Render

O repositório já possui um Blueprint em `render.yaml` para um primeiro deploy com:

- `Web Service` Python `starter`
- `Render Postgres` `basic-1gb`
- `Persistent Disk` de `10 GB` montado em `static/uploads`

Passo a passo resumido:

1. No Render, escolha `New +` -> `Blueprint`.
2. Conecte o repositório GitHub.
3. Confirme a leitura do `render.yaml`.
4. Preencha os segredos pendentes:
   - `CHAVE_SECRETA_APP`
   - `CHAVE_API_GEMINI` (se usar IA)
   - `GOOGLE_APPLICATION_CREDENTIALS` (se usar OCR)
   - `APP_HOST_PUBLICO` / `ALLOWED_HOSTS` se quiser fixar domínio próprio desde o início
5. Aguarde a criação do Postgres e do Web Service.
6. Teste a aplicação na URL `onrender.com`.

Observações:

- O app agora aceita `PASTA_UPLOADS_PERFIS` e `PASTA_ANEXOS_MESA`, o que permite persistir uploads no disco do Render.
- O app também aceita `RENDER_EXTERNAL_HOSTNAME` como fallback para `APP_HOST_PUBLICO`, facilitando o primeiro deploy sem domínio customizado.
