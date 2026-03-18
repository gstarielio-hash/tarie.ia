#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="$REPO_ROOT/web"
LOG_PATH="$REPO_ROOT/local-mobile-api.log"
ERROR_LOG_PATH="$REPO_ROOT/local-mobile-api.error.log"
PID_FILE="$REPO_ROOT/local-mobile-api.pid"

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

http_health_ok() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1
    return $?
  fi

  "$PYTHON_EXE" - <<'PY' >/dev/null 2>&1
import sys
import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2) as response:
        sys.exit(0 if response.status == 200 else 1)
except Exception:
    sys.exit(1)
PY
}

wait_for_health() {
  local pid="$1"
  local timeout_seconds="${2:-30}"
  local elapsed=0

  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    if http_health_ok; then
      return 0
    fi

    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 1
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

if [[ ! -d "$WEB_ROOT" ]]; then
  echo "Pasta web nao encontrada em $WEB_ROOT" >&2
  exit 1
fi

PYTHON_EXE="$(resolve_python)"
kill_port_8000
sleep 0.4
: > "$LOG_PATH"
: > "$ERROR_LOG_PATH"
rm -f "$PID_FILE"

cd -- "$WEB_ROOT"
export SEED_DEV_BOOTSTRAP=1

if command -v setsid >/dev/null 2>&1; then
  setsid "$PYTHON_EXE" -m uvicorn main:app --app-dir . --host 0.0.0.0 --port 8000 >> "$LOG_PATH" 2>> "$ERROR_LOG_PATH" < /dev/null &
else
  nohup "$PYTHON_EXE" -m uvicorn main:app --app-dir . --host 0.0.0.0 --port 8000 >> "$LOG_PATH" 2>> "$ERROR_LOG_PATH" < /dev/null &
fi

API_PID=$!
printf '%s\n' "$API_PID" > "$PID_FILE"

if ! wait_for_health "$API_PID" 30; then
  echo "API local nao respondeu em http://127.0.0.1:8000/health." >&2
  echo "--- local-mobile-api.log ---" >&2
  tail -n 40 "$LOG_PATH" >&2 || true
  echo "--- local-mobile-api.error.log ---" >&2
  tail -n 40 "$ERROR_LOG_PATH" >&2 || true
  exit 1
fi
