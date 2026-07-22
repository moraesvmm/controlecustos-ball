import os
import sqlite3
import uuid
import pandas as pd
import sys
from datetime import datetime
import warnings

# Silenciar avisos do openpyxl
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')

# Adiciona o diretório atual ao sys.path para importar ai_engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_engine import treinar_modelo1_budget

BASE_DIR = r"C:\Users\VMORAES1\Documents\A ALIMENTAR"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database", "database.sqlite")

def find_excels(base_dir):
    res = []
    for root, dirs, files in os.walk(base_dir):
        for f in files:
            if f.endswith('.xlsm') and not f.startswith('~'):
                res.append(os.path.join(root, f))
    return res

def process_file(filepath, conn):
    print(f"Processando: {filepath}")
    try:
        # Descobrir nome da aba correta
        xl = pd.ExcelFile(filepath)
        sheet_name = None
        for s in xl.sheet_names:
            if "Movimenta" in s or "Custo Geral" in s or "Consumo Geral" in s:
                sheet_name = s
                break
        
        if not sheet_name:
            print(f"  -> Aba de movimentação não encontrada.")
            return

        df = pd.read_excel(filepath, sheet_name=sheet_name, skiprows=6)
        
        # Mapeamento dinâmico de colunas
        cols = df.columns.tolist()
        
        def find_col(possible_names):
            for c in cols:
                if str(c).lower().strip() in [p.lower() for p in possible_names]:
                    return c
            return None

        c_it = find_col(['it-codigo', 'it_codigo'])
        c_dt = find_col(['dt-trans', 'dt_trans', 'data'])
        c_mes = find_col(['Mês', 'Mes'])
        c_custo = find_col(['Custo De entrada', 'custo_de_entrada', 'valor-entrada'])
        c_area = find_col(['Área', 'rea', 'area'])
        c_grupo = find_col(['Grupo'])
        c_carater = find_col(['Caráter', 'Carter', 'carater'])

        if not all([c_dt, c_custo]):
            print(f"  -> Colunas obrigatórias não encontradas. Encontradas: {cols[:15]}")
            return

        # Filtrar registros nulos
        df = df.dropna(subset=[c_dt, c_custo])
        
        cursor = conn.cursor()
        inseridos = 0
        for _, row in df.iterrows():
            it_codigo = str(row[c_it]) if c_it and pd.notna(row[c_it]) else ""
            dt_val = row[c_dt]
            if isinstance(dt_val, datetime):
                dt_trans = dt_val.strftime('%Y-%m-%d')
            else:
                dt_trans = str(dt_val)[:10]
            
            mes = int(row[c_mes]) if c_mes and pd.notna(row[c_mes]) else 0
            custo = float(row[c_custo]) if c_custo and pd.notna(row[c_custo]) else 0.0
            area = str(row[c_area]) if c_area and pd.notna(row[c_area]) else ""
            grupo = str(row[c_grupo]) if c_grupo and pd.notna(row[c_grupo]) else ""
            carater = str(row[c_carater]) if c_carater and pd.notna(row[c_carater]) else ""

            uid = str(uuid.uuid4())
            
            cursor.execute("""
                INSERT INTO custo_geral (id, it_codigo, dt_trans, mes, custo_de_entrada, area, grupo, carater)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (uid, it_codigo, dt_trans, mes, custo, area, grupo, carater))
            inseridos += 1
        
        conn.commit()
        print(f"  -> {inseridos} registros inseridos.")
    
    except Exception as e:
        print(f"  -> Erro ao processar: {e}")

def main():
    print("Iniciando importação histórica...")
    files = find_excels(BASE_DIR)
    print(f"Encontrados {len(files)} arquivos.")
    
    conn = sqlite3.connect(DB_PATH)
    
    for f in files:
        process_file(f, conn)
    
    conn.close()
    
    print("\nImportação concluída. Iniciando treinamento do Modelo 1 (Budget Forecast)...")
    treinar_modelo1_budget()
    print("Processo finalizado!")

if __name__ == "__main__":
    main()
