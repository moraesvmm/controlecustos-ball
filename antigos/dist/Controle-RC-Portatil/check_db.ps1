$config = Get-Content -Raw "js\config.js"
$url = ""
$key = ""
if ($config -match "SUPABASE_URL\s*=\s*.*?'(.*?)'") { $url = $matches[1] }
if ($config -match "SUPABASE_ANON_KEY\s*=\s*.*?'(.*?)'") { $key = $matches[1] }

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

$response = Invoke-RestMethod -Uri "$url/rest/v1/rc_registros?select=data_recebimento,valor,previsao_entrega" -Headers $headers
$agrupado = @{}

foreach ($item in $response) {
    if ($item.data_recebimento -ne $null) {
        $mes = $item.data_recebimento.Substring(0,7)
        if (-not $agrupado.ContainsKey($mes)) { $agrupado[$mes] = 0 }
        $agrupado[$mes] += $item.valor
    }
}

$agrupado.GetEnumerator() | Sort-Object Name | Format-Table -AutoSize
