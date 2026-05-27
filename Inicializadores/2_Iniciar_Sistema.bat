@echo off
title Servidor Controle RC
echo ========================================================
echo INICIANDO O SISTEMA CONTROLE RC
echo ========================================================
echo.

set "PROJECT_ROOT=%~dp0.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "PORT=8000"
set "PID_FILE=%PROJECT_ROOT%\.server_pid"
cd /d "%PROJECT_ROOT%"

echo O sistema esta rodando localmente de forma portatil!
echo Nao feche esta janela preta enquanto estiver usando.
echo O navegador vai abrir sozinho agora...
echo.

set "PYTHON_EXE="
if exist "%PROJECT_ROOT%\.python_local\tools\python.exe" set "PYTHON_EXE=%PROJECT_ROOT%\.python_local\tools\python.exe"
if exist "%PROJECT_ROOT%\.python_local\python.exe" set "PYTHON_EXE=%PROJECT_ROOT%\.python_local\python.exe"

if defined PYTHON_EXE (
    echo [1/3] Tentando iniciar com Python portatil...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { $p = Start-Process -FilePath '%PYTHON_EXE%' -ArgumentList '-m','http.server','%PORT%','--bind','0.0.0.0' -WorkingDirectory '%PROJECT_ROOT%' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id; exit 0 } catch { exit 1 }"
    if errorlevel 1 (
        echo [AVISO] Python portatil nao iniciou. Tentando PowerShell nativo...
        goto :start_powershell
    )
) else (
    echo [AVISO] Python portatil nao encontrado. Tentando PowerShell nativo...
    goto :start_powershell
)

goto :wait_and_open

:start_powershell
echo [1/3] Iniciando com PowerShell nativo do Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PROJECT_ROOT%\servidor.ps1','-Porta','%PORT%' -WorkingDirectory '%PROJECT_ROOT%' -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id"
if errorlevel 1 (
    echo ERRO CRITICO: Nao foi possivel iniciar nem com Python portatil nem com PowerShell.
    echo Se o PC for corporativo, envie a pasta pronta com ".python_local" ou use um PC servidor na rede.
    pause
    exit /b 1
)

:wait_and_open
echo [2/3] Aguardando o servidor subir...
timeout /t 2 /nobreak >nul

:: Abre o navegador no localhost
echo [3/3] Abrindo navegador...
start http://localhost:%PORT%/?login=force

echo Pressione qualquer tecla para encerrar o sistema.
pause >nul

if exist "%PID_FILE%" (
    for /f "usebackq delims=" %%P in ("%PID_FILE%") do set "SERVER_PID=%%P"
    if defined SERVER_PID taskkill /f /pid %SERVER_PID% >nul 2>&1
    del /f /q "%PID_FILE%" >nul 2>&1
)

exit
