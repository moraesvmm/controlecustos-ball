import sqlite3
import os

db_path = os.path.join("database", "database.sqlite")
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Seed kpi_linhas
linhas = [
    ('Linha 4', 10.5, 5.4),
    ('Linha 5', 0.0, 0.0),
    ('Linha 6', 13.3, 18.3),
    ('Linha 7', 14.1, 14.8),
    ('Linha 8', 10.8, 11.0),
    ('Linha 9', 14.7, 11.4)
]
c.executemany('INSERT OR IGNORE INTO kpi_linhas (linha, anual_pct, mensal_pct) VALUES (?,?,?)', linhas)

# Seed kpi_compliance
comps = [
    ('PM', 42.0),
    ('LUB', 86.0),
    ('PREV', 47.5),
    ('ESPEC', 35.0)
]
c.executemany('INSERT OR IGNORE INTO kpi_compliance (tipo, valor_pct) VALUES (?,?)', comps)

# Seed kpi_mtbf
mtbf = [
    ('MEC', 'Prensa', 192, 23, 24, 50, 37, 100),
    ('MEC', 'Torno', 88, 84, 38, 41, 99, 100),
    ('MEC', 'Lavadora', 766, 48, 121, 231, 465, 100),
    ('MEC', 'AC1', 2298, 4013, 3886, 1080, 3882, 100),
    ('MEC', 'Verniz Interno', 40, 76, 111, 119, 72, 100),
    
    ('ELE', 'Prensa', 100, 85, 103, 206, 243, 100),
    ('ELE', 'Torno', 115, 111, 169, 135, 431, 100),
    ('ELE', 'Lavadora', 460, 93, 169, 302, 971, 100),
]
for t in mtbf:
    c.execute('INSERT INTO kpi_mtbf (tipo, maquina, linha_4, linha_5, linha_6, linha_7, linha_8, target) VALUES (?,?,?,?,?,?,?,?)', t)

conn.commit()
conn.close()
print('Mock KPIs seeded.')
