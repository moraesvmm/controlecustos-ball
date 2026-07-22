"""
================================================================================
SISTEMA CONTROLE DE CUSTOS — ENGINE DE INTELIGÊNCIA ARTIFICIAL (XGBoost)
================================================================================
4 Modelos de Machine Learning rodando 100% localmente:
  Modelo 1: Budget Forecasting (Regressão) — Projeção XGBoost de estouro de budget
  Modelo 2: Machine Failure Prediction (Classificação) — Radar de risco de quebra
  Modelo 3: Anomaly Detection (Isolation Forest) — Lançamentos financeiros suspeitos
  Modelo 4: Spare Parts Prediction (Regressão) — Previsão de necessidade de peças
================================================================================
"""

import sqlite3
import os
import json
import pickle
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_absolute_error
import xgboost as xgb
import joblib

# ─── Caminhos ────────────────────────────────────────────────────────────────
# Suporta ser chamado de qualquer diretório
_THIS_FILE = os.path.abspath(__file__)
_BACKEND_DIR = os.path.dirname(_THIS_FILE)
# ai_engine.py fica em backend/, então o DB fica em backend/database/
DB_PATH   = os.path.join(_BACKEND_DIR, "database", "database.sqlite")
MODEL_DIR = os.path.join(_BACKEND_DIR, "models")
REPORT_DIR = os.path.join(MODEL_DIR, "reports")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ══════════════════════════════════════════════════════════════════════════════
# MODELO 2: PREDIÇÃO DE QUEBRA DE MÁQUINA (Prioridade 1 — mais dados)
# Classifica: máquina terá falha grave (>60 min) nos próximos 7 dias?
# ══════════════════════════════════════════════════════════════════════════════

def treinar_modelo2_quebras():
    print("\n[MODELO 2] Treinando Predição de Quebra de Máquinas...")
    conn = get_conn()

    df = pd.read_sql_query("""
        SELECT
            maquina,
            linha,
            grupo_parada,
            semana_iso,
            mes,
            ano,
            data,
            dur_min
        FROM kpi_paradas_raw
        WHERE dur_min > 0 AND maquina IS NOT NULL
        ORDER BY data ASC
    """, conn)
    conn.close()

    if df.empty or len(df) < 100:
        print("  [AVISO] Dados insuficientes para Modelo 2.")
        return None

    df["data"] = pd.to_datetime(df["data"])
    df["dia_semana"] = df["data"].dt.dayofweek  # 0=segunda

    # ─── Agregar por máquina + semana ─────────────────────────────────────────
    agg = df.groupby(["maquina", "linha", "semana_iso", "mes", "ano"]).agg(
        n_falhas      = ("dur_min", "count"),
        tempo_total   = ("dur_min", "sum"),
        tempo_max     = ("dur_min", "max"),
        tempo_medio   = ("dur_min", "mean"),
    ).reset_index()

    # ─── Feature: tendência das últimas 3 semanas ──────────────────────────────
    agg = agg.sort_values(["maquina", "ano", "semana_iso"])
    agg["n_falhas_lag1"] = agg.groupby("maquina")["n_falhas"].shift(1).fillna(0)
    agg["n_falhas_lag2"] = agg.groupby("maquina")["n_falhas"].shift(2).fillna(0)
    agg["tempo_lag1"]    = agg.groupby("maquina")["tempo_total"].shift(1).fillna(0)
    agg["tempo_lag2"]    = agg.groupby("maquina")["tempo_total"].shift(2).fillna(0)
    agg["tendencia"]     = agg["tempo_total"] - agg["tempo_lag1"]

    # ─── Target: semana seguinte tem quebra grave (>60 min)? ──────────────────
    agg["target_quebra_grave"] = (
        agg.groupby("maquina")["tempo_max"].shift(-1).fillna(0) > 60
    ).astype(int)

    # ─── Encode categoricals ──────────────────────────────────────────────────
    le_maquina = LabelEncoder()
    le_linha   = LabelEncoder()
    agg["maquina_enc"] = le_maquina.fit_transform(agg["maquina"].fillna("Desconhecida"))
    agg["linha_enc"]   = le_linha.fit_transform(agg["linha"].fillna("Desconhecida"))

    FEATURES = ["maquina_enc", "linha_enc", "semana_iso", "mes",
                "n_falhas", "tempo_total", "tempo_max", "tempo_medio",
                "n_falhas_lag1", "n_falhas_lag2",
                "tempo_lag1", "tempo_lag2", "tendencia"]

    df_model = agg.dropna(subset=FEATURES + ["target_quebra_grave"])
    X = df_model[FEATURES]
    y = df_model["target_quebra_grave"]

    if len(X) < 20:
        print("  [AVISO] Poucos exemplos após agregação. Usando todos para treino.")
        X_train, X_test, y_train, y_test = X, X, y, y
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scale_pos_weight = max(1, (y == 0).sum() / max((y == 1).sum(), 1))

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        verbosity=0
    )
    model.fit(X_train, y_train)

    # ─── Relatório ────────────────────────────────────────────────────────────
    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    acc = report.get("accuracy", 0)
    print(f"  Acurácia: {acc:.2%}")

    # ─── Salvar modelo e encoders ─────────────────────────────────────────────
    joblib.dump(model,      os.path.join(MODEL_DIR, "m2_quebras.pkl"))
    joblib.dump(le_maquina, os.path.join(MODEL_DIR, "m2_le_maquina.pkl"))
    joblib.dump(le_linha,   os.path.join(MODEL_DIR, "m2_le_linha.pkl"))
    joblib.dump(FEATURES,   os.path.join(MODEL_DIR, "m2_features.pkl"))

    # Salvar relatório
    with open(os.path.join(REPORT_DIR, "m2_quebras_report.json"), "w") as f:
        json.dump({"acuracia": acc, "report": report, "treinado_em": datetime.now().isoformat()}, f, indent=2)

    print(f"  [OK] Modelo 2 salvo em backend/models/m2_quebras.pkl")
    return model, le_maquina, le_linha, FEATURES, agg


def inferir_radar_risco():
    """
    Usa o Modelo 2 para gerar o Radar de Risco atual:
    retorna lista de máquinas com score de risco (0-100) para os próximos 7 dias.
    """
    model_path = os.path.join(MODEL_DIR, "m2_quebras.pkl")
    if not os.path.exists(model_path):
        return []

    model      = joblib.load(model_path)
    le_maquina = joblib.load(os.path.join(MODEL_DIR, "m2_le_maquina.pkl"))
    le_linha   = joblib.load(os.path.join(MODEL_DIR, "m2_le_linha.pkl"))
    FEATURES   = joblib.load(os.path.join(MODEL_DIR, "m2_features.pkl"))

    conn = get_conn()
    # Últimas 3 semanas de dados
    df = pd.read_sql_query("""
        SELECT maquina, linha, semana_iso, mes, ano, dur_min, data
        FROM kpi_paradas_raw
        WHERE dur_min > 0 AND maquina IS NOT NULL
        ORDER BY data DESC
        LIMIT 5000
    """, conn)
    conn.close()

    if df.empty:
        return []

    df["data"] = pd.to_datetime(df["data"])

    agg = df.groupby(["maquina", "linha", "semana_iso", "mes", "ano"]).agg(
        n_falhas    = ("dur_min", "count"),
        tempo_total = ("dur_min", "sum"),
        tempo_max   = ("dur_min", "max"),
        tempo_medio = ("dur_min", "mean"),
    ).reset_index()

    agg = agg.sort_values(["maquina", "ano", "semana_iso"])
    agg["n_falhas_lag1"] = agg.groupby("maquina")["n_falhas"].shift(1).fillna(0)
    agg["n_falhas_lag2"] = agg.groupby("maquina")["n_falhas"].shift(2).fillna(0)
    agg["tempo_lag1"]    = agg.groupby("maquina")["tempo_total"].shift(1).fillna(0)
    agg["tempo_lag2"]    = agg.groupby("maquina")["tempo_total"].shift(2).fillna(0)
    agg["tendencia"]     = agg["tempo_total"] - agg["tempo_lag1"]

    # Pegar apenas os dados mais recentes de cada máquina
    latest = agg.sort_values("semana_iso").groupby("maquina").last().reset_index()

    # Encode — usar classes conhecidas, mapear desconhecidas para "Desconhecida"
    known_maquinas = set(le_maquina.classes_)
    known_linhas   = set(le_linha.classes_)
    latest["maquina_enc"] = latest["maquina"].apply(
        lambda x: le_maquina.transform([x])[0] if x in known_maquinas else 0
    )
    latest["linha_enc"] = latest["linha"].apply(
        lambda x: le_linha.transform([x])[0] if x in known_linhas else 0
    )

    X_inf = latest[FEATURES].fillna(0)
    probs = model.predict_proba(X_inf)[:, 1]  # P(quebra grave)

    resultado = []
    for i, row in latest.iterrows():
        score = float(probs[i if i < len(probs) else -1]) * 100
        nivel = "ALTO" if score >= 60 else ("MEDIO" if score >= 30 else "BAIXO")
        cor   = "#ef4444" if nivel == "ALTO" else ("#f59e0b" if nivel == "MEDIO" else "#10b981")
        resultado.append({
            "maquina"    : row["maquina"],
            "linha"      : row["linha"],
            "score"      : round(score, 1),
            "nivel"      : nivel,
            "cor"        : cor,
            "n_falhas"   : int(row["n_falhas"]),
            "tempo_total": round(row["tempo_total"], 1),
        })

    resultado.sort(key=lambda x: x["score"], reverse=True)
    return resultado


# ══════════════════════════════════════════════════════════════════════════════
# MODELO 3: DETECÇÃO DE ANOMALIAS FINANCEIRAS (Isolation Forest)
# ══════════════════════════════════════════════════════════════════════════════

def treinar_modelo3_anomalias():
    print("\n[MODELO 3] Treinando Detecção de Anomalias Financeiras...")
    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT
            custo_de_entrada,
            custo_mes_anterior,
            mes,
            area,
            grupo,
            solicitante,
            carater
        FROM custo_geral
        WHERE it_codigo NOT IN ('BUDGET_METADATA', 'FORECAST_METADATA')
          AND custo_de_entrada IS NOT NULL
    """, conn)
    conn.close()

    if df.empty or len(df) < 10:
        print("  [AVISO] Dados insuficientes para Modelo 3.")
        return None

    df["custo_de_entrada"]    = pd.to_numeric(df["custo_de_entrada"], errors="coerce").fillna(0).abs()
    df["custo_mes_anterior"]  = pd.to_numeric(df["custo_mes_anterior"], errors="coerce").fillna(0).abs()
    df["mes"]                 = pd.to_numeric(df["mes"], errors="coerce").fillna(7)

    for col in ["area", "grupo", "solicitante", "carater"]:
        le = LabelEncoder()
        df[col + "_enc"] = le.fit_transform(df[col].fillna("Desconhecido").astype(str))
        joblib.dump(le, os.path.join(MODEL_DIR, f"m3_le_{col}.pkl"))

    FEATURES = ["custo_de_entrada", "custo_mes_anterior", "mes",
                "area_enc", "grupo_enc", "solicitante_enc", "carater_enc"]

    X = df[FEATURES].fillna(0)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.08,  # Espera ~8% de anomalias
        random_state=42
    )
    model.fit(X)

    scores = model.decision_function(X)  # Quanto menor = mais anômalo
    preds  = model.predict(X)            # -1 = anomalia, 1 = normal

    anomalias = (preds == -1).sum()
    print(f"  Anomalias detectadas no histórico: {anomalias} de {len(df)}")

    joblib.dump(model,   os.path.join(MODEL_DIR, "m3_anomalias.pkl"))
    joblib.dump(FEATURES, os.path.join(MODEL_DIR, "m3_features.pkl"))

    with open(os.path.join(REPORT_DIR, "m3_anomalias_report.json"), "w") as f:
        json.dump({
            "total_registros": int(len(df)),
            "anomalias_historico": int(anomalias),
            "pct_anomalias": round(anomalias / len(df) * 100, 1),
            "treinado_em": datetime.now().isoformat()
        }, f, indent=2)

    print(f"  [OK] Modelo 3 salvo em backend/models/m3_anomalias.pkl")
    return model


def inferir_anomalias():
    """
    Classifica todos os lançamentos do custo_geral como normal/anomalia.
    Retorna lista com score de anomalia por registro.
    """
    model_path = os.path.join(MODEL_DIR, "m3_anomalias.pkl")
    if not os.path.exists(model_path):
        return []

    model    = joblib.load(model_path)
    FEATURES = joblib.load(os.path.join(MODEL_DIR, "m3_features.pkl"))

    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT id, it_codigo, descricao_codigo, numero_ordem, custo_de_entrada,
               custo_mes_anterior, mes, area, grupo, solicitante, carater, dt_trans
        FROM custo_geral
        WHERE it_codigo NOT IN ('BUDGET_METADATA', 'FORECAST_METADATA')
    """, conn)
    conn.close()

    if df.empty:
        return []

    df["custo_de_entrada"]   = pd.to_numeric(df["custo_de_entrada"], errors="coerce").fillna(0).abs()
    df["custo_mes_anterior"] = pd.to_numeric(df["custo_mes_anterior"], errors="coerce").fillna(0).abs()
    df["mes"]                = pd.to_numeric(df["mes"], errors="coerce").fillna(7)

    for col in ["area", "grupo", "solicitante", "carater"]:
        le_path = os.path.join(MODEL_DIR, f"m3_le_{col}.pkl")
        if os.path.exists(le_path):
            le = joblib.load(le_path)
            known = set(le.classes_)
            df[col + "_enc"] = df[col].fillna("Desconhecido").astype(str).apply(
                lambda x: le.transform([x])[0] if x in known else 0
            )
        else:
            df[col + "_enc"] = 0

    X = df[FEATURES].fillna(0)
    scores = model.decision_function(X)   # Mais negativo = mais anômalo
    preds  = model.predict(X)             # -1 = anomalia

    df["anomalia"]       = (preds == -1)
    df["anomalia_score"] = ((-scores - scores.min()) / (scores.max() - scores.min() + 1e-9) * 100).round(1)

    resultado_raw = df[df["anomalia"]].to_dict(orient="records")
    
    import numpy as np
    resultado = []
    for row in resultado_raw:
        clean_row = {}
        for k, v in row.items():
            if pd.isna(v):
                clean_row[k] = None
            elif isinstance(v, (np.int64, np.int32)):
                clean_row[k] = int(v)
            elif isinstance(v, (np.float64, np.float32)):
                clean_row[k] = float(v)
            elif isinstance(v, (np.bool_, bool)):
                clean_row[k] = bool(v)
            else:
                clean_row[k] = v
        resultado.append(clean_row)
        
    resultado.sort(key=lambda x: x.get("anomalia_score", 0), reverse=True)
    return resultado


# ══════════════════════════════════════════════════════════════════════════════
# MODELO 1: BUDGET FORECASTING (Regressão XGBoost)
# ══════════════════════════════════════════════════════════════════════════════

def treinar_modelo1_budget():
    print("\n[MODELO 1] Treinando Budget Forecasting...")
    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT dt_trans, mes, custo_de_entrada, area, grupo, carater
        FROM custo_geral
        WHERE it_codigo NOT IN ('BUDGET_METADATA', 'FORECAST_METADATA')
          AND dt_trans IS NOT NULL AND custo_de_entrada IS NOT NULL
        ORDER BY dt_trans
    """, conn)
    conn.close()

    if df.empty or len(df) < 10:
        print("  [AVISO] Dados insuficientes para Modelo 1.")
        return None

    df["dt_trans"] = pd.to_datetime(df["dt_trans"], errors="coerce")
    df = df.dropna(subset=["dt_trans"])
    df["dia_mes"]          = df["dt_trans"].dt.day
    df["custo_de_entrada"] = pd.to_numeric(df["custo_de_entrada"], errors="coerce").fillna(0).abs()
    df["mes"]              = pd.to_numeric(df["mes"], errors="coerce").fillna(df["dt_trans"].dt.month)

    # Feature: custo acumulado até o dia X do mês
    df = df.sort_values("dt_trans")
    df["custo_acumulado"] = df.groupby(df["dt_trans"].dt.to_period("M"))["custo_de_entrada"].cumsum()

    for col in ["area", "grupo", "carater"]:
        le = LabelEncoder()
        df[col + "_enc"] = le.fit_transform(df[col].fillna("Desconhecido").astype(str))
        joblib.dump(le, os.path.join(MODEL_DIR, f"m1_le_{col}.pkl"))

    # Agregar por mês — Total gasto no mês (target)
    mensal = df.groupby(df["dt_trans"].dt.to_period("M")).agg(
        total_mes   = ("custo_de_entrada", "sum"),
        n_ordens    = ("custo_de_entrada", "count"),
        dia_maximo  = ("dia_mes", "max"),
        mes_num     = ("mes", "first"),
    ).reset_index()

    if len(mensal) < 2:
        print("  [AVISO] Histórico de meses insuficiente para treinar Modelo 1.")
        return None

    mensal["mes_num"] = mensal["mes_num"].astype(float)
    mensal["total_mes_lag1"] = mensal["total_mes"].shift(1).fillna(mensal["total_mes"].mean())

    FEATURES = ["n_ordens", "mes_num", "total_mes_lag1"]
    TARGET   = "total_mes"

    X = mensal[FEATURES].fillna(0)
    y = mensal[TARGET]

    model = xgb.XGBRegressor(
        n_estimators=100, max_depth=3, learning_rate=0.1,
        random_state=42, verbosity=0
    )
    model.fit(X, y)

    y_pred = model.predict(X)
    mae    = mean_absolute_error(y, y_pred)
    print(f"  MAE médio: R$ {mae:,.2f}")

    joblib.dump(model,   os.path.join(MODEL_DIR, "m1_budget.pkl"))
    joblib.dump(FEATURES, os.path.join(MODEL_DIR, "m1_features.pkl"))

    with open(os.path.join(REPORT_DIR, "m1_budget_report.json"), "w") as f:
        json.dump({
            "mae_brl": round(mae, 2),
            "meses_treinados": len(mensal),
            "treinado_em": datetime.now().isoformat()
        }, f, indent=2)

    print(f"  [OK] Modelo 1 salvo em backend/models/m1_budget.pkl")
    return model


def inferir_projecao_budget():
    """
    Usa o Modelo 1 para projetar o gasto total do mês corrente.
    """
    model_path = os.path.join(MODEL_DIR, "m1_budget.pkl")
    if not os.path.exists(model_path):
        return None

    model    = joblib.load(model_path)
    FEATURES = joblib.load(os.path.join(MODEL_DIR, "m1_features.pkl"))

    conn = get_conn()
    hoje = datetime.now()
    mes_atual = hoje.month

    df = pd.read_sql_query(f"""
        SELECT custo_de_entrada, dt_trans FROM custo_geral
        WHERE mes = {mes_atual}
          AND it_codigo NOT IN ('BUDGET_METADATA', 'FORECAST_METADATA')
          AND custo_de_entrada IS NOT NULL
    """, conn)

    df_anterior = pd.read_sql_query(f"""
        SELECT custo_de_entrada FROM custo_geral
        WHERE mes = {mes_atual - 1 if mes_atual > 1 else 12}
          AND it_codigo NOT IN ('BUDGET_METADATA', 'FORECAST_METADATA')
          AND custo_de_entrada IS NOT NULL
    """, conn)
    conn.close()

    df["custo_de_entrada"] = pd.to_numeric(df["custo_de_entrada"], errors="coerce").fillna(0).abs()
    custo_acumulado = df["custo_de_entrada"].sum()
    n_ordens        = len(df)

    total_mes_lag1 = pd.to_numeric(df_anterior["custo_de_entrada"], errors="coerce").fillna(0).abs().sum() if not df_anterior.empty else custo_acumulado

    X_inf = pd.DataFrame([{
        "n_ordens"        : n_ordens,
        "mes_num"         : float(mes_atual),
        "total_mes_lag1"  : total_mes_lag1
    }])[FEATURES]

    projecao = float(model.predict(X_inf)[0])

    return {
        "custo_acumulado"  : round(custo_acumulado, 2),
        "projecao_xgboost" : round(projecao, 2),
        "n_ordens"         : n_ordens,
        "mes"              : mes_atual,
        "treinado_em"      : _get_model_date("m1_budget_report.json")
    }


# ══════════════════════════════════════════════════════════════════════════════
# MODELO 4: PREVISÃO DE SPARE PARTS (Regressão XGBoost)
# ══════════════════════════════════════════════════════════════════════════════

def treinar_modelo4_spareparts():
    print("\n[MODELO 4] Treinando Previsão de Spare Parts...")
    conn = get_conn()

    df_paradas = pd.read_sql_query("""
        SELECT maquina, linha, semana_iso, mes, dur_min, grupo_parada
        FROM kpi_paradas_raw
        WHERE dur_min > 0 AND maquina IS NOT NULL
    """, conn)

    df_rc = pd.read_sql_query("""
        SELECT maquina, linha, criticidade, natureza, valor, created_at
        FROM rc_registros
        WHERE maquina IS NOT NULL
    """, conn)
    conn.close()

    if df_paradas.empty:
        print("  [AVISO] Dados de paradas insuficientes para Modelo 4.")
        return None

    # Feature engineering por máquina
    agg = df_paradas.groupby(["maquina", "linha", "semana_iso", "mes"]).agg(
        n_falhas          = ("dur_min", "count"),
        tempo_total       = ("dur_min", "sum"),
        n_falhas_mec      = ("grupo_parada", lambda x: (x.str.contains("ec", case=False, na=False)).sum()),
    ).reset_index()

    # Enriquecer com dados de RCs abertas (indicador de necessidade de peça)
    if not df_rc.empty:
        df_rc["maquina"] = df_rc["maquina"].str.upper().str.strip()
        rc_count = df_rc.groupby("maquina").size().reset_index(name="n_rc_abertas")
        agg["maquina_upper"] = agg["maquina"].str.upper().str.strip()
        agg = agg.merge(rc_count, left_on="maquina_upper", right_on="maquina", how="left", suffixes=("", "_rc"))
        agg["n_rc_abertas"] = agg["n_rc_abertas"].fillna(0)
    else:
        agg["n_rc_abertas"] = 0

    # Target: haverá mais de 2 falhas mecânicas na próxima semana?
    agg = agg.sort_values(["maquina", "semana_iso"])
    agg["target_sp"] = (
        agg.groupby("maquina")["n_falhas_mec"].shift(-1).fillna(0) > 2
    ).astype(int)

    le_maquina = LabelEncoder()
    le_linha   = LabelEncoder()
    agg["maquina_enc"] = le_maquina.fit_transform(agg["maquina"].fillna("Desconhecida"))
    agg["linha_enc"]   = le_linha.fit_transform(agg["linha"].fillna("Desconhecida"))

    FEATURES = ["maquina_enc", "linha_enc", "semana_iso", "mes",
                "n_falhas", "tempo_total", "n_falhas_mec", "n_rc_abertas"]

    df_model = agg.dropna(subset=FEATURES + ["target_sp"])
    X = df_model[FEATURES]
    y = df_model["target_sp"]

    if len(X) < 20:
        X_train, X_test = X, X
        y_train, y_test = y, y
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scale_pos_weight = max(1, (y == 0).sum() / max((y == 1).sum(), 1))

    model = xgb.XGBClassifier(
        n_estimators=150, max_depth=4, learning_rate=0.08,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False, eval_metric="logloss",
        random_state=42, verbosity=0
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    acc    = report.get("accuracy", 0)
    print(f"  Acurácia: {acc:.2%}")

    joblib.dump(model,      os.path.join(MODEL_DIR, "m4_spareparts.pkl"))
    joblib.dump(le_maquina, os.path.join(MODEL_DIR, "m4_le_maquina.pkl"))
    joblib.dump(le_linha,   os.path.join(MODEL_DIR, "m4_le_linha.pkl"))
    joblib.dump(FEATURES,   os.path.join(MODEL_DIR, "m4_features.pkl"))

    with open(os.path.join(REPORT_DIR, "m4_spareparts_report.json"), "w") as f:
        json.dump({"acuracia": acc, "treinado_em": datetime.now().isoformat()}, f, indent=2)

    print(f"  [OK] Modelo 4 salvo em backend/models/m4_spareparts.pkl")
    return model, le_maquina, le_linha, FEATURES, agg


def inferir_risco_spare_parts():
    """
    Gera lista de máquinas com risco de precisar de peças nos próximos 14 dias.
    """
    model_path = os.path.join(MODEL_DIR, "m4_spareparts.pkl")
    if not os.path.exists(model_path):
        return []

    model      = joblib.load(model_path)
    le_maquina = joblib.load(os.path.join(MODEL_DIR, "m4_le_maquina.pkl"))
    le_linha   = joblib.load(os.path.join(MODEL_DIR, "m4_le_linha.pkl"))
    FEATURES   = joblib.load(os.path.join(MODEL_DIR, "m4_features.pkl"))

    conn = get_conn()
    df = pd.read_sql_query("""
        SELECT maquina, linha, semana_iso, mes, dur_min, grupo_parada
        FROM kpi_paradas_raw WHERE dur_min > 0 AND maquina IS NOT NULL
        ORDER BY semana_iso DESC LIMIT 3000
    """, conn)
    df_rc = pd.read_sql_query("""
        SELECT maquina, natureza FROM rc_registros WHERE maquina IS NOT NULL
    """, conn)
    conn.close()

    if df.empty:
        return []

    agg = df.groupby(["maquina", "linha", "semana_iso", "mes"]).agg(
        n_falhas     = ("dur_min", "count"),
        tempo_total  = ("dur_min", "sum"),
        n_falhas_mec = ("grupo_parada", lambda x: (x.str.contains("ec", case=False, na=False)).sum()),
    ).reset_index()

    if not df_rc.empty:
        df_rc["maquina"] = df_rc["maquina"].str.upper().str.strip()
        rc_count = df_rc.groupby("maquina").size().reset_index(name="n_rc_abertas")
        agg["maquina_upper"] = agg["maquina"].str.upper().str.strip()
        agg = agg.merge(rc_count, left_on="maquina_upper", right_on="maquina", how="left", suffixes=("", "_rc"))
        agg["n_rc_abertas"] = agg["n_rc_abertas"].fillna(0)
    else:
        agg["n_rc_abertas"] = 0

    latest = agg.sort_values("semana_iso").groupby("maquina").last().reset_index()

    known_maquinas = set(le_maquina.classes_)
    known_linhas   = set(le_linha.classes_)
    latest["maquina_enc"] = latest["maquina"].apply(
        lambda x: le_maquina.transform([x])[0] if x in known_maquinas else 0
    )
    latest["linha_enc"] = latest["linha"].apply(
        lambda x: le_linha.transform([x])[0] if x in known_linhas else 0
    )

    X_inf = latest[FEATURES].fillna(0)
    probs = model.predict_proba(X_inf)[:, 1]

    resultado = []
    for i, row in latest.iterrows():
        idx   = list(latest.index).index(i)
        score = float(probs[idx]) * 100 if idx < len(probs) else 0
        if score >= 20:  # Só retorna máquinas com risco real
            resultado.append({
                "maquina"     : row["maquina"],
                "linha"       : row["linha"],
                "prob_pct"    : round(score, 1),
                "n_falhas_mec": int(row["n_falhas_mec"]),
                "n_rc_abertas": int(row.get("n_rc_abertas", 0)),
                "prioridade"  : "ALTA" if score >= 60 else "MEDIA"
            })

    resultado.sort(key=lambda x: x["prob_pct"], reverse=True)
    return resultado


# ══════════════════════════════════════════════════════════════════════════════
# UTILITÁRIOS
# ══════════════════════════════════════════════════════════════════════════════

def _get_model_date(report_name):
    try:
        with open(os.path.join(REPORT_DIR, report_name)) as f:
            return json.load(f).get("treinado_em", "N/A")
    except Exception:
        return "N/A"


def treinar_todos():
    """Treina/retreina todos os modelos. Chamado na inicialização ou sob demanda."""
    print("=" * 60)
    print("  CONTROLE DE CUSTOS — XGBoost AI Engine")
    print("  Iniciando treino de todos os modelos...")
    print("=" * 60)

    treinar_modelo2_quebras()
    treinar_modelo3_anomalias()
    treinar_modelo1_budget()
    treinar_modelo4_spareparts()

    print("\n" + "=" * 60)
    print("  [CONCLUÍDO] Todos os modelos treinados com sucesso!")
    print(f"  Modelos salvos em: {MODEL_DIR}")
    print("=" * 60)


def status_modelos():
    """Retorna status de cada modelo (treinado/não treinado + data)."""
    modelos = {
        "m1_budget"    : ("m1_budget.pkl",      "m1_budget_report.json"),
        "m2_quebras"   : ("m2_quebras.pkl",      "m2_quebras_report.json"),
        "m3_anomalias" : ("m3_anomalias.pkl",    "m3_anomalias_report.json"),
        "m4_spareparts": ("m4_spareparts.pkl",   "m4_spareparts_report.json"),
    }
    result = {}
    for nome, (pkl, rep) in modelos.items():
        treinado = os.path.exists(os.path.join(MODEL_DIR, pkl))
        report   = {}
        if treinado:
            try:
                with open(os.path.join(REPORT_DIR, rep)) as f:
                    report = json.load(f)
            except Exception:
                pass
        result[nome] = {"treinado": treinado, **report}
    return result


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT — executar diretamente para treinar
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    treinar_todos()
