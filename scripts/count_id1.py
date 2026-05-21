import json
import pandas as pd
import requests

EXCEL = r"C:\Users\VMORAES1\Downloads\CONTROLE RC (1).xlsx"
JSON_FILE = r"C:\Users\VMORAES1\controle-rc-system\data\rc_principal.json"
SUPABASE_URL = "https://nnbzcukmuziyrobdqlnh.supabase.co"
SUPABASE_KEY = "sb_publishable_XQxDmGp9Iz0bmNOTiDKKug_6Byxau2e"


def norm_nat(v):
    s = str(v or "").upper()
    if "FABRIC" in s:
        return "FABRICACAO"
    if "COMPRA" in s:
        return "COMPRA"
    return "CONSERTO"


def parse_id(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# Excel
df = pd.read_excel(EXCEL, sheet_name="Planilha1")
df["_id"] = df["ID"].apply(parse_id)
df["_nat"] = df["NATUREZA"].apply(norm_nat)
excel = df[(df["_id"] == 1) & (df["_nat"] == "CONSERTO")]
print("=== PLANILHA EXCEL (Planilha1) ===")
print("ID 1 + CONSERTO:", len(excel))
for _, r in excel.iterrows():
    item = str(r.get("ITEM", ""))[:55]
    print(f"  - {item} | RC={r.get('RC')} | PO={r.get('PO')}")

# JSON
with open(JSON_FILE, encoding="utf-8") as f:
    rows = json.load(f)
json_rows = [
    r
    for r in rows
    if parse_id(r.get("ID")) == 1 and norm_nat(r.get("NATUREZA")) == "CONSERTO"
]
print()
print("=== JSON exportado (data/rc_principal.json) ===")
print("ID 1 + CONSERTO:", len(json_rows))

# Supabase
url = f"{SUPABASE_URL}/rest/v1/rc_registros?item_id=eq.1&natureza=eq.CONSERTO&select=item_id,natureza,item,rc,po"
headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
r = requests.get(url, headers=headers, timeout=20)
supa = r.json() if r.status_code == 200 else []
print()
print("=== SISTEMA (Supabase) ===")
print("ID 1 + CONSERTO:", len(supa))
for row in supa:
    item = str(row.get("item", ""))[:55]
    print(f"  - {item} | RC={row.get('rc')} | PO={row.get('po')}")
