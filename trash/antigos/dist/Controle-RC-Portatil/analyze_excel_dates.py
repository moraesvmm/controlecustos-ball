import pandas as pd

file_path = r'C:\Users\VMORAES1\Downloads\CONTROLE RC (1).xlsx'
df = pd.read_excel(file_path, sheet_name=0)

for col in df.columns:
    # Try to convert column to datetime
    dt_col = pd.to_datetime(df[col], errors='coerce')
    valid_dates = dt_col.dropna()
    if not valid_dates.empty:
        print(f"Col {col}: min={valid_dates.min()}, max={valid_dates.max()}")
