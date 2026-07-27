import pandas as pd

file_path = r'C:\Users\VMORAES1\Downloads\CONTROLE RC (1).xlsx'
df = pd.read_excel(file_path, sheet_name=0)

prev_col = [c for c in df.columns if 'PREVIS' in c.upper()][0]
status_col = [c for c in df.columns if 'STATUS' in c.upper()][0]
valor_col = [c for c in df.columns if 'VALOR' in c.upper()][0]

df[prev_col] = pd.to_datetime(df[prev_col], errors='coerce')
df['mes_prev'] = df[prev_col].dt.strftime('%Y-%m')

# Group by status and month
print("Agrupado por STATUS e MES_PREV:")
print(df.groupby([status_col, 'mes_prev'])[valor_col].sum())
