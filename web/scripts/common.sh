#!/usr/bin/env bash
set -euo pipefail

COMMON_SH_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_project_root() {
  cd -- "$COMMON_SH_DIR/.." >/dev/null 2>&1
  pwd
}

resolve_bootstrap_python() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    printf '%s\n' "$PYTHON_BIN"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi

  echo "Python nao encontrado. Instale python3 ou defina PYTHON_BIN." >&2
  return 1
}

resolve_project_python() {
  local root
  root="$(resolve_project_root)"
  local candidates=(
    "${PYTHON_BIN:-}"
    "$root/.venv-linux/bin/python"
    "$root/.venv/bin/python"
    "$root/venv/bin/python"
    "$root/.venv-linux/Scripts/python.exe"
    "$root/.venv/Scripts/python.exe"
    "$root/venv/Scripts/python.exe"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  resolve_bootstrap_python
}

ensure_directory() {
  mkdir -p -- "$1"
  printf '%s\n' "$1"
}
