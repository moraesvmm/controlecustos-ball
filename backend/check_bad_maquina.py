import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT grupo_parada, maquina, ano, mes, data FROM kpi_paradas_raw WHERE maquina LIKE '%Segmento%' OR maquina LIKE '%Retorno%' LIMIT 10")
for r in cursor.fetchall():
    print(dict(r))

conn.close()
