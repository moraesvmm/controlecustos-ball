@echo off
set errorlevel=0
if %errorlevel% equ 0 (
    echo  [INFO] Redirecionando para o sistema no navegador...
    start "" "http://127.0.0.1:8080"
    timeout /t 2 >nul
)
