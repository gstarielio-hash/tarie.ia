$ErrorActionPreference = "Stop"

$pythonExe = ""
if (Test-Path ".\.venv\Scripts\python.exe") { $pythonExe = ".\.venv\Scripts\python.exe" }
elseif (Test-Path ".\venv\Scripts\python.exe") { $pythonExe = ".\venv\Scripts\python.exe" }
else { $pythonExe = "python" }

if (-not $env:STRESS_LAUDOS_ROUNDS -or [string]::IsNullOrWhiteSpace($env:STRESS_LAUDOS_ROUNDS)) {
  $env:STRESS_LAUDOS_ROUNDS = "16"
}

$env:RUN_E2E_LOCAL = "1"
$env:E2E_USE_LOCAL_DB = "1"
$env:E2E_LOCAL_SEED_BOOTSTRAP = "0"

& $pythonExe scripts/seed_usuario_uso_intenso.py

& $pythonExe -m pytest tests/e2e/test_local_stress_playwright.py -q `
  --browser chromium `
  --tracing retain-on-failure `
  --video retain-on-failure `
  --screenshot only-on-failure `
  -s
