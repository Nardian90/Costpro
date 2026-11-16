#!/usr/bin/env python3
# ============================================================================
# M078 — CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · GENERADOR XLSX DEL EXPEDIENTE
# Genera los 7 entregables XLSX de la misión 011 a partir de:
#   scripts/out/m074-matriz-1cup.json   (matriz ANTES de la corrección)
#   scripts/out/m011/after-matriz.json  (matriz DESPUÉS, Δ=0)
#   scripts/out/m011/prod-ejecucion.json · prod-verificacion.json
# Sistema de diseño: skill xlsx templates/base.py (paleta professional).
# ============================================================================
import sys, os, json
from decimal import Decimal

XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)

from openpyxl import Workbook
from templates.base import (use_palette_explicit, setup_sheet, style_header_row,
                            style_data_row, font_caption, align_number)

use_palette_explicit("professional")
BASE = "/home/z/my-project/Costpro/docs/audits/receipt-full-valuation-011"
os.makedirs(BASE, exist_ok=True)
AN = json.load(open("/home/z/my-project/Costpro/scripts/out/m074-matriz-1cup.json"))
M = AN['matriz']
C = AN['controles']
AS = AN['asiento']
DESP = json.load(open("/home/z/my-project/Costpro/scripts/out/m011/after-matriz.json"))
EJEC = json.load(open("/home/z/my-project/Costpro/scripts/out/m011/prod-ejecucion.json"))
VER = json.load(open("/home/z/my-project/Costpro/scripts/out/m011/prod-verificacion.json"))
NUMFMT = '#,##0.00'
QTYFMT = '#,##0.0000'
F = lambda x: float(Decimal(str(x))) if x is not None and str(x).strip() != '' else None

def finish(ws, header_row, last_col, fmt=NUMFMT):
    n = 0
    for r in range(header_row + 1, ws.max_row + 1):
        style_data_row(ws, r, 2, last_col, n); n += 1
    for r in range(header_row + 1, ws.max_row + 1):
        for c in range(2, last_col + 1):
            cell = ws.cell(row=r, column=c)
            if isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool):
                cell.number_format = fmt; cell.alignment = align_number()

def build_sheet(wb, name, title, headers, rows, widths=None, fmt=NUMFMT):
    ws = wb.create_sheet(name)
    last_col = len(headers) + 1
    setup_sheet(ws, title=title, last_col=last_col)
    for i, h in enumerate(headers):
        ws.cell(row=5, column=2 + i, value=h)
    style_header_row(ws, 5, 2, last_col)
    for r, row in enumerate(rows):
        for i, v in enumerate(row):
            ws.cell(row=6 + r, column=2 + i, value=v)
    finish(ws, 5, last_col, fmt)
    for i, w in enumerate(widths or [18] * len(headers)):
        ws.column_dimensions[ws.cell(row=5, column=2 + i).column_letter].width = w
    return ws

def save(wb, path):
    if 'Sheet' in wb.sheetnames: del wb['Sheet']
    wb.properties.creator = "Z.ai"
    wb.save(path)
    print('OK', path)

def resumen(wb, titulo, filas):
    ws = wb.active; ws.title = "Resumen"
    setup_sheet(ws, title=titulo, last_col=3)
    for i, (a, b, c) in enumerate(filas):
        ws.cell(row=6 + i, column=2, value=a); ws.cell(row=6 + i, column=3, value=b); ws.cell(row=6 + i, column=4, value=c)
        if isinstance(b, (int, float)) and not isinstance(b, bool):
            ws.cell(row=6 + i, column=3).number_format = NUMFMT; ws.cell(row=6 + i, column=3).alignment = align_number()
    n = 0
    for r in range(6, 6 + len(filas)):
        style_data_row(ws, r, 2, 4, n); n += 1
    ws.column_dimensions['B'].width = 44; ws.column_dimensions['C'].width = 34; ws.column_dimensions['D'].width = 60
    return ws

RESUMEN = [
    ("Recepción", "FAC-VITALLCONS-001 (id fd9d6c88-5db8-49ea-b185-8bc96cc93e63)", "01/07/2026 · Vitallcons · tienda ENERVIDA-VITALLCONS"),
    ("Regla económica del propietario (misión 011 §1)", "1,00 CUP por unidad · moneda CUP · tasa 1", "Sustituye la clasificación A–F del informe 010"),
    ("Líneas / SKUs identificados", C['lineas'], "101 SKUs distintos · capas 101 en correspondencia 1:1"),
    ("Suma de cantidades (control del propietario §5)", F(C['sum_qty']), "5.861,50 unidades de medida — reproducida desde BD"),
    ("Valor total ANTES (equivalente CUP)", F('40739585.00'), "81 líneas CUP 5.129.855,00 + 20 líneas USD 52.367,25 × 680 = 35.609.730,00"),
    ("Valor total OBJETIVO/DESPUÉS", F(C['sum_val_new_cup']), "5.861,50 = Σ cantidad × 1,00 CUP = cabecera total_cost"),
    ("Diferencia aplicada (RECT-011)", F(AS['importe_total']), "40.739.585,00 − 5.861,50 = 40.733.723,50 CUP (idéntica al §5 del propietario)"),
    ("Líneas corregidas de valor", C['n_cambio_valor'], "78 líneas (costo ≠ 1 CUP) → 1,00 CUP · CUP · tasa 1"),
    ("Líneas ya conformes (sin cambio)", C['n_ya_ok'], "23 líneas ya a 1 CUP: SKU111/112 (RECT-1, §7) + SKU999 servicio (§8) + 20 de costo bajo legítimo"),
    ("Asiento RECT-011", F(AS['importe_total']), "DR PAS_CXP_PROV 40.733.723,50 / CR INV 3.678.375,50 · COGS 21.450.370,50 · VALES 5.913.947,50 · PÉRDIDA 9.691.030,00"),
    ("Cuenta por pagar resultante", F(C['cxp_neto_despues']), "neta del documento: 192.039.436 (original) − 151.299.851 (RECT-1) − 40.733.723,50 (RECT-011) = 5.861,50 · unpaid · 0 pagos"),
    ("Atribución FIFO por canal", "227,50 u reversas casadas · 34 u no casadas · 563,50 u consumo sin capa (stock de ajustes)", "método por cantidad conforme §9/§10; capas ajenas intactas"),
    ("WAC recalculado", len(AN['wac_updates']), "25 productos con existencia en capa FVC; consistente con el crédito ACT_INVENTARIO"),
    ("SKU111/112 (§7)", "intactas — RECT-1 NO repetida", "uc 1 · capa 1 · WAC 1 · precios 2.000/1.000 CUP · stock 8,8/20"),
    ("SKU999 (§8)", "intacto — servicio", "uc 1 · subtotal 4,00 · is_service=true · sin capa nueva ni WAC nuevo"),
    ("Verificación §13", f"{VER['total']['pass']}/{VER['total']['pass'] + VER['total']['fail']}", "18/18 PASS — ver RECEIPT_POST_EXECUTION_CERTIFICATION.md"),
    ("E2E BD aislada", "APROBADA 11/11 · idempotencia · net delta 0", "fixture 5 líneas/5 productos; lotes A–D idénticos a producción"),
]

# ═══════════ 1) RECEIPT_101_ALL_COSTS_1_CUP.xlsx ═════════════════════════════
wb = Workbook()
resumen(wb, "MISIÓN CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 — Las 101 líneas de FAC-VITALLCONS-001 a 1,00 CUP", RESUMEN)
rows = [[
    int(m['num'] if 'num' in m else i + 1), m['sku'], m['nombre'], m['line_id'], F(m['qty']),
    F(m['uc_old']), m['moneda_old'], F(m['tasa_old']), F(m['uc_cup_old']), F(m['subtotal_old_cup']),
    1, 'CUP', F(m['subtotal_new']), F(m['delta_linea']),
    F(m['fvc_restante']), F(m['cons_venta']), F(m['cons_vale']), F(m['cons_perdida']),
    F(m['inv_credito']), F(m['cogs_credito']), F(m['vales_credito']), F(m['perdida_credito']),
    F(m['wac_old']), F(m['wac_new']) if m['wac_new'] is not None else 'sin cambio',
    F(m['precio_venta']) if m['precio_venta'] is not None else None,
    'ya conforme (sin cambio)' if m['ya_ok'] else 'corregida a 1 CUP',
] for i, m in enumerate(M)]
build_sheet(wb, "Matriz_101_lineas",
    "Matriz maestra — 101 líneas: costo registrado → 1,00 CUP · atribución FIFO por canal · créditos del asiento",
    ['#', 'SKU', 'Nombre', 'ID de línea', 'Cant.', 'Costo unit. ANTES', 'Moneda ANTES', 'Tasa ANTES', 'Costo CUP ANTES', 'Subtotal CUP ANTES',
     'Costo unit. FINAL', 'Moneda FINAL', 'Subtotal FINAL', 'Δ línea (CUP)',
     'Unid. en capa FVC', 'Unid. vendidas', 'Unid. por vales', 'Unid. pérdida/ajuste',
     'Crédito ACT_INVENTARIO', 'Crédito GAS_COSTO_VENTAS', 'Crédito GAS_VALES', 'Crédito GAS_PERDIDA_INV',
     'WAC ANTES', 'WAC DESPUÉS', 'Precio venta (intacto)', 'Estado'],
    rows, widths=[5, 7, 30, 34, 10, 12, 9, 8, 12, 14, 11, 9, 13, 14, 12, 11, 11, 12, 15, 16, 13, 15, 12, 12, 12, 24])
save(wb, f"{BASE}/RECEIPT_101_ALL_COSTS_1_CUP.xlsx")

# ═══════════ 2) RECEIPT_BEFORE_AFTER_COSTS.xlsx ═══════════════════════════════
wb = Workbook()
tot = [101, F(C['sum_qty']), F(C['sum_val_old_cup']), F(C['sum_val_new_cup']), F(AS['importe_total'])]
rows = [[m['sku'], m['nombre'], F(m['qty']),
         F(m['uc_old']), m['moneda_old'], F(m['tasa_old']), F(m['subtotal_old_cup']),
         1, 'CUP', 1, F(m['subtotal_new']), F(m['delta_linea'])] for m in M]
rows.append(['— TOTAL —', '101 líneas', tot[1], None, '81 CUP + 20 USD', None, tot[2], None, 'CUP', None, tot[3], tot[4]])
build_sheet(wb, "Antes_Despues",
    "Antes/Después por línea — costo unitario, moneda, tasa y subtotal (equivalente CUP)",
    ['SKU', 'Nombre', 'Cant.', 'Costo unit. ANTES', 'Moneda ANTES', 'Tasa ANTES', 'Subtotal CUP ANTES',
     'Costo unit. DESPUÉS', 'Moneda DESPUÉS', 'Tasa DESPUÉS', 'Subtotal DESPUÉS', 'Δ (CUP)'],
    rows, widths=[7, 30, 10, 13, 11, 9, 15, 14, 12, 10, 14, 16])
ws = wb.active; ws.title = "Resumen"
setup_sheet(ws, title="MISIÓN 011 — Antes/Después del costo de FAC-VITALLCONS-001", last_col=3)
filas = [
    ("Total documentado ANTES (tras RECT-1/RECT-2)", 40739585.00, "cabecera = Σ líneas (Δ 0,00) · 81 CUP + 20 USD×680"),
    ("Total DESPUÉS (regla 1,00 CUP/u)", 5861.50, "Σ 5.861,50 unidades × 1,00 CUP · 101/101 subtotales = cantidad × 1"),
    ("Reducción aplicada (RECT-011)", 40733723.50, "DR PAS_CXP_PROV / CR inventario+COGS+vales+pérdidas · D−C = 0,00"),
    ("Cargos separados fuera de las 101 líneas", 0, "ninguno identificado: cabecera = líneas antes y después"),
    ("Líneas con cambio de valor", 78, "a 1,00 CUP (moneda CUP · tasa 1)"),
    ("Líneas ya conformes", 23, "SKU111/112/999 + 20 de costo bajo legítimo"),
    ("Estado final de cabecera", 5861.50, "receipts.total_cost = 5.861,50 · unpaid · active"),
]
for i, (a, b, c) in enumerate(filas):
    ws.cell(row=6 + i, column=2, value=a); ws.cell(row=6 + i, column=3, value=b); ws.cell(row=6 + i, column=4, value=c)
    if isinstance(b, (int, float)): ws.cell(row=6 + i, column=3).number_format = NUMFMT; ws.cell(row=6 + i, column=3).alignment = align_number()
n = 0
for r in range(6, 6 + len(filas)): style_data_row(ws, r, 2, 4, n); n += 1
ws.column_dimensions['B'].width = 46; ws.column_dimensions['C'].width = 18; ws.column_dimensions['D'].width = 62
save(wb, f"{BASE}/RECEIPT_BEFORE_AFTER_COSTS.xlsx")

# ═══════════ 3) RECEIPT_INVENTORY_FIFO_RECONCILIATION.xlsx ═══════════════════
wb = Workbook()
resumen(wb, "MISIÓN 011 — Reconciliación FIFO de inventario por SKU (§9)", [
    ("Método", "Simulación cronológica del kardex por SKU", "la capa FVC es el primer movimiento del kardex en los 101 SKUs (verificado)"),
    ("Consumo FIFO", "venta / vale de salida / ajuste negativo consumen capas en orden", "reversas casadas devuelven unidades a la capa FVC (por documento+canal)"),
    ("Reversas casadas", "227,50 u", "23 sale_reverse + 2 issue_slip_reverse casados por reference_id"),
    ("Reversas no casadas", "34,00 u", "devoluciones cuyo consumo original no tomó capa FVC → cubetas propias"),
    ("Consumo sin capa", "563,50 u", "unidades vendidas contra stock de ajustes positivos (sin capa) — no atribuibles a FVC"),
    ("Capas ajenas", "45 capas de otras compras — INTACTAS", "V13: hash MD5 de 965 movimientos ajenos idéntico al congelado"),
    ("Unidades por canal (Σ)", f"inv {sum(Decimal(m['fvc_restante']) for m in M)} · venta {sum(Decimal(m['cons_venta']) for m in M)} · vales {sum(Decimal(m['cons_vale']) for m in M)} · pérdida {sum(Decimal(m['cons_perdida']) for m in M)}", "cuadre por línea: fvc_restante + consumo = cantidad recibida (tie_out OK)"),
])
rows = [[m['sku'], m['nombre'], F(m['qty']), F(m['uc_cup_old']), (m['capa_id'][:8] if m['capa_id'] else None),
         F(m['fvc_restante']), F(m['cons_venta']), F(m['cons_vale']), F(m['cons_perdida']),
         F(m['stock_actual']), F(m['wac_old']), F(m['wac_new']) if m['wac_new'] is not None else 'sin cambio',
         (F(m['fvc_restante']) + F(m['cons_venta']) + F(m['cons_vale']) + F(m['cons_perdida']))] for m in M]
build_sheet(wb, "FIFO_por_SKU",
    "Reconstrucción FIFO por SKU — capa FVC: recibidas / en existencia / consumidas por canal / WAC",
    ['SKU', 'Nombre', 'Cant. recibida', 'Costo CUP capa ANTES', 'Capa (id 8)', 'Unid. existentes FVC',
     'Unid. vendidas', 'Unid. vales', 'Unid. pérdida/ajuste', 'Stock actual (global)',
     'WAC ANTES', 'WAC DESPUÉS', 'Cuadre (rest.+consumo)'],
    rows, widths=[7, 30, 12, 13, 12, 13, 12, 11, 13, 12, 12, 12, 15])
save(wb, f"{BASE}/RECEIPT_INVENTORY_FIFO_RECONCILIATION.xlsx")

# ═══════════ 4) RECEIPT_COGS_AND_EXPENSES_RECONCILIATION.xlsx ════════════════
wb = Workbook()
q = AS['creditos_centavos']
resumen(wb, "MISIÓN 011 — Corrección de COGS y gastos por unidades salidas (§10)", [
    ("Regla", "Crédito = (costo CUP ANTES − 1) × unidades del canal", "reparto prescrito por el propietario §10: existencias/ventas/vales/pérdidas"),
    ("GAS_COSTO_VENTAS (unidades vendidas)", F(q['cogs']), "crédito que reduce el COGS sobrevalorado de unidades vendidas de la capa FVC"),
    ("GAS_VALES (unidades por vales)", F(q['vales']), "crédito por unidades retiradas mediante vales (kardex issue_slip_out neto de reversas)"),
    ("GAS_PERDIDA_INV (pérdidas/ajustes)", F(q['perdida']), "crédito por ajustes negativos (pérdidas) que consumieron capa FVC"),
    ("ACT_INVENTARIO (existencias)", F(q['inv']), "crédito por unidades aún en capa FVC (sobrevaloración retirada del activo)"),
    ("PAS_CXP_PROV (débito)", F(AS['cxp_debito']), "Σ créditos: 3.678.375,50 + 21.450.370,50 + 5.913.947,50 + 9.691.030,00"),
    ("Balance del asiento", 0.00, "Debe = Haber verificado intra-transacción (A-6) y post (V6)"),
    ("Referencia histórica (informe 010)", "COGS bases: items 1.814.385,87 · kardex 1.800.185,43 · cuenta 4.677.274,19", "documentadas como contexto; la regla 011 manda el reparto por cantidad"),
    ("Duplicaciones evitadas", "COGS 7 CUP intacto · RECT-2 24 CUP no duplicado", "V9: 4 asientos (original, RECT-1, RECT-2, RECT-011) intactos"),
])
rows = [[m['sku'], m['nombre'], F(m['uc_cup_old']), F(m['cons_venta']), F(m['cogs_credito']),
         F(m['cons_vale']), F(m['vales_credito']), F(m['cons_perdida']), F(m['perdida_credito']),
         F(m['fvc_restante']), F(m['inv_credito']), F(m['delta_linea'])] for m in M]
rows.append(['— TOTAL —', '101 líneas', None, sum(Decimal(m['cons_venta']) for m in M), F(q['cogs']),
             sum(Decimal(m['cons_vale']) for m in M), F(q['vales']),
             sum(Decimal(m['cons_perdida']) for m in M), F(q['perdida']),
             sum(Decimal(m['fvc_restante']) for m in M), F(q['inv']), F(AS['importe_total'])])
build_sheet(wb, "COGS_por_SKU",
    "Corrección de COGS/vales/pérdidas por SKU — unidades × sobrevaloración por cantidad",
    ['SKU', 'Nombre', 'Costo CUP ANTES', 'Unid. vendidas', 'Crédito GAS_COSTO_VENTAS',
     'Unid. vales', 'Crédito GAS_VALES', 'Unid. pérdida', 'Crédito GAS_PERDIDA_INV',
     'Unid. existentes', 'Crédito ACT_INVENTARIO', 'Δ total línea'],
    rows, widths=[7, 30, 13, 12, 18, 11, 15, 11, 17, 12, 17, 14])
save(wb, f"{BASE}/RECEIPT_COGS_AND_EXPENSES_RECONCILIATION.xlsx")

# ═══════════ 5) RECEIPT_CXP_RECONCILIATION.xlsx ══════════════════════════════
wb = Workbook()
rows = [
    ['93bb5da9 (asiento original — reconocimiento)', '2026-07-01', 'credito', 'PAS_CXP_PROV', 192039436.00, 'Entrada de almacén — reconocimiento inicial de la recepción (motor CP-FIN)'],
    ['RECT-1 (7ec90009…d0b30001)', '2026-07-01', 'debito', 'PAS_CXP_PROV', 151299851.00, 'Rectificación 003/004+009: exceso SKU111/112 (2.500/1.000 USD×680 → 1 CUP/u)'],
    ['RECT-2 (7ec90009…d0b30002)', '2026-11-15', 'debito', 'GAS_VALES + GAS_PERDIDA_INV / credito ACT_INVENTARIO', 24.00, 'Reconocimiento de salidas nunca contabilizadas (6 u vales + 18 u pérdidas) — NO CXP'],
    ['RECT-011 (7ec9000b…d1130001)', '2026-07-01', 'debito', 'PAS_CXP_PROV', 40733723.50, 'Misión 011: reducción de la obligación al valor 1 CUP/u de las 101 líneas'],
]
build_sheet(wb, "Linea_tiempo_CXP",
    "Cuenta por pagar vinculada a FAC-VITALLCONS-001 — línea de tiempo de asientos",
    ['Asiento', 'Fecha económica', 'Sentido', 'Cuenta', 'Importe CUP', 'Descripción'],
    rows, widths=[34, 13, 9, 40, 15, 66])
ws2 = build_sheet(wb, "Saldo", "Saldo de la obligación — antes y después", ['Concepto', 'Importe CUP', 'Nota'], [
    ['Saldo documentado ANTES (neto del documento)', 40739585.00, 'credito 192.039.436 − debito 151.299.851 (RECT-1); RECT-2 no toca CXP'],
    ['Reducción RECT-011 (débito)', 40733723.50, 'por aplicación de la regla 1,00 CUP/u a las 101 líneas'],
    ['Saldo DESPUÉS', 5861.50, '= receipts.total_cost = Σ líneas (5.861,50) · V8 PASS'],
    ['Pagos registrados', 0.00, 'payment_status=unpaid · paid_amount=0 · payments_fvc vacío'],
    ['Obligaciones ajenas', 'intactas', 'la corrección está aislada por document_id ( guards D-1/D-2) · V12/V15 PASS'],
])
save(wb, f"{BASE}/RECEIPT_CXP_RECONCILIATION.xlsx")

# ═══════════ 6) RECEIPT_ADJUSTING_ENTRIES.xlsx ═══════════════════════════════
wb = Workbook()
rows = [
    ['7ec9000b…f1130001', 'PAS_CXP_PROV', 'debito', 40733723.50, 'RECT-011 FAC-VITALLCONS-001-VAL1CUP: reducción de la obligación a valor 1 CUP/u (101 líneas)'],
    ['7ec9000b…f1130002', 'ACT_INVENTARIO', 'credito', F(q['inv']), 'desvalorización de existencias aún en capa FVC'],
    ['7ec9000b…f1130003', 'GAS_COSTO_VENTAS', 'credito', F(q['cogs']), 'corrección de COGS por unidades vendidas de la capa FVC'],
    ['7ec9000b…f1130004', 'GAS_VALES', 'credito', F(q['vales']), 'corrección por unidades retiradas con vales de la capa FVC'],
    ['7ec9000b…f1130005', 'GAS_PERDIDA_INV', 'credito', F(q['perdida']), 'corrección por pérdidas/ajustes de la capa FVC'],
]
build_sheet(wb, "RECT011",
    "Asiento RECT-011 (id 7ec9000b-0000-4000-8000-d11300000001 · posted 2026-11-16 20:03:05 UTC)",
    ['ID movimiento', 'Cuenta', 'Sentido', 'Importe CUP', 'Descripción'],
    rows, widths=[24, 20, 9, 15, 74])
build_sheet(wb, "Referencias",
    "Asientos de referencia del documento (intactos — V9)", ['Asiento', 'Evento', 'Fecha', 'Importe CUP', 'Estado'], [
    ['93bb5da9 (original)', 'reconocimiento (RECEPCION)', '2026-07-01', 192039436.00, 'posted — intacto'],
    ['7ec90009…d0b30001 (RECT-1)', 'ajuste_manual (RECEPCION)', '2026-07-01', 151299851.00, 'posted — intacto, NO repetido'],
    ['7ec90009…d0b30002 (RECT-2)', 'ajuste_manual (AJUSTE_INVENTARIO)', '2026-11-15', 24.00, 'posted — intacto, NO duplicado'],
    ['7ec9000b…d1130001 (RECT-011)', 'reconocimiento (AJUSTE_INVENTARIO)', '2026-07-01', 40733723.50, 'posted — esta misión · reversal_of=93bb5da9'],
])
ws = wb.active; ws.title = "Resumen"
setup_sheet(ws, title="Asientos de ajuste — RECT-011 y precedentes (reversal_of → asiento original 93bb5da9)", last_col=3)
filas = [
    ("Combinación única del asiento", "(AJUSTE_INVENTARIO, FVC, reconocimiento)", "uq_fin_entries_doc_event: (RECEPION,ajuste_manual)=RECT-1 y (AJUSTE_INVENTARIO,ajuste_manual)=RECT-2 ocupados"),
    ("Débito total", F(AS['importe_total']), "PAS_CXP_PROV 40.733.723,50"),
    ("Crédito total", F(q['inv']) and F(q['inv']) + F(q['cogs']) + F(q['vales']) + F(q['perdida']), "INV + COGS + VALES + PÉRDIDAS"),
    ("Balance Debe − Haber", 0.00, "verificado intra-transacción (A-6: RAISE→ROLLBACK) y post (V6)"),
    ("CXP neta del documento después", 5861.50, "V8 PASS · igual a receipts.total_cost"),
    ("Economic_date", "2026-07-01", "mismo período del reconocimiento (criterio RECT-1)"),
    ("Traza", "movements_snapshot + traza por movimiento + audit_logs SYSTEM_RECT011_ENTRY", "183 filas de auditoría con trace RECT011-PROD"),
]
for i, (a, b, c) in enumerate(filas):
    ws.cell(row=6 + i, column=2, value=a); ws.cell(row=6 + i, column=3, value=b); ws.cell(row=6 + i, column=4, value=c)
    if isinstance(b, (int, float)): ws.cell(row=6 + i, column=3).number_format = NUMFMT; ws.cell(row=6 + i, column=3).alignment = align_number()
n = 0
for r in range(6, 6 + len(filas)): style_data_row(ws, r, 2, 4, n); n += 1
ws.column_dimensions['B'].width = 38; ws.column_dimensions['C'].width = 40; ws.column_dimensions['D'].width = 64
save(wb, f"{BASE}/RECEIPT_ADJUSTING_ENTRIES.xlsx")

# ═══════════ 7) RECEIPT_EXECUTION_BATCHES.xlsx ════════════════════════════════
wb = Workbook()
resumen(wb, "MISIÓN 011 — Lotes de ejecución gobernados (canal: Management API · 1 llamada = 1 transacción atómica)", [
    ("Preflight (§11)", "extracto fresco m070 + matriz m074 + regeneración m076", "drift 0 desde el congelado (kardex 1066→1066 · stocks/precios/WAC idénticos)"),
    ("Primera ejecución", "2026-11-16 19:59:09–19:59:14 UTC — LOTAS A/B/C aplicadas", "LOTE-D abortada ATÓMICAMENTE (HTTP 400): uq_fin_entries_doc_event ya ocupada por RECT-1"),
    ("Corrección", "asiento → combinación libre (AJUSTE_INVENTARIO, FVC, reconocimiento)", "revalidada en E2E completa (setup→execute→verify→cleanup) antes de reintentar"),
    ("Reanudación", "2026-11-16 20:02:56–20:03:05 UTC", "A/B/C re-ejecutadas idempotentes (S1_previas=0, cero cambios) · D aplicada"),
    ("Asiento posted", "2026-11-16 20:03:05 UTC", "balance 0,00 · CXP neta 40.739.585,00 → 5.861,50 · 5 movimientos"),
    ("Idempotencia", "re-ejecución de los 4 lotes = 0 cambios (probado en E2E y en la reanudación)", "V18: s1=s2=s3=0 · wcl=25 · entrada=1"),
    ("Guards", "advisory lock por documento · freeze de estado (prístino|ya-aplicado) · escape hatches M021/w62 · T12 intacto", "cualquier divergencia → RAISE → rollback atómico HTTP 400"),
    ("Auditoría", "183 filas (78 VALUATION + 78 MOV_UC + 25 WAC + 1 TOTAL + 1 ENTRY)", "trace RECT011-PROD · ids deterministas md5 · V17 PASS"),
])
rows = []
for l in EJEC['lotes']:
    res = {p['paso']: p['payload'] for p in l['resultado']}
    rows.append([l['lote'], EJEC['fecha_inicio_utc'], l['ms'], json.dumps(res, ensure_ascii=False)[:120], 'COMMIT OK — idempotente (reanudación)' if l['lote'] != 'loteD_asiento.sql' else 'COMMIT OK — asiento aplicado'])
build_sheet(wb, "Lotes",
    "Lotes A–D — resultado de la ejecución (reanudación 20:02:56 UTC)",
    ['Lote', 'Inicio UTC', 'Duración ms', 'Resultado (payload)', 'Estado'],
    rows, widths=[22, 22, 10, 80, 34])
build_sheet(wb, "E2E_aislada",
    "E2E en BD aislada (lguovmvrozxgssupkwpf) — fixture 5 líneas/5 productos (m075)",
    ['Fase', 'Resultado', 'Detalle'], [
    ['Setup (pending→active: motor contabiliza reconocimiento)', 'OK', 'asiento del motor + stocks sincronizados por triggers reales'],
    ['Análisis del fixture (m074)', 'OK', 'tie_out por línea · split 69.994/137.690/399/399 · reversas casadas 3 u'],
    ['Ejecución A–D (m075 --execute)', 'OK', '4/4 lotes COMMIT OK · balance 0 · CXP 27'],
    ['Verificación (m075 --verify)', 'APROBADA 11/11', 'V1–V10 + V11 reejecución con cero cambios · capa ajena intacta (uc 10)'],
    ['Limpieza (m075 --cleanup)', 'NET DELTA = 0', 'BD aislada restaurada (11 tablas idénticas al baseline)'],
], widths=[46, 18, 80])
build_sheet(wb, "Verificacion_13",
    "Verificación §13 en producción (m077 --verify) — 18/18 PASS",
    ['Control', 'Resultado', 'Detalle'],
    [[c['id'], c['resultado'], c['detalle']] for c in VER['checks']], widths=[34, 10, 90])
save(wb, f"{BASE}/RECEIPT_EXECUTION_BATCHES.xlsx")

print('\n7 XLSX generados en', BASE)
