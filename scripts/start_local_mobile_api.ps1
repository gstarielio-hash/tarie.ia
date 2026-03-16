$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logPath = Join-Path $root "local-mobile-api.log"
if (Test-Path $logPath) {
    Remove-Item $logPath -Force
}

$env:SEED_DEV_BOOTSTRAP = "1"

& ".\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 *>> $logPath
