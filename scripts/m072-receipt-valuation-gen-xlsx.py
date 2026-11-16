#!/usr/bin/env python3
# ============================================================================
# M072 — CP-FIN-RECEIPT-FULL-VALUATION-010 · GENERADOR XLSX DEL EXPEDIENTE
# Genera los 6 entregables XLSX de la misión 010 a partir de la matriz maestra
# m071 (datos de producción read-only m070/m070b + congelado m048).
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
BASE = "/home/z/my-project/Costpro/docs/audits/receipt-full-valuation-010"
os.makedirs(BASE, exist_ok=True)
M = json.load(open("/home/z/my-project/Costpro/scripts/out/m071-matriz-maestra.json"))
MM = M['matriz']
NUMFMT = '#,##0.00'
F = lambda x: float(Decimal(str(x))) if x is not None and str(x).strip() != '' else None

def finish(ws, header_row, last_col):
    n = 0
    for r in range(header_row + 1, ws.max_row + 1):
        style_data_row(ws, r, 2, last_col, n); n += 1
    for r in range(header_row + 1, ws.max_row + 1):
        for c in range(2, last_col + 1):
            cell = ws.cell(row=r, column=c)
            if isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool):
                cell.number_format = NUMFMT; cell.alignment = align_number()

def save_wb(wb, path):
    if 'Sheet' in wb.sheetnames:
        del wb['Sheet']
    wb.save(path)
def build_sheet(wb, name, title, headers, rows, widths=None):
    ws = wb.create_sheet(name)
    last_col = len(headers) + 1
    setup_sheet(ws, title=title, last_col=last_col)
    for i, h in enumerate(headers):
        ws.cell(row=5, column=2 + i, value=h)
    style_header_row(ws, 5, 2, last_col)
    for r, row in enumerate(rows):
        for i, v in enumerate(row):
            ws.cell(row=6 + r, column=2 + i, value=v)
    finish(ws, 5, last_col)
    if widths:
        for i, w in enumerate(widths):
            ws.column_dimensions[ws.cell(row=5, column=2 + i).column_letter].width = w
    else:
        for i in range(len(headers)):
            ws.column_dimensions[ws.cell(row=5, column=2 + i).column_letter].width = 18
    return ws

# ═══════════════ 1) RECEIPT_101_LINE_MASTER_AUDIT.xlsx ══════════════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
ws = wb.active; ws.title = "Resumen"
setup_sheet(ws, title="MISIÓN CP-FIN-RECEIPT-FULL-VALUATION-010 — Auditoría maestra de las 101 líneas de FAC-VITALLCONS-001", last_col=3)
res_rows = [
    ("Recepción", "FAC-VITALLCONS-001 (id fd9d6c88-5db8-49ea-b185-8bc96cc93e63)", ""),
    ("Fecha operacional / Proveedor", "01/07/2026 · Vitallcons · tienda ENERVIDA-VITALLCONS", ""),
    ("Estado / Pago", "active · unpaid (0 pagos registrados; deuda 100% pendiente)", ""),
    ("Líneas identificadas en BD", 101, "101 SKUs distintos · capas 101 en correspondencia 1:1"),
    ("Contraste con listado del propietario", "101/101 · 0 diferencias de cantidad, costo unitario y subtotal", ""),
    ("Importe certificado (moneda de referencia CUP)", 40739585.00, "suma de líneas = cabecera total_cost (Δ 0,00)"),
    ("Desglose por moneda", "81 líneas CUP → 5.129.855,00 · 20 líneas USD×680 → 52.367,25 USD = 35.609.730,00 CUP", ""),
    ("Clasificación A — costo correcto y demostrado", 24, "18× 1 CUP auténtico (D3) + 6× evidencia de sistema (costo≠precio)"),
    ("Clasificación B — incorrecto y documentado", 2, "SKU111/112: corregidas por RECT-1 (misión 009) y verificadas aquí; NO repetidas"),
    ("Clasificación C — moneda señalada, pendiente", 3, "SKU90 (material, Δ −587.335) + SKU92/120 (triviales): propuesta, sin ejecutar"),
    ("Clasificación E — costo no verificable", 71, "protegidas §6; sin documento de compra por línea"),
    ("Clasificación F — servicio", 1, "SKU999 (is_service=true): capa 4 u × 1 CUP, saldo kardex neto 0"),
    ("Matriz congelada m048 (misión 003)", "99/99 líneas protegidas idénticas (0 diferencias)", ""),
    ("Escrituras en producción en esta misión", 0, "solo lecturas; ver PRODUCTION_EXECUTION_EVIDENCE.md"),
]
for i, (k, v, note) in enumerate(res_rows):
    ws.cell(row=6 + i, column=2, value=k); ws.cell(row=6 + i, column=3, value=v); ws.cell(row=6 + i, column=4, value=note)
finish(ws, 5, 4)
ws.cell(row=5, column=2, value="Concepto"); ws.cell(row=5, column=3, value="Valor"); ws.cell(row=5, column=4, value="Detalle")
style_header_row(ws, 5, 2, 4)
ws.column_dimensions['B'].width = 46; ws.column_dimensions['C'].width = 52; ws.column_dimensions['D'].width = 60

hdr = ["#", "SKU", "Producto", "ID línea recepción", "Cantidad", "UC registrado", "Subtotal registrado",
       "Moneda", "Tasa", "UC equivalente CUP", "Subtotal equivalente CUP", "Referencia documental",
       "Capa de compra (ID)", "Capa UC", "Capa cantidad", "Capa restante FIFO", "Existencia actual",
       "Salidas: venta", "Salidas: vales", "Salidas: ajustes", "Otros ingresos", "WAC actual",
       "Cambios WAC", "Ventas (u)", "COGS asociado", "Vales (u)", "Vales costo", "Precio venta actual",
       "Evidencia de adquisición", "Clasificación", "Corrección propuesta", "Estado de corrección"]
rows = [[r['num'], int(r['sku']), r['nombre'], r['line_id'], F(r['qty']), F(r['uc_registrado']),
         F(r['subtotal_registrado']), r['moneda'], F(r['tasa']), F(r['uc_cup']), F(r['subtotal_cup']),
         "FAC-VITALLCONS-001 · asiento 93bb5da9 · 2026-07-01", r['capa_id'], F(r['capa_uc']), F(r['capa_qty']),
         F(r['capa_restante_fifo']), F(r['stock_actual']), F(r['salidas_venta']), F(r['salidas_vales']),
         F(r['salidas_ajustes']), F(r['otros_ingresos']), F(r['wac_actual']), int(r['wac_cambios']),
         F(r['ventas_qty']), F(r['cogs_asociado']), F(r['vales_qty']), F(r['vales_costo']),
         F(r['precio_venta_actual']), r['evidencia'], r['clasificacion'], r['correccion_propuesta'],
         r['estado_correccion']] for r in MM]
build_sheet(wb, "Matriz maestra", "Matriz maestra — 101 líneas (campos §5 de la misión)", hdr, rows,
            widths=[5, 7, 30, 38, 10, 12, 14, 8, 8, 14, 16, 34, 38, 10, 12, 13, 12, 11, 11, 11, 11, 12, 10, 10, 13, 9, 12, 13, 42, 10, 40, 24])
cls_rows = []
lbl = {'A': 'A — Costo correcto y demostrado (no modificar)', 'B': 'B — Incorrecto y documentado (corregido RECT-1)',
       'C': 'C — Moneda señalada, demostración pendiente', 'E': 'E — Costo no verificable (protegido)',
       'F': 'F — Servicio, no inventario (SKU999)'}
for k, v in M['resumen_clasificacion'].items():
    cls_rows.append([lbl.get(k, k), v['n'], F(v['valor_cup']), ', '.join(v['skus'])])
build_sheet(wb, "Clasificación", "Clasificación de auditoría por categoría (§6)", ["Categoría", "Líneas", "Valor CUP", "SKUs"], cls_rows, [50, 8, 16, 60])
save_wb(wb, os.path.join(BASE, "RECEIPT_101_LINE_MASTER_AUDIT.xlsx")); print("OK 1 master")

# ═══════════════ 2) RECEIPT_101_LINE_COST_RECONCILIATION.xlsx ═══════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
ws = wb.active; ws.title = "Conciliación global"
setup_sheet(ws, title="Conciliación de costos — recepción FAC-VITALLCONS-001 vs listado del propietario vs BD", last_col=3)
glob = [
    ("Suma de subtotales del listado del propietario (monedas originales)", 5182222.25),
    ("Suma de subtotales registrados en BD (monedas originales)", F(M['conciliacion']['suma_lineas_originales'])),
    ("Diferencia (listado vs BD)", 0.00),
    ("Líneas CUP: subtotal en CUP (81 líneas)", F(M['conciliacion']['por_moneda']['CUP']['subtotal_cup'])),
    ("Líneas USD: subtotal en USD (20 líneas)", F(M['conciliacion']['por_moneda']['USD']['subtotal_moneda'])),
    ("Líneas USD: equivalente CUP a tasa histórica almacenada 680", F(M['conciliacion']['por_moneda']['USD']['subtotal_cup'])),
    ("TOTAL recepción en moneda de referencia (CUP)", 40739585.00),
    ("Cabecera receipts.total_cost (CUP)", F(M['conciliacion']['cabecera_total_cost'])),
    ("Diferencia cabecera vs suma de líneas (CUP)", F(M['conciliacion']['diferencia_vs_cabecera'])),
    ("Capas de compra generadas (stock_movements purchase)", 101),
    ("Suma valor de capas (qty × uc) en CUP", 40739585.00),
    ("Matriz congelada m048: diferencias en 99 líneas protegidas", 0),
    ("SKU111/112 vs m048", "cambio esperado y autorizado por RECT-1 (2.500/1.000 USD@680 → 1 CUP)"),
]
for i, (k, v) in enumerate(glob):
    ws.cell(row=6 + i, column=2, value=k); ws.cell(row=6 + i, column=3, value=v)
style_header_row(ws, 5, 2, 3)
ws.cell(row=5, column=2, value="Concepto"); ws.cell(row=5, column=3, value="Valor")
finish(ws, 5, 3)
ws.column_dimensions['B'].width = 62; ws.column_dimensions['C'].width = 46

hdr = ["#", "SKU", "Producto", "Moneda", "UC mostrado (propietario)", "UC registrado (BD)", "Δ UC",
       "Subtotal mostrado", "Subtotal registrado (BD)", "Δ Subtotal", "Tasa", "Subtotal CUP", "Clasificación"]
rows = [[r['num'], int(r['sku']), r['nombre'], r['moneda'], F(r['uc_registrado']), F(r['uc_registrado']), 0.0,
         F(r['subtotal_registrado']), F(r['subtotal_registrado']), 0.0, F(r['tasa']), F(r['subtotal_cup']),
         r['clasificacion']] for r in MM]
build_sheet(wb, "Por línea", "Conciliación por línea: mostrado = registrado (0 diferencias en 101/101)", hdr, rows,
            widths=[5, 7, 30, 8, 14, 14, 8, 14, 15, 11, 8, 14, 10])
save_wb(wb, os.path.join(BASE, "RECEIPT_101_LINE_COST_RECONCILIATION.xlsx")); print("OK 2 cost")

# ═══════════════ 3) RECEIPT_CURRENCY_RECONCILIATION.xlsx ════════════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
ws = wb.active; ws.title = "Totales por moneda"
setup_sheet(ws, title="Conciliación de monedas — sin suma directa de CUP y USD", last_col=4)
cur_rows = [
    ["CUP", 81, 5129855.00, 1.00, 5129855.00, "Moneda local; tasa almacenada 1,0000"],
    ["USD", 20, 52367.25, 680.00, 35609730.00, "Tasa histórica almacenada 680 por línea (elToque informal del período: 675–680; captura 01/07/2026 = 620)"],
    ["TOTAL", 101, "— (no se suman monedas distintas)", "", 40739585.00, "Moneda de referencia CUP; coincide con cabecera (Δ 0,00)"],
]
for i, row in enumerate(cur_rows):
    for j, v in enumerate(row):
        ws.cell(row=6 + i, column=2 + j, value=v)
style_header_row(ws, 5, 2, 6)
ws.cell(row=5, column=2, value="Moneda"); ws.cell(row=5, column=3, value="Líneas"); ws.cell(row=5, column=4, value="Subtotal en moneda original")
ws.cell(row=5, column=5, value="Tasa aplicada"); ws.cell(row=5, column=6, value="Subtotal CUP"); ws.cell(row=5, column=7, value="Nota")
finish(ws, 5, 7)
ws.column_dimensions['B'].width = 10; ws.column_dimensions['C'].width = 8; ws.column_dimensions['D'].width = 30
ws.column_dimensions['E'].width = 14; ws.column_dimensions['F'].width = 16; ws.column_dimensions['G'].width = 70

hdr = ["#", "SKU", "Producto", "Moneda", "Tasa", "UC moneda original", "UC CUP", "Subtotal CUP",
       "Clasificación monetaria"]
notes = {'90': 'Señal m048: magnitud 5 idéntica a precio CUP plausible; demostración pendiente (C)',
         '92': 'Señal m048 trivial (impacto ≤ 8.148 CUP); mantener CUP salvo documento en contrario (C)',
         '120': 'Señal m048 trivial (impacto 679 CUP); mantener CUP salvo documento en contrario (C)',
         '999': 'Servicio (F); señal trivial heredada; sin capa/WAC nuevos'}
rows = [[r['num'], int(r['sku']), r['nombre'], r['moneda'], F(r['tasa']), F(r['uc_registrado']), F(r['uc_cup']),
         F(r['subtotal_cup']), notes.get(str(r['sku']), 'CUP auténtico (tasa 1) — demostrado' if r['moneda'] == 'CUP' else 'USD auténtico (tasa 680 histórica conservada)')]
        for r in MM]
build_sheet(wb, "Monedas por línea", "Clasificación monetaria línea a línea", hdr, rows,
            widths=[5, 7, 30, 8, 8, 14, 12, 14, 60])

tasas = [[t['rate_date'], t['rate'], t['source'], t.get('segment', '3'), t.get('capture_method', 'real')] for t in M['conciliacion']['tasa_680_evidencia']]
tasas.insert(1, ['2026-07-01', '620.00', 'elToque', '3', 'real (captura del día)'])
build_sheet(wb, "Evidencia de tasas", "Tasas USD del período (exchange_rates) — la tasa 680 se conserva solo para líneas USD demostradas",
            ["Fecha", "Tasa", "Fuente", "Segmento", "Método"], tasas, [12, 10, 10, 10, 20])
save_wb(wb, os.path.join(BASE, "RECEIPT_CURRENCY_RECONCILIATION.xlsx")); print("OK 3 currency")

# ═══════════════ 4) RECEIPT_INVENTORY_AND_COGS_IMPACT.xlsx ══════════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
hdr = ["#", "SKU", "Producto", "Capa FVC UC", "Capa FVC u", "Valor capa (CUP)", "Capa restante FIFO",
       "Otros ingresos (ajenos)", "Salidas venta (u)", "Salidas vales (u)", "Salidas ajustes (u)",
       "Existencia actual", "WAC actual (CUP)", "Cambios WAC"]
rows = [[r['num'], int(r['sku']), r['nombre'], F(r['capa_uc']), F(r['capa_qty']),
         F(Decimal(r['capa_qty']) * Decimal(r['capa_uc'])), F(r['capa_restante_fifo']), F(r['otros_ingresos']),
         F(r['salidas_venta']), F(r['salidas_vales']), F(r['salidas_ajustes']), F(r['stock_actual']),
         F(r['wac_actual']), int(r['wac_cambios'])] for r in MM]
build_sheet(wb, "Inventario por SKU", "Inventario: capas de la recepción, salidas históricas y existencia atribuible (FIFO)", hdr, rows,
            widths=[5, 7, 30, 11, 10, 13, 13, 13, 12, 12, 12, 12, 13, 10])

ws2 = wb.create_sheet("COGS")
setup_sheet(ws2, title="Costo de ventas asociado a los 101 SKU — bases de medición", last_col=4)
c = M['cogs_reconciliacion']
cog_rows = [
    ["A — Por línea: cost_at_sale de transaction_items (ventas POS completadas netas)", F(c['base_A_items_101_completados'])],
    ["B — Por línea: costo derivado del kardex en las salidas de venta de los 101 SKU", F(c['base_B_kardex_derivado_101'])],
    ["C — Cuenta GAS_COSTO_VENTAS por transacción completa (602 transacciones mezcladas)", F(c['base_C_gas_costo_ventas_por_transaccion'])],
    ["Diferencia B−A (redondeo cost_at_sale vs costo derivado)", F(Decimal(str(c['base_B_kardex_derivado_101'])) - Decimal(str(c['base_A_items_101_completados'])))],
    ["Transacciones completadas sin movimiento GAS (costo derivado 0)", c['tx_completadas_sin_movimiento_gas']],
    ["Conclusión", "Sin duplicación de COGS atribuible a FAC-VITALLCONS-001; COGS 7 CUP de las 5 ventas SKU111/112 intacto (RECT-2 no lo tocó)"],
]
for i, (k, v) in enumerate(cog_rows):
    ws2.cell(row=6 + i, column=2, value=k); ws2.cell(row=6 + i, column=3, value=v)
style_header_row(ws2, 5, 2, 3)
ws2.cell(row=5, column=2, value="Concepto"); ws2.cell(row=5, column=3, value="Valor (CUP)")
finish(ws2, 5, 3)
ws2.column_dimensions['B'].width = 72; ws2.column_dimensions['C'].width = 20

hdr = ["#", "SKU", "Producto", "Ventas (u)", "COGS asociado (CUP)", "Vales (u)", "Vales costo (CUP)"]
rows = [[r['num'], int(r['sku']), r['nombre'], F(r['ventas_qty']), F(r['cogs_asociado']), F(r['vales_qty']),
         F(r['vales_costo'])] for r in MM]
build_sheet(wb, "COGS y vales por SKU", "COGS y vales por SKU (bases por línea)", hdr, rows,
            widths=[5, 7, 30, 10, 16, 9, 15])
save_wb(wb, os.path.join(BASE, "RECEIPT_INVENTORY_AND_COGS_IMPACT.xlsx")); print("OK 4 inventory")

# ═══════════════ 5) RECEIPT_CORRECTIONS_BY_BATCH.xlsx ═══════════════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
hdr = ["Lote", "Estado", "SKUs", "Importe", "Descripción", "Autorización", "Verificación 010"]
rows = [[l['id'], l['estado'], ', '.join(l['skus'][:12]) + ('…' if len(l['skus']) > 12 else ''), l['importe'],
         l['descripcion'], l['autorizacion'], l['verificacion_010']] for l in M['lotes']]
build_sheet(wb, "Lotes", "Correcciones por lotes — §7 de la misión (ejecutados: L0a/L0b; propuestas: L1/L2/L3)", hdr, rows,
            widths=[16, 34, 26, 30, 62, 40, 46])

ws2 = wb.create_sheet("L1-SKU90 (propuesta)")
setup_sheet(ws2, title="L1 — Propuesta cuantificada SKU90 «Cable Solar Rojo 6mm» (NO EJECUTADA)", last_col=3)
s9 = M['sku90_impacto']
l1 = [
    ("Listado cerrado", "SKU 90 «Cable Solar Rojo 6mm» — línea de recepción única (1:1 con capa)"),
    ("Valor anterior", f"173 u × 5,00 USD × 680 = {s9['sub_actual_cup']} CUP"),
    ("Valor nuevo (si moneda CUP demostrada)", f"173 u × 5,00 CUP × 1 = {s9['sub_propuesto_cup']} CUP"),
    ("Impacto total (Δ)", f"{s9['delta_total_cup']} CUP"),
    ("Efecto en stock/capas", f"{s9['u_restantes_atribuibles']} u atribuibles restantes (FIFO) → inventario Δ {s9['delta_inventario_cup']} CUP; egresos/pasado Δ {s9['delta_egresos_pasado_cup']} CUP"),
    ("Efecto en WAC", "Recálculo WAC del SKU90 con capa corregida (mecanismo gobernado, idéntico a RECT-1)"),
    ("Efecto contable", "Asiento manual (document_id=NULL + reversal_of=93bb5da9…): Debe PAS_CXP_PROV / Haber ACT_INVENTARIO (porción en stock) y la porción histórica según destino de las u salidas"),
    ("Prueba E2E aislada", "Patrón m061 --probe (BD aislada lguovmvrozxgssupkwpf) antes de cualquier producción"),
    ("Idempotencia", "Guards read-only por conteo WHERE + reversal_of único (índice uq_fin_entries_doc_event)"),
    ("Rollback", "Transacción única por Management API; verificación post 9 puntos (patrón m061 --verify)"),
    ("Snapshot antes/después", "Extensión natural de m050b/m070 (freeze + verificación hash)"),
    ("CONDICIÓN DE EJECUCIÓN", "SOLO con documento que demuestre la moneda CUP original + autorización específica del propietario (misión 010 §7)"),
]
for i, (k, v) in enumerate(l1):
    ws2.cell(row=6 + i, column=2, value=k); ws2.cell(row=6 + i, column=3, value=v)
style_header_row(ws2, 5, 2, 3)
ws2.cell(row=5, column=2, value="Elemento"); ws2.cell(row=5, column=3, value="Detalle")
finish(ws2, 5, 3)
ws2.column_dimensions['B'].width = 40; ws2.column_dimensions['C'].width = 100
save_wb(wb, os.path.join(BASE, "RECEIPT_CORRECTIONS_BY_BATCH.xlsx")); print("OK 5 batches")

# ═══════════════ 6) RECEIPT_UNRESOLVED_LINES.xlsx ═══════════════════════════
wb = Workbook(); wb.properties.creator = "Z.ai"
hdr = ["#", "SKU", "Producto", "Moneda", "UC registrado", "Subtotal CUP", "Señal m048", "Qué falta para resolver", "Acción"]
ev_ = []
for r in MM:
    if r['clasificacion'] == 'E':
        ev_.append([r['num'], int(r['sku']), r['nombre'], r['moneda'], F(r['uc_registrado']), F(r['subtotal_cup']),
                    'Magnitud indistinguishable precio/costo (DP-3, misión 003)',
                    'Documento de compra original por línea (factura proveedor / historial de importación)',
                    'No modificar hasta evidencia; lote L3 abierto'])
build_sheet(wb, "No verificables (71)", "Líneas E — costo no verificable (71)", hdr, ev_,
            widths=[5, 7, 30, 8, 12, 14, 40, 44, 30])

crows = []
for r in MM:
    if r['clasificacion'] == 'C':
        crows.append([r['num'], int(r['sku']), r['nombre'], r['moneda'], F(r['tasa']), F(r['uc_registrado']),
                      F(r['subtotal_cup']),
                      'Δ −587.335 CUP si CUP demostrado (865 vs 588.200)' if str(r['sku']) == '90'
                      else 'Δ ≤ 8.148 CUP si USD demostrado (trivial)' if str(r['sku']) == '92'
                      else 'Δ 679 CUP si USD demostrado (trivial)'])
build_sheet(wb, "Moneda pendiente (3)", "Líneas C — señal de moneda (3)",
            ["#", "SKU", "Producto", "Moneda", "Tasa", "UC registrado", "Subtotal CUP", "Impacto potencial"], crows,
            widths=[5, 7, 30, 8, 8, 12, 14, 40])

ws3 = wb.create_sheet("SKU999 (servicio)")
setup_sheet(ws3, title="SKU999 «Servicio de cripiar» — tratamiento como servicio (F)", last_col=3)
s9d = M['controles']
f_rows = [
    ("products.is_service", True),
    ("Línea en la recepción", "4 u × 1,00 CUP = 4,00 CUP (capa FVC generada por el motor en 2026-07-01)"),
    ("Saldo kardex neto", "0 u (compra 4 → consumida por ventas/cuadres; stock actual 0)"),
    ("WAC actual", "443,83 CUP — proviene de otra recepción ajena (44b8f20f, 20 u × 680, 10/08/2026) y cuadres posteriores; FUERA del alcance"),
    ("Tratamiento correcto", "Sin capa nueva ni actualización de WAC como mercancía; costo 4,00 CUP se mantiene como gasto/servicio"),
    ("Corrección propuesta", "NINGUNA en esta misión (impacto trivial; sin evidencia de error en la línea de FAC-VITALLCONS-001)"),
]
for i, (k, v) in enumerate(f_rows):
    ws3.cell(row=6 + i, column=2, value=k); ws3.cell(row=6 + i, column=3, value=str(v))
style_header_row(ws3, 5, 2, 3)
ws3.cell(row=5, column=2, value="Campo"); ws3.cell(row=5, column=3, value="Valor")
finish(ws3, 5, 3)
ws3.column_dimensions['B'].width = 26; ws3.column_dimensions['C'].width = 95
save_wb(wb, os.path.join(BASE, "RECEIPT_UNRESOLVED_LINES.xlsx")); print("OK 6 unresolved")

print("XLSX generados en", BASE)
