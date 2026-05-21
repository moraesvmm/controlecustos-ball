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

REM Tenta encontrar Python (comum em PCs corporativos)
set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY where python3 >nul 2>&1 && set PY=python3

if not defined PY (
  echo  [ERRO] Python nao encontrado.
  echo.
  echo  Instale Python 3 em: https://www.python.org/downloads/
  echo  Marque a opcao "Add python.exe to PATH" na instalacao.
  echo.
  pause
  exit /b 1
)

echo  Python: %PY%
echo  Abrindo navegador em http://localhost:8080
echo.
echo  Para outras pessoas na rede usarem ESTE PC como servidor,
echo  execute INICIAR-SERVIDOR-REDE.bat
echo.
echo  Para parar o servidor: feche esta janela ou pressione Ctrl+C
echo  ========================================
echo.

start "" "http://localhost:8080"
%PY% -m http.server 8080

pause
