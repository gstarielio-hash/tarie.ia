#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

PYTHON_EXE="$(resolve_project_python)"
ROOT_DIR="$(resolve_project_root)"
OUTPUT_DIR="$(ensure_directory "$ROOT_DIR/.test-artifacts/coverage")"
HTML_DIR="$OUTPUT_DIR/html"
PATH_ARG="tests"
RANDOM_ORDER=0
PATH_SET=0
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --random-order)
      RANDOM_ORDER=1
      shift
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    *)
      if [[ $PATH_SET -eq 0 && "$1" != -* ]]; then
        PATH_ARG="$1"
        PATH_SET=1
      else
        EXTRA_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

ARGS=(
  -m pytest "$PATH_ARG" -q
  --cov=app
  --cov=main
  --cov=nucleo
  --cov-report=term-missing
  --cov-report="html:$HTML_DIR"
  --cov-report="xml:$OUTPUT_DIR/coverage.xml"
)
if [[ $RANDOM_ORDER -eq 0 ]]; then
  ARGS+=( -p no:randomly )
fi
ARGS+=( "${EXTRA_ARGS[@]}" )

cd -- "$ROOT_DIR"
exec "$PYTHON_EXE" "${ARGS[@]}"
