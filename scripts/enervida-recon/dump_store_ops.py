#!/usr/bin/env python3
"""Fase 1b — Volcado completo de operaciones ENERVIDA-VITALLCONS desde Supabase (solo lectura).
Salidas: transactions.json, issue_slips.json, receipts.json, devolutions.json,
         stock_movements.json, commission_rules.json — bajo scripts/enervida-recon/.
"""
import json
import sys

sys.path.insert(0, '/home/z/my-project/scripts/enervida-recon')
from db import sql

STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
OUT = '/home/z/my-project/scripts/enervida-recon'


def dump(name, q):
    st, rows = sql(q)
    if st != 201:
        print(f'!! {name}: ERROR {st}: {str(rows)[:400]}')
        raise SystemExit(1)
    json.dump(rows, open(f'{OUT}/{name}.json', 'w'), ensure_ascii=False, default=str)
    print(f'{name}: {len(rows)} filas')
    return rows


# 1. Ventas + items (con SKU)
tx = dump('transactions', f"""
  SELECT t.*, (w.first_name || ' ' || w.last_name) AS seller_name FROM transactions t
  LEFT JOIN workers w ON w.id = t.seller_id
  WHERE t.store_id='{STORE}' ORDER BY t.created_at""")
dump('transaction_items', f"""
  SELECT ti.*, p.sku, p.name AS product_name
  FROM transaction_items ti
  JOIN transactions t ON t.id = ti.transaction_id
  LEFT JOIN products p ON p.id = ti.product_id
  WHERE t.store_id='{STORE}' ORDER BY ti.created_at""")

# 2. Vales de salida (VS)
slips = dump('issue_slips', f"SELECT * FROM issue_slips WHERE store_id='{STORE}' ORDER BY created_at")
dump('issue_slip_items', f"""
  SELECT isi.*, p.sku, p.name AS product_name
  FROM issue_slip_items isi
  JOIN issue_slips is_ ON is_.id = isi.slip_id
  LEFT JOIN products p ON p.id = isi.product_id
  WHERE is_.store_id='{STORE}' ORDER BY isi.created_at""")

# 3. Entradas (receipts)
dump('receipts', f"SELECT * FROM receipts WHERE store_id='{STORE}' ORDER BY created_at")
dump('receipt_items', f"""
  SELECT ri.*, p.sku, p.name AS product_name
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  LEFT JOIN products p ON p.id = ri.product_id
  WHERE r.store_id='{STORE}' ORDER BY ri.created_at""")

# 4. Devoluciones (DV)
dv = dump('devolutions', f"SELECT * FROM devolutions WHERE store_id='{STORE}' ORDER BY created_at")
dump('devolution_items', f"""
  SELECT di.*, p.sku, p.name AS product_name
  FROM devolution_items di
  JOIN devolutions d ON d.id = di.devolution_id
  LEFT JOIN products p ON p.id = di.product_id
  WHERE d.store_id='{STORE}' ORDER BY di.created_at""")

# 5. Kardex
dump('stock_movements', f"SELECT * FROM stock_movements WHERE store_id='{STORE}' ORDER BY created_at")

# 6. Comisiones existentes
dump('commission_rules', f"SELECT * FROM commission_rules WHERE store_id='{STORE}' ORDER BY created_at")
dump('commission_rule_products', """
  SELECT crp.* FROM commission_rule_products crp
  JOIN commission_rules cr ON cr.id = crp.rule_id
  WHERE cr.store_id='""" + STORE + "' ORDER BY crp.created_at")

# 7. Resumen de estados
from collections import Counter
print('\ntransactions.status:', dict(Counter(t['status'] for t in tx)))
print('issue_slips.status:', dict(Counter(s['status'] for s in slips)))
print('devolutions.status:', dict(Counter(d['status'] for d in dv)))
print('OK — volcado completo en', OUT)
