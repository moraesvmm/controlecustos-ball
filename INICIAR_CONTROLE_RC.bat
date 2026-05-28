@echo off
title Servidor Controle RC
setlocal

set "PROJECT_ROOT=%~dp0"
set "PORT=8000"
set "PID_FILE=%PROJECT_ROOT%\.server_pid"

cd /d "%PROJECT_ROOT%"

echo ========================================================
echo INICIANDO O SISTEMA CONTROLE RC (MOTOR NATIVO Windows)
echo ========================================================
echo.
echo O sistema esta ligando...
echo O navegador vai abrir sozinho agora...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PROJECT_ROOT%\servidor.ps1','-Porta','%PORT%' -WorkingDirectory '%PROJECT_ROOT%' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id"

if errorlevel 1 (
    echo ERRO CRITICO: Nao foi possivel iniciar o servidor PowerShell.
    pause
    exit /b 1
)

timeout /t 2 /nobreak >nul
start http://localhost:%PORT%/?login=force

echo O servidor esta rodando em segundo plano.
echo Para desligar o sistema, feche esta janela.
pause >nul

if exist "%PID_FILE%" (
    for /f "usebackq delims=" %%P in ("%PID_FILE%") do set "SERVER_PID=%%P"
    if defined SERVER_PID taskkill /f /pid %SERVER_PID% >nul 2>&1
    del /f /q "%PID_FILE%" >nul 2>&1
)
exit
