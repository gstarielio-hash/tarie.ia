param(
    [string]$Path = "tests",
    [string]$Workers = "auto",
    [switch]$RandomOrder,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

. (Join-Path $PSScriptRoot "test_common.ps1")

$pythonExe = Resolve-PythonExecutable
$args = @("-m", "pytest", $Path, "-q", "-n", $Workers)

if (-not $RandomOrder) {
    $args += @("-p", "no:randomly")
}

if ($PytestArgs) {
    $args += $PytestArgs
}

& $pythonExe @args
