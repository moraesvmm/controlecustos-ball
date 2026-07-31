import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'database.sqlite')
conn = sqlite3.connect(DB_PATH)

# Clean raw data
conn.execute("DELETE FROM kpi_paradas_raw WHERE maquina LIKE '%Falta De Energia%' OR maquina LIKE '%Segmento%' OR maquina LIKE '%Retorno ap%'")

# Clean offender data where they might be stored
conn.execute("DELETE FROM kpi_maquinas_ofensoras WHERE maquina LIKE '%Falta De Energia%' OR maquina LIKE '%Segmento%' OR maquina LIKE '%Retorno ap%'")

conn.commit()
conn.close()
