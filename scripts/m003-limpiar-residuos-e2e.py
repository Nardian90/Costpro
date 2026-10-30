#!/usr/bin/env python3
"""
CP-CAT-MAESTRO-003 — Limpieza controlada de residuos E2E en la base AISLADA
CostproE2E (lguovmvrozxgssupkwpf) que bloquean el replay oficial:
  · bac99491-f719-4547-8817-d488bec15579  '22'         tienda E2E 'Enervida'
  · 2c81287d-9cfa-49b7-8911-8e768e1d94eb  'ENSAYO-V4'  tienda 'FINAL-46d82282'
Son filas sintéticas de ensayos previos (no datos reales). Se eliminan sus
dependencias directas y los productos, con captura de evidencia antes/después.
"""
import json, urllib.request, os

def _token_de_env() -> str:
    for line in open(os.path.join(os.path.dirname(__file__), '..', '.env')):
        if line.startswith('SUPABASE_ACCESS_TOKEN='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('SUPABASE_ACCESS_TOKEN ausente en .env')

TOKEN = _token_de_env()
REF = 'lguovmvrozxgssupkwpf'

def q(sql):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': sql}).encode(),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:400]}')

IDS = "('bac99491-f719-4547-8817-d488bec15579','2c81287d-9cfa-49b7-8911-8e768e1d94eb')"
W = f"product_id IN {IDS}"

evidencia = {'antes': {}, 'operaciones': [], 'despues': {}}

evidencia['antes']['productos'] = q(f"SELECT id, sku, name, store_id, tenant_id FROM public.products WHERE id IN {IDS}")
evidencia['antes']['inventory'] = q(f"SELECT id, product_id, store_id, quantity FROM public.inventory WHERE {W}")
evidencia['antes']['stock_movements'] = q(f"SELECT id, product_id, movement_type, quantity_change FROM public.stock_movements WHERE {W}")
evidencia['antes']['transaction_items'] = q(f"SELECT id, transaction_id, product_id, quantity FROM public.transaction_items WHERE {W}")

ops = [
    ('DELETE transaction_items', f"DELETE FROM public.transaction_items WHERE {W}"),
    ('DELETE stock_movements', f"DELETE FROM public.stock_movements WHERE {W}"),
    ('DELETE inventory', f"DELETE FROM public.inventory WHERE {W}"),
    ('DELETE products', f"DELETE FROM public.products WHERE id IN {IDS}"),
]
for nombre, sql in ops:
    r = q(sql)
    evidencia['operaciones'].append({'op': nombre, 'resultado': r})
    print(f'{nombre}: OK')

evidencia['despues']['productos_restantes'] = q(f"SELECT count(*) AS n FROM public.products WHERE id IN {IDS}")
evidencia['despues']['casos_guard'] = q("""SELECT count(*) AS n FROM public.products p
  JOIN public.stores s ON s.id=p.store_id WHERE p.tenant_id IS NULL AND s.tenant_id IS NULL""")

out = 'audit-evidence/MAESTRO-003/limpieza-residuos-e2e.json'
json.dump(evidencia, open(out, 'w'), indent=2, ensure_ascii=False, default=str)
print('evidencia:', out)
print('productos restantes:', evidencia['despues']['productos_restantes'])
print('casos guard restantes:', evidencia['despues']['casos_guard'])
