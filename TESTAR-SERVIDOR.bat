@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Controle RC - Diagnostico

echo.
echo === DIAGNOSTICO CONTROLE RC ===
echo.
echo Pasta do projeto:
echo   %CD%
echo.

if not exist "index.html" (
  echo [ERRO] index.html nao encontrado nesta pasta.
  echo Execute o .bat dentro da pasta controle-rcs-main extraida do ZIP.
  goto :fim
)
echo [OK] index.html encontrado

if not exist "js\env.runtime.js" (
  echo [AVISO] js\env.runtime.js nao encontrado
) else (
  echo [OK] js\env.runtime.js encontrado
)

echo.
echo --- Python ---
set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (
  echo [ERRO] Python NAO instalado - servidor nao vai subir
  goto :fim
)
echo [OK] Python: %PY%
%PY% --version

echo.
echo --- Porta 8080 ---
netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo [OK] Porta 8080 livre
) else (
  echo [AVISO] Porta 8080 ja em uso - o INICIAR-SERVIDOR usara 8081
)

echo.
echo --- Teste rapido do servidor (5 segundos) ---
start /b %PY% -m http.server 8099
timeout /t 2 /nobreak >nul
%PY% -c "import urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8099/', timeout=3); print('[OK] Servidor respondeu status', r.status)" 2>nul
if errorlevel 1 echo [ERRO] Servidor nao respondeu - Python pode estar bloqueado pela politica do TI
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im py.exe >nul 2>&1

:fim
echo.
echo ========================================
pause
