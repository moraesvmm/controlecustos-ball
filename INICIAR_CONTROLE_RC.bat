@echo off
title Servidor Controle RC
setlocal

set "PORT=8000"

:: pushd no caminho UNC cria uma letra de disco temporaria (ex: Z:\)
:: Isso evita o problema de caracteres especiais (como o 'a' de Manutencao) na linha de comando
pushd "%~dp0"

echo ========================================================
echo INICIANDO O SISTEMA CONTROLE RC (MOTOR NATIVO Windows)
echo ========================================================
echo.
echo O sistema esta ligando na porta %PORT% (Modo: Localhost)...
echo Aguarde 2 segundos, o navegador vai abrir sozinho...
echo.

:: Usa o caminho atual (letra de disco ex: Z:\) - sem passar parametro -Pasta para evitar corrupcao de caracteres
start /B powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Get-Content 'servidor.ps1' -Raw))) -Porta %PORT%"

:: Espera o servidor subir e abre o navegador
timeout /t 2 /nobreak >nul
start http://localhost:%PORT%/?login=force

echo ========================================================
echo SERVIDOR ONLINE. PODE USAR O SISTEMA!
echo Para desligar, basta fechar esta janela no "X".
echo ========================================================
pause >nul

:: Remove a letra de disco temporaria ao fechar
popd
