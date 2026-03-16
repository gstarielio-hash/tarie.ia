param(
    [int]$Port = 8000,
    [string]$BindHost = "127.0.0.1",
    [switch]$UseProjectDatabase,
    [switch]$NoOpenBrowser
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[Tariel Online] $Message"
}

function Resolve-CloudflaredPath {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        return $cmd.Source
    }

    $fallback = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "cloudflared nao encontrado. Instale com: winget install --id Cloudflare.cloudflared -e"
}

function Stop-IfRunning {
    param([string]$PidFile)
    if (-not (Test-Path $PidFile)) {
        return
    }

    $raw = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
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
    }
}

$RootDir = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $RootDir ".tmp_online"
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

$AppPidFile = Join-Path $RuntimeDir "app.pid"
$TunnelPidFile = Join-Path $RuntimeDir "tunnel.pid"
$AppLog = Join-Path $RuntimeDir "app.log"
$AppErr = Join-Path $RuntimeDir "app.err.log"
$TunnelLog = Join-Path $RuntimeDir "tunnel.log"
$TunnelOutLog = Join-Path $RuntimeDir "tunnel.out.log"
$TunnelErrLog = Join-Path $RuntimeDir "tunnel.err.log"

Stop-IfRunning -PidFile $AppPidFile
Stop-IfRunning -PidFile $TunnelPidFile
Start-Sleep -Milliseconds 400

if (Test-Path $AppLog) { Remove-Item $AppLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $AppErr) { Remove-Item $AppErr -Force -ErrorAction SilentlyContinue }
if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $TunnelOutLog) { Remove-Item $TunnelOutLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $TunnelErrLog) { Remove-Item $TunnelErrLog -Force -ErrorAction SilentlyContinue }

$PythonPath = Join-Path $RootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonPath)) {
    throw "Python da venv nao encontrado em .venv\Scripts\python.exe"
}

$CloudflaredPath = Resolve-CloudflaredPath
$env:AMBIENTE = if ($env:AMBIENTE) { $env:AMBIENTE } else { "dev" }

if (-not $UseProjectDatabase.IsPresent) {
    $PreviewDbPath = Join-Path $RuntimeDir "preview_online.db"
    $PreviewDbPathSql = $PreviewDbPath.Replace("\", "/")
    $env:DATABASE_URL = "sqlite:///$PreviewDbPathSql"
    $env:SEED_DEV_BOOTSTRAP = "1"
    Write-Step "Usando banco isolado de preview: $PreviewDbPath"
} elseif (-not $env:DATABASE_URL) {
    Write-Step "Usando DATABASE_URL do ambiente/.env do projeto."
}

$AppArgs = @("-m", "uvicorn", "main:app", "--host", $BindHost, "--port", "$Port")
Write-Step "Subindo app em http://$BindHost`:$Port ..."
$AppProc = Start-Process `
    -FilePath $PythonPath `
    -ArgumentList $AppArgs `
    -WorkingDirectory $RootDir `
    -RedirectStandardOutput $AppLog `
    -RedirectStandardError $AppErr `
    -PassThru

Set-Content -Path $AppPidFile -Value "$($AppProc.Id)" -Encoding ascii

$HealthUrl = "http://{0}:{1}/health" -f $BindHost, $Port
$HealthOk = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($AppProc.HasExited) {
        break
    }

    try {
        $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) {
            $HealthOk = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 800
    }
}

if (-not $HealthOk) {
    Write-Step "Falha ao subir app. Ultimas linhas do log:"
    if (Test-Path $AppErr) { Get-Content $AppErr -Tail 80 }
    if (Test-Path $AppLog) { Get-Content $AppLog -Tail 80 }
    if ($AppProc.HasExited) {
        Write-Step "Processo da app encerrou com codigo: $($AppProc.ExitCode)"
    } else {
        Write-Step "Processo da app ainda esta em execucao, mas sem responder /health."
    }
    throw "App nao respondeu em $HealthUrl"
}

Write-Step "App online localmente. Iniciando tunel publico..."
$TunnelArgs = @(
    "tunnel",
    "--url",
    ("http://{0}:{1}" -f $BindHost, $Port),
    "--no-autoupdate",
    "--protocol",
    "http2"
)
$TunnelProc = Start-Process `
    -FilePath $CloudflaredPath `
    -ArgumentList $TunnelArgs `
    -WorkingDirectory $RootDir `
    -RedirectStandardOutput $TunnelOutLog `
    -RedirectStandardError $TunnelErrLog `
    -PassThru

Set-Content -Path $TunnelPidFile -Value "$($TunnelProc.Id)" -Encoding ascii

$PublicUrl = ""
for ($i = 0; $i -lt 90; $i++) {
    if ($TunnelProc.HasExited) {
        break
    }

    $fontes = @($TunnelLog, $TunnelOutLog, $TunnelErrLog)
    foreach ($fonte in $fontes) {
        if (Test-Path $fonte) {
            $match = Select-String -Path $fonte -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue
            if ($match -and $match.Matches.Count -gt 0) {
                $PublicUrl = ($match.Matches[-1].Value)
                break
            }
        }
    }
    if ($PublicUrl) { break }

    Start-Sleep -Milliseconds 700
}

if (-not $PublicUrl) {
    Write-Step "Nao consegui capturar a URL publica do tunel. Confira:"
    if (Test-Path $TunnelOutLog) { Get-Content $TunnelOutLog -Tail 120 }
    if (Test-Path $TunnelErrLog) { Get-Content $TunnelErrLog -Tail 120 }
    if (Test-Path $TunnelLog) { Get-Content $TunnelLog -Tail 120 }
    throw "Tunel nao disponibilizou URL."
}

Write-Host ""
Write-Host "==============================================="
Write-Host "URL PUBLICA (compartilhe para testes):"
Write-Host $PublicUrl
Write-Host "==============================================="
Write-Host ""
Write-Step "Logs: $RuntimeDir"
Write-Step "Para encerrar tudo: .\\scripts\\stop_online_preview.ps1"

if (-not $NoOpenBrowser.IsPresent) {
    Start-Process $PublicUrl | Out-Null
}

try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($AppProc.HasExited) {
            Write-Step "App foi encerrada (PID $($AppProc.Id))."
            break
        }
        if ($TunnelProc.HasExited) {
            Write-Step "Tunel foi encerrado (PID $($TunnelProc.Id))."
            break
        }
    }
} finally {
    Stop-IfRunning -PidFile $TunnelPidFile
    Stop-IfRunning -PidFile $AppPidFile
}
