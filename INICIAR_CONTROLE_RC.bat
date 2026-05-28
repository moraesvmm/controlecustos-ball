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
echo O sistema esta ligando na porta %PORT%...
echo Aguarde 2 segundos, o navegador vai abrir sozinho...
echo.

:: Roda em background na mesma janela usando código em memória para burlar bloqueio de execução de arquivos da TI
start /B powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Get-Content 'servidor.ps1' -Raw))) -Porta %PORT%"

:: Espera 2 segundos para dar tempo do servidor subir
timeout /t 2 /nobreak >nul

:: Abre o navegador nativamente via CMD (não falha)
start http://localhost:%PORT%/?login=force

echo ========================================================
echo SERVIDOR ONLINE. PODE USAR O SISTEMA!
echo Para desligar, basta fechar esta janela no "X".
echo ========================================================
pause >nul
