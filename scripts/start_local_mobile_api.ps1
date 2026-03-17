$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $root "web"
Set-Location $root

$logPath = Join-Path $root "local-mobile-api.log"
if (Test-Path $logPath) {
    Remove-Item $logPath -Force
}

$env:SEED_DEV_BOOTSTRAP = "1"

$pythonCandidates = @(
    (Join-Path $root ".venv\Scripts\python.exe"),
    (Join-Path $root "venv\Scripts\python.exe"),
    (Join-Path $webRoot ".venv\Scripts\python.exe"),
    (Join-Path $webRoot "venv\Scripts\python.exe")
)
$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not (Test-Path $python)) {
    throw "Python virtualenv nao encontrado em $($pythonCandidates -join ', ')"
}

if (-not (Test-Path $webRoot)) {
    throw "Pasta web nao encontrada em $webRoot"
}

try {
    $processosPorta = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $processosPorta) {
        if ($pid) {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
}

Start-Sleep -Milliseconds 400

Push-Location $webRoot
try {
    & $python -m uvicorn main:app --app-dir . --host 0.0.0.0 --port 8000 *>> $logPath
} finally {
    Pop-Location
}
