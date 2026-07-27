import pandas as pd
df = pd.read_excel(r'C:\Users\VMORAES1\Downloads\CONTROLE RC (2).xlsx')
status_col = None
for col in df.columns:
    if str(col).lower().strip() == 'status':
        status_col = col
        break

if status_col:
    print('Unique statuses:')
    unique = df[status_col].dropna().unique()
    for s in sorted([str(x).strip() for x in unique]):
        print(f' - {s}')
else:
    print('No Status column found.')
    print(df.columns)
