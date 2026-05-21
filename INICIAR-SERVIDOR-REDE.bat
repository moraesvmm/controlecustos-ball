@echo off
chcp 65001 >nul
title Controle RC - Servidor na rede (porta 8080)
cd /d "%~dp0"

echo.
echo  ========================================
echo   CONTROLE RC - Acesso na rede local
echo  ========================================
echo.

set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY where python3 >nul 2>&1 && set PY=python3

if not defined PY (
  echo  [ERRO] Python nao encontrado.
  pause
  exit /b 1
)

set PORTA=8080
netstat -ano | findstr ":%PORTA% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 set PORTA=8081

echo  Obtendo IP desta maquina...
set IP=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%a"
  goto :found
)
:found
set IP=%IP: =%

echo.
echo  Servidor na porta %PORTA%
echo  Este PC:     http://localhost:%PORTA%/
echo  Outros PCs:  http://%IP%:%PORTA%/
echo.

start "Controle RC - Servidor Rede" cmd /k "%PY% -m http.server %PORTA% --bind 0.0.0.0"

timeout /t 3 /nobreak >nul
start "" "http://localhost:%PORTA%/"

echo  Deixe a janela do servidor aberta.
echo  Firewall: libere TCP %PORTA% se outros PCs nao conectarem.
echo.
pause
