#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/scripts/common.sh"

BOOTSTRAP_PYTHON="$(resolve_bootstrap_python)"
cd -- "$SCRIPT_DIR"
exec "$BOOTSTRAP_PYTHON" "$SCRIPT_DIR/scripts/linux_cli.py" validate-pipeline "$@"
