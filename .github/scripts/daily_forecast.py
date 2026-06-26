import requests
import json
import pandas as pd
import numpy as np
import os
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

# 1. Fetch colaboradores para o PROCV exato
colab_url = f"{SUPABASE_URL}/rest/v1/colaboradores?select=*"
colab_res = requests.get(colab_url, headers=headers)
map_colab = {}
if colab_res.status_code == 200:
    for c in colab_res.json():
        if c.get('cod_req'):
            map_colab[str(c['cod_req']).lower().strip()] = c

# 2. Fetch custo_geral com paginacao para nao perder dados (limite padrao eh 1000)
limit = 1000
offset = 0
dados = []

while True:
    url = f"{SUPABASE_URL}/rest/v1/custo_geral?select=*&limit={limit}&offset={offset}"
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"Erro ao buscar dados na pagina {offset}: {response.text}")
        exit(1)
    
    page_data = response.json()
    if not page_data:
        break
        
    dados.extend(page_data)
    offset += limit
    
    if len(page_data) < limit:
        break
print(f"Buscados {len(dados)} registros da nuvem.")

budget_alvo = 750000.0 # Default fallback
df_raw = []

for r in dados:
    if r['it_codigo'] == 'BUDGET_METADATA':
        try:
            b_data = json.loads(r.get('descricao_codigo', '{}'))
            if 'manutencao' in b_data:
                budget_alvo = float(b_data['manutencao'])
        except:
            pass
        continue
    
    if r['it_codigo'] == 'FORECAST_METADATA':
        continue
        
    # LOGICA DE PROCV DO DB.JS
    original_solicitante = r.get('solicitante', '')
    sol = r.get('solicitante_2') if r.get('solicitante_2') else original_solicitante
    sol_key = str(sol).lower().strip() if sol else ''
    colab = map_colab.get(sol_key)
    
    is_excel_failed = False
    if not colab and sol_key != '':
        is_excel_failed = True
    elif sol_key == '' and (not original_solicitante or str(original_solicitante).strip() == ''):
        is_excel_failed = True
        
    area = colab.get('area') if colab else r.get('area')
    it_codigo = str(r.get('it_codigo', '')).upper()
    
    if not colab and it_codigo:
        if it_codigo.startswith('UCMAN') or it_codigo.startswith('SER'):
            area = 'MANUTENÇÃO'
        else:
            area = 'OUTROS'
    elif not area:
        area = 'OUTROS'
        
    item_tipo = it_codigo[:3]
    carater = 'Real Compras Serv' if item_tipo == 'SER' else 'Real Consumo'
    
    emitente_str = str(r.get('descricao_emitente', '')).upper()
    if 'WZF' in emitente_str:
        area = 'OUTROS'
        
    if area and area.upper() == 'MANUTENÇÃO':
        custo_do_mes = float(r.get('custo_do_mes') or 0)
        custo_mes_anterior = float(r.get('custo_mes_anterior') or 0)
        custo_de_entrada = float(r.get('custo_de_entrada') or 0)
        r['custo_cc'] = custo_do_mes + custo_mes_anterior + custo_de_entrada
        df_raw.append(r)

if not df_raw:
    print("Sem dados de manutencao para calcular.")
    exit(0)

df = pd.DataFrame(df_raw)

# Precisamos limpar e preparar a data e custo (usando custo_cc conforme regra do Budget no app.js)
df['dt_trans'] = pd.to_datetime(df['dt_trans'], errors='coerce')
df['custo_cc'] = pd.to_numeric(df.get('custo_cc', 0), errors='coerce').fillna(0)

hoje = datetime.now()
mes_atual = hoje.month
ano_atual = hoje.year

# O TOTAL GASTO DEVE SER A SOMA DE TODOS OS REGISTROS (assim como o frontend faz, pois o DB reflete a foto do mes)
total_gasto = df['custo_cc'].sum()

# Lendo historico de Machine Learning
hist_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'historical_burn_rate.csv')
avg_fraction = {}

if os.path.exists(hist_path):
    print("Carregando historico de Machine Learning para sazonalidade...")
    df_hist = pd.read_csv(hist_path)
    df_hist['ds'] = pd.to_datetime(df_hist['ds'])
    
    # Adicionar o mes atual para o historico? O mes atual esta incompleto, entao nao usamos para a curva
    
    # Calcular a fracao acumulada media por dia do mes
    df_hist['month'] = df_hist['ds'].dt.to_period('M')
    df_hist['day'] = df_hist['ds'].dt.day
    
    # Criar um grid completo de dias (1..31) para cada mes historico
    months = df_hist['month'].unique()
    grid = []
    for m in months:
        days_in_m = calendar.monthrange(m.year, m.month)[1]
        for d in range(1, days_in_m + 1):
            grid.append({'month': m, 'day': d})
    
    df_grid = pd.DataFrame(grid)
    df_hist = pd.merge(df_grid, df_hist[['month', 'day', 'y']], on=['month', 'day'], how='left').fillna(0)
    
    # Cumulative sum
    df_hist = df_hist.sort_values(['month', 'day'])
    df_hist['cum_y'] = df_hist.groupby('month')['y'].cumsum()
    
    # Total per month
    month_totals = df_hist.groupby('month')['y'].sum().reset_index().rename(columns={'y': 'total_m'})
    df_hist = pd.merge(df_hist, month_totals, on='month')
    
    # Fraction
    df_hist['fraction'] = df_hist['cum_y'] / df_hist['total_m']
    
    # Avoid div by zero
    df_hist['fraction'] = df_hist['fraction'].fillna(0)
    
    # Average fraction per day across all months
    avg_fraction_df = df_hist.groupby('day')['fraction'].mean()
    avg_fraction = avg_fraction_df.to_dict()
    print("Curva de sazonalidade treinada com sucesso!")

# Para a projecao diaria, precisamos agrupar pelos dias validos do mes atual
df_valid_dates = df.dropna(subset=['dt_trans']).copy()
df_mes = df_valid_dates[(df_valid_dates['dt_trans'].dt.month == mes_atual) & (df_valid_dates['dt_trans'].dt.year == ano_atual)].copy()

if df_mes.empty:
    print("Sem dias no mes atual para tracar projecao.")
    ultimo_dia_registrado = hoje.day
    daily = pd.DataFrame()
else:
    df_mes['dia'] = df_mes['dt_trans'].dt.day
    daily = df_mes.groupby('dia')['custo_cc'].sum().reset_index()
    daily = daily.sort_values('dia')
    ultimo_dia_registrado = daily['dia'].max()

print(f"DEBUG: Dia {ultimo_dia_registrado}, Total Gasto Real: {total_gasto}")

# Calculo do Burn Rate: Se tivermos a curva de sazonalidade ML e o dia > 0
total_dias_mes = calendar.monthrange(ano_atual, mes_atual)[1]
projecao_final = total_gasto

if avg_fraction and ultimo_dia_registrado in avg_fraction:
    frac = avg_fraction[ultimo_dia_registrado]
    if frac > 0.05: # Evitar projecoes malucas nos primeiros dias do mes
        projecao_final = total_gasto / frac
        print(f"Machine Learning: usando multiplicador sazonal de {frac:.2f} para o dia {ultimo_dia_registrado}")
    else:
        # Fallback linear se fracao muito pequena
        ritmo_diario = total_gasto / ultimo_dia_registrado if ultimo_dia_registrado > 0 else 0
        projecao_final = ritmo_diario * total_dias_mes
else:
    ritmo_diario = total_gasto / ultimo_dia_registrado if ultimo_dia_registrado > 0 else 0
    projecao_final = ritmo_diario * total_dias_mes

# Ajustar arrays projetados para o Frontend desenhar o cone
historico_dias = []
if not daily.empty:
    cum_atual = 0
    for _, row in daily.iterrows():
        historico_dias.append({
            "dia": int(row['dia']), 
            "gasto_diario": float(row['custo_cc']),
            "is_projecao": False
        })
        
    # Adicionar a projecao futura para os graficos
    if avg_fraction:
        for d in range(int(ultimo_dia_registrado) + 1, total_dias_mes + 1):
            if d in avg_fraction:
                frac = avg_fraction[d]
                # Quanto o ML acha que teremos gasto ACUMULADO neste dia?
                estimativa_acumulada_dia = projecao_final * frac
                # Para simplificar no json, mandamos a projecao final e a frac do dia
                historico_dias.append({
                    "dia": d,
                    "fracao_sazonal": float(frac),
                    "is_projecao": True
                })

resultado = {
    "mes": mes_atual,
    "ano": ano_atual,
    "dia_atual": int(ultimo_dia_registrado),
    "gasto_atual": float(total_gasto),
    "projecao_final": float(projecao_final),
    "budget": float(budget_alvo),
    "overrun": float(projecao_final - budget_alvo), # Agora pode ser negativo (saldo)
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
