import os
import pandas as pd
import sys
import glob

def train_model(folder_path):
    print(f"Buscando planilhas .xlsm na pasta: {folder_path} (e subpastas)")
    files = glob.glob(os.path.join(folder_path, '**', '*.xlsm'), recursive=True)
    
    if not files:
        print("Nenhuma planilha .xlsm encontrada!")
        return
        
    print(f"Foram encontradas {len(files)} planilhas. Processando...")
    
    all_data = []
    
    for f in files:
        try:
            print(f"Lendo: {os.path.basename(f)}")
            xl = pd.ExcelFile(f)
            # Achar a aba correta
            sheet = None
            for s in xl.sheet_names:
                if 'Movimenta' in s or 'Geral' in s:
                    sheet = s
                    break
            if not sheet:
                print("Aba de dados não encontrada!")
                continue
                
            df = pd.read_excel(f, sheet_name=sheet, header=None)
            
            # Localizar a linha de cabecalho
            header_row = 0
            for i, row in df.iterrows():
                row_str = ' '.join([str(x).lower() for x in row.values])
                if 'dt-trans' in row_str or 'dt_trans' in row_str:
                    header_row = i
                    break
            
            # Agora recarregar com o cabecalho correto
            df = pd.read_excel(f, sheet_name=sheet, header=header_row)
            
            # Normalizar nomes de colunas
            cols = {c: c.lower().replace(' ', '_').replace('-', '_') for c in df.columns}
            df.rename(columns=cols, inplace=True)
            
            # Renomear colunas especificas
            rename_map = {}
            for c in df.columns:
                if 'custo_do_m' in c: rename_map[c] = 'custo_do_mes'
                elif 'custo_m' in c and 'anterior' in c: rename_map[c] = 'custo_mes_anterior'
                elif 'custo_de_entrada' in c: rename_map[c] = 'custo_de_entrada'
                elif 'rea' in c: rename_map[c] = 'area'
            df.rename(columns=rename_map, inplace=True)
            
            # Filtrar apenas o que tem dt_trans
            if 'dt_trans' not in df.columns:
                print("Coluna dt_trans não encontrada!")
                continue
            df['dt_trans'] = pd.to_datetime(df['dt_trans'], errors='coerce')
            df = df.dropna(subset=['dt_trans'])
            
            # Somar os custos
            for col in ['custo_do_mes', 'custo_mes_anterior', 'custo_de_entrada']:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            df['custo_cc'] = df['custo_do_mes'] + df['custo_mes_anterior'] + df['custo_de_entrada']
            
            # Filtrar apenas Manutencao
            # Como a coluna 'area' pode estar ausente ou nula em algumas planilhas antigas, fazemos um fallback
            df['area'] = df['area'].astype(str).str.upper()
            df['it_codigo'] = df['it_codigo'].astype(str).str.upper()
            
            def is_manutencao(row):
                if 'MANUTENÇÃO' in row['area'] or 'MANUTENCAO' in row['area']: return True
                if row['it_codigo'].startswith('UCMAN') or row['it_codigo'].startswith('SER'): return True
                return False
                
            df['is_manut'] = df.apply(is_manutencao, axis=1)
            df_manut = df[df['is_manut']]
            
            if df_manut.empty:
                print(f"Aviso: Nenhuma linha de Manutenção encontrada em {os.path.basename(f)}")
                continue
                
            # Agrupar por dia
            df_manut['ds'] = df_manut['dt_trans'].dt.date
            daily = df_manut.groupby('ds').agg(
                y=('custo_cc', 'sum'),
                volume_ordens=('custo_cc', 'count')
            ).reset_index()
            
            all_data.append(daily)
            
        except Exception as e:
            print(f"Erro ao processar {os.path.basename(f)}: {e}")
            
    if not all_data:
        print("Nenhum dado válido extraído.")
        return
        
    final_df = pd.concat(all_data, ignore_index=True)
    # Ordenar por data
    final_df = final_df.sort_values('ds')
    
    # Salvar o csv
    output_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'historical_burn_rate.csv')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    final_df.to_csv(output_path, index=False)
    print(f"Treinamento concluído! Histórico salvo em {output_path} com {len(final_df)} dias mapeados.")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        folder = sys.argv[1]
    else:
        print("Uso: python analyze_history_ml.py <caminho_da_pasta_com_xlsm>")
        sys.exit(1)
        
    train_model(folder)
