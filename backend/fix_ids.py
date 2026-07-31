import sqlite3
import uuid
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT rowid, item_id FROM rc_registros WHERE id IS NULL AND item_id IN (167, 168, 169)")
rows = cursor.fetchall()
updated = 0

for r in rows:
    uid = str(uuid.uuid4())
    cursor.execute("UPDATE rc_registros SET id = ? WHERE rowid = ?", (uid, r[0]))
    updated += 1

conn.commit()
print(f"Atualizados {updated} registros.")
conn.close()
