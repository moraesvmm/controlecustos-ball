import sqlite3
conn = sqlite3.connect('database.sqlite')
res = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios'").fetchone()
print(res[0] if res else "Not found")
