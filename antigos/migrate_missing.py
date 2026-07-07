import urllib.request
import json
import sqlite3
import os

SUPABASE_URL = 'https://zawlcgurowsqrydwfipu.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphd2xjZ3Vyb3dzcXJ5ZHdmaXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAyMzEsImV4cCI6MjA5NzM2NjIzMX0.2UQOL_ig7HKHp0jpXrJGff08Ur6G-ivauHTxH7ijwYs'
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "database.sqlite")

def fetch_supabase(endpoint):
    all_data = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{endpoint}?limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        })
        try:
            with urllib.request.urlopen(req) as response:
                chunk = json.loads(response.read().decode())
                if not chunk: break
                all_data.extend(chunk)
                if len(chunk) < limit: break
                offset += limit
        except Exception as e:
            print(f"Erro ao baixar {endpoint} (offset {offset}): {e}")
            break
    return all_data

def create_table_from_dict(conn, table_name, sample_dict):
    columns = []
    for k, v in sample_dict.items():
        if k == 'id':
            if isinstance(v, int):
                columns.append("id INTEGER PRIMARY KEY AUTOINCREMENT")
            else:
                columns.append("id TEXT PRIMARY KEY")
        elif isinstance(v, int):
            columns.append(f"{k} INTEGER")
        elif isinstance(v, float):
            columns.append(f"{k} REAL")
        else:
            columns.append(f"{k} TEXT")
    
    schema = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(columns)});"
    conn.execute(schema)

def insert_data(conn, table_name, data_list):
    if not data_list: return
    keys = data_list[0].keys()
    placeholders = ", ".join(["?"] * len(keys))
    columns = ", ".join(keys)
    query = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
    tuples = [tuple(row[k] for k in keys) for row in data_list]
    conn.executemany(query, tuples)
    conn.commit()

conn = sqlite3.connect(DB_PATH)
table = "colaboradores"
print(f"Baixando {table}...")
data = fetch_supabase(table)
if data:
    create_table_from_dict(conn, table, data[0])
    insert_data(conn, table, data)
    print(f"   -> {len(data)} registros inseridos.")
else:
    print(f"   -> Nenhuma data.")
conn.close()
