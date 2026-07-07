@echo off
title Sistema de Controle de Custos Ball
color 0A

echo ============================================================
echo   Iniciando o Sistema...
echo ============================================================
echo.

:: Chama o script do servidor que esta organizado na pasta backend
call "%~dp0backend\Iniciar_Servidor.bat"
