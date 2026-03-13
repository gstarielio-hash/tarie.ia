param(
    [string]$Path = "tests",
    [switch]$RandomOrder,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

. (Join-Path $PSScriptRoot "test_common.ps1")

$root = Resolve-ProjectRoot
$pythonExe = Resolve-PythonExecutable
$outputDir = Ensure-Directory (Join-Path $root ".test-artifacts\coverage")
$htmlDir = Join-Path $outputDir "html"

$args = @(
    "-m", "pytest", $Path, "-q",
    "--cov=app",
    "--cov=main",
    "--cov=nucleo",
    "--cov-report=term-missing",
    "--cov-report=html:$htmlDir",
    "--cov-report=xml:$outputDir\coverage.xml"
)

if (-not $RandomOrder) {
    $args += @("-p", "no:randomly")
}

if ($PytestArgs) {
    $args += $PytestArgs
}

& $pythonExe @args
