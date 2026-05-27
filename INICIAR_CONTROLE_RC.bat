@echo off
title Controle RC
setlocal

set "PROJECT_ROOT=%~dp0"
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "PYTHON_EXE=%PROJECT_ROOT%\.python_local\tools\python.exe"
set "INSTALLER=%PROJECT_ROOT%\Inicializadores\1_Instalar_Requisitos.bat"
set "STARTER=%PROJECT_ROOT%\Inicializadores\2_Iniciar_Sistema.bat"

cd /d "%PROJECT_ROOT%"

echo ========================================================
echo CONTROLE RC
echo ========================================================
echo.

if not exist "%STARTER%" (
    echo ERRO: arquivo de inicializacao nao encontrado.
    echo Esperado: %STARTER%
    echo.
    pause
    exit /b 1
)

if not exist "%PYTHON_EXE%" (
    echo Preparando arquivos locais pela primeira vez...
    echo.
    call "%INSTALLER%"
    if errorlevel 1 (
        echo.
        echo Nao foi possivel preparar o ambiente local.
        pause
        exit /b 1
    )
)

call "%STARTER%"
exit /b %errorlevel%
