#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

BOOTSTRAP_PYTHON="$(resolve_bootstrap_python)"
ROOT_DIR="$(resolve_project_root)"
cd -- "$ROOT_DIR"
exec "$BOOTSTRAP_PYTHON" "$SCRIPT_DIR/linux_cli.py" start-online-preview "$@"
