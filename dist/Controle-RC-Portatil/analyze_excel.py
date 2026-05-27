import pandas as pd
import json

file_path = r'C:\Users\VMORAES1\Downloads\CONTROLE RC (1).xlsx'
df = pd.read_excel(file_path, sheet_name=0)

# Identify relevant columns
cols = df.columns
print("Columns:", list(cols))

# Find columns for date received and expected delivery
date_rec_col = next((c for c in cols if 'DATA' in c.upper() and 'RECEBIMENTO' in c.upper()), None)
date_prev_col = next((c for c in cols if 'PREVISAO' in c.upper() or 'PREVISÃO' in c.upper() or 'ENTREGA' in c.upper()), None)
valor_col = next((c for c in cols if 'VALOR' in c.upper()), None)

print(f"Date Rec Col: {date_rec_col}")
print(f"Date Prev Col: {date_prev_col}")
print(f"Valor Col: {valor_col}")

if date_rec_col and valor_col:
    # Convert to datetime
    df[date_rec_col] = pd.to_datetime(df[date_rec_col], errors='coerce')
    # Filter only rows with data_recebimento
    received_df = df[df[date_rec_col].notnull()]
    
    # Group by month
    received_df['mes'] = received_df[date_rec_col].dt.strftime('%Y-%m')
    grouped = received_df.groupby('mes')[valor_col].sum()
    print("\nValores recebidos por mês na planilha original:")
    print(grouped)
