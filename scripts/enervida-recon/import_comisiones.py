#!/usr/bin/env python3
"""
FASE 5 — Importación idempotente de ConfComisiones → commission_rules + commission_rule_products.

Arquitectura existente (sin sistemas paralelos):
- UNA regla product_specific por tienda (worker_id NULL = «Toda la tienda»),
  igual que crea la UI (WorkersView.handleSave) vía POST/PATCH /api/commissions/rules.
- commission_rule_products: una fila por SKU con commission_amount (CUP) y
  commission_mode='per_unit' (motor: monto × cantidad).
- Ceros explícitos del Excel se importan como 0 (requisito de la misión).
- Valores vacíos → SIN regla (se identifican claramente; no se inventan valores).
- Idempotencia: UNIQUE (rule_id, product_id); segunda corrida = 0 creadas/0 actualizadas.

Uso: python3 import_comisiones.py [--dry-run]
"""
import json
import sys

sys.path.insert(0, '/home/z/my-project/scripts/enervida-recon')
from db import sql

STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
ADMIN = 'a1111111-1111-1111-1111-111111111111'  # admin@demo.com (atribución como importación ENERVIDA)
VALID_FROM = '2026-10-14'
DRY = '--dry-run' in sys.argv

conf = json.load(open('/home/z/my-project/scripts/enervida-recon/confcomisiones.json'))['rows']
prods = json.load(open('/home/z/my-project/scripts/enervida-recon/products_enervida.json'))
pmap = {p['sku']: p['id'] for p in prods}

# --- clasificar filas ConfComisiones ---
to_import = []      # (sku, product_id, amount) con valor explícito (incluye 0)
empty = []          # valor vacío → sin regla
no_product = []     # valor definido pero producto inexistente en la tienda
for d in conf:
    v = d['Comisión por Unidad Vendida']
    sku = str(d['Código'])
    if v is None:
        empty.append(sku)
        continue
    pid = pmap.get(sku)
    if not pid:
        no_product.append(sku)
        continue
    to_import.append((sku, pid, float(v)))

print(f'ConfComisiones: {len(conf)} filas → importables: {len(to_import)} (>0: {sum(1 for *_, a in to_import if a > 0)}, =0: {sum(1 for *_, a in to_import if a == 0)}) · vacías (sin regla): {len(empty)} · sin producto: {len(no_product)}')

# --- 1. regla product_specific store-wide (idempotente) ---
st, rules = sql(f"""
  SELECT id, product_commission_mode FROM commission_rules
  WHERE store_id='{STORE}' AND type='product_specific' AND worker_id IS NULL
  ORDER BY created_at LIMIT 1""")
assert st == 201, str(rules)[:300]

if rules:
    rule_id = rules[0]['id']
    accion = 'EXISTENTE (reutilizada — no se duplica)'
else:
    if DRY:
        print('[dry-run] se crearía regla product_specific store-wide')
        rule_id = None
    else:
        st, ins = sql(f"""
          INSERT INTO commission_rules (store_id, worker_id, type, base_calculation, priority,
                                        valid_from, product_commission_amount, product_commission_mode, created_by)
          VALUES ('{STORE}', NULL, 'product_specific', 'total_sales', 0,
                  '{VALID_FROM}', 0, 'per_unit', '{ADMIN}')
          RETURNING id""")
        assert st == 201, str(ins)[:400]
        rule_id = ins[0]['id']
    accion = 'CREADA'
print(f"Regla product_specific: {accion} (id={rule_id})")

if rule_id is None:
    print('[dry-run] fin')
    sys.exit(0)

# --- 2. upsert de comisiones por producto ---
st, existing = sql(f"SELECT product_id, commission_amount, commission_mode FROM commission_rule_products WHERE rule_id='{rule_id}'")
assert st == 201, str(existing)[:300]
ex_map = {e['product_id']: e for e in existing}

creadas, actualizadas, sin_cambios = 0, 0, 0
for sku, pid, amount in to_import:
    ex = ex_map.get(pid)
    if ex is None:
        if not DRY:
            st, r = sql(f"""
              INSERT INTO commission_rule_products (rule_id, product_id, commission_amount, commission_mode)
              VALUES ('{rule_id}', '{pid}', {amount}, 'per_unit')""")
            assert st == 201, f'INSERT {sku}: {str(r)[:300]}'
        creadas += 1
    elif abs(float(ex['commission_amount'] or 0) - amount) > 0.0001 or ex['commission_mode'] != 'per_unit':
        if not DRY:
            st, r = sql(f"""
              UPDATE commission_rule_products SET commission_amount={amount}, commission_mode='per_unit', updated_at=now()
              WHERE rule_id='{rule_id}' AND product_id='{pid}'""")
            assert st == 201, f'UPDATE {sku}: {str(r)[:300]}'
        actualizadas += 1
    else:
        sin_cambios += 1

sin_regla = len(empty) + len(no_product)
total_productos = len(prods)
pendientes = total_productos - len({pid for _, pid, _ in to_import})

print(f'\n=== RESUMEN IMPORTACIÓN {"(DRY-RUN)" if DRY else ""} ===')
print(f'  Regla product_specific store-wide: {accion}')
print(f'  Reglas creadas:        {creadas}')
print(f'  Reglas actualizadas:   {actualizadas}')
print(f'  Sin cambios:           {sin_cambios}')
print(f'  Omitidas (vacías):     {len(empty)} · (sin producto): {len(no_product)}')
print(f'  Pendientes (sin regla definida): {pendientes} de {total_productos} productos')
print(f'  Total configurado (incluye ceros): {len(to_import)}')

# --- 3. verificación de versión (trigger de versionado) ---
st, ver = sql(f"SELECT COUNT(*) AS n FROM commission_rule_versions WHERE rule_id='{rule_id}'")
print(f'  Versiones registradas (trigger): {ver[0]["n"]}')
