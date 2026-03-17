param(
    [string]$BaseUrl = "",
    [int]$Users = 6,
    [int]$SpawnRate = 2,
    [string]$RunTime = "45s"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

. (Join-Path $PSScriptRoot "test_common.ps1")

$root = Resolve-ProjectRoot
$locustExe = Resolve-VenvExecutable -Name "locust.exe"
$outputDir = Ensure-Directory (Join-Path $root ".test-artifacts\locust")
$reportBase = Join-Path $outputDir "locust-report"

$server = $null
try {
    if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
        $server = Start-LocalTestServer -SeedDevBootstrap "1"
        $BaseUrl = $server.BaseUrl
    }

    $env:LOCUST_INSPETOR_EMAIL = $env:LOCUST_INSPETOR_EMAIL ?? "inspetor@tariel.ia"
    $env:LOCUST_INSPETOR_SENHA = $env:LOCUST_INSPETOR_SENHA ?? "Dev@123456"
    $env:LOCUST_REVISOR_EMAIL = $env:LOCUST_REVISOR_EMAIL ?? "revisor@tariel.ia"
    $env:LOCUST_REVISOR_SENHA = $env:LOCUST_REVISOR_SENHA ?? "Dev@123456"

    & $locustExe `
        -f (Join-Path $root "tests\load\locustfile.py") `
        --host $BaseUrl `
        --headless `
        --users $Users `
        --spawn-rate $SpawnRate `
        --run-time $RunTime `
        --html "$reportBase.html" `
        --csv $reportBase
}
finally {
    if ($server) {
        Stop-LocalTestServer -Server $server
    }
}
