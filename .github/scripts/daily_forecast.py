import requests
import json
import pandas as pd
import numpy as np
from datetime import datetime
import calendar

# Chaves hardcoded a pedido do usuario
SUPABASE_URL = "https://zawlcgurowsqrydwfipu.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphd2xjZ3Vyb3dzcXJ5ZHdmaXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAyMzEsImV4cCI6MjA5NzM2NjIzMX0.2UQOL_ig7HKHp0jpXrJGff08Ur6G-ivauHTxH7ijwYs"

headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

print("Iniciando previsao diaria...")

# 1. Fetch custo_geral (limit 10000)
url = f"{SUPABASE_URL}/rest/v1/custo_geral?select=*"
response = requests.get(url, headers=headers)
if response.status_code != 200:
    print(f"Erro ao buscar dados: {response.text}")
    exit(1)

dados = response.json()
print(f"Buscados {len(dados)} registros da nuvem.")

budget_alvo = 750000.0 # Default fallback
df_raw = []

for r in dados:
    if r['it_codigo'] == 'BUDGET_METADATA':
        try:
            b_data = json.loads(r.get('descricao_codigo', '{}'))
            if 'geral' in b_data:
                budget_alvo = float(b_data['geral'])
        except:
            pass
        continue
    
    if r['it_codigo'] == 'FORECAST_METADATA':
        continue
        
    # Filtra apenas Area = MANUTENÇÃO se essa coluna existir localmente
    # Como a API retorna dados crus do financeiro, a definicao de MANUTENCAO ocorre no JS.
    # Porem, o historico puro do mes eh suficiente para calcular um burn rate global.
    # Para espelhar o dashboard, focaremos em ordens UCMAN e valores validos.
    df_raw.append(r)

if not df_raw:
    print("Sem dados de movimentacao para calcular.")
    exit(0)

df = pd.DataFrame(df_raw)

# Precisamos limpar e preparar a data e custo
df['dt_trans'] = pd.to_datetime(df['dt_trans'], errors='coerce')
df['custo_do_mes'] = pd.to_numeric(df['custo_do_mes'], errors='coerce').fillna(0)

df = df.dropna(subset=['dt_trans'])

hoje = datetime.now()
mes_atual = hoje.month
ano_atual = hoje.year

# Pega so o mes atual para a execucao
df_mes = df[(df['dt_trans'].dt.month == mes_atual) & (df['dt_trans'].dt.year == ano_atual)].copy()

if df_mes.empty:
    print("Nenhum dado para o mes corrente.")
    exit(0)

df_mes['dia'] = df_mes['dt_trans'].dt.day
daily = df_mes.groupby('dia')['custo_do_mes'].sum().reset_index()

# Ordena por dia
daily = daily.sort_values('dia')
ultimo_dia_registrado = daily['dia'].max()
total_gasto = daily['custo_do_mes'].sum()

# Calculo simplificado de Burn Rate linear para o MVP Cloud
# Gasto por dia = total_gasto / ultimo_dia_registrado
# Projecao = (Gasto por dia) * total_dias_no_mes
total_dias_mes = calendar.monthrange(ano_atual, mes_atual)[1]
ritmo_diario = total_gasto / ultimo_dia_registrado if ultimo_dia_registrado > 0 else 0
projecao_final = ritmo_diario * total_dias_mes

historico_dias = [{"dia": int(row['dia']), "gasto": float(row['custo_do_mes'])} for _, row in daily.iterrows()]

resultado = {
    "mes": mes_atual,
    "ano": ano_atual,
    "dia_atual": int(ultimo_dia_registrado),
    "gasto_atual": float(total_gasto),
    "projecao_final": float(projecao_final),
    "budget": float(budget_alvo),
    "overrun": float(projecao_final - budget_alvo) if projecao_final > budget_alvo else 0,
    "historico_dias": historico_dias,
    "atualizado_em": hoje.isoformat()
}

print(f"Projecao calculada: R$ {projecao_final:.2f} (Overrun: R$ {resultado['overrun']:.2f})")

# Vamos tentar deletar o metadata antigo
del_url = f"{SUPABASE_URL}/rest/v1/custo_geral?it_codigo=eq.FORECAST_METADATA"
requests.delete(del_url, headers=headers)

# E inserir o novo
insert_url = f"{SUPABASE_URL}/rest/v1/custo_geral"
payload = {
    "it_codigo": "FORECAST_METADATA",
    "descricao_codigo": json.dumps(resultado),
    "numero_ordem": "0",
    "quantidade": 0,
    "custo_do_mes": 0
}

res = requests.post(insert_url, headers=headers, json=payload)
if res.status_code in [200, 201]:
    print("Previsao salva com sucesso no Supabase!")
else:
    print(f"Erro ao salvar: {res.status_code} - {res.text}")
    exit(1)
