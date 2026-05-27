import pandas as pd

df = pd.read_excel('C:/Users/VMORAES1/Downloads/CONTROLE RC (2).xlsx', sheet_name='Planilha1')

def clean(x):
    if pd.isnull(x):
        return 0.0
    if isinstance(x, str):
        try:
            return float(x.replace('R$ ', '').replace('R$', '').replace('.', '').replace(',', '.'))
        except:
            return 0.0
    return float(x)

print('Sum VALOR PREVISTO:', df['VALOR PREVISTO'].apply(clean).sum())
print('Sum VALOR RECEBIDO:', df['VALOR RECEBIDO'].apply(clean).sum())
