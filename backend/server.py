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
SYNC_PATH = os.path.join(os.path.dirname(__file__), "database", "database.sync")

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

@app.middleware("http")
async def sse_trigger_middleware(request: Request, call_next):
    override = request.headers.get("x-http-method-override", "").upper()
    method = override if override else request.method
    path = request.url.path
    
    response = await call_next(request)
    
    # Touch the sync file if it's a modifying request
    if method in ["POST", "PATCH", "PUT", "DELETE"] and ("/rest/v1/" in path or "/api/" in path):
        if 200 <= response.status_code < 300:
            if path != "/api/stream":
                try:
                    with open(SYNC_PATH, 'a'):
                        os.utime(SYNC_PATH, None)
                except Exception:
                    pass
    return response

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
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-20000;") # Usa 20MB de RAM local para cache de leitura (muito mais rápido)
    return conn

def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=TRUNCATE;")
    
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

    # Tabelas do módulo de Confiabilidade (MTBF/MTTR calculado do MGPRO)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_paradas_raw (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linha TEXT,
            grupo_parada TEXT,
            data TEXT,
            semana_iso INTEGER,
            mes INTEGER,
            ano INTEGER,
            dur_min REAL
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_confiabilidade (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linha TEXT,
            periodo_tipo TEXT,
            periodo_ref TEXT,
            ano INTEGER,
            n_falhas INTEGER,
            tempo_parado_min REAL,
            mtbf_h REAL,
            mttr_h REAL,
            indisponibilidade_pct REAL,
            UNIQUE(linha, periodo_tipo, periodo_ref, ano)
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS kpi_metas_confiabilidade (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linha TEXT UNIQUE,
            meta_mtbf_h REAL,
            meta_mttr_h REAL,
            meta_indisponibilidade_pct REAL
        )
    ''')

    # Inserir metas padrão se não existirem
    linhas_padrao = ['Linha 4', 'Linha 5', 'Linha 6', 'Linha 7', 'Linha 8', 'Linha 9']
    for ln in linhas_padrao:
        conn.execute('''
            INSERT OR IGNORE INTO kpi_metas_confiabilidade (linha, meta_mtbf_h, meta_mttr_h, meta_indisponibilidade_pct)
            VALUES (?, ?, ?, ?)
        ''', (ln, 4.0, 0.5, 8.0))

    conn.execute('''
        CREATE TABLE IF NOT EXISTS retomada_l05 (
            id          INTEGER PRIMARY KEY,
            maquina     TEXT,
            descricao   TEXT,
            duracao     REAL,
            profissional TEXT,
            perc_execucao REAL DEFAULT 0,
            os          TEXT,
            status      TEXT DEFAULT NULL,
            created_at  TEXT,
            updated_at  TEXT
        )
    ''')

    conn.commit()
    conn.close()


@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/health")
def health_check():
    return {"status": "ok", "db_path": DB_PATH}

# ==============================================================================
# MÓDULO: Retomada Linha 05
# ==============================================================================

@app.get("/api/retomada_l05")
def get_retomada_l05():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM retomada_l05 ORDER BY id").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.patch("/api/retomada_l05/{id}")
async def patch_retomada_l05(id: int, req: Request):
    from datetime import datetime
    data = await req.json()
    conn = get_db()
    try:
        current = conn.execute("SELECT * FROM retomada_l05 WHERE id=?", (id,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        
        current = dict(current)
        
        if "os" in data:
            os_val = data.get("os")
        else:
            os_val = current["os"]
            
        if "perc_execucao" in data:
            perc = float(data.get("perc_execucao", 0) or 0)
            # Business rule: 100% -> CONCLUÍDO, >0 -> EM EXECUÇÃO, 0 -> None
            if perc >= 100:
                perc = 100
                status = "CONCLUÍDO"
            elif perc > 0:
                status = "EM EXECUÇÃO"
            else:
                status = None
        else:
            perc = current["perc_execucao"]
            status = current["status"]
            
        now = datetime.now().isoformat()
        conn.execute(
            "UPDATE retomada_l05 SET perc_execucao=?, status=?, os=?, updated_at=? WHERE id=?",
            (perc, status, os_val, now, id)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM retomada_l05 WHERE id=?", (id,)).fetchone()
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.post("/api/retomada_l05/import")
async def import_retomada_l05(req: Request):
    """Bulk import from frontend (one-time). Replaces all rows."""
    from datetime import datetime
    data = await req.json()  # list of dicts
    conn = get_db()
    try:
        conn.execute("DELETE FROM retomada_l05")
        now = datetime.now().isoformat()
        for row in data:
            raw_status = row.get("status")
            # Normalize status to use proper Portuguese
            if raw_status and ("CONCLU" in str(raw_status).upper()):
                normalized_status = "CONCLUÍDO"
            elif raw_status and ("EXECU" in str(raw_status).upper()):
                normalized_status = "EM EXECUÇÃO"
            else:
                normalized_status = None
            # Business rule: 100% always → CONCLUÍDO
            perc = float(row.get("perc_execucao", 0) or 0)
            if perc >= 100:
                perc = 100
                normalized_status = "CONCLUÍDO"
            elif perc > 0 and not normalized_status:
                normalized_status = "EM EXECUÇÃO"
            conn.execute(
                "INSERT INTO retomada_l05 (id, maquina, descricao, duracao, profissional, perc_execucao, os, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (row.get("id"), row.get("maquina"), row.get("descricao"), row.get("duracao"),
                 row.get("profissional"), perc, row.get("os"),
                 normalized_status, now, now)
            )
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM retomada_l05").fetchone()[0]
        return {"imported": count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()



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
    from starlette.concurrency import run_in_threadpool
    is_single = req.headers.get("Accept") == "application/vnd.pgrst.object+json"
    
    def _do_insert():
        import uuid
        from datetime import datetime
        conn = get_db()
        try:
            inserted_rows = []
            rows_to_insert = data if isinstance(data, list) else [data]
            if not rows_to_insert: return []
            
            for row_data in rows_to_insert:
                if "id" not in row_data or not row_data["id"]:
                    row_data["id"] = str(uuid.uuid4())
                # Get table columns to avoid injecting non-existent columns
                cursor_info = conn.execute(f"PRAGMA table_info({table})")
                table_cols = [col[1] for col in cursor_info.fetchall()]
                
                if "created_at" not in row_data and "created_at" in table_cols:
                    row_data["created_at"] = datetime.now().isoformat()
                if ("last_modified_at" not in row_data or not row_data["last_modified_at"]) and "last_modified_at" in table_cols:
                    row_data["last_modified_at"] = datetime.now().isoformat()
                
                # Remove any keys that are not in the table
                keys = [k for k in row_data.keys() if k in table_cols]
                
                cols = ", ".join(keys)
                vals = ", ".join(["?"] * len(keys))
                query = f"INSERT INTO {table} ({cols}) VALUES ({vals})"
                
                conn.execute(query, tuple(row_data[k] for k in keys))
                
                # Fetch the inserted row to return it
                cursor = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_data["id"],))
                inserted_rows.append(dict(cursor.fetchone()))
                
            conn.commit()
            if is_single and inserted_rows:
                return inserted_rows[0]
            return inserted_rows
        finally:
            conn.close()

    try:
        return await run_in_threadpool(_do_insert)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/rest/v1/{table}")
async def update_record(table: str, req: Request):
    data = await req.json()
    if not data: return []
    from starlette.concurrency import run_in_threadpool
    is_single = req.headers.get("Accept") == "application/vnd.pgrst.object+json"
    
    where_clause = ""
    values = list(data.values())
    for k, v in req.query_params.items():
        if v.startswith("eq."):
            where_clause = f" WHERE {k} = ?"
            values.append(v.replace("eq.", ""))
            break
            
    def _do_update():
        conn = get_db()
        try:
            # Get table columns to avoid injecting non-existent columns
            cursor_info = conn.execute(f"PRAGMA table_info({table})")
            table_cols = [col[1] for col in cursor_info.fetchall()]
            
            if "last_modified_at" not in data and "last_modified_at" in table_cols:
                from datetime import datetime
                data["last_modified_at"] = datetime.now().isoformat()
            
            # Remove any keys that are not in the table
            keys = [k for k in data.keys() if k in table_cols]
            
            # Re-build values based on the filtered keys
            values = [data[k] for k in keys]
            
            # Re-append query param values (e.g. eq.id=123) for WHERE clause
            for k, v in req.query_params.items():
                if v.startswith("eq."):
                    values.append(v.replace("eq.", ""))
                    break
            
            set_clause = ", ".join([f"{k} = ?" for k in keys])
            query = f"UPDATE {table} SET {set_clause}{where_clause}"
            conn.execute(query, values)
            conn.commit()
            
            # Retrieve the updated row(s) to simulate Supabase 'select()'
            select_query = f"SELECT * FROM {table}{where_clause}"
            select_cursor = conn.execute(select_query, values[len(data.values()):])
            updated_rows = [dict(ix) for ix in select_cursor.fetchall()]
            
            if is_single and updated_rows:
                return updated_rows[0]
            return updated_rows 
        finally:
            conn.close()

    try:
        return await run_in_threadpool(_do_update)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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

# ==========================================
# MÓDULO CONFIABILIDADE: MTBF / MTTR
# ==========================================

@app.post("/api/import/paradas")
async def import_paradas(req: Request):
    """Recebe JSON com lista de registros do MGPRO já parseados no front (via SheetJS),
    filtra grupos de reparo, calcula MTBF/MTTR/Indisponibilidade e salva no banco."""
    import datetime, math
    data = await req.json()
    rows = data.get("rows", [])
    ano = int(data.get("ano", datetime.datetime.now().year))
    file_mes = data.get("mes")

    GRUPOS_REPARO = ['Reparos Mecânicos', 'Reparos Elétricos']
    TEMPO_MES_MIN = 30 * 24 * 60   # 43200 min - 30 dias 24h
    TEMPO_SEM_MIN = 7 * 24 * 60    # 10080 min - 7 dias 24h

    def hms_to_min(s):
        try:
            parts = str(s).strip().split(':')
            h, m, sec = int(parts[0]), int(parts[1]), float(parts[2])
            return h * 60 + m + sec / 60
        except:
            return 0.0

    def semana_iso(data_str):
        try:
            d = datetime.datetime.strptime(str(data_str)[:10], '%Y-%m-%d')
            return d.isocalendar()[1]
        except:
            return 0

    def mes_num(data_str):
        try:
            return int(str(data_str)[5:7])
        except:
            return 0

    # Filtra apenas reparos
    reparos = [r for r in rows if any(g in str(r.get('grupo', '')) for g in GRUPOS_REPARO)]
    if not reparos:
        raise HTTPException(status_code=400, detail="Nenhum registro de Reparos Mecânicos ou Elétricos encontrado no arquivo.")

    conn = get_db()
    try:
        # 1. Limpa dados do ano importado
        conn.execute("DELETE FROM kpi_paradas_raw WHERE ano = ?", (ano,))
        conn.execute("DELETE FROM kpi_confiabilidade WHERE ano = ?", (ano,))

        # 2. Insere raw
        for r in reparos:
            dur = hms_to_min(r.get('duracao', '0:0:0'))
            sem = semana_iso(r.get('data', ''))
            mes = int(file_mes) if file_mes else mes_num(r.get('data', ''))
            conn.execute(
                "INSERT INTO kpi_paradas_raw (linha, grupo_parada, data, semana_iso, mes, ano, dur_min) VALUES (?,?,?,?,?,?,?)",
                (r.get('linha', ''), r.get('grupo', ''), str(r.get('data', ''))[:10], sem, mes, ano, dur)
            )

        # 3. Calcula KPIs por Linha x Mês
        rows_mes = conn.execute(
            "SELECT linha, mes, COUNT(*) as n, SUM(dur_min) as tp FROM kpi_paradas_raw WHERE ano=? GROUP BY linha, mes",
            (ano,)
        ).fetchall()
        MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        for r in rows_mes:
            ln, mes, n, tp = r['linha'], r['mes'], r['n'], r['tp'] or 0
            tf = max(TEMPO_MES_MIN - tp, 0)
            mtbf = (tf / n / 60) if n > 0 else 0
            mttr = (tp / n / 60) if n > 0 else 0
            indisp = (tp / TEMPO_MES_MIN) * 100
            per_ref = MESES[mes - 1] if 1 <= mes <= 12 else str(mes)
            conn.execute('''
                INSERT OR REPLACE INTO kpi_confiabilidade
                (linha, periodo_tipo, periodo_ref, ano, n_falhas, tempo_parado_min, mtbf_h, mttr_h, indisponibilidade_pct)
                VALUES (?,?,?,?,?,?,?,?,?)
            ''', (ln, 'MES', per_ref, ano, n, tp, round(mtbf,2), round(mttr,2), round(indisp,2)))

        # 4. Calcula KPIs por Linha x Semana
        rows_sem = conn.execute(
            "SELECT linha, semana_iso, COUNT(*) as n, SUM(dur_min) as tp FROM kpi_paradas_raw WHERE ano=? GROUP BY linha, semana_iso",
            (ano,)
        ).fetchall()
        for r in rows_sem:
            ln, sem, n, tp = r['linha'], r['semana_iso'], r['n'], r['tp'] or 0
            tf = max(TEMPO_SEM_MIN - tp, 0)
            mtbf = (tf / n / 60) if n > 0 else 0
            mttr = (tp / n / 60) if n > 0 else 0
            indisp = (tp / TEMPO_SEM_MIN) * 100
            per_ref = f'S{sem:02d}'
            conn.execute('''
                INSERT OR REPLACE INTO kpi_confiabilidade
                (linha, periodo_tipo, periodo_ref, ano, n_falhas, tempo_parado_min, mtbf_h, mttr_h, indisponibilidade_pct)
                VALUES (?,?,?,?,?,?,?,?,?)
            ''', (ln, 'SEMANA', per_ref, ano, n, tp, round(mtbf,2), round(mttr,2), round(indisp,2)))

        conn.commit()
        total = len(reparos)
        return {"status": "ok", "importados": total, "ano": ano}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/kpi/confiabilidade")
def get_kpi_confiabilidade(periodo_tipo: str = 'MES', ano: int = None, linha: str = None):
    import datetime
    if not ano:
        ano = datetime.datetime.now().year
    conn = get_db()
    try:
        q = "SELECT * FROM kpi_confiabilidade WHERE periodo_tipo=? AND ano=?"
        vals = [periodo_tipo, ano]
        if linha and linha != 'TODAS':
            q += " AND linha=?"
            vals.append(linha)
        q += " ORDER BY linha, periodo_ref"
        rows = conn.execute(q, vals).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/kpi/metas-confiabilidade")
def get_metas_confiabilidade():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM kpi_metas_confiabilidade ORDER BY linha").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/kpi/metas-confiabilidade")
async def save_metas_confiabilidade(req: Request):
    data = await req.json()  # lista de {linha, meta_mtbf_h, meta_mttr_h, meta_indisponibilidade_pct}
    conn = get_db()
    try:
        for item in data:
            conn.execute('''
                INSERT INTO kpi_metas_confiabilidade (linha, meta_mtbf_h, meta_mttr_h, meta_indisponibilidade_pct)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(linha) DO UPDATE SET
                    meta_mtbf_h=excluded.meta_mtbf_h,
                    meta_mttr_h=excluded.meta_mttr_h,
                    meta_indisponibilidade_pct=excluded.meta_indisponibilidade_pct
            ''', (item['linha'], item['meta_mtbf_h'], item['meta_mttr_h'], item['meta_indisponibilidade_pct']))
        conn.commit()
        return {"status": "ok"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
        if os.path.exists(SYNC_PATH):
            last_mtime = os.path.getmtime(SYNC_PATH)
        
        while True:
            if await request.is_disconnected():
                break
            
            # Checa a data de modificação do arquivo de sincronização
            if os.path.exists(SYNC_PATH):
                current_mtime = os.path.getmtime(SYNC_PATH)
                if current_mtime > last_mtime:
                    last_mtime = current_mtime
                    # Arquivo de sync mudou! Envia um evento SSE para o frontend atualizar a tela
                    yield f"data: {json.dumps({'type': 'db_updated'})}\n\n"
            
            # Aguarda 1 segundo antes de checar novamente
            await asyncio.sleep(1)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(ROOT_DIR, "index.html"))

app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8080)
