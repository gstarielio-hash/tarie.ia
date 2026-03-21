SHELL := /bin/bash
WEB_PYTHON := $(shell [ -x web/.venv-linux/bin/python ] && echo web/.venv-linux/bin/python || echo python)
WEB_PYTHON_IN_WEB := $(shell [ -x web/.venv-linux/bin/python ] && echo ./.venv-linux/bin/python || echo python)
PRE_COMMIT := $(WEB_PYTHON) -m pre_commit

.PHONY: help hooks-install web-lint web-test web-ci mobile-install mobile-lint mobile-typecheck mobile-test mobile-format-check mobile-ci ci

help: ## Lista comandos úteis do repositório
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

hooks-install: ## Instala hooks de pre-commit e pre-push
	$(PRE_COMMIT) install --hook-type pre-commit --hook-type pre-push

web-lint: ## Roda ruff no workspace web
	cd web && PYTHONPATH=. $(WEB_PYTHON_IN_WEB) -m ruff check .

web-test: ## Roda a suíte crítica do workspace web
	cd web && PYTHONPATH=. $(WEB_PYTHON_IN_WEB) -m pytest -q tests/test_smoke.py tests/test_regras_rotas_criticas.py tests/test_inspetor_comandos_dominio.py tests/test_inspetor_confianca_dominio.py
	cd web && PYTHONPATH=. $(WEB_PYTHON_IN_WEB) -m pytest -q tests/test_tenant_access.py

web-ci: web-lint web-test ## Executa os checks principais do web

mobile-install: ## Instala dependências do workspace mobile
	cd android && npm install

mobile-lint: ## Roda ESLint no workspace mobile
	cd android && npm run lint

mobile-typecheck: ## Roda TypeScript no workspace mobile
	cd android && npm run typecheck

mobile-test: ## Roda Jest no workspace mobile
	cd android && npm run test -- --runInBand

mobile-format-check: ## Confere formatação do workspace mobile
	cd android && npm run format:check

mobile-ci: mobile-typecheck mobile-lint mobile-format-check mobile-test ## Executa os checks principais do mobile

ci: web-ci mobile-ci ## Executa os checks principais dos workspaces
