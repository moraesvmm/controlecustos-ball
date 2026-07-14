import pandas as pd

filepath = r"C:\Users\VMORAES1\Downloads\Relatório de Paradas 2026-06.xlsx"
df = pd.read_excel(filepath, engine='calamine', header=0)

col_grupo = df.columns[3]   # 'Grupos de Paradas'
col_linha = df.columns[4]   # 'Linha'
col_data = df.columns[7]    # 'Data'
col_inicio = df.columns[8]  # 'Início'
col_fim = df.columns[9]     # 'Fim'
col_dur = df.columns[10]    # 'Duração'

# Filtra apenas Reparos Mecânicos e Elétricos
df_rep = df[df[col_grupo].str.contains('Reparos', na=False, case=False)].copy()

# Converte Duração (string HH:MM:SS) para minutos
def hms_to_min(s):
    try:
        parts = str(s).strip().split(':')
        h, m, sec = int(parts[0]), int(parts[1]), float(parts[2])
        return h*60 + m + sec/60
    except:
        return 0.0

df_rep['dur_min'] = df_rep[col_dur].apply(hms_to_min)

# Converte data
df_rep['data_dt'] = pd.to_datetime(df_rep[col_data], errors='coerce')
df_rep['semana_iso'] = df_rep['data_dt'].dt.isocalendar().week.astype(int)
df_rep['mes'] = df_rep['data_dt'].dt.month
df_rep['ano'] = df_rep['data_dt'].dt.year

print("=== DADOS LIMPOS ===")
print(df_rep[[col_grupo, col_linha, 'data_dt', 'semana_iso', 'dur_min']].head(10).to_string())

# Calcula MTBF, MTTR e Indisponibilidade por Linha no mês
# Tempo disponível no mês: 30 dias * 24h * 60min = 43200 min (assumindo 24/7)
TEMPO_MES_MIN = 30 * 24 * 60

print("\n=== KPIs POR LINHA (JUNHO) ===")
grupos = df_rep.groupby(col_linha)
for linha, g in grupos:
    n_falhas = len(g)
    tempo_parado_min = g['dur_min'].sum()
    tempo_func_min = TEMPO_MES_MIN - tempo_parado_min
    mtbf = tempo_func_min / n_falhas if n_falhas > 0 else 0
    mttr = tempo_parado_min / n_falhas if n_falhas > 0 else 0
    indisponibilidade = (tempo_parado_min / TEMPO_MES_MIN) * 100
    print(f"\n{linha}:")
    print(f"  Falhas: {n_falhas}")
    print(f"  Tempo parado total: {tempo_parado_min:.1f} min ({tempo_parado_min/60:.1f}h)")
    print(f"  MTBF: {mtbf:.2f} min ({mtbf/60:.2f}h)")
    print(f"  MTTR: {mttr:.2f} min ({mttr/60:.2f}h)")
    print(f"  Indisponibilidade: {indisponibilidade:.2f}%")

print("\n=== KPIs POR SEMANA (LINHA 4) ===")
df_l4 = df_rep[df_rep[col_linha] == 'Linha 4']
TEMPO_SEM_MIN = 7 * 24 * 60
for sem, g in df_l4.groupby('semana_iso'):
    n = len(g)
    tp = g['dur_min'].sum()
    tf = TEMPO_SEM_MIN - tp
    mtbf = tf / n if n > 0 else 0
    mttr = tp / n if n > 0 else 0
    indisp = (tp / TEMPO_SEM_MIN) * 100
    print(f"  Semana {sem}: {n} falhas | MTBF={mtbf/60:.2f}h | MTTR={mttr/60:.2f}h | Indisp={indisp:.2f}%")
