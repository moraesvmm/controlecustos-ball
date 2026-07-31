import sqlite3
import uuid
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Encontrar todos os registros que estão com id = NULL
cursor.execute("SELECT rowid, item_id FROM rc_registros WHERE id IS NULL")
rows = cursor.fetchall()

print(f"Encontrados {len(rows)} registros com ID nulo.")
for r in rows:
    print(f" - rowid: {r[0]}, item_id: {r[1]}")

updated = 0
for r in rows:
    uid = str(uuid.uuid4())
    cursor.execute("UPDATE rc_registros SET id = ? WHERE rowid = ?", (uid, r[0]))
    updated += 1

conn.commit()
print(f"Atualizados {updated} registros no total.")
conn.close()
