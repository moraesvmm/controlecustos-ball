import urllib.request
import json
import sqlite3
import os

SUPABASE_URL = 'https://zawlcgurowsqrydwfipu.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphd2xjZ3Vyb3dzcXJ5ZHdmaXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAyMzEsImV4cCI6MjA5NzM2NjIzMX0.2UQOL_ig7HKHp0jpXrJGff08Ur6G-ivauHTxH7ijwYs'
DB_PATH = os.path.join(os.path.dirname(__file__), "database", "database.sqlite")

def fetch_supabase(endpoint):
    all_data = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{endpoint}&limit={limit}&offset={offset}"
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

def seed_usuarios(conn):
    """Cria usuários padrão de acesso ao sistema local."""
    import uuid
    conn.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT,
            password TEXT
        )
    ''')
    usuarios = [
        (str(uuid.uuid4()), 'admin@ball.com',    'Administrador',   'ball@2026'),
        (str(uuid.uuid4()), 'vinicius@ball.com', 'Vinicius Moraes', 'ball@2026'),
    ]
    for u in usuarios:
        try:
            conn.execute('INSERT INTO usuarios (id, email, username, password) VALUES (?, ?, ?, ?)', u)
            print(f"   -> Usuário criado: {u[1]}")
        except sqlite3.IntegrityError:
            print(f"   -> Usuário já existe: {u[1]}")
    conn.commit()

def migrate():
    print("Iniciando Transfusão (Supabase -> SQLite)...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH) # Reseta para garantir transfusão limpa
        
    conn = sqlite3.connect(DB_PATH)

    for table in ["custo_geral", "rc_registros", "preventiva_registros", "machines", "machine_activities", "fornecedores_contatos", "tarefas_delegadas", "plano_mestre_maquinas", "plano_mestre_atividades", "datasul_ordens", "colaboradores", "preventiva_linhas_checkin"]:
        print(f"Baixando {table}...")
        data = fetch_supabase(f"{table}?select=*")
        if data:
            create_table_from_dict(conn, table, data[0])
            insert_data(conn, table, data)
            print(f"   -> {len(data)} registros inseridos.")
        else:
            print(f"   -> Nenhuma data.")

    print("Criando usuários de acesso...")
    seed_usuarios(conn)

    conn.close()
    print("Transfusão concluída com sucesso! O banco 'database.sqlite' está pronto.")

if __name__ == "__main__":
    migrate()
