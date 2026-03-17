$ErrorActionPreference = "SilentlyContinue"

function Stop-IfRunning {
    param([string]$PidFile)
    if (-not (Test-Path $PidFile)) {
        return
    }

    $raw = (Get-Content $PidFile | Select-Object -First 1)
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    if (-not $raw) {
        return
    }

    try {
        $pid = [int]$raw
    } catch {
        return
    }

    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "[Tariel Online] Processo finalizado: PID $pid"
    }
}

$RootDir = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $RootDir ".tmp_online"

$AppPidFile = Join-Path $RuntimeDir "app.pid"
$TunnelPidFile = Join-Path $RuntimeDir "tunnel.pid"

Stop-IfRunning -PidFile $TunnelPidFile
Stop-IfRunning -PidFile $AppPidFile

try {
    $processos = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'cloudflared.exe'"
    foreach ($proc in $processos) {
        $cmd = [string]$proc.CommandLine
        if (-not $cmd) { continue }
        $ehApp = $cmd -match "uvicorn\s+main:app" -and $cmd -match "--port\s+8000"
        $ehTunnel = $cmd -match "trycloudflare\.com|--url\s+http://127\.0\.0\.1:8000"
        if ($ehApp -or $ehTunnel) {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "[Tariel Online] Processo órfão finalizado: PID $($proc.ProcessId)"
        }
    }
} catch {
    # Sem interrupção: o stop principal já foi executado via PID files.
}

Write-Host "[Tariel Online] Encerramento concluido."
