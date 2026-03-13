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
