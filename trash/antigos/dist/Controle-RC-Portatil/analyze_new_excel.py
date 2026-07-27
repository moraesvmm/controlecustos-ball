import pandas as pd

file_path = r'C:\Users\VMORAES1\Downloads\controleplanilharc.xlsx'
try:
    df = pd.read_excel(file_path, sheet_name=0)
    print("Columns:", list(df.columns))
    
    # Try to find date columns
    for col in df.columns:
        dt_col = pd.to_datetime(df[col], errors='coerce')
        valid_dates = dt_col.dropna()
        if not valid_dates.empty:
            print(f"Col '{col}': min={valid_dates.min()}, max={valid_dates.max()}")
            jan_rows = df[dt_col.dt.month == 1]
            if not jan_rows.empty:
                print(f"--> Found {len(jan_rows)} rows in January based on {col}")
except Exception as e:
    print("Error:", e)
