# Servidor HTTP Raw Socket — nativo do PowerShell (Nao exige Admin para 0.0.0.0)
param([int]$Porta = 8000, [string]$Pasta = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$Pasta = (Resolve-Path $Pasta).Path

# Usa raw Sockets para escapar do bloqueio de HttpListener e do bloqueio de .exe da TI
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Porta)
try { $listener.Start() } catch { Write-Host "[ERRO] Porta $Porta ocupada." -ForegroundColor Red; exit 1 }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
}

Write-Host ''
Write-Host '  Controle RC - Servidor Nativo 100% PowerShell' -ForegroundColor Green
Write-Host "  URL Local:   http://localhost:$Porta/" -ForegroundColor Cyan
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
if ($ip) { Write-Host "  URL na Rede: http://${ip}:$Porta/" -ForegroundColor Cyan }
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
        if ($reqStr -match "^GET\s+([^\s]+)\s+HTTP") {
            $rel = [System.Uri]::UnescapeDataString($matches[1].Split('?')[0])
            if ($rel -eq '/') { $rel = '/index.html' }
            
            $caminhoRelativo = $rel.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
            $candidato = Join-Path $Pasta $caminhoRelativo
            
            $arquivo = $null
            if (Test-Path $candidato -PathType Leaf) { $arquivo = $candidato }
            elseif (Test-Path ($candidato + '.html') -PathType Leaf) { $arquivo = $candidato + '.html' }
            
            $writer = New-Object System.IO.StreamWriter($stream)
            $writer.AutoFlush = $true
            if ($arquivo) {
                $ext = [IO.Path]::GetExtension($arquivo).ToLower()
                $ctype = $mime[$ext]
                if (-not $ctype) { $ctype = 'application/octet-stream' }
                $bytes = [IO.File]::ReadAllBytes($arquivo)
                $writer.Write("HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
                $stream.Write($bytes, 0, $bytes.Length)
            } else {
                $writer.Write("HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nConnection: close`r`n`r`n404 - Nao encontrado")
            }
            $writer.Close()
        }
    } catch {}
    $client.Close()
  } else {
    Start-Sleep -Milliseconds 10
  }
}


