$ErrorActionPreference = 'Stop'
$pyDir = "$env:LOCALAPPDATA\ControleRC_Python"

Write-Host "Criando diretorio local..."
New-Item -ItemType Directory -Force -Path $pyDir | Out-Null

Write-Host "Baixando Python 3.11 Embeddable..."
Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.8/python-3.11.8-embed-amd64.zip" -OutFile "$pyDir\python.zip"

Write-Host "Extraindo..."
Expand-Archive -Path "$pyDir\python.zip" -DestinationPath $pyDir -Force
Remove-Item "$pyDir\python.zip"

Write-Host "Habilitando site-packages..."
$pthFile = "$pyDir\python311._pth"
(Get-Content $pthFile) | ForEach-Object { $_ -replace '#import site', 'import site' } | Set-Content $pthFile

Write-Host "Instalando pip..."
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile "$pyDir\get-pip.py"
& "$pyDir\python.exe" "$pyDir\get-pip.py"

Write-Host "Instalando dependencias (FastAPI, Uvicorn, SQLAlchemy)..."
& "$pyDir\Scripts\pip.exe" install fastapi uvicorn sqlalchemy pydantic cors

Write-Host "Ambiente pronto!"
