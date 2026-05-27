import pandas as pd
import requests

SUPABASE_URL = "https://nnbzcukmuziyrobdqlnh.supabase.co/rest/v1/rc_registros"
SUPABASE_KEY = "sb_publishable_XQxDmGp9Iz0bmNOTiDKKug_6Byxau2e"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

# Fetch DB data
response = requests.get(SUPABASE_URL, headers=headers)
if response.status_code == 200:
    db_data = response.json()
    df_db = pd.DataFrame(db_data)
else:
    print("Error fetching DB:", response.status_code, response.text)
    exit(1)

# Fetch Excel data
excel_path = r'C:\Users\VMORAES1\Downloads\CONTROLE RC (2).xlsx'
df_excel = pd.read_excel(excel_path)

# Normalize column names in Excel to make it easier to find matches
excel_cols = {str(c).lower().strip(): c for c in df_excel.columns}

item_col = excel_cols.get('item')
status_col = excel_cols.get('status')
rc_col = excel_cols.get('rc')

if not item_col or not status_col:
    print("Could not find 'item' or 'status' column in excel.")
    exit(1)

print(f"Total DB records: {len(df_db)}")
print(f"Total Excel records: {len(df_excel)}")

# Prepare comparison
df_db['match_id'] = pd.to_numeric(df_db['item_id'], errors='coerce')

# Excel ITEM column
item_col = next((c for c in df_excel.columns if str(c).strip().upper() == 'ITEM'), None)
status_col = next((c for c in df_excel.columns if str(c).strip().upper() == 'STATUS'), None)

if not item_col or not status_col:
    print("Could not find 'ITEM' or 'STATUS' columns in excel.")
    print("Found:", list(df_excel.columns))
    exit(1)

df_excel['match_id'] = pd.to_numeric(df_excel[item_col], errors='coerce')

merged = pd.merge(df_db.dropna(subset=['match_id']), df_excel.dropna(subset=['match_id']), on='match_id', how='inner', suffixes=('_db', '_ex'))
print(f'Matched records by ID: {len(merged)}')

diffs = []
for idx, row in merged.iterrows():
    db_status = str(row.get('status_db') or '').strip().upper()
    ex_status = str(row[status_col]).strip().upper()
    
    if not db_status.startswith('PENDENTE'):
        continue
        
    if ex_status != 'NAN' and ex_status != db_status:
        norm_db = db_status.replace('Ç', 'C').replace('ENTREGE', 'ENTREGUE')
        norm_ex = ex_status.replace('Ç', 'C').replace('ENTREGE', 'ENTREGUE')
        
        if norm_db != norm_ex:
            diffs.append({
                'ID': int(row['match_id']),
                'Item': row.get('item_db') or row.get('item_ex', ''),
                'Status DB': db_status,
                'Status Planilha': ex_status
            })

if diffs:
    print(f"\nEncontradas {len(diffs)} diferenças (DB = Pendente, Planilha = Outro):")
    for d in diffs:
        print(f"- [ID {d['ID']}] {d['Item']} | Sistema: {d['Status DB']} | Planilha: {d['Status Planilha']}")
else:
    print("\nNenhuma diferença real encontrada entre os itens pendentes no sistema e na planilha!")
    print("\nAqui estão os pendentes encontrados:")
    for idx, row in merged.iterrows():
        db_status = str(row.get('status_db') or '').strip().upper()
        ex_status = str(row[status_col]).strip().upper()
        if db_status.startswith('PENDENTE'):
            print(f"- [ID {row['match_id']}] {row.get('item_db')} | DB: {db_status} | Excel: {ex_status}")


