param(
    [string]$DeviceId = "RQCW20887GV",
    [string[]]$Flows = @(
        "android/maestro/login-smoke.yaml",
        "android/maestro/history-smoke.yaml",
        "android/maestro/settings-smoke.yaml",
        "android/maestro/chat-smoke.yaml"
    )
)

$ErrorActionPreference = "Stop"

$runner = Join-Path $PSScriptRoot "run_mobile_maestro_smoke.ps1"

if (-not (Test-Path $runner)) {
    throw "Runner base do Maestro nao encontrado em $runner"
}

for ($index = 0; $index -lt $Flows.Length; $index++) {
    $flow = $Flows[$index]
    Write-Host "Executando fluxo $($index + 1)/$($Flows.Length): $flow" -ForegroundColor Cyan

    if ($index -eq 0) {
        & $runner -DeviceId $DeviceId -Flow $flow
    } else {
        & $runner -DeviceId $DeviceId -Flow $flow -SkipApiStart
    }
}
