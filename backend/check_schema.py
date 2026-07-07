import sqlite3, os
db_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\backend\database\database.sqlite'
conn = sqlite3.connect(db_path)
print('--- rc_registros schema ---')
for row in conn.execute('PRAGMA table_info(rc_registros);').fetchall():
    print(row)
print('--- other tables ---')
for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall():
    print(row[0])
