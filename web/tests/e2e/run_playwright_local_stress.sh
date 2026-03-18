#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../scripts/common.sh"

PYTHON_EXE="$(resolve_project_python)"
ROOT_DIR="$(resolve_project_root)"

export STRESS_LAUDOS_ROUNDS="${STRESS_LAUDOS_ROUNDS:-16}"
export RUN_E2E_LOCAL=1
export E2E_USE_LOCAL_DB=1
export E2E_LOCAL_SEED_BOOTSTRAP=0

cd -- "$ROOT_DIR"
"$PYTHON_EXE" scripts/seed_usuario_uso_intenso.py
exec "$PYTHON_EXE" -m pytest tests/e2e/test_local_stress_playwright.py -q \
  --browser chromium \
  --tracing retain-on-failure \
  --video retain-on-failure \
  --screenshot only-on-failure \
  -s \
  "$@"
