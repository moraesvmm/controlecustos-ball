#!/usr/bin/env python3
"""
Importa dados do Excel para Supabase (tabela rc_registros).
Uso:
  set SUPABASE_URL=https://nnbzcukmuziyrobdqlnh.supabase.co
  set SUPABASE_SERVICE_KEY=sua_service_role_key
  python scripts/import_to_supabase.py
"""
import json
import os
import re
import sys

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE, "data", "rc_principal.json")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nnbzcukmuziyrobdqlnh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

def parse_date(v):
    if not v:
        return None
    s = str(v)
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return None

def parse_valor(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_item_id(v):
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        s = str(v).strip()
        digits = "".join(c for c in s if c.isdigit())
        return int(digits) if digits else None


def map_row(row):
    nat = str(row.get("NATUREZA") or "CONSERTO").upper()
    nat = nat.replace("Ã", "A").replace("Ç", "C")
    if "FABRIC" in nat:
        natureza = "FABRICACAO"
    elif "COMPRA" in nat:
        natureza = "COMPRA"
    elif "SERV" in nat:
        natureza = "SERVICO"
    else:
        natureza = "CONSERTO"
    crit = str(row.get("CRITICIDADE") or "").upper()
    if crit == "CRITICA":
        criticidade = "CRITICA"
    elif crit in ("ALTA", "MEDIA", "BAIXA"):
        criticidade = crit
    else:
        criticidade = None

    return {
        "sinal": row.get("SINAL"),
        "item_id": parse_item_id(row.get("ID")),
        "natureza": natureza,
        "item": row.get("ITEM") or "",
        "descricao_falha": row.get("DESCRIÇÃO FALHA") or row.get("DESCRIÇÃO FALHA"),
        "solicitante": row.get("SOLICITANTE"),
        "criticidade": criticidade,
        "linha": row.get("LINHA"),
        "maquina": row.get("MAQUINA"),
        "fornecedor": row.get("FORNECEDOR"),
        "nf_saida": str(row["NF DE SAÍDA"]) if row.get("NF DE SAÍDA") is not None else None,
        "data_saida": parse_date(row.get("DATA DE SAÍDA")),
        "orcamento": str(row["ORÇAMENTO"]) if row.get("ORÇAMENTO") is not None else None,
        "rc": str(row["RC"]) if row.get("RC") is not None else None,
        "po": str(row["PO"]) if row.get("PO") is not None else None,
        "valor": parse_valor(row.get("VALOR")),
        "previsao_entrega": parse_date(row.get("PREVISAO_ENTREGA")),
        "data_recebimento": parse_date(row.get("DATA RECEBIMENTO")),
    }

def main():
    if not SUPABASE_KEY:
        print("Defina SUPABASE_SERVICE_KEY (recomendado) ou SUPABASE_ANON_KEY")
        sys.exit(1)

    with open(DATA_FILE, encoding="utf-8") as f:
        rows = json.load(f)

    payload = [map_row(r) for r in rows if r.get("ITEM")]
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/rc_registros"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    # Limpa e reinsere (cuidado em produção)
    print(f"Enviando {len(payload)} registros para Supabase...")
    r = requests.post(url, headers=headers, json=payload, timeout=60)
    if r.status_code >= 400:
        print("Erro:", r.status_code, r.text)
        sys.exit(1)
    print("Importação concluída.")

if __name__ == "__main__":
    main()
