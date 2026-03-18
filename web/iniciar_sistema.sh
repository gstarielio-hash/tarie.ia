#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/scripts/common.sh"

PYTHON_EXE="$(resolve_project_python)"
APP_PORTA="${PORTA:-8000}"
APP_HOST="${HOST_BIND:-0.0.0.0}"

cd -- "$SCRIPT_DIR"
exec "$PYTHON_EXE" -m uvicorn main:app --host "$APP_HOST" --port "$APP_PORTA" --reload
