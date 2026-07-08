@echo off
setlocal
title Sistema de Controle de Custos Ball — Servidor Local
color 0A

:: Caminho na maquina do usuario onde o Python sera instalado silenciosamente
set PY_DIR=%LOCALAPPDATA%\ControleRC_Python
set BACKEND_DIR=%~dp0

echo.
echo  ============================================================
echo    SISTEMA DE CONTROLE DE CUSTOS — BALL BEVERAGE BRASIL
echo    Versao Local — Servidor SQLite / Porta 8080
echo  ============================================================
echo.
echo  Verificando ambiente de execucao...
echo.

:: Verifica se o Python ja esta instalado na pasta local do usuario
if not exist "%PY_DIR%\python.exe" (
    echo  [INFO] Configurando ambiente Python pela primeira vez.
    echo  [INFO] Este processo e automatico e ocorre apenas no primeiro acesso.
    echo  [INFO] Por favor, aguarde...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%BACKEND_DIR%\install_env.ps1" || (
        color 0C
        echo.
        echo  [ERRO] Falha ao configurar o ambiente de execucao.
        echo  [ERRO] Contate o suporte tecnico.
        echo.
        pause
        exit /b 1
    )
) else (
    echo  [OK] Ambiente de execucao detectado.
)

echo.
echo  ------------------------------------------------------------
echo  [OK] Iniciando servidor em: http://localhost:8080
echo.
echo  IMPORTANTE: Mantenha esta janela ABERTA durante o uso.
echo              Voce pode MINIMIZAR, mas nao feche.
echo  ------------------------------------------------------------
echo.

:: Executa o Uvicorn via PowerShell, que suporta caminhos UNC nativamente!
:: Isso garante que nenhuma letra de rede temporaria (como Z:) seja criada.

:: Verifica se a porta 8080 ja esta em uso (servidor ja rodando)
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo  [INFO] O servidor ja esta em execucao (Porta 8080 ocupada).
    echo  [INFO] Redirecionando para o sistema no navegador...
    start http://127.0.0.1:8080
    timeout /t 2 >nul
    exit /b 0
)

:: Abre o navegador automaticamente apos 3 segundos
start "" /B cmd /c "ping 127.0.0.1 -n 3 >nul && start http://127.0.0.1:8080"

:: Inicia o servidor e aguarda na mesma janela
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%BACKEND_DIR%'; & '%PY_DIR%\Scripts\uvicorn.exe' server:app --host 127.0.0.1 --port 8080"

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERRO] O servidor foi encerrado.
    echo.
) else (
    echo.
    echo  [OK] Servidor encerrado com sucesso.
)


echo.
pause
