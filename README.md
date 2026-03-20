# Tariel Control

Repositório principal do produto Tariel.

## Workspaces

- `web/`: aplicação FastAPI que roda em produção no Render
- `android/`: aplicativo mobile do inspetor
- `scripts/`: automações e comandos de suporte local

## Deploy

O deploy de produção usa o blueprint da raiz em `render.yaml`.
Esse blueprint aponta para `web/` via `rootDir: web`, então:

- os comandos de build/start são executados no diretório da aplicação web
- os caminhos persistentes de upload ficam alinhados com `web/static/uploads`

## Documentação

- Web: `web/README.md`
- Mobile: `android/README.md`

## Qualidade Local

Comandos úteis na raiz:

```bash
make help
make web-ci
make mobile-ci
make ci
```

Hooks opcionais:

```bash
python -m pip install -r web/requirements.txt
make hooks-install
```
