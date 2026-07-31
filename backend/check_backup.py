import sqlite3
import os

BACKUP_PATH = r"C:\Users\VMORAES1\Documents\backupcustos\database\database.sqlite"

try:
    conn = sqlite3.connect(BACKUP_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM rc_registros WHERE item_id IN (167, 168, 169)")
    rows = cursor.fetchall()
    
    if not rows:
        print("Nenhum registro encontrado para esses IDs no backup.")
    else:
        for r in rows:
            print(dict(r))
            
    conn.close()
except Exception as e:
    print(f"Erro ao acessar o backup: {e}")
