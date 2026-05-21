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
  echo  [ERRO] Python nao encontrado. Instale Python 3 com PATH.
  pause
  exit /b 1
)

echo  Obtendo IP desta maquina...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :found
)
:found
set IP=%IP: =%

echo.
echo  Outros PCs da rede devem abrir no navegador:
echo.
echo      http://%IP%:8080
echo.
echo  Se nao abrir, libere a porta 8080 no firewall do Windows
echo  (veja COMANDOS-DISTRIBUICAO-LOCAL.md)
echo.
echo  Este PC tambem: http://localhost:8080
echo  Para parar: Ctrl+C ou feche esta janela
echo  ========================================
echo.

start "" "http://localhost:8080"
%PY% -m http.server 8080 --bind 0.0.0.0

pause
