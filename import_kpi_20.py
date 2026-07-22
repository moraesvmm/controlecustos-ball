import pandas as pd
import sqlite3

filepath = r"C:\Users\VMORAES1\Downloads\Relatório de Paradas 2026-07-15_2026-07-20.xlsx"
print(f"Loading {filepath}...")
df = pd.read_excel(filepath, engine='calamine', header=0)

col_paradas = df.columns[2] # 'Paradas'
col_grupo = df.columns[3]   # 'Grupos de Paradas'
col_linha = df.columns[4]   # 'Linha'
col_data = df.columns[7]    # 'Data'
col_dur = df.columns[10]    # 'Duração'

# Filtra apenas Reparos Mecânicos e Elétricos
df_rep = df[df[col_grupo].str.contains('Reparos', na=False, case=False)].copy()

def hms_to_min(s):
    try:
        parts = str(s).strip().split(':')
        h, m, sec = int(parts[0]), int(parts[1]), float(parts[2])
        return h*60 + m + sec/60
    except:
        return 0.0

df_rep['dur_min'] = df_rep[col_dur].apply(hms_to_min)
df_rep['data_dt'] = pd.to_datetime(df_rep[col_data], errors='coerce')
df_rep['semana_iso'] = df_rep['data_dt'].dt.isocalendar().week.astype(int)
df_rep['mes'] = df_rep['data_dt'].dt.month
df_rep['ano'] = df_rep['data_dt'].dt.year

df_rep = df_rep.dropna(subset=['data_dt'])

db_path = 'backend/database/database.sqlite'
print(f"Connecting to {db_path}...")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get the min and max dates to delete existing data in that range to prevent duplicates
min_date = df_rep['data_dt'].min().strftime('%Y-%m-%d')
max_date = df_rep['data_dt'].max().strftime('%Y-%m-%d')
print(f"Found data from {min_date} to {max_date}. Deleting existing records in this range...")

cur.execute("DELETE FROM kpi_paradas_raw WHERE data >= ? AND data <= ?", (min_date, max_date))
deleted_count = cur.rowcount
print(f"Deleted {deleted_count} old records.")

records_to_insert = []
for _, row in df_rep.iterrows():
    # Attempt to extract 'maquina' if the codebase usually expects it, otherwise None
    records_to_insert.append((
        str(row[col_linha]),
        str(row[col_grupo]),
        row['data_dt'].strftime('%Y-%m-%d'),
        int(row['semana_iso']),
        int(row['mes']),
        int(row['ano']),
        float(row['dur_min']),
        None, # maquina
        str(row[col_paradas])
    ))

cur.executemany("""
    INSERT INTO kpi_paradas_raw (linha, grupo_parada, data, semana_iso, mes, ano, dur_min, maquina, parada_original)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""", records_to_insert)

conn.commit()
print(f"Successfully inserted {len(records_to_insert)} new KPI records!")
conn.close()
