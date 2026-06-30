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
map_colab = {}
offset_colab = 0
while True:
    colab_url = f"{SUPABASE_URL}/rest/v1/colaboradores?select=*&limit=1000&offset={offset_colab}"
    colab_res = requests.get(colab_url, headers=headers)
    if colab_res.status_code == 200:
        c_data = colab_res.json()
        if not c_data:
            break
        for c in c_data:
            if c.get('cod_req'):
                # IMPORTANT: DO NOT STRIP TO MATCH JS / EXCEL BEHAVIOR EXACTLY
                map_colab[str(c['cod_req']).lower()] = c
        offset_colab += 1000
        if len(c_data) < 1000:
            break
    else:
        break

# 1.5 Fetch datasul_ordens
map_datasul = {}
offset_ds = 0
while True:
    ds_url = f"{SUPABASE_URL}/rest/v1/datasul_ordens?select=*&limit=1000&offset={offset_ds}"
    ds_res = requests.get(ds_url, headers=headers)
    if ds_res.status_code == 200:
        ds_data = ds_res.json()
        if not ds_data:
            break
        for d in ds_data:
            map_datasul[str(d.get('numero_ordem', ''))] = str(d.get('solicitante', ''))
        offset_ds += 1000
        if len(ds_data) < 1000:
            break
    else:
        break

# 2. Fetch custo_geral com paginacao para nao perder dados
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
        
    # LOGICA DE PROCV DO DB.JS (EXATAMENTE COMO JS PARA BATER 750K)
    original_solicitante = str(r.get('solicitante', ''))
    numero_ordem = str(r.get('numero_ordem', ''))
    
    sol_to_use = original_solicitante
    
    if not sol_to_use or sol_to_use.strip() == '' or sol_to_use == 'None':
        excel_lookup = map_datasul.get(numero_ordem)
        system_lookup = excel_lookup
        if not system_lookup and len(numero_ordem) < 8:
            system_lookup = map_datasul.get(numero_ordem.zfill(8))
            
        sol_to_use = system_lookup if system_lookup else ''
        
    # IMPORTANT: DO NOT STRIP TO MATCH JS / EXCEL BEHAVIOR EXACTLY
    excel_sol_key = sol_to_use.lower()
    colab = map_colab.get(excel_sol_key)
        
    area = colab.get('area') if colab else r.get('area')
    it_codigo = str(r.get('it_codigo', '')).upper()
    
    if not colab and it_codigo:
        if it_codigo.startswith('UCMAN') or it_codigo.startswith('SER'):
            area = 'MANUTENÇÃO'
        else:
            area = 'OUTROS'
    if not area:
        area = 'OUTROS'
        
    emitente_str = str(r.get('descricao_emitente', '')).upper()
    if 'WZF' in emitente_str:
        area = 'OUTROS'
        
    custo_do_mes = float(r.get('custo_do_mes') or 0)
    custo_mes_anterior = float(r.get('custo_mes_anterior') or 0)
    custo_de_entrada = float(r.get('custo_de_entrada') or 0)
    r['custo_cc'] = custo_do_mes + custo_mes_anterior + custo_de_entrada
    
    # Adicionamos TODOS os registros para deteccao de anomalia, mas a previsao sera so para manutencao
    r['area_normalizada'] = area.upper()
    df_raw.append(r)

if not df_raw:
    print("Sem dados para calcular.")
    exit(0)

df = pd.DataFrame(df_raw)

# Convert string dates to datetime objects for ALL dataframes
df['dt_trans'] = pd.to_datetime(df['dt_trans'], errors='coerce')

# Filtrar apenas Manutencao para o modelo de ML de previsao
df_manut = df[df['area_normalizada'] == 'MANUTENÇÃO'].copy()

# Anomaly Detection Module (Para todas as áreas)
alerts = []
try:
    df_valid = df.dropna(subset=['dt_trans']).copy()
    
    if not df_valid.empty:
        max_date = df_valid['dt_trans'].max()
        cutoff_date = max_date - pd.Timedelta(days=7)
        
        areas = df_valid['area_normalizada'].unique()
        for a in areas:
            df_a = df_valid[df_valid['area_normalizada'] == a]
            
            recent = df_a[df_a['dt_trans'] > cutoff_date]
            past = df_a[df_a['dt_trans'] <= cutoff_date]
            
            recent_total = recent['custo_cc'].sum()
            past_total = past['custo_cc'].sum()
            
            recent_days = (max_date - cutoff_date).days
            past_days = (cutoff_date - df_a['dt_trans'].min()).days if not past.empty else 1
            if past_days <= 0: past_days = 1
            
            recent_avg = recent_total / recent_days
            past_avg = past_total / past_days
            
            # Se gastou mais de 5k na ultima semana e a media diaria foi 50% maior que antes
            if recent_total > 5000 and past_avg > 0 and recent_avg > (past_avg * 1.5):
                ratio = (recent_avg / past_avg)
                alerts.append(f"A área {a.capitalize()} apresentou pico de gastos: R$ {recent_total:,.2f} nos últimos 7 dias ({ratio:.1f}x a média do início do mês).".replace(',','_').replace('.',',').replace('_','.'))
except Exception as e:
    print(f"Erro no módulo de anomalias: {e}")

# ====================================================
# ML FORECASTING (Apenas Manutencao)
# ====================================================
hoje = datetime.now()
mes_atual = hoje.month
ano_atual = hoje.year

total_gasto = df_manut['custo_cc'].sum()

# Lendo historico de Machine Learning
hist_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'historical_burn_rate.csv')
avg_fraction = {}

if os.path.exists(hist_path):
    print("Carregando historico de Machine Learning para sazonalidade e Mês Gêmeo...")
    df_hist = pd.read_csv(hist_path)
    df_hist['ds'] = pd.to_datetime(df_hist['ds'])
    
    # Garantir que os custos historicos sejam interpretados como positivos (ja que na nuvem current=positivo)
    if 'y' in df_hist.columns:
        df_hist['y'] = df_hist['y'].abs()
    
    df_hist['month'] = df_hist['ds'].dt.to_period('M')
    df_hist['day'] = df_hist['ds'].dt.day
    
    # Se nao tiver volume_ordens (historico velho), cria dummy
    if 'volume_ordens' not in df_hist.columns:
        df_hist['volume_ordens'] = 1
    
    # Criar um grid completo de dias (1..31) para cada mes historico
    months = df_hist['month'].unique()
    grid = []
    for m in months:
        days_in_m = calendar.monthrange(m.year, m.month)[1]
        for d in range(1, days_in_m + 1):
            grid.append({'month': m, 'day': d})
    
    df_grid = pd.DataFrame(grid)
    df_hist = pd.merge(df_grid, df_hist[['month', 'day', 'y', 'volume_ordens']], on=['month', 'day'], how='left').fillna(0)
    
    # Cumulative sum
    df_hist = df_hist.sort_values(['month', 'day'])
    df_hist['cum_y'] = df_hist.groupby('month')['y'].cumsum()
    df_hist['cum_vol'] = df_hist.groupby('month')['volume_ordens'].cumsum()
    
    # Total per month
    month_totals = df_hist.groupby('month')['y'].sum().reset_index().rename(columns={'y': 'total_m'})
    df_hist = pd.merge(df_hist, month_totals, on='month')
    
    # Fraction
    df_hist['fraction'] = df_hist['cum_y'] / df_hist['total_m']
    df_hist['fraction'] = df_hist['fraction'].fillna(0)
    
    # Average fraction (fallback)
    avg_fraction_df = df_hist.groupby('day')['fraction'].mean()
    avg_fraction = avg_fraction_df.to_dict()
    print("Base do Mês Gêmeo (KNN) preparada com sucesso!")

# Para a projecao diaria, precisamos agrupar pelos dias validos do mes atual
df_valid_dates = df_manut.dropna(subset=['dt_trans']).copy()
df_mes = df_valid_dates[(df_valid_dates['dt_trans'].dt.month == mes_atual) & (df_valid_dates['dt_trans'].dt.year == ano_atual)].copy()

total_volume = 0
if df_mes.empty:
    print("Sem dias no mes atual para tracar projecao.")
    ultimo_dia_registrado = hoje.day
    daily = pd.DataFrame()
else:
    df_mes['dia'] = df_mes['dt_trans'].dt.day
    daily = df_mes.groupby('dia').agg(
        custo_cc=('custo_cc', 'sum'),
        volume_ordens=('custo_cc', 'count')
    ).reset_index()
    daily = daily.sort_values('dia')
    ultimo_dia_registrado = daily['dia'].max()
    total_volume = daily['volume_ordens'].sum()

print(f"DEBUG: Dia {ultimo_dia_registrado}, Total Gasto Real: R$ {total_gasto}, Volume: {total_volume} ordens")

# ====================================================
# KNN K=3 COM MEDIA PONDERADA E INTERVALO DE CONFIANCA
# ====================================================
total_dias_mes = calendar.monthrange(ano_atual, mes_atual)[1]
projecao_final = total_gasto
projecao_min = total_gasto
projecao_max = total_gasto
twin_month_name = "N/A"
twin_month_dist = 0
knn_vizinhos = []
K = 3  # Numero de vizinhos

if 'df_hist' in locals() and ultimo_dia_registrado > 0:
    df_day_d = df_hist[df_hist['day'] == ultimo_dia_registrado].copy()

    candidatos = []
    for _, row in df_day_d.iterrows():
        m_cum_y = row['cum_y']
        m_cum_vol = row['cum_vol']
        m_frac = row['fraction']

        if m_cum_y == 0 or m_frac <= 0.05:
            continue

        # Distancia Euclidiana Normalizada
        diff_y   = (m_cum_y - total_gasto)   / total_gasto   if total_gasto   > 0 else 0
        diff_vol = (m_cum_vol - total_volume) / total_volume  if total_volume  > 0 else 0
        dist = np.sqrt(diff_y**2 + diff_vol**2)

        # Projecao que este mes historico sugere
        proj_mes = total_gasto / m_frac

        candidatos.append({
            'month': row['month'],
            'dist': dist,
            'frac': m_frac,
            'proj': proj_mes
        })

    # Ordenar pelos K mais proximos
    candidatos.sort(key=lambda x: x['dist'])
    vizinhos = candidatos[:K]

    if vizinhos:
        # Pesos inversos da distancia (quanto mais proximo, mais peso)
        # Evitar divisao por zero: se dist == 0, peso = 1e9
        pesos = []
        for v in vizinhos:
            pesos.append(1.0 / v['dist'] if v['dist'] > 1e-9 else 1e9)
        soma_pesos = sum(pesos)

        # Projecao ponderada
        projecao_final = sum(v['proj'] * p for v, p in zip(vizinhos, pesos)) / soma_pesos

        # Intervalo de confianca: min e max dos K vizinhos
        projecoes = [v['proj'] for v in vizinhos]
        projecao_min = min(projecoes)
        projecao_max = max(projecoes)

        # Confianca: quanto mais tarde no mes e menor o spread, maior a confianca
        spread_rel = (projecao_max - projecao_min) / projecao_final if projecao_final > 0 else 1
        fator_dia  = ultimo_dia_registrado / total_dias_mes          # 0..1
        confianca_pct = max(30, min(98, int((1 - spread_rel) * 60 + fator_dia * 40)))

        # Melhor vizinho para exibicao
        best = vizinhos[0]
        twin_month_name = str(best['month'])
        twin_month_dist = best['dist']

        # Similaridade percentual (0..100) inversamente proporcional a distancia
        similaridade = max(0, min(100, int((1 - best['dist']) * 100)))

        knn_vizinhos = [
            {
                'month': str(v['month']),
                'dist': round(v['dist'], 4),
                'proj': round(v['proj'], 2),
                'similaridade': max(0, min(100, int((1 - v['dist']) * 100)))
            }
            for v in vizinhos
        ]

        frac = best['frac']
        print(f"KNN K={len(vizinhos)} vizinhos. Melhor: {twin_month_name} (Distância: {twin_month_dist:.3f}, Similaridade: {similaridade}%)")
        print(f"Projecao ponderada: R$ {projecao_final:.2f} | Range: [R$ {projecao_min:.2f} – R$ {projecao_max:.2f}] | Confiança: {confianca_pct}%")
    else:
        # Fallback linear
        ritmo_diario  = total_gasto / ultimo_dia_registrado if ultimo_dia_registrado > 0 else 0
        projecao_final = ritmo_diario * total_dias_mes
        projecao_min   = projecao_final
        projecao_max   = projecao_final
        confianca_pct  = 40
        twin_month_name = "Média Linear (Fallback)"
        similaridade    = 0
        frac = 0.5
else:
    ritmo_diario  = total_gasto / ultimo_dia_registrado if ultimo_dia_registrado > 0 else 0
    projecao_final = ritmo_diario * total_dias_mes
    projecao_min   = projecao_final
    projecao_max   = projecao_final
    confianca_pct  = 30
    twin_month_name = "Média Linear (Sem histórico)"
    similaridade    = 0
    frac = 0.5

# ── REGRA DE CONVERGÊNCIA FINAL (últimos 2 dias do mês) ──────────────────────
# Nos 2 últimos dias, a projeção crava no menor valor dos meses gêmeos (cenário realista de fim de mês),
# DESDE QUE o gasto atual não seja maior que esse valor mínimo.
dias_restantes = total_dias_mes - ultimo_dia_registrado
if dias_restantes <= 2:  # 0, 1 ou 2 dias restantes
    projecao_final_original = projecao_final
    
    if total_gasto >= projecao_min:
        # Se já gastamos mais que o mínimo histórico, usamos o Gasto Atual + média diária até o fim
        ritmo_residual = (total_gasto / ultimo_dia_registrado) if ultimo_dia_registrado > 0 else 0
        projecao_final = total_gasto + (ritmo_residual * dias_restantes)
        print(f"CONVERGENCIA FINAL: total_gasto (R$ {total_gasto:.2f}) já superou projecao_min (R$ {projecao_min:.2f}). Ajustando para Gasto Atual + Ritmo Residual: R$ {projecao_final:.2f}")
    else:
        # Crava no menor valor dos meses gêmeos
        projecao_final = projecao_min
        print(f"CONVERGENCIA FINAL (dias restantes={dias_restantes}): Cravando projeção no Menor Mês Gêmeo. R$ {projecao_final_original:.2f} -> R$ {projecao_final:.2f}")

    # Confiança sobe pois a incerteza é quase nula no fim do mês
    confianca_pct = 99
# ─────────────────────────────────────────────────────────────────────────────

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
    "projecao_min": float(projecao_min),
    "projecao_max": float(projecao_max),
    "confianca_pct": int(confianca_pct),
    "budget": float(budget_alvo),
    "overrun": float(projecao_final - budget_alvo),
    "historico_dias": historico_dias,
    "alerts": alerts,
    "twin_month": twin_month_name,
    "twin_month_dist": float(twin_month_dist),
    "twin_month_similaridade": int(similaridade),
    "knn_vizinhos": knn_vizinhos,
    "volume_ordens_atual": float(total_volume),
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
