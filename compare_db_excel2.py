import pandas as pd
import requests

SUPABASE_URL = 'https://nnbzcukmuziyrobdqlnh.supabase.co/rest/v1/rc_registros'
SUPABASE_KEY = 'sb_publishable_XQxDmGp9Iz0bmNOTiDKKug_6Byxau2e'
headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
df_db = pd.DataFrame(requests.get(SUPABASE_URL, headers=headers).json())
df_excel = pd.read_excel(r'C:\Users\VMORAES1\Downloads\CONTROLE RC (2).xlsx', sheet_name='Planilha1')

item_col = next((c for c in df_excel.columns if str(c).strip().upper() == 'ITEM'), None)
status_col = next((c for c in df_excel.columns if str(c).strip().upper() == 'STATUS'), None)

df_db['match_id'] = pd.to_numeric(df_db['item_id'], errors='coerce')
df_excel['match_id'] = pd.to_numeric(df_excel[item_col], errors='coerce')

def calc_status(row):
    if pd.notna(row.get('data_recebimento')) and str(row.get('data_recebimento')).strip() and str(row.get('data_recebimento')).strip() != 'None': return 'ENTREGUE'
    if pd.notna(row.get('data_saida')) and str(row.get('data_saida')).strip() and str(row.get('data_saida')).strip() != 'None' and not (str(row.get('orcamento')).strip() and str(row.get('orcamento')).strip() != 'None') and not (str(row.get('rc')).strip() and str(row.get('rc')).strip() != 'None') and not (str(row.get('po')).strip() and str(row.get('po')).strip() != 'None'): return 'PENDENTE DE ORCAMENTO'
    if pd.notna(row.get('orcamento')) and str(row.get('orcamento')).strip() and str(row.get('orcamento')).strip() != 'None' and not (str(row.get('rc')).strip() and str(row.get('rc')).strip() != 'None') and not (str(row.get('po')).strip() and str(row.get('po')).strip() != 'None'): return 'PENDENTE DE RC'
    if pd.notna(row.get('rc')) and str(row.get('rc')).strip() and str(row.get('rc')).strip() != 'None' and not (str(row.get('po')).strip() and str(row.get('po')).strip() != 'None'): return 'PENDENTE DE PEDIDO'
    if pd.notna(row.get('po')) and str(row.get('po')).strip() and str(row.get('po')).strip() != 'None' and not (str(row.get('data_recebimento')).strip() and str(row.get('data_recebimento')).strip() != 'None'): return 'PENDENTE DE ENTREGA'
    return 'PENDENTE DE ENVIO'

df_db['status_db'] = df_db.apply(calc_status, axis=1)

merged = pd.merge(df_db.dropna(subset=['match_id']), df_excel.dropna(subset=['match_id']), on='match_id', how='inner', suffixes=('_db', '_ex'))

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
                'Item': row.get('item') or '',
                'Status DB': db_status,
                'Status Planilha': ex_status
            })

if diffs:
    print(f"\nEncontradas {len(diffs)} diferenças (DB = Pendente, Planilha = Outro):")
    seen = set()
    for d in diffs:
        key = f"{d['ID']}-{d['Status Planilha']}"
        if key not in seen:
            print(f"- [ID {d['ID']}] {d['Item']} | Sistema: {d['Status DB']} | Planilha: {d['Status Planilha']}")
            seen.add(key)
else:
    print("\nNenhuma diferença encontrada!")
