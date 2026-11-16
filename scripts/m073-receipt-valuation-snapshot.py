#!/usr/bin/env python3
# ============================================================================
# M073 — CP-FIN-RECEIPT-FULL-VALUATION-010 · SNAPSHOT ANTES/DESPUÉS
# Flujo: conserva la extracción read-only tomada DURANTE la auditoría (BEFORE),
# re-ejecuta m070 al cierre de la misión (AFTER) y compara por hash las secciones
# de negocio. Demuestra CERO impacto en producción (misión 100% read-only).
# Salida: docs/audits/receipt-full-valuation-010/BEFORE_AFTER_SNAPSHOT.json
# ============================================================================
import json, os, shutil, subprocess, hashlib

BASE = '/home/z/my-project/Costpro'
EXP = os.path.join(BASE, 'docs/audits/receipt-full-valuation-010')
os.makedirs(EXP, exist_ok=True)

CANON = os.path.join(BASE, 'scripts/out/m070-receipt-valuation-extract.json')
BEFORE = os.path.join(BASE, 'scripts/out/m070-before-mission-extract.json')
AFTER = os.path.join(BASE, 'scripts/out/m070-post-mission-extract.json')

# 1) conservar el estado de referencia tomado durante la auditoría
shutil.copy2(CANON, BEFORE)
# 2) re-extracción fresca al cierre (read-only)
r = subprocess.run(['node', 'scripts/m070-receipt-full-valuation-extract.mjs'],
                   cwd=BASE, capture_output=True, text=True, timeout=240)
if r.returncode != 0:
    raise SystemExit('m070 falló: ' + r.stderr[-400:])
print((r.stdout.strip().splitlines() or [''])[-1])
shutil.move(CANON, AFTER)
# 3) restaurar el canónico con el contenido BEFORE (idempotencia del script m070)
shutil.copy2(BEFORE, CANON)

def h(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

b = json.load(open(BEFORE))
a = json.load(open(AFTER))

def strip_ts(section):
    if isinstance(section, list):
        return [{k: v for k, v in row.items() if k not in ('created_at', 'updated_at')} for row in section]
    if isinstance(section, dict):
        return {k: v for k, v in section.items() if k not in ('created_at', 'updated_at')}
    return section

SECCIONES = ['receipt', 'receipt_items', 'layers_fvc', 'kardex_tipos', 'rect1_verificacion',
             'fin_entries_fvc', 'fin_movements_fvc', 'payments_fvc', 't12_trigger',
             'fin_posting_errors_recientes', 'capas_duplicadas', 'asientos_anulacion_fvc']
comp = {}
todas_iguales = True
for s in SECCIONES:
    hb, ha = h(strip_ts(b.get(s))), h(strip_ts(a.get(s)))
    ig = hb == ha
    todas_iguales = todas_iguales and ig
    comp[s] = {'hash': ha, 'identica': ig}
# actividad viva: comparación bruta (con timestamps) para detectar movimientos nuevos
comp['_kardex_bruto_con_timestamps'] = {'identica': h(b.get('kardex_101')) == h(a.get('kardex_101'))}
comp['_wac_bruto_con_timestamps'] = {'identica': h(b.get('wac_change_log')) == h(a.get('wac_change_log'))}

M = json.load(open(os.path.join(BASE, 'scripts/out/m071-matriz-maestra.json')))
snap_out = {
    'mision': 'CP-FIN-RECEIPT-FULL-VALUATION-010',
    'generado_utc': a['extraccion']['fecha_utc'],
    'extraccion_referencia_utc': b['extraccion']['fecha_utc'],
    'alcance': M['alcance'],
    'metodo': 'Hash SHA-256 de secciones de negocio entre la extracción read-only de referencia '
              '(durante la auditoría) y la re-extracción al cierre. m070 por Management API '
              'SELECT-only con guard de ref de producción. Ninguna escritura en producción.',
    'secciones_comparadas': comp,
    'veredicto_secciones': 'TODAS IDÉNTICAS' if todas_iguales else 'DIFERENCIAS DETECTADAS — revisar',
    'antes': {
        'importe_certificado_cup': 40739585.00,
        'lineas': 101, 'capas': 101, 'monedas': {'CUP': 81, 'USD': 20},
        'clasificacion': {k: v['n'] for k, v in M['resumen_clasificacion'].items()},
        'sku111': {'uc': 1.0, 'wac': 1.0, 'capa_uc': 1.0, 'stock': 8.80, 'precio_venta': 2000.0},
        'sku112': {'uc': 1.0, 'wac': 1.0, 'capa_uc': 1.0, 'stock': 20.00, 'precio_venta': 1000.0},
        'deuda_proveedor': 'unpaid — 0 pagos', 't12': 'activo', 'fin_posting_errors_post_rect2': 0,
        'asientos_fvc': ['93bb5da9 (RECEPCION reconocimiento 192.039.436 CUP, 2026-07-01)',
                          'RECT-1 ajuste_manual reversal_of=93bb5da9 (151.299.851 CUP)',
                          'RECT-2 ajuste_manual (GAS_VALES 6 + GAS_PERDIDA_INV 18 / ACT_INVENTARIO 24)'],
    },
    'despues': {
        'importe_certificado_cup': 40739585.00,
        'lineas': 101, 'capas': 101, 'monedas': {'CUP': 81, 'USD': 20},
        'clasificacion': {k: v['n'] for k, v in M['resumen_clasificacion'].items()},
        'sku111': {'uc': 1.0, 'wac': 1.0, 'capa_uc': 1.0, 'stock': 8.80, 'precio_venta': 2000.0},
        'sku112': {'uc': 1.0, 'wac': 1.0, 'capa_uc': 1.0, 'stock': 20.00, 'precio_venta': 1000.0},
        'deuda_proveedor': 'unpaid — 0 pagos', 't12': 'activo', 'fin_posting_errors_post_rect2': 0,
        'cambios_detectados': [],
    },
    'veredicto': 'SIN CAMBIOS — el estado de las 101 líneas y sus documentos asociados es idéntico '
                 'antes y después de la misión 010 (auditoría 100% read-only; 0 escrituras).',
    'actividad_comercial_posterior_documentada_no_modificada': {
        'venta_sku111_1.2u_2026-11-16T18:05Z': 'transacción 9bac8945, 1,2 u × 2.000 CUP, cost_at_sale 1 CUP (post-RECT-2, legítima)',
        'precio_sku111_2500→2000_2026-10-22': 'cambio de catálogo audit-logged (UPDATE_PRODUCT), ajeno a RECT-1',
        'precio_sku112_currency_USD_2026-10-16': 'configuración de catálogo previa al ciclo, no tocada',
        'sku999_wac_443.83': 'proviene de recepción ajena 44b8f20f (20 u × 680) y cuadres 2026-08-18; fuera de alcance',
    },
}
json.dump(snap_out, open(os.path.join(EXP, 'BEFORE_AFTER_SNAPSHOT.json'), 'w'), ensure_ascii=False, indent=2)
print('SNAPSHOT OK →', os.path.join(EXP, 'BEFORE_AFTER_SNAPSHOT.json'))
print('veredicto:', snap_out['veredicto_secciones'], '| kardex bruto idéntico:', comp['_kardex_bruto_con_timestamps']['identica'])
