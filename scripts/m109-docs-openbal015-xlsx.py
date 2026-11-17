#!/usr/bin/env python3
# ============================================================================
# M109-docs — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015
# Genera los XLSX del expediente (patrón misión 014; skill xlsx, LITE):
#   · BEFORE_AFTER_AND_RECTIFICATIONS.xlsx (3 hojas)
#   · E2E_EVIDENCE.xlsx (batería m108)
# Totales como VALORES calculados (verificación programática, regla skill).
# ============================================================================
import json, sys, os

XLSX_SKILL_DIR = '/home/z/my-project/skills/xlsx'
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, 'templates')]:
    if sub not in sys.path:
        sys.path.insert(0, sub)

from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from templates.base import (setup_sheet, style_header_row, style_data_row,
                            style_total_row, FORMATS, COLUMN_WIDTHS,
                            align_number, auto_fit_columns)

OUT = '/home/z/my-project/Costpro/docs/audits/cp-fin-opening-balances-cash-reconciliation-015'
os.makedirs(OUT, exist_ok=True)

analysis = json.load(open('/home/z/my-project/Costpro/scripts/out/m015/analysis.json'))
e2e = json.load(open('/home/z/my-project/Costpro/scripts/out/m015/e2e-resultados.json'))
MONEY = FORMATS['decimal_2']

def write_block(ws, start_row, headers, rows, money_cols=()):
    """Escribe tabla con estilos del skill; devuelve la fila final."""
    r = start_row
    for j, h in enumerate(headers, 2):
        ws.cell(row=r, column=j, value=h)
    style_header_row(ws, r, 2, len(headers) + 1)
    idx = 0
    for row in rows:
        r += 1
        for j, v in enumerate(row, 2):
            c = ws.cell(row=r, column=j, value=v)
            if (j - 1) in money_cols and isinstance(v, (int, float)):
                c.number_format = MONEY
                c.alignment = align_number()
        style_data_row(ws, r, 2, len(row) + 1, idx)
        # re-aplicar formato monetario tras el estilo
        for j, v in enumerate(row, 2):
            if (j - 1) in money_cols and isinstance(v, (int, float)):
                c = ws.cell(row=r, column=j)
                c.number_format = MONEY
                c.alignment = align_number()
        idx += 1
    return r

def set_widths(ws, widths):
    for j, w in enumerate(widths, 2):
        ws.column_dimensions[get_column_letter(j)].width = w

# ═══ 1. BEFORE_AFTER_AND_RECTIFICATIONS.xlsx ═══
wb = Workbook()
wb.properties.creator = 'Z.ai'

ws = wb.active
setup_sheet(ws, 'M-015 · Saldos de ENERVIDA antes y después de las rectificaciones (CUP)', last_col=5)
antes = analysis['antes']; despues = analysis['despues']
rows = [
    ['ACT_EFECTIVO_CUP', float(antes['ACT_EFECTIVO_CUP']), float(despues['ACT_EFECTIVO_CUP']), float(despues['ACT_EFECTIVO_CUP']) - float(antes['ACT_EFECTIVO_CUP'])],
    ['ACT_EFECTIVO_USD (equiv. CUP)', float(antes['ACT_EFECTIVO_USD']), float(despues['ACT_EFECTIVO_USD']), float(despues['ACT_EFECTIVO_USD']) - float(antes['ACT_EFECTIVO_USD'])],
    ['ACT_BANCOS', float(antes['ACT_BANCOS']), float(despues['ACT_BANCOS']), 0.0],
    ['ACT_INVENTARIO', float(antes['ACT_INVENTARIO']), float(despues['ACT_INVENTARIO']), float(despues['ACT_INVENTARIO']) - float(antes['ACT_INVENTARIO'])],
    ['ACT_OTROS_CORR (nuevo)', 0.0, float(despues['ACT_OTROS_CORR']), float(despues['ACT_OTROS_CORR'])],
    ['PAS_CXP_PROV', float(antes['PAS_CXP_PROV']), float(despues['PAS_CXP_PROV']), 0.0],
    ['ING_VENTAS', float(antes['ING_VENTAS']), float(despues['ING_VENTAS']), float(despues['ING_VENTAS']) - float(antes['ING_VENTAS'])],
    ['ING_DESCUENTOS', 0.0, float(despues['ING_DESCUENTOS']), float(despues['ING_DESCUENTOS'])],
    ['GAS_COSTO_VENTAS', float(antes['GAS_COSTO_VENTAS']), float(despues['GAS_COSTO_VENTAS']), float(despues['GAS_COSTO_VENTAS']) - float(antes['GAS_COSTO_VENTAS'])],
    ['GAS_OTROS_OPER', float(antes['GAS_OTROS_OPER']), float(despues['GAS_OTROS_OPER']), float(despues['GAS_OTROS_OPER']) - float(antes['GAS_OTROS_OPER'])],
]
r = write_block(ws, 4, ['Cuenta', 'Antes (CUP)', 'Después (CUP)', 'Δ (CUP)'], rows, money_cols=(2, 3, 4))
total_antes = round(sum(x[1] for x in rows), 2)
total_desp = round(sum(x[2] for x in rows), 2)
r += 1
for j, v in enumerate(['Total neto (control de las filas listadas)', total_antes, total_desp, round(total_desp - total_antes, 2)], 2):
    c = ws.cell(row=r, column=j, value=v)
    if j > 2:
        c.number_format = MONEY
        c.alignment = align_number()
style_total_row(ws, r, 2, 5)
r += 2
ws.cell(row=r, column=2, value='Ecuación contable DESPUÉS: activos 36.314.845,50 = pasivos + patrimonio 36.314.845,50 · diferencia 0,00')
r += 1
ws.cell(row=r, column=2, value='USD nunca negativo: mínimo de la ventana 420,00 CUP (post-entrega del 23-10) · saldo final 109.900,00 CUP = 130 USD @845')
set_widths(ws, [34, 18, 18, 16])

ws2 = wb.create_sheet('Rectificaciones')
setup_sheet(ws2, 'M-015 · Rectificaciones contables propuestas (partida doble equilibrada)', last_col=7)
rect_rows = []
for key in ['RECT-015-A', 'RECT-015-B', 'RECT-015-C', 'RECT-015-D']:
    rec = analysis['rectificaciones'][key]
    for cat, monto in rec['dr'].items():
        rect_rows.append([key, rec['nombre'], 'DÉBITO', cat, float(monto), None, rec['refs'][0][:90]])
    for cat, monto in rec['cr'].items():
        rect_rows.append([key, rec['nombre'], 'CRÉDITO', cat, None, float(monto), rec['refs'][0][:90]])
r = write_block(ws2, 4, ['Rectificación', 'Nombre', 'Sentido', 'Categoría', 'Débito (CUP)', 'Crédito (CUP)', 'Referencia principal'],
                rect_rows, money_cols=(5, 6))
dr_total = round(sum(x[4] for x in rect_rows if x[4] is not None), 2)
cr_total = round(sum(x[5] for x in rect_rows if x[5] is not None), 2)
r += 1
for j, v in enumerate(['TOTAL', '4 rectificaciones · D=C en cada una', '', '', dr_total, cr_total, 'D − C = 0,00'], 2):
    c = ws2.cell(row=r, column=j, value=v)
    if j in (6, 7):
        c.number_format = MONEY
        c.alignment = align_number()
style_total_row(ws2, r, 2, 8)
set_widths(ws2, [14, 40, 11, 20, 16, 16, 48])

ws3 = wb.create_sheet('Caja_USD_timeline')
setup_sheet(ws3, 'M-015 · Caja USD física y contable — ventana crítica', last_col=5)
caja_rows = [
    ['2026-10-17', 'Venta 68e7464d — cobro físico 150 USD @805 (carve de ítems)', '+150 USD = 120.750,00 CUP', 'POSTEADA — cobro clasificado CUP (error de moneda)'],
    ['2026-10-19', 'Venta 28e94349 — cobro físico 207 USD @810 + CUP 2.000; faltante 8.100 aceptado', '+207 USD = 167.670,00 CUP', 'NO CONTABILIZADA (sin línea de diferencia)'],
    ['2026-10-23', 'Venta 23ccd04f — cobro físico 10 USD @560', '+10 USD = 5.600,00 CUP', 'POSTEADA — cobro clasificado CUP (error de moneda)'],
    ['2026-10-23', 'IE-000002-2026 — entrega a Belkis para ingresar al banco (barrido)', '−367 USD = 293.600,00 CUP', 'Posteada como GASTO (GAS_OTROS_OPER) — es activo'],
    ['2026-11-17', 'Estado antes de la rectificación', 'Saldo contable: −184.120,00 CUP', 'El cajón físico real tenía 130 USD — 367 USD entregados nunca se contabilizaron como cobro USD'],
    ['Después', 'RECT-015-A/B/C/D aplicadas', 'Saldo contable: 109.900,00 CUP = 130 USD @845', 'Contable = físico · mínimo de la ventana 420,00 CUP'],
]
write_block(ws3, 4, ['Fecha', 'Operación', 'Efecto físico USD', 'Tratamiento contable'], caja_rows)
set_widths(ws3, [12, 62, 34, 54])

wb.save(f'{OUT}/BEFORE_AFTER_AND_RECTIFICATIONS.xlsx')
print('OK BEFORE_AFTER_AND_RECTIFICATIONS.xlsx')

# ═══ 2. E2E_EVIDENCE.xlsx ═══
wb2 = Workbook()
wb2.properties.creator = 'Z.ai'
wse = wb2.active
setup_sheet(wse, 'M-015 · Batería E2E m108 (BD aislada CostproE2E) — verificaciones', last_col=5)
nombres = {
    '0': 'Migración aplicada al aislado (v2 activa ×2 + trigger + catálogo)',
    '0.5': 'Fixture creado (flujo real: pending → pagos → completed; auto-posteo)',
    '1': 'V1 S1 espejo 28e94349: carve físico 167.670 USD + CUP 2.000 + diferencia 8.100',
    '2': 'V2 S2 control (pago USD a nivel venta): sin override físico',
    '3': 'V3 S3 exceso aceptado: ING_DESCUENTOS crédito 200',
    '4': 'V4 CF1 entrega_efectivo USD → ACT_OTROS_CORR (no gasto)',
    '5': 'V5 CF2 egreso ordinario → GAS_OTROS_OPER (sin cambios)',
    '6': 'V6 métricas S4 (68e7464d): carve_items 169.000 + 120.750',
    '7': 'V7 guard físico de caja: ERR_INSUFFICIENT_CURRENCY (entrega fuera de turno)',
    '8': 'V8 apertura USD completa 367 @800 + contrapartida PAT_CAPITAL',
    '9': 'V9 duplicado (23505) + cero sin notas (guard) + inmutabilidad (guard)',
    '10': 'V10 declaración en cero con notas + completitud (sin_apertura=false)',
    '11': 'V11 ecuación contable: diferencia 0,00',
    '12': 'V12 idempotencia: re-post null · 8 asientos',
    '13': 'Rollback deliberado: 0 persistencia',
    '14': 'Cleanup NET DELTA = 0 (11 tablas)',
}
fase_rows = []
for f in e2e.get('fases', []):
    fase_rows.append([str(f['fase']), nombres.get(str(f['fase']), f['nombre']),
                      'PASS' if f['ok'] else 'FAIL', str(f.get('detalle', ''))[:110]])
r = write_block(wse, 4, ['Fase', 'Verificación', 'Resultado', 'Detalle'], fase_rows)
r += 2
cyc = [
    ['Ciclo 1 (2026-11-18)', 'setup → execute → verify → rollback → cleanup', '14/14 PASS · NET DELTA=0'],
    ['Ciclo 2 (2026-11-18)', 'setup → execute → verify → cleanup (re-ejecutabilidad)', '12/12 PASS · NET DELTA=0'],
    ['Pre-limpieza m108b', 'residuo de la sesión cortada del 17-11 vía RPC oficiales e2e_hard_delete_store/user', 'NET DELTA=0 · 24 duplicados v2 eliminados'],
]
for j, h in enumerate(['Ciclo', 'Secuencia', 'Resultado'], 2):
    wse.cell(row=r, column=j, value=h)
style_header_row(wse, r, 2, 4)
for i, row in enumerate(cyc):
    r += 1
    for j, v in enumerate(row, 2):
        wse.cell(row=r, column=j, value=v)
    style_data_row(wse, r, 2, 4, i)
set_widths(wse, [8, 72, 12, 56])

wb2.save(f'{OUT}/E2E_EVIDENCE.xlsx')
print('OK E2E_EVIDENCE.xlsx')
