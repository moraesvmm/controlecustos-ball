import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT periodo_ref, COUNT(*) FROM kpi_confiabilidade WHERE periodo_tipo = 'SEMANA' GROUP BY periodo_ref ORDER BY CAST(periodo_ref AS INTEGER)")
rows = cursor.fetchall()
print("Semanas no BD kpi_confiabilidade:")
for r in rows:
    print(dict(r))

conn.close()
