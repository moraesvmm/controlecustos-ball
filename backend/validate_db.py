import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

print("--- RELATÓRIO DE VALIDAÇÃO rc_registros ---")

# 1. Total de registros
cursor.execute("SELECT COUNT(*) FROM rc_registros")
total = cursor.fetchone()[0]
print(f"Total de registros na tabela: {total}")

# 2. Registros com ID NULO
cursor.execute("SELECT COUNT(*) FROM rc_registros WHERE id IS NULL")
null_ids = cursor.fetchone()[0]
print(f"Registros com ID nulo: {null_ids}")

# 3. Registros com ID VAZIO
cursor.execute("SELECT COUNT(*) FROM rc_registros WHERE id = ''")
empty_ids = cursor.fetchone()[0]
print(f"Registros com ID vazio (string vazia): {empty_ids}")

# 4. IDs Duplicados
cursor.execute("SELECT id, COUNT(*) FROM rc_registros GROUP BY id HAVING COUNT(*) > 1")
dups = cursor.fetchall()
print(f"IDs duplicados: {len(dups)}")
for d in dups:
    print(f"  - ID: {d[0]} aparece {d[1]} vezes")

# 5. Registros sem item_id
cursor.execute("SELECT COUNT(*) FROM rc_registros WHERE item_id IS NULL")
null_item_id = cursor.fetchone()[0]
print(f"Registros sem item_id: {null_item_id}")

conn.close()
