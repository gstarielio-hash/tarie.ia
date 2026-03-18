#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="$REPO_ROOT/web"
LOG_PATH="$REPO_ROOT/local-mobile-api.log"

resolve_python() {
  local candidates=(
    "${PYTHON_BIN:-}"
    "$REPO_ROOT/.venv-linux/bin/python"
    "$REPO_ROOT/.venv/bin/python"
    "$REPO_ROOT/venv/bin/python"
    "$WEB_ROOT/.venv-linux/bin/python"
    "$WEB_ROOT/.venv/bin/python"
    "$WEB_ROOT/venv/bin/python"
    "$REPO_ROOT/.venv-linux/Scripts/python.exe"
    "$REPO_ROOT/.venv/Scripts/python.exe"
    "$REPO_ROOT/venv/Scripts/python.exe"
    "$WEB_ROOT/.venv-linux/Scripts/python.exe"
    "$WEB_ROOT/.venv/Scripts/python.exe"
    "$WEB_ROOT/venv/Scripts/python.exe"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi
  echo "Python nao encontrado. Configure PYTHON_BIN ou crie uma venv em .venv-linux/.venv." >&2
  return 1
}

kill_port_8000() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:8000 -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser 8000/tcp 2>/dev/null || true)"
  fi
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
}

if [[ ! -d "$WEB_ROOT" ]]; then
  echo "Pasta web nao encontrada em $WEB_ROOT" >&2
  exit 1
fi

PYTHON_EXE="$(resolve_python)"
kill_port_8000
sleep 0.4
: > "$LOG_PATH"

cd -- "$WEB_ROOT"
export SEED_DEV_BOOTSTRAP=1
exec "$PYTHON_EXE" -m uvicorn main:app --app-dir . --host 0.0.0.0 --port 8000 >> "$LOG_PATH" 2>&1
