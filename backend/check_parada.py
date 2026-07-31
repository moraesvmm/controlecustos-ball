import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.execute("SELECT grupo_parada, parada_original FROM kpi_paradas_raw LIMIT 5")
print("First 5 records:", c.fetchall())

c.execute("SELECT COUNT(*) FROM kpi_paradas_raw WHERE parada_original = '' OR parada_original IS NULL")
print("Empty parada_original:", c.fetchone())

conn.close()
