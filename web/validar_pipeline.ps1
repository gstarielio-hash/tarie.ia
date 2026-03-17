$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$EXCLUDE_PATTERN = '[\\/](venv|\.venv|node_modules|\.git|dist|build|\.mypy_cache|\.pytest_cache|\.ruff_cache|__pycache__)([\\/]|$)'
$ROOT = (Get-Location).Path

function Resolve-PythonExecutable() {
    $localDotVenv = Join-Path $ROOT ".venv\Scripts\python.exe"
    $localVenv = Join-Path $ROOT "venv\Scripts\python.exe"

    if (Test-Path $localDotVenv) { return $localDotVenv }
    if (Test-Path $localVenv) { return $localVenv }
    return "python"
}

function Get-ProjectFiles([string[]]$extensions) {
    Get-ChildItem -Path $ROOT -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $extOk = $extensions -contains $_.Extension.ToLowerInvariant()
            $pathOk = $_.FullName -notmatch $EXCLUDE_PATTERN
            $extOk -and $pathOk
        }
}

function Invoke-Step([scriptblock]$command) {
    & $command
    if ($LASTEXITCODE -ne 0) {
        throw "Falha no comando nativo (exit code $LASTEXITCODE)."
    }
}

$PYTHON_EXE = Resolve-PythonExecutable
Write-Host "Python em uso: $PYTHON_EXE"

function Get-RelativeDirectory([string]$fullName) {
    $dir = Split-Path -Parent $fullName
    $relative = $dir.Substring($ROOT.Length).TrimStart('\')
    if ([string]::IsNullOrWhiteSpace($relative)) { return "." }
    return $relative
}

$codeFiles = Get-ProjectFiles @(".py", ".js", ".html", ".css", ".json")
$scannedDirs = $codeFiles | ForEach-Object { Get-RelativeDirectory $_.FullName } | Sort-Object -Unique

Write-Host "Pastas analisadas (recursivo):"
$scannedDirs | ForEach-Object { Write-Host " - $_" }

Write-Host ""
Write-Host "1/9 format (python)"
Invoke-Step { & $PYTHON_EXE -m ruff format . }

Write-Host "2/9 lint (python)"
Invoke-Step { & $PYTHON_EXE -m ruff check . }

Write-Host "3/9 arquitetura (chat compat/imports)"
Invoke-Step { & $PYTHON_EXE scripts/check_chat_architecture.py }

Write-Host "4/9 type-check (python)"
Invoke-Step { & $PYTHON_EXE -m mypy }

Write-Host "5/9 test (python)"
Invoke-Step { & $PYTHON_EXE -m pytest -q }

Write-Host "6/9 build (python compileall recursivo)"
Invoke-Step { & $PYTHON_EXE -m compileall -q -x $EXCLUDE_PATTERN . }

$jsFiles = Get-ProjectFiles @(".js")
if ($jsFiles.Count -gt 0) {
    Write-Host "7/9 sintaxe JS (node --check)"
    foreach ($jsFile in $jsFiles) {
        Invoke-Step { node --check $jsFile.FullName | Out-Null }
    }
} else {
    Write-Host "7/9 sintaxe JS (sem arquivos .js para validar)"
}

$templateRoot = Join-Path $ROOT "templates"
if (Test-Path $templateRoot) {
    Write-Host "8/9 sintaxe templates Jinja2"
    Invoke-Step {
        & $PYTHON_EXE -c "from pathlib import Path; import sys; from jinja2 import Environment, FileSystemLoader; root = Path(sys.argv[1]); env = Environment(loader=FileSystemLoader(str(root))); files = sorted(root.rglob('*.html')); [env.parse(f.read_text(encoding='utf-8')) for f in files]; print(f'TEMPLATES_OK={len(files)}')" $templateRoot
    }
} else {
    Write-Host "8/9 sintaxe templates Jinja2 (pasta templates nao encontrada)"
}

$jsonFiles = Get-ProjectFiles @(".json")
if ($jsonFiles.Count -gt 0) {
    Write-Host "9/9 sintaxe JSON"
    foreach ($jsonFile in $jsonFiles) {
        Invoke-Step { & $PYTHON_EXE -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" $jsonFile.FullName | Out-Null }
    }
} else {
    Write-Host "9/9 sintaxe JSON (sem arquivos .json para validar)"
}

Write-Host ""
Write-Host "Resumo:"
Write-Host " - Arquivos de codigo analisados: $($codeFiles.Count)"
Write-Host " - Pastas analisadas: $($scannedDirs.Count)"
Write-Host "Pipeline concluida com sucesso."
