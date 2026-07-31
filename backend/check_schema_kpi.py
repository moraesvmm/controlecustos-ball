import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(kpi_confiabilidade)")
cols = cursor.fetchall()
print([c[1] for c in cols])
conn.close()
