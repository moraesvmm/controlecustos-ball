import pandas as pd
excel_file = pd.ExcelFile(r'C:\Users\VMORAES1\Documents\Financeiro_1607.xlsx')
print("Sheet names:", excel_file.sheet_names)
sheet_name = next(s for s in excel_file.sheet_names if 'moviment' in s.lower())
df = pd.read_excel(excel_file, sheet_name=sheet_name)
print("Initial columns:", df.columns.tolist()[:10])

# find the real header
for i, row in df.head(20).iterrows():
    row_str = ' '.join(str(x).lower() for x in row)
    if 'it-codigo' in row_str or 'item' in row_str or 'ordem' in row_str:
        print(f"Header at row {i}")
        df = pd.read_excel(excel_file, sheet_name=sheet_name, header=i+1)
        break

print("Actual columns:", df.columns.tolist())
check_col = next((c for c in df.columns if str(c).lower().strip() == 'check'), None)
custo_col = next((c for c in df.columns if 'custo' in str(c).lower() and 'm' in str(c).lower() and not 'anterior' in str(c).lower()), None)
print(f"Check col: {check_col}, Custo col: {custo_col}")

if check_col and custo_col:
    df[custo_col] = pd.to_numeric(df[custo_col], errors='coerce').fillna(0)
    print(df.groupby(check_col)[custo_col].sum())
