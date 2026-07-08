@echo off
title Sistema de Controle de Custos Ball
color 0A

echo ============================================================
echo   Iniciando o Sistema...
echo ============================================================
echo.

:: Chama o script do servidor que esta organizado na pasta backend
call "%~dp0backend\Iniciar_Servidor.bat"

echo.
echo [DEBUG] Fim do script 01. Se voce esta vendo isso, a janela nao fechou sozinha.
pause
