@echo off
setlocal

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "venv\Scripts\python.exe" set "PYTHON_EXE=venv\Scripts\python.exe"

if not defined PYTHON_EXE (
    echo [ERRO] Nao encontrei interpretador Python em .venv\Scripts ou venv\Scripts.
    echo Crie o ambiente virtual antes: python -m venv .venv
    pause
    exit /b 1
)

set "APP_PORTA=8000"
if not "%PORTA%"=="" set "APP_PORTA=%PORTA%"

set "APP_HOST=0.0.0.0"
if not "%HOST_BIND%"=="" set "APP_HOST=%HOST_BIND%"

"%PYTHON_EXE%" -m uvicorn main:app --host %APP_HOST% --port %APP_PORTA% --reload
