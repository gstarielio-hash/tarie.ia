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
$outputDir = Ensure-Directory (Join-Path $root ".test-artifacts\reports")
$allureDir = Ensure-Directory (Join-Path $outputDir "allure-results")
$htmlReport = Join-Path $outputDir "pytest-report.html"
$junitReport = Join-Path $outputDir "pytest-junit.xml"

$args = @(
    "-m", "pytest", $Path, "-q",
    "--html=$htmlReport",
    "--self-contained-html",
    "--junitxml=$junitReport",
    "--alluredir=$allureDir"
)

if (-not $RandomOrder) {
    $args += @("-p", "no:randomly")
}

if ($PytestArgs) {
    $args += $PytestArgs
}

& $pythonExe @args
