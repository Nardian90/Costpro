#!/usr/bin/env python3
# ============================================================================
# M093 — CP-FIN-NEGATIVE-WAC-REMEDIATION-013
# Generador de los 5 XLSX del expediente (skill xlsx · paleta professional).
# Solo lectura de los extractos/análisis RO; no consulta producción.
# Salida: docs/audits/cp-fin-negative-wac-remediation-013/*.xlsx
# ============================================================================
import json, os, sys
from decimal import Decimal as D, ROUND_HALF_UP
from collections import defaultdict

XLSX_SKILL_DIR = '/home/z/my-project/skills/xlsx'
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, 'templates')]:
    if sub not in sys.path:
        sys.path.insert(0, sub)
from base import (FONT_NAME, PRIMARY, SECONDARY, ACCENT_POSITIVE, ACCENT_NEGATIVE,
                  ACCENT_WARNING, NEUTRAL_900, NEUTRAL_600, NEUTRAL_200, NEUTRAL_100, NEUTRAL_0,
                  setup_sheet, style_header_row, style_data_row, style_total_row,
                  font_caption, font_body, align_number, align_text, auto_fit_columns)
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

OUTDIR = 'docs/audits/cp-fin-negative-wac-remediation-013'
os.makedirs(OUTDIR, exist_ok=True)
M013 = 'scripts/out/m013'
e = json.load(open(f'{M013}/extract.json'))
R = json.load(open(f'{M013}/analysis.json'))
mat = json.load(open('scripts/out/m074-matriz-1cup.json'))

STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
TARGETS = ['117', '83', '90', '40', '37']
NOMBRES = {'117': 'Inversor', '83': 'Cripiadora Roja con 6 dabas rojas', '90': 'Cable Solar Rojo 6mm',
           '40': 'Latiguillo de media por 3/8', '37': 'J de techo', '31': 'Expansiones con tornillos M8'}
Q2 = lambda x: D(str(x)).quantize(D('0.01'), ROUND_HALF_UP)
d = lambda x: D(str(x)) if x is not None else D(0)
num = lambda x: float(d(x))
FMT_MONEY = '#,##0.00'
FMT_QTY = '#,##0.0000'
FMT_WAC = '#,##0.000000'

prod_by_sku = {str(p['sku']): p for p in e['productos_todas_tiendas'] if p['store_id'] == STORE}


def sheet_from_rows(wb, title, headers, rows, total_row=None, col_formats=None, notes=None, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title[:31].replace(':', '·').replace('/', '-').replace('?', '')
    last_col = len(headers) + 1
    setup_sheet(ws, title=title, last_col=last_col)
    for ci, h in enumerate(headers, start=2):
        ws.cell(row=4, column=ci, value=h)
    style_header_row(ws, row_num=4, col_start=2, col_end=last_col)
    r = 5
    for i, row in enumerate(rows):
        for ci, v in enumerate(row, start=2):
            cell = ws.cell(row=r, column=ci, value=v)
            style_data_row(ws, row_num=r, col_start=2, col_end=last_col, row_index=i)
            if col_formats and (ci - 2) in col_formats and isinstance(v, (int, float)):
                cell.number_format = col_formats[ci - 2]
                cell.alignment = align_number()
        r += 1
    if total_row:
        for ci, v in enumerate(total_row, start=2):
            cell = ws.cell(row=r, column=ci, value=v)
            style_total_row(ws, row_num=r, col_start=2, col_end=last_col)
            if col_formats and (ci - 2) in col_formats and isinstance(v, (int, float)):
                cell.number_format = col_formats[ci - 2]
                cell.alignment = align_number()
        r += 1
    if notes:
        r += 1
        for n in notes:
            c = ws.cell(row=r, column=2, value=n)
            c.font = font_caption()
            r += 1
    auto_fit_columns(ws)
    return ws


def mark_negative_rows(ws, col, start_row, n_rows):
    for r in range(start_row, start_row + n_rows):
        cell = ws.cell(row=r, column=col)
        if isinstance(cell.value, (int, float)) and cell.value < 0:
            cell.font = Font(name=FONT_NAME, size=10, color=ACCENT_NEGATIVE, bold=True)


# ═══════════ 1. FIVE_SKU_RECONCILIATION.xlsx ════════════════════════════════
wb = Workbook(); wb.properties.creator = 'Z.ai'
ca = R['control_aritmetico']

# Hoja 1: control aritmético (diferencia 280.106,21 explicada)
rows = []
for v in ca['verificacion_wac_hoy']:
    sku = v['sku']
    rows.append([f"SKU{sku}", NOMBRES[sku], num(v['stock']),
                 float(Q2(d(v['wac']))), float(Q2(d(v['valor_total']))),
                 num(prod_by_sku[sku]['stock_current']), num(prod_by_sku[sku]['cost_average'])])
sheet_from_rows(wb, 'Control aritmético (diferencia 280.106,21 explicada)',
    ['SKU', 'Producto', 'Cantidad kardex (u)', 'WAC unitario (CUP/u) = cifra informe 012',
     'Valor total = WAC × cantidad (CUP)', 'stock_current (u)', 'cost_average exacto (CUP/u)'],
    rows,
    total_row=['TOTAL', '', num(sum(D(v['stock']) for v in ca['verificacion_wac_hoy'])),
               '', num(ca['valor_total_real_hoy_q2']), '', ''],
    col_formats={2: FMT_QTY, 3: FMT_MONEY, 4: FMT_MONEY, 5: FMT_QTY, 6: FMT_WAC},
    notes=[
        'Las cinco cifras del informe 012 (−2.175.998,00 / −122.398,00 / −78.176,25 / −665,86 / −1,00) son COSTO UNITARIO PROMEDIO (products.cost_average), no valores totales.',
        'Σ de las cifras unitarias tal cual = −2.377.239,11. El total declarado en 012 (−2.657.345,32) = Σ(WAC × cantidad kardex).',
        'Diferencia explicada: −280.106,21 = aporte de las cantidades: SKU83 (2−1)×122.398 = 122.398,00 · SKU90 (3−1)×78.176,25 = 156.352,50 · SKU40 (3−1)×665,86 = 1.331,72 · SKU37 (25−1)×1,00 = 24,00 · SKU117 qty=1 → 0,00.',
        'Verificación con Decimal exacto: Σ(wac×qty) hoy = −2.657.345,315789473 ≈ −2.657.345,32 (Q2, igual al total declarado en 012) → diferencia real vs suma unitarios = −280.106,21 EXACTA.',
        'SKU117: valor contable = −2.175.998,00 (1 u) · SKU83: −244.796,00 (2 u) · SKU90: −234.528,74 (3 u) · SKU40: −1.997,57 (3 u) · SKU37: −25,00 (25 u).',
    ], first=True)

# Hoja 2: tabla inequívoca cantidad / costo unitario / valor total / exposición
rows2 = []
expos = {'venta': 'Costo de ventas (GAS_COSTO_VENTAS)', 'vale': 'Gastos por vales (GAS_VALES)',
         'perdida': 'Pérdidas (GAS_PERDIDA_INV)'}
for sku in TARGETS:
    rec = R['reconstruccion'][sku]
    stock = d(rec['stock_current']); wac = d(rec['wac_hoy'])
    consumo = sum(d(v['unidades']) for k, v in rec['flujos_netos'].items() if k in ('venta', 'vale', 'perdida'))
    costo_hist = sum(d(v['costo_registrado']) for k, v in rec['flujos_netos'].items() if k in ('venta', 'vale', 'perdida'))
    rows2.append([f"SKU{sku}", NOMBRES[sku], num(stock), float(Q2(wac)), float(Q2(wac * stock)),
                  num(consumo), float(Q2(costo_hist)), float(Q2(consumo * 1 - costo_hist)),
                  'Valoración de producto (ACT_INVENTARIO, atribución)'])
sheet_from_rows(wb, 'Exposición por SKU (inequívoca)',
    ['SKU', 'Producto', 'Existencia final (u)', 'Costo unitario WAC (CUP/u)', 'Valor total inventario (CUP)',
     'Consumo histórico neto (u)', 'Costo registrado de consumos (CUP)', 'Re-costeo a 1 CUP/u pendiente (CUP)',
     'Naturaleza del importe'],
    rows2,
    total_row=['TOTAL', '', num(sum(d(R['reconstruccion'][s]['stock_current']) for s in TARGETS)),
               '', num(ca['valor_total_real_hoy_q2']),
               num(sum(d(R['reconstruccion'][s]['identidad_cantidades']['consumo_neto']) for s in TARGETS)),
               float(Q2(sum(d(R['reconstruccion'][s]['flujos_netos'].get(k, {}).get('costo_registrado', '0'))
                            for s in TARGETS for k in ('venta', 'vale', 'perdida')))),
               float(Q2(sum(D(R['componente_b_regularizacion']['recosteo_pendiente'][k]) for k in ('venta', 'vale', 'perdida')))), ''],
    col_formats={2: FMT_QTY, 3: FMT_MONEY, 4: FMT_MONEY, 5: FMT_QTY, 6: FMT_MONEY, 7: FMT_MONEY},
    notes=[
        'Valor total = WAC unitario × existencia final. La exposición contable del valor negativo está dentro del crédito global de ACT_INVENTARIO (34.435.061,24 → saldo hoy).',
        'El consumo histórico se registró a costo ≈0 (drift preexistente): el re-costeo a 1 CUP/u es el componente B (regularización, requiere autorización).',
    ])

# Hoja 3: reconstrucción de cantidades por SKU (identidad)
rows3 = []
for sku in TARGETS + ['31']:
    rec = R['reconstruccion'][sku]
    idn = rec['identidad_cantidades']
    rows3.append([f"SKU{sku}", NOMBRES[sku], num(idn['entradas_fvc']), num(idn['entradas_ajenas']),
                  num(idn['ajustes_plus']), num(idn['consumo_neto']), num(idn['existencia_final']),
                  num(idn['cuadra']), 'OK' if idn['ok'] else 'REVISAR'])
sheet_from_rows(wb, 'Identidad de cantidades por SKU',
    ['SKU', 'Producto', 'Entrada FVC (u)', 'Entradas otras recepciones (u)', 'Ajustes + (u)',
     'Consumo neto (venta+vale+pérdida) (u)', 'Existencia final (u)', 'Existencia inicial+entrad.+ajust.+cons. = final',
     'Veredicto'],
    rows3, col_formats={2: FMT_QTY, 3: FMT_QTY, 4: FMT_QTY, 5: FMT_QTY, 6: FMT_QTY, 7: FMT_QTY},
    notes=['SKU31 = control (WAC positivo): su identidad también cuadra. Todas las existencias finales = stock_current (drift 0).'])

# Hoja 4: flujos por canal (evidencia del costo ≈0)
rows4 = []
for sku in TARGETS:
    rec = R['reconstruccion'][sku]
    for canal in ('venta', 'vale', 'perdida'):
        fl = rec['flujos_netos'].get(canal)
        if not fl:
            rows4.append([f"SKU{sku}", expos[canal], 0, 0.0, 0.0, '— sin salidas por este canal —'])
        else:
            rows4.append([f"SKU{sku}", expos[canal], num(fl['unidades']), float(Q2(d(fl['costo_registrado']))),
                          float(Q2(d(fl['unidades']))), f"n={fl['n']} movimientos netos"])
sheet_from_rows(wb, 'Consumos históricos registrados a costo ≈0 (causa raíz B)',
    ['SKU', 'Canal contable', 'Unidades netas consumidas', 'Costo unitario registrado (CUP/u)',
     'Costo total registrado (CUP)', 'Observación'],
    rows4, col_formats={2: FMT_QTY, 3: FMT_MONEY, 4: FMT_MONEY},
    notes=['La capa FVC llegó a costos de hasta 2.176.000 CUP/u, pero los consumos se registraron a WAC≈0 (0,14–1,00 CUP/u): el costo de la recepción nunca entró al WAC ni al gasto.'])
wb.save(f'{OUTDIR}/FIVE_SKU_RECONCILIATION.xlsx')
print('OK FIVE_SKU_RECONCILIATION.xlsx')

# ═══════════ 2. FIFO_LAYER_RECONSTRUCTION.xlsx ══════════════════════════════
wb = Workbook(); wb.properties.creator = 'Z.ai'
rows = []
for sku in TARGETS + ['31']:
    rec = R['reconstruccion'][sku]
    for c in rec['capas_fvc']:
        rows.append([f"SKU{sku}", NOMBRES[sku], 'FVC (FAC-VITALLCONS-001)', c['fecha'], num(c['qty']),
                     float(Q2(d(c['uc']))), float(Q2(d(c['qty']) * d(c['uc']))), 'capa de la misión (1 CUP tras RECT-011)'])
    for c in rec['capas_ajenas']:
        rows.append([f"SKU{sku}", NOMBRES[sku], f"AJENA ({c['doc']})", c['fecha'], num(c['qty']),
                     float(Q2(d(c['uc']))), float(Q2(d(c['qty']) * d(c['uc']))), 'capa legítima ajena — INTACTA'])
sheet_from_rows(wb, 'Capas de compra por SKU (reconstrucción FIFO)',
    ['SKU', 'Producto', 'Tipo de capa', 'Fecha', 'Cantidad (u)', 'Costo unitario actual (CUP/u)',
     'Valor de capa (CUP)', 'Estado'],
    rows, col_formats={4: FMT_QTY, 5: FMT_MONEY, 6: FMT_MONEY},
    notes=[
        'Todas las capas de los 5 SKU están a 1,00 CUP/u tras RECT-011 (FVC) o ya lo estaban (ajena 30538c95 de SKU90: 100 u @ 1,00; consumida).',
        'SKU90: las 3 u restantes valen 1,00 CUP/u con independencia de la capa de origen (FVC ahora @1; ajena @1) → valor verdadero 3,00.',
        'El kardex de SKU90 presenta balance_after inconsistente en las reversas y saldos intermedios negativos (drift preexistente, importaciones); el NETO (3 u) concilia con stock_current.',
    ], first=True)

# Hoja: instante del negativo
inst = R['instante_negativo']
rows = []
for det in inst['detalle']:
    rows.append([det['old_wac'] if not isinstance(det['old_wac'], (int, float)) else num(det['old_wac']),
                 det['new_wac'] if not isinstance(det['new_wac'], (int, float)) else num(det['new_wac']),
                 num(det['stock']) if det['stock'] is not None else ''])
sheet_from_rows(wb, 'Instante exacto de la negatividad (lote C · RECT-011)',
    ['WAC antes (positivo)', 'WAC después (negativo)', 'Stock (u)'],
    rows, col_formats={0: FMT_WAC, 1: FMT_WAC, 2: FMT_QTY},
    notes=[
        f"Acción SYSTEM_RECT011_WAC · trace RECT011-PROD · created_at {inst['created_at']} (lote C, pasada 1 de RECT-011).",
        'Los 6 registros de auditoría del lote C muestran WAC antes POSITIVO para los 5 SKU + SKU31: la negatividad fue PRODUCIDA por RECT-011 (no preexistente a la misión 011).',
        'Mecanismo: lote C escribió cost_average directamente (token sellado w62) con los wac_new del modelo m074: wac_new = (wac_old×stock − (uc_old−1)×fvc_rem)/stock.',
    ])

# Hoja: historia WAC (drift)
rows = []
for sku in TARGETS:
    for w in R['historia_wac'].get(sku, []):
        rows.append([f"SKU{sku}", w['fecha'], w['evento'], num(w['antes']), num(w['despues']),
                     w['qty_in'], w['uc_in']])
sheet_from_rows(wb, 'Historia del WAC por SKU (drift: salidas a costo ≈0)',
    ['SKU', 'Fecha (UTC)', 'Evento', 'WAC antes', 'WAC después', 'qty_in', 'uc_in'],
    rows, col_formats={3: FMT_WAC, 4: FMT_WAC, 5: FMT_QTY, 6: FMT_WAC},
    notes=[
        'Origen del drift: la recepción FVC (2026-07-01) nunca actualizó el WAC (0 filas de wac_change_log para ella); las salidas desde 2026-07-22 se registraron a costo ≈0.',
        'Las correcciones de octubre (wac_correction / adjustment_plus) fijaron WAC nominales pequeños (0,14–1,00) sin absorber el costo de la recepción.',
        'SKU31 (control): wac_correction 0→350 el 2026-10-06 y recepciones diluyeron a 4,1441; RECT-011 lo llevó a 1,00 (coherente con todas sus capas a 1).',
    ])
wb.save(f'{OUTDIR}/FIFO_LAYER_RECONSTRUCTION.xlsx')
print('OK FIFO_LAYER_RECONSTRUCTION.xlsx')

# ═══════════ 3. WAC_BEFORE_AFTER_ANALYSIS.xlsx ══════════════════════════════
wb = Workbook(); wb.properties.creator = 'Z.ai'
rows = []
for sku in TARGETS:
    rec = R['reconstruccion'][sku]
    m74 = rec['modelo_m074']
    p = prod_by_sku[sku]
    rows.append([f"SKU{sku}", NOMBRES[sku],
                 num(d(m74['wac_old'])), float(Q2(d(m74['wac_old']) * d(m74['stock_actual']))),
                 float(Q2(d(m74['inv_credito']))), num(d(m74['wac_new'])),
                 num(d(p['cost_average'])), num(d(p['stock_current'])),
                 float(Q2(d(p['cost_average']) * d(p['stock_current']))),
                 1.0, num(d(p['stock_current'])), float(Q2(d(p['stock_current'])))])
sheet_from_rows(wb, 'WAC antes / tras RECT-011 / propuesto por SKU',
    ['SKU', 'Producto', 'WAC pre-RECT-011 (CUP/u)', 'Valor libro pre (CUP)', 'Crédito INV aplicado (CUP)',
     'WAC post-RECT-011 (CUP/u) = hoy', 'WAC hoy (exacto)', 'Stock (u)', 'Valor hoy (CUP)',
     'WAC propuesto (CUP/u)', 'Stock propuesto (u)', 'Valor propuesto (CUP)'],
    rows,
    total_row=['TOTAL (5 SKU)', '', '', float(Q2(sum(d(m['wac_old']) * d(m['stock_actual'])
                 for s in TARGETS for m in [R['reconstruccion'][s]['modelo_m074']]))),
               float(Q2(sum(d(R['reconstruccion'][s]['modelo_m074']['inv_credito']) for s in TARGETS))),
               '', '', num(sum(d(R['reconstruccion'][s]['stock_current']) for s in TARGETS)),
               num(ca['valor_total_real_hoy_q2']), '', num(sum(d(R['reconstruccion'][s]['stock_current']) for s in TARGETS)),
               34.00],
    col_formats={2: FMT_WAC, 3: FMT_MONEY, 4: FMT_MONEY, 5: FMT_WAC, 6: FMT_WAC, 7: FMT_QTY, 8: FMT_MONEY,
                 9: FMT_WAC, 10: FMT_QTY, 11: FMT_MONEY},
    notes=[
        'Fórmula aplicada por el lote C de RECT-011 (modelo m074): wac_new = (wac_old×stock − (uc_old−1)×fvc_rem)/stock.',
        'La fórmula es matemáticamente correcta en el mundo sin drift (valor libro = uc_old×fvc_rem), pero el valor libro preexistente NO contenía la recepción (drift) → exceso de crédito → negativo.',
        'El WAC propuesto (1,00 CUP/u) es la valoración de la economía autorizada (todas las capas de estos SKU a 1 CUP): stock × 1 = valor verdadero.',
    ], first=True)

# Hoja: los 25 recalculados
rows = []
for w in sorted(mat['wac_updates'], key=lambda x: (float(x['wac_new']) >= 0, x['sku'])):
    neg = float(w['wac_new']) < 0
    rows.append([f"SKU{w['sku']}", num(w['stock']), num(w['wac_old']), num(w['wac_new']), float(Q2(d(w['inv_credito']))),
                 'NEGATIVO — corregido por RECT-013-A' if neg else 'positivo — fuera de alcance 013'])
sheet_from_rows(wb, 'Los 25 WAC recalculados por RECT-011',
    ['SKU', 'Stock (u)', 'WAC_old', 'WAC_new (modelo m074)', 'Crédito INV asignado (CUP)', 'Clasificación'],
    rows, col_formats={1: FMT_QTY, 2: FMT_WAC, 3: FMT_WAC, 4: FMT_MONEY},
    notes=['5 de 25 quedaron negativos (los de mayor uc_old y menor stock); los 20 restantes positivos. SKU31 y SKU90 son los únicos con capas de otras recepciones.'])

# Hoja: SKU31 vs SKU90 (capas ajenas)
rows = []
for sku in ['31', '90']:
    rec = R['reconstruccion'][sku]
    m74 = rec['modelo_m074']
    p = prod_by_sku[sku]
    rows.append([f"SKU{sku}", NOMBRES[sku], num(d(m74['wac_old'])), num(d(m74['wac_new'])),
                 num(d(p['cost_average'])), len(rec['capas_ajenas']),
                 float(Q2(sum(d(c['qty']) * d(c['uc']) for c in rec['capas_ajenas']))),
                 'WAC=1 coherente (todas las capas a 1)' if sku == '31' else 'WAC negativo por exceso de crédito — corregido a 1'])
sheet_from_rows(wb, 'Productos con capas de otras recepciones (SKU31 y SKU90)',
    ['SKU', 'Producto', 'WAC_old', 'WAC_new (m074)', 'WAC hoy', 'Capas ajenas (n)',
     'Valor capas ajenas (CUP)', 'Situación'],
    rows, col_formats={2: FMT_WAC, 3: FMT_WAC, 4: FMT_WAC, 6: FMT_MONEY},
    notes=['Las capas legítimas de otras recepciones NO se alteran en ninguna corrección propuesta: SKU31 conserva sus 110 u @1 (0fab1e37 y 55ed12df); SKU90 conserva la capa ajena (30538c95, 100 u @1, consumida).'])
wb.save(f'{OUTDIR}/WAC_BEFORE_AFTER_ANALYSIS.xlsx')
print('OK WAC_BEFORE_AFTER_ANALYSIS.xlsx')

# ═══════════ 4. ACCOUNTING_IMPACT.xlsx ══════════════════════════════════════
wb = Workbook(); wb.properties.creator = 'Z.ai'
imp = R['impacto_contable']
rows = []
for cat in ['ACT_INVENTARIO', 'PAS_CXP_PROV', 'GAS_COSTO_VENTAS', 'GAS_VALES', 'GAS_PERDIDA_INV']:
    s = imp['saldos_enervida'][cat]
    rows.append([cat, s['movs'], num(s['debe']), num(s['haber']), num(s['saldo_natural']),
                 'ACTIVO (deudor)' if cat == 'ACT_INVENTARIO' else ('PASIVO (acreedor)' if cat == 'PAS_CXP_PROV' else 'GASTO — SALDO ACREEDOR ANÓMALO (ingreso fantasma)')])
sheet_from_rows(wb, 'Saldos ENERVIDA hoy (libro mayor, naturaleza)',
    ['Categoría', 'Movimientos', 'Total debe (CUP)', 'Total haber (CUP)', 'Saldo natural (debe−haber)', 'Naturaleza / anomalía'],
    rows, col_formats={1: '0', 2: FMT_MONEY, 3: FMT_MONEY, 4: FMT_MONEY},
    notes=[
        'Las tres cuentas de gasto tienen saldo ACREEDOR (negativo): los créditos de RECT-011 no tienen débitos históricos que los sustenten (los consumos se registraron a costo ≈0).',
        'GAS_COSTO_VENTAS −16.677.175,95 · GAS_VALES −5.105.078,39 · GAS_PERDIDA_INV −9.691.011,00 → ingreso fantasma creado por la misma asignación de RECT-011 que produjo los 5 WAC negativos.',
    ], first=True)

rows = []
cred = R['impacto_contable']['creditos_rect011_5sku']
glob = R['impacto_contable']['creditos_rect011_global']
for k, nombre in [('inv', 'ACT_INVENTARIO (crédito)'), ('cogs', 'GAS_COSTO_VENTAS (crédito)'),
                  ('vales', 'GAS_VALES (crédito)'), ('perdida', 'GAS_PERDIDA_INV (crédito)'), ('delta', 'PAS_CXP_PROV (débito)')]:
    gk = 'cxp_debito' if k == 'delta' else k
    rows.append([nombre, num(cred[k]), num(glob[gk]), float(Q2(d(cred[k]) / d(glob[gk]) * 100)) if d(glob[gk]) else 0.0])
sheet_from_rows(wb, 'Créditos/débitos de RECT-011: los 5 SKU vs global',
    ['Concepto', 'Los 5 SKU (CUP)', 'Global RECT-011 (CUP)', '% de los 5 SKU'],
    rows, col_formats={1: FMT_MONEY, 2: FMT_MONEY, 3: '0.00"%"'},
    notes=['El asiento RECT-011 está balanceado globalmente (Σ créditos = débito = 40.733.723,50); la anomalía es la ATRIBUCIÓN por canal/producto.'])

rows = []
ca_ = R['control_aritmetico']
for v in ca_['verificacion_wac_hoy']:
    rows.append([f"SKU{v['sku']}", num(v['stock']), float(Q2(d(v['wac']))), float(Q2(d(v['valor_total'])))])
prop = R['propuesta_rect013_a']
rows.append(['EFECTO PROPUESTA RECT-013-A', '', '', ''])
rows.append(['ACT_INVENTARIO (crédito)', '', '', -num(prop['importe_total'])])
rows.append(['GAS_COSTO_VENTAS (débito)', '', '', num(prop['dr_gas_costo_ventas'])])
rows.append(['GAS_VALES (débito)', '', '', num(prop['dr_gas_vales'])])
rows.append(['GAS_PERDIDA_INV (débito)', '', '', num(prop['dr_gas_perdida_inv'])])
rows.append(['PAS_CXP_PROV', '', '', 0.0])
rows.append(['Balance de la entrada (ΣDR − ΣCR)', '', '', num(prop['balance'])])
sheet_from_rows(wb, 'Efecto de la propuesta RECT-013-A sobre las cuentas',
    ['Concepto', 'Stock (u)', 'WAC (CUP/u)', 'Importe (CUP)'],
    rows, col_formats={1: FMT_QTY, 2: FMT_MONEY, 3: FMT_MONEY},
    notes=['Después de RECT-013-A: GAS_COSTO_VENTAS −16.110.629,50 · GAS_VALES −4.032.160,12 · GAS_PERDIDA_INV −8.673.096,40 (siguen acreedores: la regularización completa es el componente B).',
           'ACT_INVENTARIO: 34.435.061,24 − 2.657.379,32 = 31.777.681,92 (libera parte de la atribución ficticia). PAS_CXP_PROV: intacto.'])

rows = []
for k, v in sorted(R['integridad']['saldos_otras_tiendas'].items()):
    rows.append([k, num(v)])
sheet_from_rows(wb, 'Integridad: otras tiendas (sin movimientos de la misión)',
    ['Cuenta@tienda', 'Saldo natural'], rows, col_formats={1: FMT_MONEY},
    notes=['Las otras tiendas (43a4dabc…, 899d2503…) permanecen constantes; SKU117 y SKU90 existen también en PUERTO PADRE con WAC = 1,00 positivo e intacto.'])
wb.save(f'{OUTDIR}/ACCOUNTING_IMPACT.xlsx')
print('OK ACCOUNTING_IMPACT.xlsx')

# ═══════════ 5. CORRECTION_PROPOSAL.xlsx ════════════════════════════════════
wb = Workbook(); wb.properties.creator = 'Z.ai'
rows = []
for w in prop['wac_updates']:
    rows.append([w['sku'], NOMBRES[w['sku']], w['product_id'], num(w['stock']), float(Q2(d(w['wac_hoy']))), 1.0])
sheet_from_rows(wb, 'RECT-013-A · actualizaciones de WAC (lote A, token sellado)',
    ['SKU', 'Producto', 'product_id', 'Stock (u)', 'WAC hoy (negativo)', 'WAC propuesto (CUP/u)'],
    rows, col_formats={3: FMT_QTY, 4: FMT_WAC, 5: FMT_WAC},
    notes=['Escritura sellada (SET LOCAL app.wac_writer=fn_recalc_wac) + fila en wac_change_log (event=rect013_restauracion) + auditoría SYSTEM_RECT013_WAC.'], first=True)

rows = [
    ['GAS_COSTO_VENTAS', 'débito', num(prop['dr_gas_costo_ventas']), 'reparto proporcional a los créditos RECT-011 de los 5 SKU'],
    ['GAS_VALES', 'débito', num(prop['dr_gas_vales']), 'reparto proporcional (base 11.361.375,00)'],
    ['GAS_PERDIDA_INV', 'débito', num(prop['dr_gas_perdida_inv']), 'residuo de reparto al centavo'],
    ['ACT_INVENTARIO', 'crédito', num(prop['importe_total']), 'liberación de la atribución ficticia de inventario'],
    ['TOTAL DEBE', '', num(prop['importe_total']), ''],
    ['TOTAL HABER', '', num(prop['importe_total']), ''],
    ['D − C', '', num(prop['balance']), 'equilibrado al centavo'],
]
sheet_from_rows(wb, 'RECT-013-A · asiento propuesto (lote B)',
    ['Categoría', 'Sentido', 'Importe (CUP)', 'Criterio'],
    rows, col_formats={2: FMT_MONEY},
    notes=[
        'Asiento: AJUSTE_INVENTARIO / ajuste_manual · economic_date = fecha de ejecución (período corriente) · document_id NULL (combinación libre) · movements_snapshot con detalle por SKU.',
        'Alternativa documentada (sugerencia del informe 012): concentrar la contrapartida íntegra en GAS_PERDIDA_INV (DR 2.657.379,32 / CR ACT_INVENTARIO 2.657.379,32).',
        'No toca PAS_CXP_PROV (economía FAC-VITALLCONS-001: 5.861,50 intacta), ni líneas, ni capas, ni movimientos históricos, ni precios.',
    ])

rows = []
b = R['componente_b_regularizacion']
# residuo obsoleto de los 5 SKU en ACT_INVENTARIO tras A (cálculo desde datos):
# Σ(item) + Σ(otros débitos: capa ajena + ajustes +) − h_5 − Σ(inv_credito) − valor verdadero (34,00) − A
item5 = sum(d(R['reconstruccion'][s]['modelo_m074']['uc_cup_old']) * d(R['reconstruccion'][s]['modelo_m074']['qty']) for s in TARGETS)
otros5 = sum(d(c['qty']) * d(c['uc']) for s in TARGETS for c in R['reconstruccion'][s]['capas_ajenas']) \
         + sum(d(R['reconstruccion'][s]['flujos_netos'].get('ajuste_plus', {}).get('costo_registrado', '0')) for s in TARGETS)
h5 = sum(d(R['reconstruccion'][s]['flujos_netos'].get(k, {}).get('costo_registrado', '0')) for s in TARGETS for k in ('venta', 'vale', 'perdida'))
invcred5 = sum(d(R['reconstruccion'][s]['modelo_m074']['inv_credito']) for s in TARGETS)
verdadero5 = sum(d(R['reconstruccion'][s]['stock_current']) for s in TARGETS) * D(1)
residuo_B = item5 + otros5 - h5 - invcred5 - verdadero5 - d(prop['importe_total'])
rows.append(['Costos históricos registrados — COGS (venta)', num(b['costos_historicos_registrados']['cogs'])])
rows.append(['Costos históricos registrados — VALES', num(b['costos_historicos_registrados']['vales'])])
rows.append(['Costos históricos registrados — PÉRDIDA', num(b['costos_historicos_registrados']['perdida'])])
rows.append(['Re-costeo a 1 CUP/u — venta (135 u netas)', num(b['recosteo_pendiente']['venta'])])
rows.append(['Re-costeo a 1 CUP/u — vales (133 u netas)', num(b['recosteo_pendiente']['vale'])])
rows.append(['Re-costeo a 1 CUP/u — pérdida (23 u netas)', num(b['recosteo_pendiente']['perdida'])])
rows.append(['Fantasma RECT-011 de los 5 SKU — COGS', num(b['fantasma_rect011_5sku']['cogs'])])
rows.append(['Fantasma RECT-011 de los 5 SKU — VALES', num(b['fantasma_rect011_5sku']['vales'])])
rows.append(['Fantasma RECT-011 de los 5 SKU — PÉRDIDA', num(b['fantasma_rect011_5sku']['perdida'])])
rows.append(['Residuo obsoleto en ACT_INVENTARIO de los 5 SKU (tras A)', num(residuo_B)])
sheet_from_rows(wb, 'Componente B · regularización (requiere autorización específica)',
    ['Concepto', 'Importe (CUP)'], rows, col_formats={1: FMT_MONEY},
    notes=[
        'El componente B completa la asignación contable de RECT-011 para los 5 SKU: deshacer el fantasma restante, re-costear los consumos históricos a 1 CUP/u y liberar el residuo obsoleto de ACT_INVENTARIO.',
        f'Cálculo del residuo: Σ(item {Q2(item5)}) + otros débitos {Q2(otros5)} − costos registrados {Q2(h5)} − créditos INV RECT-011 {Q2(invcred5)} − valor verdadero {Q2(verdadero5)} − restauración A {prop["importe_total"]} = {Q2(residuo_B)}.',
        'Afecta el resultado acumulado y las bases divergentes F-012-3 (protegidas): NO ejecutar sin autorización específica del propietario.',
        'La extensión del tratamiento a los otros 96 productos recalculados (si se desea regularizar globalmente) sería una misión posterior.',
    ])

rows = [
    ['No reabre la valoración de las 101 líneas', 'Las líneas siguen a 1,00 CUP/u; CXP neta del documento 5.861,50 intacta'],
    ['No repite RECT-1 / RECT-2 / RECT-011', 'Ninguno de los tres asientos se modifica; RECT-013-A es una entrada nueva y balanceada'],
    ['Protege capas de otras recepciones', 'SKU31 (110 u @1) y SKU90 (100 u @1, consumida) intactas; 66 capas uc≠1 fuera de alcance'],
    ['Conserva existencias y movimientos', 'stock_current y kardex sin cambios (solo cost_average de los 5)'],
    ['Trazable', 'wac_change_log + auditoría SYSTEM_RECT013_WAC/ENTRY + movements_snapshot por SKU'],
    ['Idempotente', 'guard YA_APLICADO (conteo read-only) + IDs deterministas + ON CONFLICT DO NOTHING'],
    ['Reversible', '1 llamada = 1 transacción atómica; aborto → 0 persistencia (probado en E2E)'],
    ['E2E aprobada', 'BD aislada CostproE2E: 13 veredictos PASS, NET DELTA = 0'],
    ['Producción sin escrituras', 'Esta misión es 100% read-only; la ejecución de RECT-013-A requiere autorización del propietario'],
]
sheet_from_rows(wb, 'Garantías de la propuesta', ['Garantía', 'Detalle'], rows,
    notes=['Criterios de aceptación de la misión 013 §12 cubiertos.'])
wb.save(f'{OUTDIR}/CORRECTION_PROPOSAL.xlsx')
print('OK CORRECTION_PROPOSAL.xlsx')
print('5 XLSX generados en', OUTDIR)
