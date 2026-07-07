import pandas as pd
import glob

def clean(x):
    if pd.isnull(x): return 0.0
    if isinstance(x, str):
        try: return float(x.replace('R$ ', '').replace('R$', '').replace('.', '').replace(',', '.'))
        except: return 0.0
    return float(x)

files = [
    'C:/Users/VMORAES1/Downloads/CONTROLE RC (2).xlsx',
    'C:/Users/VMORAES1/Downloads/CONTROLE RC (1).xlsx',
    'C:/Users/VMORAES1/Downloads/CONTROLE RC.xlsx',
    'C:/Users/VMORAES1/Downloads/controleplanilharc.xlsx'
]

for f in files:
    try:
        xl = pd.ExcelFile(f)
        print(f"\n--- {f.split('/')[-1]} ---")
        for sheet in xl.sheet_names:
            df = xl.parse(sheet)
            if 'VALOR' in df.columns:
                s = df['VALOR'].apply(clean).sum()
                print(f"  {sheet}: R$ {s:,.2f}")
    except Exception as e:
        print(f"Error on {f}: {e}")
