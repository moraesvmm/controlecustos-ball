import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT * FROM rc_registros WHERE item_id IN (167, 168, 169, 171)")
rows = cursor.fetchall()
for r in rows:
    print(dict(r))

conn.close()
