@echo off
title Servidor Controle RC
setlocal

set "PORT=8000"

:: pushd no caminho UNC cria uma letra de disco temporaria (ex: Z:\)
:: Isso evita o problema de caracteres especiais (como o 'a' de Manutencao) na linha de comando
pushd "%~dp0"

echo ========================================================
echo INICIANDO O SISTEMA CONTROLE RC (MOTOR NATIVO Windows)
echo ========================================================
echo.
echo O sistema esta ligando na porta %PORT% (Modo: Localhost)...
echo Aguarde 2 segundos, o navegador vai abrir sozinho...
echo.

:: Inicia o motor de Inteligencia Artificial (Ollama) em segundo plano, habilitando acesso web (CORS)
set "OLLAMA_ORIGINS=*"
start /B ollama serve >nul 2>&1

:: Usa o caminho atual (letra de disco ex: Z:\) - sem passar parametro -Pasta para evitar corrupcao de caracteres
start /B powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([ScriptBlock]::Create((Get-Content 'servidor.ps1' -Raw))) -Porta %PORT%"

:: Espera o servidor subir e abre o navegador
timeout /t 2 /nobreak >nul
start http://localhost:%PORT%/?login=force

echo ========================================================
echo SERVIDOR ONLINE. PODE USAR O SISTEMA!
echo Para desligar, basta fechar esta janela no "X".
echo ========================================================
pause >nul

:: Remove a letra de disco temporaria ao fechar
:: 1. Desconecta o servidor PowerShell (porta %PORT%) que "prende" o disco
for /f "tokens=5" %%a in ('netstat -aon ^| find ":%PORT%" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: 2. Aguarda 1 segundo para o sistema operacional liberar a trava do disco
timeout /t 1 /nobreak >nul

:: 3. Executa o popd original para tentar a remocao padrao
popd

:: 4. [Garantia extra] Remove qualquer letra de rede temporaria (T: a Z:) presa no servidor
for %%D in (T U V W X Y Z) do (
    net use %%D: 2>nul | find /I "britufps01" >nul
    if not errorlevel 1 (
        net use %%D: /delete /y >nul 2>&1
    )
)
