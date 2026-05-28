@echo off
title Servidor Controle RC
setlocal

set "PROJECT_ROOT=%~dp0"
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "PORT=8000"

pushd "%PROJECT_ROOT%"

echo ========================================================
echo INICIANDO O SISTEMA CONTROLE RC (MOTOR NATIVO Windows)
echo ========================================================
echo.
echo O sistema esta ligando...
echo O navegador vai abrir sozinho agora...
echo.

start http://localhost:%PORT%/?login=force

powershell -NoProfile -ExecutionPolicy Bypass -File "servidor.ps1" -Porta "%PORT%"

if errorlevel 1 (
    echo ERRO CRITICO: Nao foi possivel iniciar o servidor PowerShell.
    pause
    exit /b 1
)

popd
exit
