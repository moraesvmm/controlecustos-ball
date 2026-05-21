@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Controle RC - Servidor (PowerShell, sem Python)

echo.
echo  Iniciando servidor SEM Python...
echo  Pasta: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Porta 8080

pause
