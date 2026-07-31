import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)

conn.execute('''
CREATE TABLE IF NOT EXISTS kpi_lifespan_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina TEXT NOT NULL,
    linha TEXT NOT NULL,
    nome_componente TEXT NOT NULL,
    data_instalacao TEXT NOT NULL,
    vida_alvo_dias INTEGER NOT NULL,
    descricao_troca TEXT,
    foto_url TEXT,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

conn.commit()
conn.close()
print("Table kpi_lifespan_components created successfully.")
