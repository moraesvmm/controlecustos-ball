# Servidor HTTP simples — nao precisa de Python nem Node
param(
  [int]$Porta = 8080,
  [string]$Pasta = $PSScriptRoot,
  [switch]$Rede
)

$ErrorActionPreference = 'Stop'
$Pasta = (Resolve-Path $Pasta).Path

$listener = New-Object System.Net.HttpListener
if ($Rede) {
  $listener.Prefixes.Add("http://+:$Porta/")
} else {
  $listener.Prefixes.Add("http://localhost:$Porta/")
}

try {
  $listener.Start()
} catch {
  Write-Host '[ERRO] Nao foi possivel abrir a porta' $Porta -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($Rede) {
    Write-Host 'Para rede, execute PowerShell como Administrador ou use apenas localhost (sem -Rede).'
  }
  exit 1
}

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
Write-Host '  Controle RC - servidor ativo' -ForegroundColor Green
Write-Host "  Pasta: $Pasta"
Write-Host "  URL:   http://localhost:$Porta/" -ForegroundColor Cyan
if ($Rede) {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
  if ($ip) { Write-Host "  Rede:  http://${ip}:$Porta/" -ForegroundColor Cyan }
}
Write-Host ''
Write-Host '  Para parar: Ctrl+C ou feche esta janela'
Write-Host ''

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
  if ($rel -eq '/') { $rel = '/index.html' }

  $candidato = Join-Path $Pasta ($rel.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar))
  $arquivo = $null

  if (Test-Path $candidato -PathType Leaf) {
    $arquivo = $candidato
  } elseif (Test-Path ($candidato + '.html') -PathType Leaf) {
    $arquivo = $candidato + '.html'
  }

  if ($arquivo) {
    $bytes = [IO.File]::ReadAllBytes($arquivo)
    $ext = [IO.Path]::GetExtension($arquivo).ToLower()
    $res.ContentType = $mime[$ext]
    if (-not $res.ContentType) { $res.ContentType = 'application/octet-stream' }
    $res.StatusCode = 200
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $msg = [Text.Encoding]::UTF8.GetBytes('404 - nao encontrado')
    $res.ContentType = 'text/plain; charset=utf-8'
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.Close()
}
