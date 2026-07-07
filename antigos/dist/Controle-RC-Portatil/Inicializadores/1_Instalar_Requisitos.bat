@echo off
title Instalador Controle RC
echo ========================================================
echo INSTALADOR PORTATIL DO CONTROLE RC
echo ========================================================
echo.
echo Este script vai baixar os motores necessarios para o 
echo sistema rodar sem precisar de TI ou Permissao de Admin.
echo Nenhuma instalacao global no Windows sera feita!
echo.
echo Por favor, aguarde... (Isso pode levar de 1 a 3 minutos)
echo.

set "PROJECT_ROOT=%~dp0.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "LOCAL_RUNTIME_ZIP=%PROJECT_ROOT%\runtime\python_env.zip"
set "TEMP_RUNTIME_ZIP=%PROJECT_ROOT%\python_env.zip"
cd /d "%PROJECT_ROOT%"

if exist "%PROJECT_ROOT%\.python_local\tools\python.exe" (
    echo O sistema ja esta instalado! Voce ja pode fechar esta janela e rodar o 2_Iniciar_Sistema.bat.
    pause
    exit
)

if exist "%LOCAL_RUNTIME_ZIP%" (
    echo [1/3] Encontrado pacote local do Python em:
    echo        %LOCAL_RUNTIME_ZIP%
) else (
    echo [1/3] Baixando ambiente de execucao seguro da Microsoft/Python...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://www.nuget.org/api/v2/package/python/3.12.8' -OutFile '%TEMP_RUNTIME_ZIP%'"
    if errorlevel 1 goto :download_error
)

echo [2/3] Extraindo arquivos locais para a pasta do projeto...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$zipPath = if (Test-Path '%LOCAL_RUNTIME_ZIP%') { '%LOCAL_RUNTIME_ZIP%' } else { '%TEMP_RUNTIME_ZIP%' }; Expand-Archive -Path $zipPath -DestinationPath '%PROJECT_ROOT%\.python_local' -Force"
if errorlevel 1 goto :install_error

echo [3/3] Limpando arquivos temporarios...
if exist "%TEMP_RUNTIME_ZIP%" del /f /q "%TEMP_RUNTIME_ZIP%"

echo.
echo ========================================================
echo SUCESSO! O MOTOR DO SISTEMA FOI BAIXADO.
echo ========================================================
echo Agora voce ja pode fechar esta janela e rodar o arquivo
echo "2_Iniciar_Sistema.bat" toda vez que for usar o sistema!
echo.
pause
exit

:download_error
echo.
echo ========================================================
echo FALHA NO DOWNLOAD
echo ========================================================
echo Nao foi possivel baixar o Python pela internet.
echo.
echo Para PCs corporativos, distribua um arquivo local em:
echo %LOCAL_RUNTIME_ZIP%
echo.
echo Alternativas:
echo 1. Copiar a pasta ".python_local" pronta de outro PC.
echo 2. Colocar o arquivo "python_env.zip" dentro da pasta "runtime".
echo 3. Usar o 2_Iniciar_Sistema.bat, que tambem tenta iniciar via PowerShell nativo.
echo.
pause
exit /b 1

:install_error
echo.
echo ========================================================
echo FALHA NA INSTALACAO
echo ========================================================
echo Pasta do projeto: %PROJECT_ROOT%
echo Verifique se o ZIP do Python esta valido e se a pasta permite escrita.
echo.
pause
exit /b 1
