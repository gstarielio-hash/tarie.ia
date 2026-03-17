$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Resolve-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Resolve-PythonExecutable {
    $root = Resolve-ProjectRoot
    $dotVenv = Join-Path $root ".venv\Scripts\python.exe"
    $venv = Join-Path $root "venv\Scripts\python.exe"

    if (Test-Path $dotVenv) { return $dotVenv }
    if (Test-Path $venv) { return $venv }
    return "python"
}

function Resolve-VenvExecutable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $root = Resolve-ProjectRoot
    $dotVenv = Join-Path $root ".venv\Scripts\$Name"
    $venv = Join-Path $root "venv\Scripts\$Name"

    if (Test-Path $dotVenv) { return $dotVenv }
    if (Test-Path $venv) { return $venv }
    return $Name
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }

    return (Resolve-Path $Path).Path
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return [int]$listener.LocalEndpoint.Port
    }
    finally {
        $listener.Stop()
    }
}

function Wait-HealthEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri "$BaseUrl/health" -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
            continue
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "A aplicação não respondeu em $TimeoutSeconds segundos em $BaseUrl."
}

function New-TestDatabaseUrl {
    param(
        [string]$Label = "test"
    )

    $root = Resolve-ProjectRoot
    $runtimeDir = Ensure-Directory (Join-Path $root ".test-artifacts\runtime")
    $safeLabel = ($Label -replace "[^A-Za-z0-9_-]", "_").Trim("_")
    if ([string]::IsNullOrWhiteSpace($safeLabel)) {
        $safeLabel = "test"
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dbPath = Join-Path $runtimeDir "$safeLabel-$timestamp.sqlite3"
    $dbPathNormalizado = $dbPath.Replace("\", "/")
    return "sqlite:///$dbPathNormalizado"
}

function Start-LocalTestServer {
    param(
        [int]$Port = 0,
        [string]$DatabaseUrl = "",
        [string]$SeedDevBootstrap = "1"
    )

    $root = Resolve-ProjectRoot
    $pythonExe = Resolve-PythonExecutable
    $portFinal = if ($Port -gt 0) { $Port } else { Get-FreeTcpPort }
    $baseUrl = "http://127.0.0.1:$portFinal"
    $dbFinal = if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { New-TestDatabaseUrl -Label "server" } else { $DatabaseUrl }

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $pythonExe
    $psi.WorkingDirectory = $root
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.ArgumentList.Add("-m") | Out-Null
    $psi.ArgumentList.Add("uvicorn") | Out-Null
    $psi.ArgumentList.Add("main:app") | Out-Null
    $psi.ArgumentList.Add("--host") | Out-Null
    $psi.ArgumentList.Add("127.0.0.1") | Out-Null
    $psi.ArgumentList.Add("--port") | Out-Null
    $psi.ArgumentList.Add([string]$portFinal) | Out-Null
    $psi.ArgumentList.Add("--log-level") | Out-Null
    $psi.ArgumentList.Add("warning") | Out-Null
    $psi.Environment["AMBIENTE"] = "dev"
    $psi.Environment["PYTHONUNBUFFERED"] = "1"
    $psi.Environment["SEED_DEV_BOOTSTRAP"] = $SeedDevBootstrap
    $psi.Environment["DATABASE_URL"] = $dbFinal
    if ($env:SCHEMATHESIS_TEST_HINTS) {
        $psi.Environment["SCHEMATHESIS_TEST_HINTS"] = $env:SCHEMATHESIS_TEST_HINTS
    }

    $process = [System.Diagnostics.Process]::Start($psi)

    try {
        Wait-HealthEndpoint -BaseUrl $baseUrl -TimeoutSeconds 90
    }
    catch {
        if ($process -and -not $process.HasExited) {
            $process.Kill($true)
        }
        throw
    }

    return [pscustomobject]@{
        Process = $process
        BaseUrl = $baseUrl
        Port = $portFinal
        DatabaseUrl = $dbFinal
    }
}

function Stop-LocalTestServer {
    param(
        [Parameter(Mandatory = $true)]
        $Server
    )

    if ($null -eq $Server.Process) {
        return
    }

    if (-not $Server.Process.HasExited) {
        $Server.Process.Kill($true)
        $Server.Process.WaitForExit(10000) | Out-Null
    }
}

function Get-HiddenInputValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Html,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $pattern = 'name="' + [Regex]::Escape($Name) + '"\s+value="([^"]+)"'
    $match = [Regex]::Match($Html, $pattern)
    if (-not $match.Success) {
        throw "Campo oculto '$Name' não encontrado."
    }

    return $match.Groups[1].Value
}

function Get-MetaContentValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Html,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $pattern = '<meta\s+name="' + [Regex]::Escape($Name) + '"\s+content="([^"]*)"'
    $match = [Regex]::Match($Html, $pattern)
    if (-not $match.Success) {
        throw "Meta '$Name' não encontrada."
    }

    return $match.Groups[1].Value
}

function Get-CookieHeaderFromSession {
    param(
        [Parameter(Mandatory = $true)]
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )

    $uri = [Uri]$BaseUrl
    $cookies = $Session.Cookies.GetCookies($uri)
    $pairs = @()
    foreach ($cookie in $cookies) {
        $pairs += "$($cookie.Name)=$($cookie.Value)"
    }
    return ($pairs -join "; ")
}

function Get-PortalAuthHeaders {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl,
        [Parameter(Mandatory = $true)]
        [ValidateSet("inspetor", "revisor", "cliente", "admin")]
        [string]$Portal,
        [Parameter(Mandatory = $true)]
        [string]$Email,
        [Parameter(Mandatory = $true)]
        [string]$Senha
    )

    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()

    switch ($Portal) {
        "inspetor" {
            $loginPath = "/app/login"
            $landingPath = "/app/"
        }
        "revisor" {
            $loginPath = "/revisao/login"
            $landingPath = "/revisao/painel"
        }
        "admin" {
            $loginPath = "/admin/login"
            $landingPath = "/admin/painel"
        }
        "cliente" {
            $loginPath = "/cliente/login"
            $landingPath = "/cliente/painel"
        }
    }

    $loginPage = Invoke-WebRequest -Uri ($BaseUrl + $loginPath) -WebSession $session -TimeoutSec 15
    $csrfToken = Get-HiddenInputValue -Html $loginPage.Content -Name "csrf_token"

    $null = Invoke-WebRequest `
        -Uri ($BaseUrl + $loginPath) `
        -Method Post `
        -WebSession $session `
        -Body @{
            csrf_token = $csrfToken
            email = $Email
            senha = $Senha
        } `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 15

    $landingPage = Invoke-WebRequest -Uri ($BaseUrl + $landingPath) -WebSession $session -TimeoutSec 15
    $headerCsrf = Get-MetaContentValue -Html $landingPage.Content -Name "csrf-token"
    $cookieHeader = Get-CookieHeaderFromSession -Session $session -BaseUrl $BaseUrl

    return [pscustomobject]@{
        Cookie = $cookieHeader
        CsrfToken = $headerCsrf
        Session = $session
        LandingHtml = $landingPage.Content
    }
}
