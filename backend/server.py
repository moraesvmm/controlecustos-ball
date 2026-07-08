from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import sqlite3
import json
import asyncio

ROOT_DIR = os.path.join(os.path.dirname(__file__), "..")
DB_PATH = os.path.join(os.path.dirname(__file__), "database", "database.sqlite")

# ==============================================================================
# ARQUITETURA DISTRIBUÍDA (Multi-Servidor / Banco Único)
# ==============================================================================
# Responsabilidade deste Backend: Servir de intermediário local para o navegador
# do usuário, processando regras de negócio e gravando no arquivo SQLite.
#
# Atenção: Como este servidor Python roda localmente na máquina de CADA usuário
# (ou seja, não há um servidor central), a comunicação "Real-Time" (SSE) 
# funciona monitorando a data de modificação física do arquivo `database.sqlite` 
# na rede compartilhada. Se a data (mtime) muda, significa que outro PC salvou
# dados, e este servidor avisa a tela local (frontend) para recarregar.
# ==============================================================================

app = FastAPI(title="Controle RC Backend (Localhost SQLite)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # ATENÇÃO: NÃO UTILIZAR WAL AQUI.
    # Como o banco está numa rede compartilhada (Windows SMB), o WAL corromperia 
    # o banco porque ele exige "Shared Memory" (mmap) suportado apenas localmente.
    # TRUNCATE ou DELETE são os únicos modos seguros para rede.
    conn.execute("PRAGMA journal_mode=TRUNCATE;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-20000;") # Usa 20MB de RAM local para cache de leitura (muito mais rápido)
    
    # Criar tabela de usuários local caso não exista
    conn.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT,
            password TEXT
        )
    ''')
    
    # Criar tabela de notificações de prazos lidas por usuário
    conn.execute('''
        CREATE TABLE IF NOT EXISTS registro_prazo_ciente (
            user_email TEXT,
            registro_id INTEGER,
            faixa_prazo TEXT,
            data_ciente TEXT,
            PRIMARY KEY (user_email, registro_id, faixa_prazo)
        )
    ''')
    
    # Criar tabela de tarefas delegadas
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tarefas_delegadas (
            id TEXT PRIMARY KEY,
            titulo TEXT,
            descricao TEXT,
            status TEXT,
            atribuido_para TEXT,
            atribuido_por TEXT,
            criado_em TEXT,
            prazo TEXT,
            finalizado_em TEXT,
            anexos TEXT
        )
    ''')
    
    # Criar tabelas do Módulo de Indicadores (KPIs)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_breakdowns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            periodo_tipo TEXT, 
            periodo_nome TEXT,
            breakdown_real REAL,
            target_meta REAL,
            UNIQUE(periodo_tipo, periodo_nome)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_maquinas_ofensoras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            semana TEXT,
            maquina TEXT,
            tempo_mecanico_min REAL,
            tempo_total_min REAL,
            tempo_disponivel_min REAL,
            breakdown_pct REAL,
            UNIQUE(semana, maquina)
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_plano_acoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_str TEXT,
            projeto TEXT,
            responsavel TEXT,
            status_col TEXT,
            ref_id TEXT
        )
    ''')
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_linhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linha TEXT UNIQUE,
            anual_pct REAL,
            mensal_pct REAL
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_diario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia INTEGER UNIQUE,
            eletrica_pct REAL,
            mecanica_pct REAL
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_compliance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT UNIQUE,
            valor_pct REAL
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_mtbf (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            maquina TEXT,
            linha_4 REAL,
            linha_5 REAL,
            linha_6 REAL,
            linha_7 REAL,
            linha_8 REAL,
            linha_9 REAL,
            target REAL
        )
    ''')

    conn.commit()
    return conn

@app.get("/api/health")
def health_check():
    return {"status": "ok", "db_path": DB_PATH}

@app.post("/auth/v1/token")
async def login(req: Request):
    data = await req.json()
    email = data.get("email")
    password = data.get("password")
    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE email = ? AND password = ?", (email, password)).fetchone()
    conn.close()
    if user:
        u_dict = dict(user)
        return {
            "access_token": "local-token-123", 
            "user": {"id": u_dict["id"], "email": u_dict["email"], "user_metadata": {"username": u_dict["username"]}}
        }
    raise HTTPException(status_code=401, detail="Credenciais inválidas")

@app.post("/auth/v1/signup")
async def register(req: Request):
    data = await req.json()
    email = data.get("email")
    password = data.get("password")
    username = data.get("data", {}).get("username", "Usuario_Local")
    
    import uuid
    new_id = str(uuid.uuid4())
    
    conn = get_db()
    try:
        conn.execute("INSERT INTO usuarios (id, email, username, password) VALUES (?, ?, ?, ?)", 
                     (new_id, email, username, password))
        conn.commit()
        return {
            "access_token": "local-token-123", 
            "user": {"id": new_id, "email": email, "user_metadata": {"username": username}}
        }
    except sqlite3.IntegrityError:
        print("Integrity Error!")
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    except Exception as e:
        print("Register Exception: ", e)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.get("/auth/v1/user")
def get_user():
    # Mock para manter sessao viva
    return {"id": "1", "email": "admin@teste.com", "user_metadata": {"username": "Admin Local"}}

@app.post("/auth/v1/logout")
def logout():
    return {}

@app.head("/rest/v1/{table}")
@app.get("/rest/v1/{table}")
def get_all(table: str, req: Request):
    conn = get_db()
    try:
        if req.method == "HEAD":
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            from fastapi.responses import Response
            return Response(headers={"Content-Range": f"0-{count-1}/{count}"})
            
        query_str = "SELECT * FROM " + table
        where_clauses = []
        values = []
        
        for k, v in req.query_params.items():
            if k in ["limit", "offset", "order"]: continue
            
            if v.startswith("ilike."):
                where_clauses.append(f"{k} LIKE ?")
                values.append(v.replace("ilike.", ""))
            elif v.startswith("eq."):
                where_clauses.append(f"{k} = ?")
                values.append(v.replace("eq.", ""))
            elif v.startswith("gte."):
                where_clauses.append(f"{k} >= ?")
                values.append(v.replace("gte.", ""))
            elif v.startswith("lte."):
                where_clauses.append(f"{k} <= ?")
                values.append(v.replace("lte.", ""))
                
        if where_clauses:
            query_str += " WHERE " + " AND ".join(where_clauses)

        if "order" in req.query_params:
            order_param = req.query_params["order"]
            if "." in order_param:
                col, d = order_param.split(".", 1)
                query_str += f" ORDER BY {col} {'DESC' if d.lower() == 'desc' else 'ASC'}"
        
        limit = None
        offset = None
        if "limit" in req.query_params:
            limit = int(req.query_params["limit"])
        if "offset" in req.query_params:
            offset = int(req.query_params["offset"])
            
        range_header = req.headers.get("Range") or req.headers.get("range")
        if range_header:
            parts = range_header.replace("items=", "").split("-")
            if len(parts) == 2:
                from_idx = int(parts[0])
                to_idx = int(parts[1])
                limit = to_idx - from_idx + 1
                offset = from_idx

        if limit is not None:
            query_str += f" LIMIT {limit}"
        if offset is not None:
            query_str += f" OFFSET {offset}"
            
        rows = conn.execute(query_str, values).fetchall()
        return [dict(ix) for ix in rows]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.post("/rest/v1/{table}")
async def insert_record(table: str, req: Request):
    data = await req.json()
    if not isinstance(data, list):
        data = [data]
    if not data: return []
    
    conn = get_db()
    try:
        keys = data[0].keys()
        cols = ", ".join(keys)
        vals = ", ".join(["?"] * len(keys))
        query = f"INSERT INTO {table} ({cols}) VALUES ({vals})"
        
        tuples = [tuple(row[k] for k in keys) for row in data]
        cursor = conn.executemany(query, tuples)
        conn.commit()
        return {"inserted": cursor.rowcount}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.patch("/rest/v1/{table}")
async def update_record(table: str, req: Request):
    data = await req.json()
    if not data: return []
    
    # Extrai o filtro da query (ex: ?id=eq.123)
    where_clause = ""
    values = list(data.values())
    for k, v in req.query_params.items():
        if v.startswith("eq."):
            where_clause = f" WHERE {k} = ?"
            values.append(v.replace("eq.", ""))
            break
            
    conn = get_db()
    try:
        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        query = f"UPDATE {table} SET {set_clause}{where_clause}"
        cursor = conn.execute(query, values)
        conn.commit()
        
        # Supabase usually returns the updated row if Prefer: return=representation is set, but we just return []
        return [data] 
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/rest/v1/{table}")
def delete_record(table: str, req: Request):
    where_clause = ""
    values = []
    for k, v in req.query_params.items():
        if v.startswith("eq."):
            where_clause = f" WHERE {k} = ?"
            values.append(v.replace("eq.", ""))
            break

    conn = get_db()
    try:
        cursor = conn.execute(f"DELETE FROM {table}{where_clause}", values)
        conn.commit()
        return []
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.post("/groq")
async def proxy_groq(req: Request):
    import urllib.request
    import urllib.error
    
    GROQ_URL = "https://api.cloudflare.com/client/v4/accounts/17add9f645d8586ef4b9e895df1ec9ea/ai/v1/chat/completions"
    
    body = await req.body()
    auth = req.headers.get("Authorization", "")
    
    try:
        req_out = urllib.request.Request(
            GROQ_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": auth,
            },
            method="POST"
        )
        with urllib.request.urlopen(req_out, timeout=30) as resp:
            response_body = resp.read()
            
        from fastapi.responses import Response
        return Response(content=response_body, media_type="application/json")
        
    except urllib.error.HTTPError as e:
        from fastapi.responses import Response
        return Response(content=e.read(), status_code=e.code, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prazo_ciente")
def get_prazo_ciente(email: str):
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    conn = get_db()
    rows = conn.execute("SELECT registro_id, faixa_prazo FROM registro_prazo_ciente WHERE user_email = ?", (email,)).fetchall()
    conn.close()
    return [{"registro_id": r["registro_id"], "faixa_prazo": r["faixa_prazo"]} for r in rows]

@app.post("/api/prazo_ciente")
async def post_prazo_ciente(req: Request):
    data = await req.json()
    email = data.get("email")
    notificacoes = data.get("notificacoes", [])
    if not email or not notificacoes:
        return {"status": "ok"}
    
    import datetime
    now_str = datetime.datetime.now().isoformat()
    
    conn = get_db()
    try:
        for n in notificacoes:
            conn.execute('''
                INSERT OR IGNORE INTO registro_prazo_ciente (user_email, registro_id, faixa_prazo, data_ciente)
                VALUES (?, ?, ?, ?)
            ''', (email, n["registro_id"], n["faixa_prazo"], now_str))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    
    return {"status": "ok"}

# ==========================================
# SSE (Server-Sent Events) - REALTIME SYNC
# ==========================================
@app.get("/api/stream")
async def sse_stream(request: Request):
    """
    Endpoint SSE que escuta as mudanças no arquivo SQLite.
    Como a arquitetura é distribuída (cada PC roda o seu server.py),
    o método mais rápido e leve de detectar que *outro* PC salvou algo 
    é checando a data de modificação (mtime) do arquivo database.sqlite.
    """
    async def event_generator():
        last_mtime = 0
        if os.path.exists(DB_PATH):
            last_mtime = os.path.getmtime(DB_PATH)
        
        while True:
            if await request.is_disconnected():
                break
            
            # Checa a data de modificação do arquivo
            if os.path.exists(DB_PATH):
                current_mtime = os.path.getmtime(DB_PATH)
                if current_mtime > last_mtime:
                    last_mtime = current_mtime
                    # Arquivo mudou! Envia um evento SSE para o frontend atualizar a tela
                    yield f"data: {json.dumps({'type': 'db_updated'})}\n\n"
            
            # Aguarda 1 segundo antes de checar novamente (muito leve para a rede/disco)
            await asyncio.sleep(1)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(ROOT_DIR, "index.html"))

app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8080)
