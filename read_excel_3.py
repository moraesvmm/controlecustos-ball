import pandas as pd
import math

excel_file = pd.ExcelFile(r'C:\Users\VMORAES1\Documents\Financeiro_1607.xlsx')
sheet_name = next(s for s in excel_file.sheet_names if 'moviment' in s.lower())
df = pd.read_excel(excel_file, sheet_name=sheet_name, header=1)

custo_col = next((c for c in df.columns if 'custo' in str(c).lower() and 'm' in str(c).lower() and not 'anterior' in str(c).lower()), None)
df[custo_col] = pd.to_numeric(df[custo_col], errors='coerce').fillna(0)

print(f"Total Custo do Mes: {df[custo_col].sum():.2f}")

# Group by each categorical column to find something that gives ~476k
for col in ['Grupo', 'C.Custos', 'Descrio Emitente', 'Descriao Conta2']:
    if col in df.columns:
        print(f"\n--- Grouping by {col} ---")
        counts = df.groupby(col)[custo_col].sum().sort_values(ascending=False)
        for name, val in counts.items():
            if val > 10000:
                print(f"{name}: {val:.2f}")

# Check the user's specific areas (Manutenção, Ferramentaria, Facilities) based on some rule?
