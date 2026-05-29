# Servidor HTTP Raw Socket - nativo do PowerShell
param([int]$Porta = 8000, [string]$Pasta = "")
$ErrorActionPreference = 'Continue'

# Garante que a pasta nunca fica vazia
# PSScriptRoot fica vazio em ScriptBlock, entao usa Get-Location (que herda a letra de disco do pushd)
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) { $Pasta = $PSScriptRoot }
if ([string]::IsNullOrEmpty($Pasta)) { $Pasta = (Get-Location).Path }

# Normaliza: remove barra final e prefixo de provedor PowerShell (caso exista)
$Pasta = $Pasta.TrimEnd('\').TrimEnd('/')
$Pasta = $Pasta -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', ''

# Usa Loopback (127.0.0.1) para nao acionar firewall corporativo
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Porta)
try { $listener.Start() } catch { Write-Host "[ERRO] Porta $Porta ocupada." -ForegroundColor Red; exit 1 }

$mime = @{
  '.html'  = 'text/html; charset=utf-8'
  '.htm'   = 'text/html; charset=utf-8'
  '.js'    = 'application/javascript; charset=utf-8'
  '.css'   = 'text/css; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.ico'   = 'image/x-icon'
  '.png'   = 'image/png'
  '.jpg'   = 'image/jpeg'
  '.jpeg'  = 'image/jpeg'
  '.gif'   = 'image/gif'
  '.svg'   = 'image/svg+xml'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
  '.txt'   = 'text/plain; charset=utf-8'
}

Write-Host ''
Write-Host '  Controle RC - Servidor Nativo 100% PowerShell' -ForegroundColor Green
Write-Host "  URL Local:   http://localhost:$Porta/" -ForegroundColor Cyan
Write-Host "  Pasta Raiz:  $Pasta" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Pressione Ctrl+C nesta janela preta para desligar o sistema.'
Write-Host ''

while ($true) {
  if ($listener.Pending()) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    try {
        $reader = New-Object System.IO.StreamReader($stream)
        $reqStr = $reader.ReadLine()

        # Drena os headers restantes ate linha vazia - previne TCP RST por dados nao lidos
        try {
            $headerLine = $reader.ReadLine()
            while ($null -ne $headerLine -and $headerLine -ne '') {
                $headerLine = $reader.ReadLine()
            }
        } catch {}

        if ($null -ne $reqStr -and $reqStr -match "^GET\s+([^\s]+)\s+HTTP") {
            $rel = [System.Uri]::UnescapeDataString($matches[1].Split('?')[0])
            if ($rel -eq '/') { $rel = '/index.html' }

            $caminhoRelativo = $rel.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
            $candidato = Join-Path $Pasta $caminhoRelativo

            $arquivo = $null
            if (Test-Path $candidato -PathType Leaf) { $arquivo = $candidato }
            elseif (Test-Path ($candidato + '.html') -PathType Leaf) { $arquivo = $candidato + '.html' }

            # Usa StreamWriter como no original (compativel com .NET 4.x)
            $writer = New-Object System.IO.StreamWriter($stream)
            $writer.AutoFlush = $true

            if ($arquivo) {
                $ext   = [IO.Path]::GetExtension($arquivo).ToLower()
                $ctype = $mime[$ext]
                if (-not $ctype) { $ctype = 'application/octet-stream' }
                $bytes = [IO.File]::ReadAllBytes($arquivo)
                $writer.Write("HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n")
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
            } else {
                $writer.Write("HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nConnection: close`r`n`r`n404 - Arquivo nao encontrado: $rel")
            }
            $writer.Close()
        }
    } catch { Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red }
    $client.Close()
  } else {
    Start-Sleep -Milliseconds 10
  }
}
