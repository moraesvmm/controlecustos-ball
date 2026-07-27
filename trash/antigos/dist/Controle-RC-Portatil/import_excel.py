import pandas as pd
import requests
import json
import unicodedata

# Config
SUPABASE_URL = 'https://nnbzcukmuziyrobdqlnh.supabase.co'
SUPABASE_ANON_KEY = 'sb_publishable_XQxDmGp9Iz0bmNOTiDKKug_6Byxau2e'
FILE_PATH = r'C:\Users\VMORAES1\Downloads\controleplanilharc.xlsx'

def normalizar_natureza(v):
    s = str(v).upper() if pd.notnull(v) else ''
    if 'FABRIC' in s: return 'FABRICACAO'
    if 'COMPRA' in s: return 'COMPRA'
    if 'SERV' in s: return 'SERVICO'
    return 'CONSERTO'

def normalizar_criticidade(v):
    if pd.isnull(v): return 'BAIXA'
    s = str(v).upper()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    if 'CRITIC' in s: return 'CRITICA'
    if 'ALTA' in s: return 'ALTA'
    if 'MEDIA' in s: return 'MEDIA'
    return 'BAIXA'

def parse_date(v):
    if pd.isnull(v): return None
    try:
        if isinstance(v, str):
            return pd.to_datetime(v, dayfirst=True, errors='coerce').strftime('%Y-%m-%d')
        return pd.to_datetime(v).strftime('%Y-%m-%d')
    except:
        return None

def try_parse_int(v):
    if pd.isnull(v): return None
    try:
        return int(float(v))
    except:
        return None

print("Reading Excel...")
df = pd.read_excel(FILE_PATH, sheet_name='Planilha1')

payloads = []
max_item_id = 1000

for _, row in df.iterrows():
    if pd.isnull(row.get('RC')) and pd.isnull(row.get('ITEM')):
        continue
        
    natureza_val = row.get('Ttulo') or row.get('T\xedtulo') or row.get('Título') or row.get('NATUREZA')
    
    item_id = try_parse_int(row.get('ITEM'))
    if item_id is None:
        item_id = max_item_id
        max_item_id += 1
        
    record = {
        'item_id': item_id,
        'natureza': normalizar_natureza(natureza_val),
        'item': str(row.get('Coluna1') or '')[:255] if pd.notnull(row.get('Coluna1')) else '',
        'descricao_falha': str(row.get('DESCRIÇÃO FALHA') or row.get('DESCRIO FALHA') or ''),
        'solicitante': str(row.get('SOLICITANTE') or ''),
        'criticidade': normalizar_criticidade(row.get('CRITICIDADE')),
        'linha': str(row.get('LINHA') or ''),
        'maquina': str(row.get('MÁQUINA') or row.get('MQUINA') or ''),
        'fornecedor': str(row.get('FORNECEDOR') or ''),
        'nf_saida': str(row.get('NF DE SAÍDA ') or row.get('NF DE SADA ') or ''),
        'data_saida': parse_date(row.get('DATA DE SAÍDA') or row.get('DATA DE SADA')),
        'orcamento': str(row.get('ORÇAMENTO') or row.get('ORAMENTO') or ''),
        'rc': str(row.get('RC') or ''),
        'po': str(row.get('PO') or ''),
        'valor': float(row['VALOR']) if pd.notnull(row.get('VALOR')) and not isinstance(row.get('VALOR'), str) else 0.0,
        'previsao_entrega': parse_date(row.get('PREVISAO_ENTREGA') or row.get('PREVISÃO_ENTREGA') or row.get('PREVISO DE ENTREGA')),
        'data_recebimento': parse_date(row.get('DATA RECEBIMENTO')),
        'comentario': str(row.get('COMENTÁRIO') or '')
    }
    
    # Clean strings
    for k, v in record.items():
        if isinstance(v, str):
            record[k] = v.strip()
            if record[k] == 'nan' or record[k] == '':
                if k == 'item':
                    record[k] = 'Sem descrição'
                else:
                    record[k] = None
                
    payloads.append(record)

print(f"Prepared {len(payloads)} records to upload.")

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

print("Uploading to Supabase...")
for i in range(0, len(payloads), 100):
    batch = payloads[i:i+100]
    res = requests.post(f"{SUPABASE_URL}/rest/v1/rc_registros", headers=headers, json=batch)
    if res.status_code >= 300:
        print(f"Error {res.status_code}: {res.text}")
    else:
        print(f"Batch {i//100 + 1} uploaded successfully!")
print("Done.")
