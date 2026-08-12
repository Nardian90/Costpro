#!/usr/bin/env python3
"""
PR-4.4I — Backfill Vitallcons: crear payment_transactions para ventas históricas.

Algoritmo:
  1. Cargar transacciones Vitallcons con zelle_amount > 0 y sin payment_transactions
  2. Cargar Excel Vitallcons
  3. Mapear Código → product_id (normalizado)
  4. Preflight SKU uniqueness post-normalización
  5. Matching bidireccional (TX→Excel y Excel→TX, aceptar solo 1:1)
  6. Para cada par válido, validar split de pagos (per-method AND total)
  7. Clasificar: DERIVED_RATE, NO_FX_REQUIRED, AMBIGUOUS, NOT_FOUND, *_MISMATCH
  8. Crear payment_transactions atómicamente (BEGIN/COMMIT/ROLLBACK via SQL)
  9. Audit log por cada acción
"""
import json
import os
import sys
import requests
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timezone
import openpyxl

# Config — read from environment variables
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
PROJECT_REF = SUPABASE_URL.replace("https://", "").split(".")[0] if SUPABASE_URL else ""
STORE_ID = os.environ.get("BACKFILL_STORE_ID", "")
EXCEL_PATH = os.environ.get("BACKFILL_EXCEL_PATH", "/home/z/my-project/upload/ventas Vitallcons.xlsx")

DB_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
DB_HEADERS = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}
REST_HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}

TOLERANCE = Decimal("0.01")


def to_decimal(value, default="0"):
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    s = str(value).strip()
    if not s or s.lower() in ("nan", "none", "null", "-"):
        return Decimal(default)
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return Decimal(default)


def normalize_code(code):
    if code is None:
        return None
    s = str(code).strip()
    if not s:
        return None
    if s.isdigit() and s.isascii():
        s = s.lstrip("0") or "0"
    return s.upper()


def normalize_date_utc(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if len(s) == 10:
            try:
                return date.fromisoformat(s).isoformat()
            except ValueError:
                return None
        try:
            iso_str = s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s
            dt = datetime.fromisoformat(iso_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).date().isoformat()
        except ValueError:
            return None
    return None


def build_txn_fingerprint(tx, tx_items):
    fecha = normalize_date_utc(tx.get("completed_at"))
    cash = to_decimal(tx.get("cash_amount"))
    transf = to_decimal(tx.get("transfer_amount"))
    items = sorted(
        [(str(i["product_id"]), to_decimal(i["quantity"])) for i in tx_items],
        key=lambda x: x[0],
    )
    return (fecha, cash, transf, tuple(items))


def build_excel_fingerprint(row, product_id):
    fecha = normalize_date_utc(row.get("fecha"))
    cash = to_decimal(row.get("efectivo"))
    transf = to_decimal(row.get("transf"))
    qty = to_decimal(row.get("cantidad"))
    items = ((str(product_id), qty),) if product_id else ()
    return (fecha, cash, transf, items)


def execute_sql(query):
    """Execute SQL via Supabase Management API."""
    r = requests.post(DB_URL, headers=DB_HEADERS, json={"query": query}, timeout=120)
    if r.status_code not in (200, 201):
        raise Exception(f"SQL error {r.status_code}: {r.text[:500]}")
    try:
        return json.loads(r.text) if r.text.strip() else []
    except:
        return []


def fetch_vitallcons_txns():
    """Fetch Vitallcons transactions with zelle_amount > 0 and no payment_transactions."""
    sql = f"""
    SELECT t.id, t.store_id, t.completed_at, t.cash_amount, t.transfer_amount,
           t.zelle_amount, t.total_amount, t.invoice_number,
           (
             SELECT jsonb_agg(jsonb_build_object('product_id', ti.product_id, 'quantity', ti.quantity))
             FROM transaction_items ti WHERE ti.transaction_id = t.id
           ) AS items
    FROM transactions t
    WHERE t.store_id = '{STORE_ID}'::uuid
      AND t.status = 'completed'
      AND t.zelle_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM payment_transactions pt
        WHERE pt.transaction_id = t.id
      )
    ORDER BY t.completed_at;
    """
    rows = execute_sql(sql)
    result = []
    for row in rows:
        tx = {
            "id": row["id"],
            "store_id": row["store_id"],
            "completed_at": row["completed_at"],
            "cash_amount": row["cash_amount"],
            "transfer_amount": row["transfer_amount"],
            "zelle_amount": row["zelle_amount"],
            "total_amount": row["total_amount"],
            "invoice_number": row.get("invoice_number"),
        }
        items = row.get("items") or []
        tx["items"] = [{"product_id": i["product_id"], "quantity": i["quantity"]} for i in items]
        result.append(tx)
    return result


def fetch_products():
    """Fetch products with SKU for mapping."""
    sql = f"""
    SELECT id, sku FROM products WHERE store_id = '{STORE_ID}'::uuid AND sku IS NOT NULL;
    """
    return execute_sql(sql)


def load_excel():
    """Load Excel Vitallcons."""
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb["Hoja1"]
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        codigo, clasif, nota, desc, qty, efectivo, transf, usd, fecha, comision = row
        if not any([codigo, desc, qty]):
            continue
        rows.append({
            "row_number": i,
            "codigo": codigo,
            "descripcion": desc or "",
            "cantidad": qty or 0,
            "efectivo": efectivo or 0,
            "transf": transf or 0,
            "usd": usd or 0,
            "fecha": fecha,
            "comision": comision or 0,
        })
    return rows


def preflight_sku_uniqueness(products):
    """Check SKU uniqueness after normalization."""
    seen = {}
    for p in products:
        norm = normalize_code(p["sku"])
        if norm is None:
            continue
        if norm not in seen:
            seen[norm] = []
        seen[norm].append(p["id"])
    collisions = {k: v for k, v in seen.items() if len(v) > 1}
    if collisions:
        print("PREFLIGHT FAILED: SKU collisions after normalization:")
        for sku, pids in collisions.items():
            print(f"  '{sku}' → {pids}")
        return False
    return True


def backfill_single_txn_atomic(tx, excel):
    """Backfill one transaction atomically via SQL."""
    tx_id = tx["id"]
    store_id = tx["store_id"]
    completed_at = tx["completed_at"]

    excel_cash = to_decimal(excel["efectivo"])
    excel_transf = to_decimal(excel["transf"])
    excel_usd = to_decimal(excel["usd"])
    tx_cash = to_decimal(tx["cash_amount"])
    tx_transf = to_decimal(tx["transfer_amount"])
    tx_zelle = to_decimal(tx["zelle_amount"])
    tx_total = to_decimal(tx["total_amount"])

    # Per-method validation
    if abs(excel_cash - tx_cash) > TOLERANCE:
        return "CASH_MISMATCH", {"excel": str(excel_cash), "tx": str(tx_cash)}
    if abs(excel_transf - tx_transf) > TOLERANCE:
        return "TRANSFER_MISMATCH", {"excel": str(excel_transf), "tx": str(tx_transf)}

    # FX classification
    if excel_usd > 0 and tx_zelle > 0:
        inferred_rate = tx_zelle / excel_usd
        classification = "DERIVED_RATE"
    elif excel_usd == 0 and tx_zelle == 0:
        inferred_rate = None
        classification = "NO_FX_REQUIRED"
    elif excel_usd > 0 and tx_zelle == 0:
        return "USD_NO_ZELLE_IN_TX", {"excel_usd": str(excel_usd)}
    else:
        return "TX_ZELLE_NO_EXCEL_USD", {"tx_zelle": str(tx_zelle)}

    # Total validation
    calculated_total = excel_cash + excel_transf + tx_zelle
    if abs(calculated_total - tx_total) > TOLERANCE:
        return "TOTAL_MISMATCH", {"calculated": str(calculated_total), "tx_total": str(tx_total)}

    # Build SQL for atomic insert
    inserts = []
    if excel_cash > 0:
        inserts.append(f"""
        INSERT INTO payment_transactions
          (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, payment_date, idempotency_key)
        VALUES
          ('{store_id}'::uuid, 'sale', '{tx_id}'::uuid, '{tx_id}'::uuid, {excel_cash}, 'cash', 'CUP', 1.0, '{completed_at}', 'backfill-pr44i-cash-{tx_id}')
        """)

    if excel_transf > 0:
        inserts.append(f"""
        INSERT INTO payment_transactions
          (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, payment_date, idempotency_key)
        VALUES
          ('{store_id}'::uuid, 'sale', '{tx_id}'::uuid, '{tx_id}'::uuid, {excel_transf}, 'transfer', 'CUP', 1.0, '{completed_at}', 'backfill-pr44i-transfer-{tx_id}')
        """)

    if classification == "DERIVED_RATE" and inferred_rate is not None:
        inserts.append(f"""
        INSERT INTO payment_transactions
          (store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, payment_date, idempotency_key)
        VALUES
          ('{store_id}'::uuid, 'sale', '{tx_id}'::uuid, '{tx_id}'::uuid, {excel_usd}, 'zelle', 'USD', {inferred_rate}, '{completed_at}', 'backfill-pr44i-zelle-{tx_id}')
        """)

    # Audit log
    audit_metadata = json.dumps({
        "classification": classification,
        "cash": str(excel_cash),
        "transfer": str(excel_transf),
        "usd": str(excel_usd) if excel_usd > 0 else None,
        "rate": str(inferred_rate) if inferred_rate else None,
        "tx_total": str(tx_total),
        "calculated_total": str(calculated_total),
    })
    inserts.append(f"""
    INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
    VALUES ('BACKFILL_{classification}', 'payment_transactions', '{tx_id}'::uuid, '{store_id}'::uuid, '{audit_metadata}'::jsonb)
    """)

    # Execute atomically
    full_sql = "BEGIN;\n" + ";\n".join(inserts) + ";\nCOMMIT;"
    try:
        execute_sql(full_sql)
        return classification, {"rate": str(inferred_rate) if inferred_rate else None}
    except Exception as e:
        # Rollback and audit failure
        try:
            execute_sql("ROLLBACK;")
        except:
            pass
        fail_meta = json.dumps({"error": str(e)[:500], "classification": classification})
        try:
            execute_sql(f"""
            INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
            VALUES ('BACKFILL_FAILED', 'payment_transactions', '{tx_id}'::uuid, '{store_id}'::uuid, '{fail_meta}'::jsonb);
            """)
        except:
            pass
        return "FAILED", {"error": str(e)[:200]}


def main():
    print("=" * 60)
    print("PR-4.4I — Backfill Vitallcons payment_transactions")
    print("=" * 60)

    # 1. Load data
    print("\n1. Loading data...")
    txns = fetch_vitallcons_txns()
    print(f"   Vitallcons txns with zelle > 0 and no payment_transactions: {len(txns)}")

    excel_rows = load_excel()
    print(f"   Excel rows: {len(excel_rows)}")

    products = fetch_products()
    print(f"   Products: {len(products)}")

    # 2. Preflight SKU uniqueness
    print("\n2. Preflight SKU uniqueness...")
    if not preflight_sku_uniqueness(products):
        print("   ABORT: SKU collisions detected")
        sys.exit(1)
    print("   OK — no collisions after normalization")

    # 3. Build code → product_id mapping
    code_to_pid = {}
    for p in products:
        norm = normalize_code(p["sku"])
        if norm:
            code_to_pid[norm] = p["id"]
    print(f"   Mapped {len(code_to_pid)} unique codes")

    # 4. Bidirectional matching
    print("\n3. Bidirectional matching...")
    tx_to_excel = {}
    excel_to_tx = {}

    for tx in txns:
        tx_fp = build_txn_fingerprint(tx, tx["items"])
        for excel in excel_rows:
            code = normalize_code(excel["codigo"])
            if not code:
                continue
            pid = code_to_pid.get(code)
            if not pid:
                continue
            excel_fp = build_excel_fingerprint(excel, pid)
            if tx_fp == excel_fp:
                tx_to_excel.setdefault(tx["id"], []).append(excel)
                excel_to_tx.setdefault(excel["row_number"], []).append(tx["id"])

    # Count matches
    valid_pairs = []
    ambiguous_tx = []
    ambiguous_excel = []
    unmatched_tx = []

    for tx_id, excels in tx_to_excel.items():
        if len(excels) == 1:
            excel = excels[0]
            txs_for_excel = excel_to_tx.get(excel["row_number"], [])
            if len(txs_for_excel) == 1 and txs_for_excel[0] == tx_id:
                valid_pairs.append((tx_id, excel))
            else:
                ambiguous_tx.append(tx_id)
        else:
            ambiguous_tx.append(tx_id)

    unmatched_tx = [t["id"] for t in txns if t["id"] not in tx_to_excel]

    all_excel_ids = {r["row_number"] for r in excel_rows}
    matched_excel_ids = set(excel_to_tx.keys())
    unmatched_excel = all_excel_ids - matched_excel_ids

    # Manifest
    manifest = {
        "tx_total": len(txns),
        "excel_total": len(excel_rows),
        "valid_pairs": len(valid_pairs),
        "ambiguous_tx": len(ambiguous_tx),
        "ambiguous_excel": len(ambiguous_excel),
        "unmatched_tx": len(unmatched_tx),
        "unmatched_excel": len(unmatched_excel),
        "ready_for_backfill": (
            len(ambiguous_tx) == 0 and len(ambiguous_excel) == 0
        ),
    }
    print(f"\n   Manifest: {json.dumps(manifest, indent=2)}")

    # 5. Backfill valid pairs
    print(f"\n4. Backfilling {len(valid_pairs)} valid pairs...")
    results = {"DERIVED_RATE": 0, "NO_FX_REQUIRED": 0, "AMBIGUOUS": 0,
               "NOT_FOUND": 0, "FAILED": 0, "MISMATCH": 0}

    tx_map = {t["id"]: t for t in txns}

    for tx_id, excel in valid_pairs:
        tx = tx_map[tx_id]
        classification, meta = backfill_single_txn_atomic(tx, excel)
        results[classification] = results.get(classification, 0) + 1
        if classification in ("DERIVED_RATE", "NO_FX_REQUIRED"):
            print(f"   ✓ {tx_id[:8]} → {classification} (rate={meta.get('rate', 'N/A')})")
        else:
            print(f"   ✗ {tx_id[:8]} → {classification}: {meta}")

    # Audit ambiguous and unmatched
    for tx_id in ambiguous_tx:
        execute_sql(f"""
        INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
        VALUES ('BACKFILL_AMBIGUOUS', 'payment_transactions', '{tx_id}'::uuid, '{STORE_ID}'::uuid,
          '{{"reason": "multiple Excel candidates"}}'::jsonb);
        """)

    for tx_id in unmatched_tx:
        execute_sql(f"""
        INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
        VALUES ('BACKFILL_NOT_FOUND', 'payment_transactions', '{tx_id}'::uuid, '{STORE_ID}'::uuid,
          '{{"reason": "no Excel match"}}'::jsonb);
        """)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"BACKFILL SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total txns to backfill:  {len(txns)}")
    print(f"  Valid pairs (1:1):       {len(valid_pairs)}")
    print(f"  DERIVED_RATE:            {results.get('DERIVED_RATE', 0)}")
    print(f"  NO_FX_REQUIRED:          {results.get('NO_FX_REQUIRED', 0)}")
    print(f"  AMBIGUOUS:               {len(ambiguous_tx)}")
    print(f"  NOT_FOUND:               {len(unmatched_tx)}")
    print(f"  MISMATCH:                {results.get('CASH_MISMATCH', 0) + results.get('TRANSFER_MISMATCH', 0) + results.get('TOTAL_MISMATCH', 0)}")
    print(f"  FAILED:                  {results.get('FAILED', 0)}")
    print(f"  Success rate:            {results.get('DERIVED_RATE', 0) + results.get('NO_FX_REQUIRED', 0)}/{len(txns)}")


if __name__ == "__main__":
    main()
