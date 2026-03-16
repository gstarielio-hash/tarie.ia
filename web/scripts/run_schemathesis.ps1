param(
    [ValidateSet("publico", "inspetor", "revisor", "cliente", "admin")]
    [string]$Portal = "inspetor",
    [string]$BaseUrl = "",
    [string]$Workers = "1",
    [int]$MaxExamples = 8,
    [string]$IncludePathRegex = "",
    [switch]$ContinueOnFailure
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

. (Join-Path $PSScriptRoot "test_common.ps1")

$root = Resolve-ProjectRoot
$schemathesisExe = Resolve-VenvExecutable -Name "schemathesis.exe"
$pythonExe = Resolve-PythonExecutable
$outputDir = Ensure-Directory (Join-Path $root ".test-artifacts\schemathesis")
$hooksPath = Join-Path $root "scripts\schemathesis_hooks.py"

$server = $null
$pythonUtf8Anterior = $env:PYTHONUTF8
$pythonIoAnterior = $env:PYTHONIOENCODING
$schemathesisHintsAnterior = $env:SCHEMATHESIS_TEST_HINTS
$schemathesisHooksAnterior = $env:SCHEMATHESIS_HOOKS
try {
    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $env:SCHEMATHESIS_HOOKS = $hooksPath

    if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
        $env:SCHEMATHESIS_TEST_HINTS = "1"
        $server = Start-LocalTestServer -SeedDevBootstrap "1"
        $BaseUrl = $server.BaseUrl
    }

    $headers = @()
    switch ($Portal) {
        "publico" {
            if ([string]::IsNullOrWhiteSpace($IncludePathRegex)) {
                $IncludePathRegex = "^/(health|ready)$"
            }
        }
        "inspetor" {
            if ([string]::IsNullOrWhiteSpace($IncludePathRegex)) {
                $IncludePathRegex = "^/app/api/(perfil($|/foto$)|laudo/status$|laudo/iniciar$|laudo/cancelar$|laudo/desativar$)$"
            }
            if ($server) {
                & $pythonExe (Join-Path $root "scripts\seed_schemathesis_data.py") `
                    --database-url $server.DatabaseUrl `
                    --inspetor-email ($env:SCHEMA_INSPETOR_EMAIL ?? "inspetor@tariel.ia") `
                    --revisor-email ($env:SCHEMA_REVISOR_EMAIL ?? "revisor@tariel.ia")
            }
            $auth = Get-PortalAuthHeaders `
                -BaseUrl $BaseUrl `
                -Portal "inspetor" `
                -Email ($env:SCHEMA_INSPETOR_EMAIL ?? "inspetor@tariel.ia") `
                -Senha ($env:SCHEMA_INSPETOR_SENHA ?? "Dev@123456")
            $headers += @("-H", "Cookie:$($auth.Cookie)")
            $headers += @("-H", "X-CSRF-Token:$($auth.CsrfToken)")
        }
        "revisor" {
            if ([string]::IsNullOrWhiteSpace($IncludePathRegex)) {
                $IncludePathRegex = "revisao/api/laudo/.+/(completo|mensagens|pacote)$"
            }
            if ($server) {
                & $pythonExe (Join-Path $root "scripts\seed_schemathesis_data.py") `
                    --database-url $server.DatabaseUrl `
                    --inspetor-email ($env:SCHEMA_INSPETOR_EMAIL ?? "inspetor@tariel.ia") `
                    --revisor-email ($env:SCHEMA_REVISOR_EMAIL ?? "revisor@tariel.ia")
            }
            $auth = Get-PortalAuthHeaders `
                -BaseUrl $BaseUrl `
                -Portal "revisor" `
                -Email ($env:SCHEMA_REVISOR_EMAIL ?? "revisor@tariel.ia") `
                -Senha ($env:SCHEMA_REVISOR_SENHA ?? "Dev@123456")
            $headers += @("-H", "Cookie:$($auth.Cookie)")
            $headers += @("-H", "X-CSRF-Token:$($auth.CsrfToken)")
        }
        "admin" {
            if ([string]::IsNullOrWhiteSpace($IncludePathRegex)) {
                $IncludePathRegex = "^/admin/api/"
            }
            $auth = Get-PortalAuthHeaders `
                -BaseUrl $BaseUrl `
                -Portal "admin" `
                -Email ($env:SCHEMA_ADMIN_EMAIL ?? "admin@tariel.ia") `
                -Senha ($env:SCHEMA_ADMIN_SENHA ?? "Dev@123456")
            $headers += @("-H", "Cookie:$($auth.Cookie)")
            $headers += @("-H", "X-CSRF-Token:$($auth.CsrfToken)")
        }
        "cliente" {
            if ([string]::IsNullOrWhiteSpace($IncludePathRegex)) {
                $IncludePathRegex = "^/cliente/api/"
            }
            if ($server) {
                & $pythonExe (Join-Path $root "scripts\seed_schemathesis_data.py") `
                    --database-url $server.DatabaseUrl `
                    --inspetor-email ($env:SCHEMA_INSPETOR_EMAIL ?? "inspetor@tariel.ia") `
                    --revisor-email ($env:SCHEMA_REVISOR_EMAIL ?? "revisor@tariel.ia")
            }
            $auth = Get-PortalAuthHeaders `
                -BaseUrl $BaseUrl `
                -Portal "cliente" `
                -Email ($env:SCHEMA_CLIENTE_EMAIL ?? "cliente@tariel.ia") `
                -Senha ($env:SCHEMA_CLIENTE_SENHA ?? "Dev@123456")
            $headers += @("-H", "Cookie:$($auth.Cookie)")
            $headers += @("-H", "X-CSRF-Token:$($auth.CsrfToken)")
        }
    }

    $args = @(
        "run",
        "$BaseUrl/openapi.json",
        "--url", $BaseUrl,
        "--no-color",
        "--wait-for-schema", "30",
        "--workers", $Workers,
        "--phases", "examples,coverage",
        "--checks", "all",
        "--max-examples", [string]$MaxExamples,
        "--generation-deterministic",
        "--report", "junit,har",
        "--report-dir", $outputDir,
        "--include-path-regex", $IncludePathRegex
    )

    if ($ContinueOnFailure) {
        $args += "--continue-on-failure"
    }

    $args += $headers

    & $schemathesisExe @args
}
finally {
    $env:PYTHONUTF8 = $pythonUtf8Anterior
    $env:PYTHONIOENCODING = $pythonIoAnterior
    $env:SCHEMATHESIS_TEST_HINTS = $schemathesisHintsAnterior
    $env:SCHEMATHESIS_HOOKS = $schemathesisHooksAnterior

    if ($server) {
        Stop-LocalTestServer -Server $server
    }
}
