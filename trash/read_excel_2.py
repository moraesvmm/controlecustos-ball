import pandas as pd
excel_file = pd.ExcelFile(r'C:\Users\VMORAES1\Documents\Financeiro_1607.xlsx')
sheet_name = next(s for s in excel_file.sheet_names if 'moviment' in s.lower())
df = pd.read_excel(excel_file, sheet_name=sheet_name, header=1) # header at row 1
print("Check values:", df['Check'].fillna('VAZIO').value_counts())
