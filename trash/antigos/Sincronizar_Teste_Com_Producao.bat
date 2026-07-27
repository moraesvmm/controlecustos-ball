@echo off
color 0B
echo ===================================================
echo   SISTEMA CENTRAL - SINCRONIZACAO DE PRODUCAO
echo ===================================================
echo.
echo Este script vai apagar o banco de testes atual e 
echo clonar absolutamente TODOS os dados novos do Supabase 
echo (Producao) para o seu SQLite local (Testes).
echo.
echo Pressione qualquer tecla para iniciar a clonagem...
pause >nul
echo.

set "PYTHON_CMD="
if exist "%LOCALAPPDATA%\ControleRC_Python\python.exe" (
    set "PYTHON_CMD=%LOCALAPPDATA%\ControleRC_Python\python.exe"
) else (
    set "PYTHON_CMD=python"
)

echo [OK] Ambiente Python detectado. Baixando dados...
echo.

"%PYTHON_CMD%" "%~dp0backend\migrate.py"

echo.
echo ===================================================
echo   CONCLUIDO! O BANCO DE TESTES ESTA 100%% ATUALIZADO
echo ===================================================
echo Voce pode fechar esta janela e abrir o Iniciar_Servidor.bat
pause
