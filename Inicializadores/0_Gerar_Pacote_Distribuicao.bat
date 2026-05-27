@echo off
title Gerar Pacote de Distribuicao - Controle RC
setlocal

set "PROJECT_ROOT=%~dp0.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "DIST_DIR=%PROJECT_ROOT%\dist"
set "STAGE_DIR=%DIST_DIR%\Controle-RC-Portatil"
set "ZIP_FILE=%DIST_DIR%\Controle-RC-Portatil.zip"

cd /d "%PROJECT_ROOT%"

if not exist "%PROJECT_ROOT%\.python_local\tools\python.exe" (
    echo ERRO: a pasta ".python_local" nao foi encontrada.
    echo Rode primeiro o "1_Instalar_Requisitos.bat" neste PC para preparar o runtime portatil.
    pause
    exit /b 1
)

echo ========================================================
echo GERANDO PACOTE DE DISTRIBUICAO PORTATIL
echo ========================================================
echo Projeto: %PROJECT_ROOT%
echo Saida:   %ZIP_FILE%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$projectRoot = '%PROJECT_ROOT%';" ^
  "$distDir = '%DIST_DIR%';" ^
  "$stageDir = '%STAGE_DIR%';" ^
  "$zipFile = '%ZIP_FILE%';" ^
  "if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force };" ^
  "if (Test-Path $zipFile) { Remove-Item -LiteralPath $zipFile -Force };" ^
  "New-Item -ItemType Directory -Path $stageDir -Force | Out-Null;" ^
  "$excludeNames = @('.git','dist','node_modules','scratch_logs.txt','scratch_appjs_history.txt','scratch_renderFornecedores.txt');" ^
  "Get-ChildItem -LiteralPath $projectRoot -Force | Where-Object { $excludeNames -notcontains $_.Name } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stageDir -Recurse -Force };" ^
  "Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipFile -Force;"

if errorlevel 1 (
    echo.
    echo FALHA: nao foi possivel gerar o pacote de distribuicao.
    pause
    exit /b 1
)

echo.
echo Pacote criado com sucesso:
echo %ZIP_FILE%
echo.
echo Distribua esse ZIP para os outros PCs.
echo Depois de extrair, o usuario deve rodar:
echo INICIAR_CONTROLE_RC.bat
echo.
pause
exit /b 0
