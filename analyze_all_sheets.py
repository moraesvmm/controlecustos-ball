import pandas as pd
import math

file_path = r'C:\Users\VMORAES1\Downloads\controleplanilharc.xlsx'
try:
    xl = pd.ExcelFile(file_path)
    print("Sheets available:", xl.sheet_names)
    
    for sheet_name in xl.sheet_names:
        print(f"\n--- Checking Sheet: {sheet_name} ---")
        df = xl.parse(sheet_name)
        
        for col in df.columns:
            # We are looking for any date columns
            if 'DATA' in str(col).upper() or 'PREVIS' in str(col).upper() or 'ENTREGA' in str(col).upper():
                dt_col = pd.to_datetime(df[col], errors='coerce')
                valid_dates = dt_col.dropna()
                if not valid_dates.empty:
                    print(f"Col '{col}': min={valid_dates.min().strftime('%Y-%m-%d')}, max={valid_dates.max().strftime('%Y-%m-%d')}")
                    jan = valid_dates[valid_dates.dt.month == 1]
                    if not jan.empty:
                        print(f"   >>> Found {len(jan)} records in January!")
except Exception as e:
    print("Error:", e)
