#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../scripts/common.sh"

PYTHON_EXE="$(resolve_project_python)"
ROOT_DIR="$(resolve_project_root)"

cd -- "$ROOT_DIR"
export RUN_E2E=1
exec "$PYTHON_EXE" -m pytest tests/e2e -q \
  --browser chromium \
  --tracing retain-on-failure \
  --video retain-on-failure \
  --screenshot only-on-failure \
  "$@"
