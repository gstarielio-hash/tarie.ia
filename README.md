# Tariel Control

Aplicação SaaS de inspeções industriais com backend FastAPI, SQLAlchemy, templates Jinja2 e assets estáticos.

## Roadmap do produto WF

Backlog mestre da etapa antiga (priorizado e com status):

- `ROADMAP_WF_BACKLOG.md`

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
- `static/js/chat`, `static/js/admin`, `static/js/shared`: organização de scripts por domínio

Observação: os arquivos legados na raiz (`rotas_*.py`, `banco_dados.py`, `seguranca.py`, etc.) permanecem como wrappers de compatibilidade durante a transição.

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
python -m mypy
python -m pytest -q
python -m compileall -q .
```

## Testes E2E (Playwright)

Os testes E2E estão em `tests/e2e` e sobem a aplicação automaticamente em uma porta local com:

- banco SQLite temporário (não usa seu banco real),
- seed DEV habilitado (`SEED_DEV_BOOTSTRAP=1`) para usuários de teste.

Usuários seed usados nos E2E:

- `inspetor@wf.com.br` / `Dev@123456`
- `revisor@wf.com.br` / `Dev@123456`
- `admin@wf.com.br` / `Admin@123`

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
