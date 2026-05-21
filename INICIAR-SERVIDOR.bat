@echo off
chcp 65001 >nul
title Controle RC - Servidor local (porta 8080)
cd /d "%~dp0"

echo.
echo  ========================================
echo   CONTROLE RC - Servidor local
echo  ========================================
echo.
echo  Pasta: %CD%
echo.

set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY where python3 >nul 2>&1 && set PY=python3

if not defined PY (
  echo  [ERRO] Python nao encontrado neste PC.
  echo.
  echo  Solucoes:
  echo   1) Pecao ao TI instalar Python 3
  echo   2) Use outro PC como servidor ^(INICIAR-SERVIDOR-REDE.bat^)
  echo   3) Leia: PC-CORPORATIVO-BLOQUEIOS.md
  echo.
  pause
  exit /b 1
)

set PORTA=8080
netstat -ano | findstr ":%PORTA% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  [AVISO] Porta %PORTA% ja em uso. Tentando porta 8081...
  set PORTA=8081
)

echo  Python: %PY%
echo  Iniciando servidor na porta %PORTA%...
echo.

REM Servidor em OUTRA janela (nao fecha ao abrir o navegador)
start "Controle RC - Servidor" cmd /k "%PY% -m http.server %PORTA%"

REM Aguarda o servidor subir ANTES de abrir o navegador
echo  Aguardando servidor...
timeout /t 3 /nobreak >nul

start "" "http://localhost:%PORTA%/"

echo.
echo  ========================================
echo  Navegador aberto: http://localhost:%PORTA%/
echo.
echo  IMPORTANTE:
echo   - Deixe a janela "Controle RC - Servidor" ABERTA
echo   - Se a pagina nao carregar, espere 5s e atualize ^(F5^)
echo   - Para parar: feche a janela do servidor ou Ctrl+C nela
echo  ========================================
echo.
pause
