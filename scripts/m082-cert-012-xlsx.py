#!/usr/bin/env python3
# ============================================================================
# M082 — CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
# Generador de los 7 XLSX del expediente (skill xlsx · paleta professional).
# Solo lectura de los extractos RO; no consulta producción.
# Salida: docs/audits/cp-fin-post-rectification-certification-012/*.xlsx
# ============================================================================
import json, os, sys
from decimal import Decimal as D
from collections import defaultdict

XLSX_SKILL_DIR = '/home/z/my-project/skills/xlsx'
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, 'templates')]:
    if sub not in sys.path:
        sys.path.insert(0, sub)
from base import (FONT_NAME, HEADER_BOLD, PRIMARY, SECONDARY, ACCENT_POSITIVE, ACCENT_NEGATIVE,
                  ACCENT_WARNING, NEUTRAL_900, NEUTRAL_600, NEUTRAL_200, NEUTRAL_100, NEUTRAL_0,
                  setup_sheet, style_header_row, style_data_row, style_total_row,
                  font_caption, font_body, align_number, align_text, auto_fit_columns)
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

OUTDIR = 'docs/audits/cp-fin-post-rectification-certification-012'
os.makedirs(OUTDIR, exist_ok=True)
M012 = 'scripts/out/m012'
e = json.load(open(f'{M012}/extract.json'))
s1 = json.load(open(f'{M012}/extract-supplement.json'))
s2 = json.load(open(f'{M012}/extract-supplement2.json'))
mat = json.load(open('scripts/out/m074-matriz-1cup.json'))
R = json.load(open(f'{M012}/results.json'))

FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
NOMBRE_ASIENTO = {'93bb5da9-0afd-4325-baad-a275710062c5': 'ORIG (asiento original)',
                  '7ec90009-0000-4000-8000-d0b300000001': 'RECT-1',
                  '7ec90009-0000-4000-8000-d0b300000002': 'RECT-2',
                  '7ec9000b-0000-4000-8000-d11300000001': 'RECT-011'}

def d(x):
    return D(str(x)) if x is not None else D(0)

def num(x):
    return float(d(x))

FMT_MONEY = '#,##0.00'
FMT_QTY = '#,##0.0000'

def sheet_from_rows(wb, title, headers, rows, total_row=None, col_formats=None, notes=None, first=False):
    """Hoja estándar: título B2, cabecera fila 4, datos fila 5+, totales opcionales."""
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
            if col_formats and headers[ci - 2] in col_formats and isinstance(v, (int, float)):
                cell.number_format = col_formats[headers[ci - 2]]
        style_data_row(ws, row_num=r, col_start=2, col_end=last_col, row_index=i)
        # alineación numérica
        for ci, v in enumerate(row, start=2):
            if isinstance(v, (int, float)):
                ws.cell(row=r, column=ci).alignment = align_number()
        r += 1
    if total_row:
        for ci, v in enumerate(total_row, start=2):
            cell = ws.cell(row=r, column=ci, value=v)
            if col_formats and headers[ci - 2] in col_formats and isinstance(v, (int, float)):
                cell.number_format = col_formats[headers[ci - 2]]
        style_total_row(ws, row_num=r, col_start=2, col_end=last_col)
        for ci, v in enumerate(total_row, start=2):
            if isinstance(v, (int, float)):
                ws.cell(row=r, column=ci).alignment = align_number()
        r += 1
    if notes:
        r += 2
        for nota in notes:
            c = ws.cell(row=r, column=2, value=nota)
            c.font = font_caption()
            r += 1
    auto_fit_columns(ws, min_width=8, max_width=42, header_row=4, data_start_row=5)
    ws.freeze_panes = 'C5'
    return ws

def resumen_sheet(wb, titulo, veredictos_ids, notas_extra=None):
    """Hoja Resumen con los veredictos del análisis referidos a este libro."""
    rows = []
    for v in R['veredictos']:
        if v['id'].split('_')[0] in veredictos_ids:
            rows.append([v['id'], v['seccion'], v['resultado'], v['detalle']])
    ws = sheet_from_rows(wb, titulo, ['Check', 'Sección', 'Resultado', 'Detalle'], rows, first=not wb.worksheets or wb.worksheets[0].title == 'Sheet',
                         notes=(notas_extra or []) + [f"Extracción RO: {R['generado_utc']} · m080/m080b/m080c · producción wthkddeleylijmonclxg intacta"],
                         first_override=True) if False else None
    return ws

def add_summary(wb, titulo, prefijos, notas=None):
    ws = wb.active
    ws.title = 'Resumen'
    rows = []
    for v in R['veredictos']:
        if any(v['id'].startswith(p) for p in prefijos):
            estado = v['resultado']
            rows.append([v['id'], v['seccion'], estado, v['detalle']])
    ws_ = sheet_from_rows(wb, titulo, ['Check', 'Sección', 'Resultado', 'Detalle'], rows,
                          notes=(notas or []) + [f"Extracción read-only {R['generado_utc']} · scripts m080/m080b/m080c · producción intacta (CP-INFRA-019/020, T12 activo)"],
                          first=True)
    # colorear resultados
    for i in range(len(rows)):
        c = ws_.cell(row=5 + i, column=4)
        if c.value == 'PASS':
            c.font = Font(name=FONT_NAME, size=11, color=ACCENT_POSITIVE)
        elif c.value in ('POST_EXECUTION', 'PREEXISTING', 'OUT_OF_SCOPE', 'BLOCKED'):
            c.font = Font(name=FONT_NAME, size=11, color=ACCENT_WARNING)
    return ws_

def mark_negative_rows(ws, col, start_row, n_rows):
    for i in range(n_rows):
        v = ws.cell(row=start_row + i, column=col).value
        if isinstance(v, (int, float)) and v < 0:
            for ci in range(2, ws.max_column + 1):
                cell = ws.cell(row=start_row + i, column=ci)
                cell.font = Font(name=FONT_NAME, size=11, color=ACCENT_NEGATIVE)

wb1 = Workbook()

# ═══ 1 · RECEIPT_ACCOUNTING_RECONCILIATION.xlsx ══════════════════════════════
add_summary(wb1, 'Reconciliación recepción ↔ contabilidad — FAC-VITALLCONS-001', ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'A1', 'A2', 'A3', 'A4'],
            ['Cadena: 192.039.436,00 (ORIG) − 151.299.851,00 (RECT-1) − 40.733.723,50 (RECT-011) = 5.861,50 CUP'])
matrows = {m['sku']: m for m in mat['matriz']}
lin_by_sku = {r['sku']: r for r in e['receipt_items']}
filas = []
for m in mat['matriz']:
    r = lin_by_sku[m['sku']]
    filas.append([m['sku'], r['name'], r['line_id'], num(m['qty']), num(m['uc_cup_old']), num(m['subtotal_old_cup']),
                  num(m['subtotal_new']), num(m['delta_linea']), r['moneda_recepcion'], num(r['tasa_cambio_recepcion']),
                  m['capa_id'], str(r['updated_at'])[:19]])
tot = ['TOTAL', '', '', num(sum(d(m['qty']) for m in mat['matriz'])), '',
       num(sum(d(m['subtotal_old_cup']) for m in mat['matriz'])), num(sum(d(m['subtotal_new']) for m in mat['matriz'])),
       num(sum(d(m['delta_linea']) for m in mat['matriz'])), '', '', '', '']
sheet_from_rows(wb1, 'Las 101 líneas (antes → después)',
                ['SKU', 'Producto', 'line_id', 'Cantidad', 'Costo CUP anterior', 'Valor anterior CUP', 'Subtotal nuevo (1 CUP)', 'Delta línea', 'Moneda', 'Tasa', 'capa_id', 'updated_at (UTC)'],
                filas, total_row=tot,
                col_formats={'Cantidad': FMT_QTY, 'Costo CUP anterior': FMT_MONEY, 'Valor anterior CUP': FMT_MONEY,
                             'Subtotal nuevo (1 CUP)': FMT_MONEY, 'Delta línea': FMT_MONEY, 'Tasa': FMT_QTY},
                notes=['Subtotal nuevo = cantidad × 1,00 CUP (regla del propietario, misión 011). Delta = valor anterior − subtotal nuevo.',
                       '78 líneas cambiaron de valor; 23 ya conformes (SKU111/112 por RECT-1, 999 servicio, 20 costo bajo legítimo).'])
movs = []
for m in e['fin_movements_fvc']:
    nom = NOMBRE_ASIENTO[m['entry_id']]
    movs.append([nom, m['category_code'], m['sense'], num(m['amount']), num(m['amount_cup']),
                 str(m['economic_date']), str(m['created_at'])[:19], (m['description'] or '')[:60]])
ent = {a['id']: a for a in e['fin_entries_fvc']}
sheet_from_rows(wb1, 'Asientos del documento (12 movimientos)',
                ['Asiento', 'Categoría', 'Sense', 'Importe', 'Importe CUP', 'Fecha económica', 'created_at (UTC)', 'Descripción'],
                movs,
                col_formats={'Importe': FMT_MONEY, 'Importe CUP': FMT_MONEY},
                notes=['ORIG: D ACT_INVENTARIO / C PAS_CXP_PROV 192.039.436,00 · RECT-1: D CXP / C INV 151.299.851,00',
                       'RECT-2: C INV 24,00 / D PÉRDIDA 18,00 + VALES 6,00 · RECT-011: D CXP 40.733.723,50 / C INV+COGS+VALES+PÉRDIDA',
                       'Todos balanceados (D−C = 0,00). RECT-1 y RECT-011 con reversal_of = asiento original; NO son anulaciones totales.'])
wb1.save(f'{OUTDIR}/RECEIPT_ACCOUNTING_RECONCILIATION.xlsx')

# ═══ 2 · BALANCE_SHEET_RECONCILIATION.xlsx ═══════════════════════════════════
wb2 = Workbook()
add_summary(wb2, 'Balance General — reconciliación RPC vs motor directo', ['E1', 'E2', 'K1', 'K2', 'K3', 'K4'],
            ['Ecuación contable: activos 61.249.431,25 = pasivos 2.961.795,90 + resultado 58.287.635,35 (diferencia 0,00)'])
bs = e['rpc_balance_sheet']
cats = []
for c in bs['categorias']:
    cats.append([c['code'], c['name'], c['clase'], c['grupo'], num(c['saldo']), c['movimientos']])
sheet_from_rows(wb2, 'Balance por categoría (RPC fin_get_balance_sheet, as_of 2026-11-17)',
                ['Código', 'Categoría', 'Clase', 'Grupo', 'Saldo CUP', 'Movimientos'], cats,
                total_row=['TOTALES', 'Activos 61.249.431,25 · Pasivos 2.961.795,90 · Resultado acumulado 58.287.635,35 · Ecuación 0,00 (equilibrado)', '', '', '', ''],
                col_formats={'Saldo CUP': FMT_MONEY},
                notes=['Alcance: tienda ENERVIDA. La tienda no tiene asiento de apertura (completitud.sin_apertura=true) — estado preexistente.',
                       'RPC == cálculo directo del motor: 13 categorías con saldo idénticas una a una.'])
cadena = [
    ['Corte tras RECT-2 (16:07:48Z)', num(R['veredictos'] and 38121388.34), num(43695519.40), num(12259780.17), num(50381168.51), num(55955299.57), 'Ancla certificada m063 (misión 009)'],
    ['Ventas orgánicas 18:05–18:50Z', -7951.60, 0.00, 0.00, -7951.60, 0.00, '3 ventas legítimas (OUT_OF_SCOPE)'],
    ['RECT-011 (20:03:05Z)', -3678375.50, -40733723.50, 0.00, -3678375.50, -40733723.50, 'Asiento de la corrección'],
    ['Saldo al cierre de la corrección', num(34435061.24 + 0), num(2961795.90), num(12259780.17), num(46694841.41), num(15221576.07), 'ENERVIDA + otras tiendas == cadena certificada'],
]
sheet_from_rows(wb2, 'Cadena de corte ACT_INVENTARIO / PAS_CXP_PROV (todas las tiendas)',
                ['Momento', 'Δ ACT ENERVIDA', 'Δ CXP ENERVIDA', 'Otras tiendas (constante)', 'ACT global', 'CXP global', 'Nota'],
                cadena,
                col_formats={'Δ ACT ENERVIDA': FMT_MONEY, 'Δ CXP ENERVIDA': FMT_MONEY, 'Otras tiendas (constante)': FMT_MONEY,
                             'ACT global': FMT_MONEY, 'CXP global': FMT_MONEY},
                notes=['ENERVIDA al cierre: ACT 34.435.061,24 · CXP 2.961.795,90 (idénticos hoy: 0 movimientos posteriores de estas cuentas).',
                       'Las certificaciones m060/m063 se midieron globalmente (ENERVIDA + tiendas 43a4dabc y 899d2503 = 12.259.780,17, sin movimientos nuevos).'])
comp = []
mine = {r['code']: r for r in e['saldos_por_categoria']}
for c in bs['categorias']:
    r = mine.get(c['code'])
    comp.append([c['code'], num(c['saldo']), num(r['saldo']) if r else None, 'IDÉNTICO' if r and d(r['saldo']) == d(c['saldo']) else 'DIVERGE'])
sheet_from_rows(wb2, 'Informe COSTPRO (RPC) vs consultas directas del motor',
                ['Código', 'Saldo RPC (informe app)', 'Saldo motor directo', 'Estado'], comp,
                col_formats={'Saldo RPC (informe app)': FMT_MONEY, 'Saldo motor directo': FMT_MONEY},
                notes=['Conclusión §7: no existe diferencia entre los informes de COSTPRO y las consultas directas del motor contable.'])
wb2.save(f'{OUTDIR}/BALANCE_SHEET_RECONCILIATION.xlsx')

# ═══ 3 · INCOME_STATEMENT_RECONCILIATION.xlsx ════════════════════════════════
wb3 = Workbook()
add_summary(wb3, 'Estado de Resultados — reconciliación', ['E4', 'K2', 'T5', 'A8'],
            ['Los efectos de la corrección (economic_date 2026-07-01) caen en el período de julio; el Balance los refleja íntegro.'])
inc = e['rpc_income_statement']
inc_rows = []
for c in inc['categorias']:
    inc_rows.append([c['code'], c['name'], c['grupo'], num(c['saldo'])])
sheet_from_rows(wb3, 'PyG período 2026-11-01 → 2026-11-17 (RPC fin_get_income_statement)',
                ['Código', 'Categoría', 'Grupo', 'Saldo CUP'], inc_rows,
                col_formats={'Saldo CUP': FMT_MONEY},
                notes=['Período noviembre: solo actividad orgánica (3 ventas 18:05–18:50Z del 16-11). La corrección no aparece por fecha económica 2026-07-01.'])
cat_fecha = defaultdict(lambda: D(0))
for r in s1['categoria_fecha']:
    cat_fecha[r['category_code']] += d(r['neto_debito'])
cats_map = {c['code']: c for c in e['fin_categories']}
acum = []
for code, v in sorted(cat_fecha.items(), key=lambda kv: (cats_map.get(kv[0], {}).get('sort_order', 99), kv[0])):
    c = cats_map.get(code, {})
    acum.append([code, c.get('name', code), c.get('clase', ''), num(v)])
sheet_from_rows(wb3, 'PyG acumulado por categoría (2026-07-01 → 2026-11-16, todas las tiendas ENERVIDA)',
                ['Código', 'Categoría', 'Clase', 'Neto débito−crédito CUP'], acum,
                col_formats={'Neto débito−crédito CUP': FMT_MONEY},
                notes=['Incluye los efectos de ORIG/RECT-1/RECT-2/RECT-011 (fecha económica 2026-07-01).',
                       'GAS_COSTO_VENTAS, GAS_VALES y GAS_PERDIDA_INV contienen los créditos compensatorios de RECT-011.'])
efectos = []
for m in e['fin_movements_fvc']:
    efectos.append([NOMBRE_ASIENTO[m['entry_id']], m['category_code'], m['sense'], num(m['amount_cup']), str(m['economic_date'])])
sheet_from_rows(wb3, 'Efecto contable de los 4 asientos por categoría',
                ['Asiento', 'Categoría', 'Sense', 'Importe CUP', 'Fecha económica'], efectos,
                col_formats={'Importe CUP': FMT_MONEY},
                notes=['RECT-011 acredita COGS 21.450.370,50 · VALES 5.913.947,50 · PÉRDIDA 9.691.030,00 (compensación de sobrecosto histórico) e inventario 3.678.375,50.'])
wb3.save(f'{OUTDIR}/INCOME_STATEMENT_RECONCILIATION.xlsx')

# ═══ 4 · INVENTORY_VALUATION_RECONCILIATION.xlsx ═════════════════════════════
wb4 = Workbook()
add_summary(wb4, 'Valoración de inventario — 101 productos y WAC', ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I9'],
            ['Crédito INV 3.678.375,50 = A) 3.094.707,00 variación de los 25 recalculados + B) 583.668,50 write-off de 3 SKUs sin existencias (86/89/110).'])
v101 = {r['product_id']: r for r in e['valoracion_101']}
wu = {w['product_id']: w for w in mat['wac_updates']}
val_rows = []
for m in mat['matriz']:
    r = v101[m['product_id']]
    en25 = m['product_id'] in wu
    if en25:
        conforme = 'SÍ' if d(r['wac_registrado']) == d(wu[m['product_id']]['wac_new']) else 'NO'
    else:
        conforme = 'SÍ' if d(r['wac_registrado']) == d(m['wac_old']) else 'NO'
    val_rows.append([m['sku'], num(r['qty_actual']), num(m['wac_old']), num(r['wac_registrado']),
                     num(d(r['qty_actual']) * d(m['wac_old'])), num(d(r['qty_actual']) * d(r['wac_registrado'])),
                     'SÍ' if en25 else 'no', conforme])
tot4 = ['TOTAL', num(sum(d(r['qty_actual']) for r in e['valoracion_101'])), '', '',
        num(sum(d(r['qty_actual']) * d(m['wac_old']) for m, r in [(mm, v101[mm['product_id']]) for mm in mat['matriz']])),
        num(sum(d(r['qty_actual']) * d(r['wac_registrado']) for r in e['valoracion_101'])), '', '']
ws_val = sheet_from_rows(wb4, 'Valoración operativa de los 101 productos (antes → ahora)',
                ['SKU', 'Existencias', 'WAC antes', 'WAC ahora', 'Valor antes CUP', 'Valor ahora CUP', 'WAC recalculado (25)', 'Conforme'],
                val_rows, total_row=tot4,
                col_formats={'Existencias': FMT_QTY, 'WAC antes': FMT_MONEY, 'WAC ahora': FMT_MONEY,
                             'Valor antes CUP': FMT_MONEY, 'Valor ahora CUP': FMT_MONEY},
                notes=['Δ valor = 3.678.375,50 CUP == crédito ACT_INVENTARIO del asiento RECT-011 (desglose en hoja siguiente).',
                       'Filas en rojo: WAC negativo (hallazgo F-012-1).'])
mark_negative_rows(ws_val, 4, 5, len(val_rows))
wac25 = [[w['sku'], num(w['wac_old']), num(w['wac_new']), num(w['stock']), num(next(d(m['inv_credito']) for m in mat['matriz'] if m['product_id'] == pid))]
         for pid, w in wu.items()]
ws_25 = sheet_from_rows(wb4, 'Los 25 WAC recalculados (lote C de RECT-011)',
                ['SKU', 'WAC antes', 'WAC nuevo', 'Existencias', 'Crédito INV atribuido CUP'], wac25,
                col_formats={'WAC antes': FMT_MONEY, 'WAC nuevo': FMT_MONEY, 'Existencias': FMT_QTY, 'Crédito INV atribuido CUP': FMT_MONEY},
                notes=['cost_average en producción == wac_new congelado: 25/25 (I5).',
                       'Capas de otras recepciones de los 25: solo SKU31 (110 u × 1,00) y SKU90 (100 u × 1,00) — WAC=1 coherente con todas las capas a 1 CUP.'])
mark_negative_rows(ws_25, 4, 5, len(wac25))
desglose = [
    ['A) Variación de valor contable de los 25 productos recalculados', num(3094707.00), 'Σ stock×(wac_old − wac_now)'],
    ['B) Write-off de residuo contable — 3 SKUs sin existencias (86/89/110)', num(583668.50), 'Σ fvc_restante × (uc_cup_old − 1)'],
    ['TOTAL = crédito ACT_INVENTARIO del asiento RECT-011', num(3678375.50), 'Σ inv_credito de las 101 líneas'],
]
sheet_from_rows(wb4, 'Desglose del crédito de inventario del asiento', ['Componente', 'Importe CUP', 'Fórmula'], desglose,
                col_formats={'Importe CUP': FMT_MONEY},
                notes=['B) es la limpieza del valor de recepción que las salidas históricas (a WAC≈0) nunca imputaron — causa raíz preexistente.'])
neg5 = [[h['cuantificacion']['skus'][i]['sku'], num(h['cuantificacion']['skus'][i]['wac']), num(h['cuantificacion']['skus'][i]['stock']), num(h['cuantificacion']['skus'][i]['valor'])]
        for i in range(len(h['cuantificacion']['skus']))] if (h := next(x for x in R['hallazgos'] if x['id'] == 'F-012-1')) else []
sheet_from_rows(wb4, 'Hallazgo F-012-1: WAC negativos (NO corregido en esta misión)',
                ['SKU', 'WAC actual', 'Existencias', 'Valor "contable" CUP'], neg5,
                col_formats={'WAC actual': FMT_MONEY, 'Existencias': FMT_QTY, 'Valor "contable" CUP': FMT_MONEY},
                notes=['Causa raíz PREEXISTING: inv_credito (2.657.375,00) > valor registrado (stock×wac_old ≈ 29,68) por salidas históricas a WAC≈0 con recepción cara.',
                       'Total −2.657.345,32 CUP. Asiento balanceado y asignación por línea exacta; valoración por producto económicamente inválida.',
                       'Clasificación: POST_EXECUTION (artefacto del modelo m074/loteC de la misión 011). Requiere corrección autorizada posterior; aquí SOLO documentado.'])
wb4.save(f'{OUTDIR}/INVENTORY_VALUATION_RECONCILIATION.xlsx')

# ═══ 5 · ACCOUNTS_PAYABLE_RECONCILIATION.xlsx ════════════════════════════════
wb5 = Workbook()
add_summary(wb5, 'Cuentas por pagar — reconciliación', ['K5', 'N9', 'R2', 'A4'],
            ['CXP ENERVIDA 2.961.795,90 == Σ recepciones activas unpaid (89 docs). FVC: 5.861,50 unpaid, 0 pagos.'])
cxp_rows = []
for r in sorted(e['cxp_por_documento'], key=lambda x: -d(x['neto_cxp'])):
    doc = r['document_id'] or '(sin documento)'
    marca = ' ← FAC-VITALLCONS-001' if r['document_id'] == FVC else ''
    cxp_rows.append([doc, r['document_type'], r['event'], num(r['neto_cxp']), r['movs'], marca])
sheet_from_rows(wb5, 'CXP por documento (libro mayor, ENERVIDA)',
                ['document_id', 'Tipo', 'Evento', 'Neto acreedor CUP', 'Movimientos', 'Nota'], cxp_rows,
                col_formats={'Neto acreedor CUP': FMT_MONEY},
                notes=['El FVC agrega sus 3 eventos (ORIG −192.039.436,00; RECT-1 +151.299.851,00; RECT-011 +40.733.723,50) = 5.861,50.',
                       'Los documentos con neto 0 son obligaciones pagadas o saldadas históricamente.'])
prov_rows = []
for r in s1['cxp_por_proveedor']:
    prov_rows.append([r['supplier'], r['payment_status'], r['n'], num(r['total']), num(r['pagado']),
                      str(r['vencimiento_min']), str(r['vencimiento_max'])])
sheet_from_rows(wb5, 'Recepciones activas por proveedor (estado de pagos)',
                ['Proveedor', 'Estado', 'Recepciones', 'Total CUP', 'Pagado CUP', 'Vencimiento mín', 'Vencimiento máx'], prov_rows,
                col_formats={'Total CUP': FMT_MONEY, 'Pagado CUP': FMT_MONEY},
                notes=['Todas las recepciones están unpaid; el único pago del 16-11 (21:06Z) fue de SERVICIO (PAS_SERV_PEND, Tienda Pueblo 900 CUP).'])
fvc_cxp = [[NOMBRE_ASIENTO[m['entry_id']], m['sense'], num(m['amount_cup']), str(m['economic_date'])]
           for m in e['fin_movements_fvc'] if m['category_code'] == 'PAS_CXP_PROV']
sheet_from_rows(wb5, 'FAC-VITALLCONS-001 en PAS_CXP_PROV (4 asientos)',
                ['Asiento', 'Sense', 'Importe CUP', 'Fecha económica'], fvc_cxp,
                col_formats={'Importe CUP': FMT_MONEY},
                notes=['Neto acreedor del documento: 5.861,50 CUP == total_cost de la recepción. Pagos registrados: 0. Obligaciones de otras recepciones intactas.'])
wb5.save(f'{OUTDIR}/ACCOUNTS_PAYABLE_RECONCILIATION.xlsx')

# ═══ 6 · GENERAL_LEDGER_RECONCILIATION.xlsx ══════════════════════════════════
wb6 = Workbook()
add_summary(wb6, 'Libro Mayor — reconciliación', ['E4', 'K1', 'K3', 'K4', 'A2'],
            ['5 cuentas clave conciliadas: saldo final == cadena de corte == RPC fin_get_category_detail.'])
lm_rows = []
for cat, v in R['libro_mayor_resumen'].items():
    lm_rows.append([cat, v['movimientos'], num(v['debitos']), num(v['creditos']), num(v['saldo_final']), num(v['corte_rect2'])])
sheet_from_rows(wb6, 'Libro mayor — 5 cuentas clave (ENERVIDA)',
                ['Cuenta', 'Movimientos', 'Débitos CUP', 'Créditos CUP', 'Saldo final CUP', 'Saldo al corte RECT-2'],
                lm_rows,
                col_formats={'Débitos CUP': FMT_MONEY, 'Créditos CUP': FMT_MONEY, 'Saldo final CUP': FMT_MONEY, 'Saldo al corte RECT-2': FMT_MONEY},
                notes=['GAS_* y ACT_INVENTARIO: saldo = débitos − créditos (naturaleza deudora). PAS_CXP_PROV: acreedor.',
                       'Saldo al corte RECT-2 (16:07:48Z) + actividad orgánica + RECT-011 == saldo final (cadena verificada).'])
clave_rows = []
for m in e['fin_movements_fvc']:
    clave_rows.append([NOMBRE_ASIENTO[m['entry_id']], m['category_code'], m['sense'], num(m['amount_cup']),
                       str(m['economic_date']), str(m['created_at'])[:19], 'FAC-VITALLCONS-001'])
for m in s2['movs_organicos']:
    clave_rows.append([m['document_type'], m['category_code'], m['sense'], num(m['amount_cup']),
                       str(m['economic_date']) if 'economic_date' in m else '', str(m['posted_at'])[:19], m['document_id'][:13] + '…'])
sheet_from_rows(wb6, 'Movimientos clave: corrección + actividad orgánica del 16-11',
                ['Documento', 'Cuenta', 'Sense', 'Importe CUP', 'Fecha económica', 'created_at (UTC)', 'document_id'],
                clave_rows, col_formats={'Importe CUP': FMT_MONEY},
                notes=['4 asientos del FVC (12 movimientos) + 5 asientos orgánicos (3 ventas 18:05–18:50Z + servicio y pago 21:06Z, 16 movimientos).'])
detalle = []
for m in e['libro_mayor_cuentas']:
    detalle.append([m['category_code'], str(m['created_at'])[:19], m['event'], (m['document_type'] or ''), (m['document_id'] or '')[:13],
                    m['sense'], num(m['amount_cup']), str(m['economic_date'])])
sheet_from_rows(wb6, 'Detalle completo del libro mayor (2004 movimientos)',
                ['Cuenta', 'created_at (UTC)', 'Evento', 'Tipo doc', 'document_id', 'Sense', 'Importe CUP', 'Fecha económica'],
                detalle, col_formats={'Importe CUP': FMT_MONEY},
                notes=['ACT_INVENTARIO 1000 · GAS_COSTO_VENTAS 710 · GAS_VALES 200 · PAS_CXP_PROV 91 · GAS_PERDIDA_INV 3.'])
wb6.save(f'{OUTDIR}/GENERAL_LEDGER_RECONCILIATION.xlsx')

# ═══ 7 · OUT_OF_SCOPE_INTEGRITY.xlsx ═════════════════════════════════════════
wb7 = Workbook()
add_summary(wb7, 'Integridad fuera de alcance — RECT-011 no alteró otras operaciones', ['N1', 'N5', 'N7', 'N9', 'T1', 'T2', 'T3', 'T4'],
            ['0 objetos ajenos tocados. Actividad orgánica identificada y atribuida (3 ventas + servicio con pago).'])
intg = e['integridad']
cnt = [
    ['Recepciones ajenas (cabeceras updated_at > ventana)', intg['otras_recepciones_cabeceras'][0]['n'], '0 = intactas'],
    ['Líneas de otras recepciones actualizadas', intg['otras_recepciones_lineas'][0]['n'], '0 = intactas'],
    ['Productos ajenos actualizados', intg['productos_ajenos'][0]['n'], '0 = intactos'],
    ['Movimientos de stock nuevos (todas las tiendas)', intg['otros_movimientos'][0]['n'], '0 = noche sin actividad'],
    ['Asientos en otras tiendas', intg['otras_tiendas_asientos'][0]['n'], '0 = intactas'],
    ['Capas de compra uc≠1 de otras recepciones', e['capas_global_uc_distinto_1'][0]['n'], f"{e['capas_global_uc_distinto_1'][0]['valor'][:14]} CUP preservado · 0 del FVC"],
    ['wac_change_log ajenos desde ventana', e['wac_log_otros_recientes'][0]['n'], '0 = solo los 25 de la misión'],
    ['Pagos contra FAC-VITALLCONS-001', s1['pagos_fvc'][0]['n'], 'unpaid 5.861,50 intacto'],
    ['Precios de venta divergentes (101 productos)', 0, 'R5: 0 divergencias vs matriz congelada'],
    ['Drift stock↔kardex de los 101 productos', 0, 'I3: stock_current == Σ kardex'],
]
sheet_from_rows(wb7, 'Contadores de integridad (ventana misión: 19:42:56Z → extracción)',
                ['Control', 'Valor', 'Interpretación'], cnt,
                notes=['La corrección solo tocó: 78 líneas FVC, 78 capas FVC, 25 WAC, 1 cabecera FVC, 1 asiento nuevo — todo con trace RECT011-PROD (183 filas de auditoría).'])
aud_rows = [[a['trace_id'] or '(orgánico)', a['action'], a['table_name'] or '', (a['record_id'] or '')[:13], str(a['created_at'])[:19]]
            for a in s1['auditoria_ventana_full']]
sheet_from_rows(wb7, 'Auditoría completa en la ventana (185 filas)',
                ['trace_id', 'Acción', 'Tabla', 'record_id', 'created_at (UTC)'], aud_rows,
                notes=['183 filas RECT011-PROD (78+78+25+1+1) + 2 orgánicas 21:06Z: SERVICE_CREATED y SUPPLIER_PAYMENT_REGISTERED (servicio SRV-20261116-00125, Tienda Pueblo, 900 CUP, pagado).'])
org_rows = []
for m in s2['movs_organicos']:
    org_rows.append([m['document_type'], m['event'], str(m['posted_at'])[:19], m['category_code'], m['sense'], num(m['amount_cup'])])
sheet_from_rows(wb7, 'Asientos orgánicos entre RECT-2 y la extracción (16 movimientos)',
                ['Documento', 'Evento', 'posted_at (UTC)', 'Cuenta', 'Sense', 'Importe CUP'], org_rows,
                col_formats={'Importe CUP': FMT_MONEY},
                notes=['3 ventas 18:05–18:50Z (usaron cost_average vigente en su momento; SKU111 a 1 CUP ya desde RECT-1) + servicio recibido y su pago 21:06Z.',
                       'Ninguno toca el FVC ni las 5 cuentas clave de la corrección (salvo ACT_EFECTIVO/GAS_SERVICIOS/PAS_SERV_PEND, cuentas ajenas).'])
wb7.save(f'{OUTDIR}/OUT_OF_SCOPE_INTEGRITY.xlsx')

print('OK — 7 XLSX generados en', OUTDIR)
for f in sorted(os.listdir(OUTDIR)):
    if f.endswith('.xlsx'):
        print('  ·', f, os.path.getsize(f'{OUTDIR}/{f}'), 'bytes')
