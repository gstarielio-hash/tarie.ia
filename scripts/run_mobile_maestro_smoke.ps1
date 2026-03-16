param(
    [string]$DeviceId = "RQCW20887GV",
    [string]$Flow = "android/maestro/login-smoke.yaml",
    [switch]$SkipApiStart
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$adb = Join-Path $androidSdk "platform-tools\adb.exe"
$maestroCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\maestro\maestro\bin\maestro.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\maestro\maestro\bin\maestro.bat"),
    (Join-Path $env:LOCALAPPDATA "Programs\maestro\maestro\bin\maestro")
)
$maestro = $maestroCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$apiScript = Join-Path $repoRoot "scripts\start_local_mobile_api_background.ps1"
$flowPath = Join-Path $repoRoot $Flow

function Test-HttpHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-ForHttpHealth {
    param(
        [int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpHealth) {
            return $true
        }
        Start-Sleep -Seconds 2
    }

    return $false
}

if (-not (Test-Path $adb)) {
    throw "adb nao encontrado em $adb"
}

if (-not $maestro) {
    throw "maestro nao encontrado em $($maestroCandidates -join ', ')"
}

if (-not (Test-Path $flowPath)) {
    throw "Flow do Maestro nao encontrado em $flowPath"
}

if (-not (Test-HttpHealth)) {
    if ($SkipApiStart) {
        throw "API local indisponivel em http://127.0.0.1:8000/health e -SkipApiStart foi usado."
    }

    if (-not (Test-Path $apiScript)) {
        throw "Script da API local nao encontrado em $apiScript"
    }

    Write-Host "Subindo API local do mobile..." -ForegroundColor Cyan
    & $apiScript

    if (-not (Wait-ForHttpHealth)) {
        throw "API local nao respondeu a tempo em http://127.0.0.1:8000/health"
    }
}

Write-Host "Preparando dispositivo $DeviceId..." -ForegroundColor Cyan
& $adb start-server | Out-Null
& $adb -s $DeviceId wait-for-device | Out-Null
& $adb -s $DeviceId reverse tcp:8000 tcp:8000 | Out-Null

Write-Host "Rodando Maestro: $Flow" -ForegroundColor Cyan
& $maestro test --device $DeviceId $flowPath
