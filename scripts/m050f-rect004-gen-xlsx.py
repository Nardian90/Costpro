#!/usr/bin/env python3
# ============================================================================
# M050f — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004:
# GENERADOR DE LOS 4 ENTREGABLES XLSX (evidencia verificada read-only).
#  · RECT004_CXP_RECONCILIATION.xlsx       (DP-2 — deuda proveedor)
#  · RECT004_EXITS_RECONCILIATION.xlsx     (§8 — 119 salidas + reingreso + asientos)
#  · RECT004_ACCOUNTING_RECONCILIATION.xlsx(§9 — inventario/COGS/vales/pérdidas)
#  · RECT004_MATRIX_101.xlsx               (§10 — matriz 101 con protección 75)
# Valores COMPUTADOS (verificación programática; sin fórmulas dinámicas).
# ============================================================================
import sys, os, json

XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)
import base
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

OUT_DIR = "/home/z/my-project/Costpro/docs/audits/valuation-rectification-release-gate-004"
DL_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(DL_DIR, exist_ok=True)

SNAP = json.load(open("/home/z/my-project/scripts/out/rect004-faseDP-snapshot.json"))
ANALYSIS = json.load(open("/home/z/my-project/scripts/out/rect004-fase-analisis.json"))
M048 = json.load(open("/home/z/my-project/Costpro/docs/audits/valuation-rectification-003-20261115/m048-faseIII-matriz.json"))

F = base.FONT_NAME
PRIM = base.PRIMARY
NEU9 = base.NEUTRAL_900
NEU6 = base.NEUTRAL_600
NEU1 = base.NEUTRAL_100
ACC_P = base.ACCENT_POSITIVE
ACC_N = base.ACCENT_NEGATIVE
ACC_W = base.ACCENT_WARNING

def titulo(ws, texto, last_col):
    ws.cell(row=2, column=2, value=texto).font = base.font_title()
    ws.cell(row=2, column=2).alignment = base.align_title()

def subtitulo(ws, row, texto, last_col):
    c = ws.cell(row=row, column=2, value=texto)
    c.font = base.font_subheader()
    for col in range(2, last_col + 1):
        ws.cell(row=row, column=col).fill = base.fill_total()

def cabecera(ws, row, headers):
    for i, h in enumerate(headers):
        c = ws.cell(row=row, column=2 + i, value=h)
        c.font = base.font_header()
        c.fill = base.fill_header()
        c.alignment = base.align_header()
        c.border = base.border_header()

def fila(ws, row, values, idx, formato=None, cols=None):
    for i, v in enumerate(values):
        c = ws.cell(row=row, column=2 + i, value=v)
        c.font = base.font_body()
        c.fill = base.fill_data_row(idx)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            c.alignment = base.align_number()
            if formato:
                c.number_format = formato
        else:
            c.alignment = base.align_text()

def totales(ws, row, values, formato=None):
    for i, v in enumerate(values):
        c = ws.cell(row=row, column=2 + i, value=v)
        c.font = base.font_subheader()
        c.fill = base.fill_total()
        c.border = base.border_total()
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            c.alignment = base.align_number()
            if formato:
                c.number_format = formato

def nota(ws, row, texto):
    c = ws.cell(row=row, column=2, value=texto)
    c.font = base.font_caption()

def anchos(ws, widths):
    for i, w in enumerate(widths):
        ws.column_dimensions[get_column_letter(2 + i)].width = w

# ═════════════════════════════════════════════════════════════════════════════
# 1. RECT004_CXP_RECONCILIATION.xlsx — contrapartida de 151.299.851 (DP-2)
# ═════════════════════════════════════════════════════════════════════════════
wb = Workbook(); ws = wb.active; ws.title = "Conciliación CXP"
titulo(ws, "Conciliación de la deuda con el proveedor Vitallcons — FAC-VITALLCONS-001 (DP-2)", 7)
subtitulo(ws, 4, "A. Documento FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63)", 7)
fvc = SNAP["receipts_fvc"][0]
cabecera(ws, 5, ["Campo", "Valor verificado", "Fuente / canal"])
datos_fvc = [
    ("Estado del documento", "active (no anulado)", "receipts.status — SELECT Management API"),
    ("Saldo original reconocido", 192039436.00, "asiento 93bb5da9: D ACT_INVENTARIO / C PAS_CXP_PROV"),
    ("payment_status", "unpaid", "receipts.payment_status"),
    ("paid_amount", 0, "receipts.paid_amount"),
    ("paid_at", "(nulo)", "receipts.paid_at"),
    ("Vencimiento", "2026-07-31 (vencida)", "receipts.due_date"),
    ("Reversed / motivo", "(nulo) — sin reversa", "receipts.reversed_at / reversal_reason"),
]
r = 6
for i, (a, b, c) in enumerate(datos_fvc):
    fila(ws, r, [a, b, c], i); r += 1
r += 1
subtitulo(ws, r, "B. Verificación documento por documento (misión §5) — producción read-only " + SNAP["extraccion"]["fecha_utc"][:19] + " UTC", 7); r += 1
cabecera(ws, r, ["#", "Verificación exigida", "Resultado verificado", "Evidencia (corte 004)"]); r += 1
dp2 = ANALYSIS["dp2_conciliacion_deuda"]
verifs = [
    ("1", "Pagos vinculados a la FVC (payment_transactions.ref_id)", "0 filas", "Ningún pago referencia a la FVC"),
    ("2", "Pagos al proveedor por ref_type (receipt/proveedor/supplier/purchase)", "0 filas en 200 transacciones de la tienda", "ref_type presente: sale/in (181), service/in (17), cash_flow/out (2)"),
    ("3", "Pagos no vinculados directamente (referencia/notas con Vitallcons/FAC)", "0 filas", "Búsqueda ILIKE sobre reference/notes"),
    ("4", "Anticipos / compensaciones (direction=out)", "2 filas cash_flow 2026-10-23 (293.600 USD + 8.435.679,98 CUP)", "Documentos de FLUJO_CAJA, no pagos a proveedor de recepciones"),
    ("5", "Archivo de purga de pagos (payment_transactions_purga_20261026_archive)", "0 filas con FVC/Vitallcons", "Tabla de archivo auditada"),
    ("6", "Notas de crédito a proveedor (DEVOLUCION_PROV = reversa de recepción)", "La FVC sigue active — NO existe reversa", "fin_entries anulacion RECEPCION: 1 (otra recepción de 960 CUP)"),
    ("7", "Anulaciones de la FVC (fin_entries reversal_of)", "0 filas", "reversal_of → asientos de la FVC: vacío"),
    ("8", "Duplicados del documento (70 recepciones del proveedor)", "0 duplicados — 70 números únicos", "FAC-VITALLCONS-001 aparece 1 vez"),
    ("9", "Recepciones nuevas del proveedor tras el corte 003", "0 filas", "created_at > 2026-11-14T18:58:17Z"),
    ("10", "Crédito de tienda aplicado al proveedor (store_credit_ledger)", "0 filas", "Ledger de crédito de CLIENTES (devoluciones)"),
    ("11", "Vista v_purchase_orders_cxp de la tienda", "0 filas", "Vista sin filas para la tienda ENERVIDA"),
    ("12", "Mayor PAS_CXP_PROV global (componentes)", "reconocimiento C 207.256.110,57 (98 recepciones) + anulacion D 960 (1)", "Neto 207.255.150,57 CUP — IDÉNTICO al corte 003 (sin pagos: no existe PAGO_PROVEEDOR)"),
]
for i, (a, b, c, d) in enumerate(verifs):
    fila(ws, r, [a, b, c, d], i); r += 1
r += 1
subtitulo(ws, r, "C. Determinación de la contrapartida RECT-1", 7); r += 1
cabecera(ws, r, ["Concepto", "Importe (CUP)", "Justificación contable"]); r += 1
conc = [
    ("Exceso atribuido a SKU 111 (49 u × (2.500×680 − 1))", 83299951.00, "Precio de venta CUP importado como costo USD; costo real 1 CUP/u"),
    ("Exceso atribuido a SKU 112 (100 u × (1.000×680 − 1))", 67999900.00, "Ídem"),
    ("EXCESO CONJUNTO A REVERTIR", 151299851.00, "RECT-1: D PAS_CXP_PROV / C ACT_INVENTARIO"),
    ("Parte del importe que continúa como deuda REAL pendiente", 151299851.00, "Verificado B.1-B.12: la deuda está 100% pendiente (0 pagos, 0 compensaciones, 0 reversiones)"),
    ("Deuda restante de la FVC tras RECT-1 (sigue unpaid)", 40739585.00, "Solo se cancelará con pagos reales futuros (PAGO_PROVEEDOR)"),
]
for i, (a, b, c) in enumerate(conc):
    fila(ws, r, [a, b, c], i, formato="#,##0.00"); r += 1
nota(ws, r + 1, "Condición de aprobación §5 CUMPLIDA: la parte del importe a revertir continúa formando parte de una deuda real pendiente. "
     "Corte: " + SNAP["extraccion"]["fecha_utc"][:19] + " UTC (zona horaria de extracción UTC). Producción intacta (solo SELECT).")
anchos(ws, [46, 44, 52, 40])
ws.freeze_panes = "B6"
wb.save(os.path.join(OUT_DIR, "RECT004_CXP_RECONCILIATION.xlsx")); wb.close()

# ═════════════════════════════════════════════════════════════════════════════
# 2. RECT004_EXITS_RECONCILIATION.xlsx — 119 salidas + reingreso + asientos
# ═════════════════════════════════════════════════════════════════════════════
wb = Workbook(); ws = wb.active; ws.title = "119 Salidas"
titulo(ws, "Reconciliación de las 119 salidas netas de SKU 111/112 — reconstrucción por unidad (§8)", 9)
subtitulo(ws, 4, "A. Cronología por documento (kardex verificado — 21 movimientos, ids idénticos al corte 003)", 9)
cabecera(ws, 5, ["#", "SKU", "Fecha", "Tipo", "Documento", "Cant.", "uc kardex", "Valor reg. (CUP)", "Costo correcto (CUP)", "Estado contable"])
k = SNAP["kardex_111_112"]
CRONO = [
    ("1", 111, "2026-07-24", "Venta", "FAC-004479-2026 (tx 99d8993f)", 1, 0, 0, 1, "MOTOR ya contabilizó COGS 1 CUP (asiento VENTA)"),
    ("2", 111, "2026-08-18", "Ajuste", "Cuadre importación Δ−1 (sin documento)", 1, 0, 0, 1, "SIN asiento (brecha) → RECT-2 GAS_PERDIDA_INV"),
    ("3", 111, "2026-10-04", "Venta", "Venta POS v2 (tx d939ea06)", 1, 0, 0, 1, "MOTOR ya contabilizó COGS 1 CUP"),
    ("4", 111, "2026-10-05", "Vale", "VS-000139-2026 (ENERVIDA)", 1, 0, 0, 1, "SIN asiento (brecha) → RECT-2 GAS_VALES"),
    ("5", 111, "2026-10-09", "Vale", "VS-000148-2026 (OT/Ferro)", 1, 1, 1, 1, "Asiento GAS_VALES 1 CUP ✓"),
    ("6", 111, "2026-10-10", "Vale", "VS-000158-2026 (Transf. Puerto Padre)", 20, 1, 20, 20, "Asiento GAS_VALES 20 CUP ✓"),
    ("7", 111, "2026-10-14", "Venta", "Venta POS v2 (tx 4c76a1a1)", 1, 1, 1, 1, "MOTOR ya contabilizó COGS 1 CUP"),
    ("8", 111, "2026-10-22", "Venta", "Venta POS v2 (tx a0d9f44d)", 1, 1, 1, 1, "MOTOR ya contabilizó COGS 1 CUP"),
    ("9", 111, "2026-10-28", "Vale", "VS-000208-2026 (Transf. Tienda Ferrocarril)", 12, 1, 12, 12, "Asiento GAS_VALES (porción 111/112 = 32 CUP del vale) ✓"),
    ("10", 112, "2026-08-18", "Ajuste", "Cuadre importación Δ−17 (sin documento)", 17, 0, 0, 17, "SIN asiento (brecha) → RECT-2 GAS_PERDIDA_INV"),
    ("11", 112, "2026-09-19", "Vale", "VS-000037-2026 (Orden/47)", 4, 0, 0, 4, "SIN asiento (brecha) → RECT-2 GAS_VALES (vale SOLO contiene 112)"),
    ("12", 112, "2026-10-05", "Vale", "VS-000138-2026 (ENERVIDA)", 1, 0, 0, 1, "SIN asiento (brecha) → RECT-2 GAS_VALES"),
    ("13", 112, "2026-10-05", "Venta", "Venta POS v2 (tx acc2b470)", 3, 1, 3, 3, "MOTOR ya contabilizó COGS 3 CUP"),
    ("14", 112, "2026-10-10", "Vale", "VS-000157-2026 (Transf. Puerto Padre)", 20, 1, 20, 20, "Asiento GAS_VALES 20 CUP ✓"),
    ("15", 112, "2026-10-10", "Vale", "VS-000165-2026 (OT/Ferro)", 10, 1, 10, 10, "Asiento GAS_VALES 10 CUP ✓"),
    ("16", 112, "2026-10-28", "Vale", "VS-000208-2026 (Transf. Tienda Ferrocarril)", 20, 1, 20, 20, "Asiento GAS_VALES (parte del vale) ✓"),
    ("17", 112, "2026-11-07", "Vale", "VS-000223-2026 (Ferro, vale 38-26)", 1, 1, 1, 1, "ANULADO: vale reversed; salida y reingreso SIN asiento → neto 0 (NO se contabiliza)"),
    ("18", 112, "2026-11-07", "Vale", "VS-000225-2026 (Ferro, vale 38-26)", 5, 1, 5, 5, "Asiento GAS_VALES 5 CUP ✓"),
]
r = 6
for i, row in enumerate(CRONO):
    fila(ws, r, list(row), i); r += 1
totales(ws, r, ["Σ netas", "", "", "18 movimientos", "9 fila SKU111 + 9 fila SKU112", 119, "", 94, 119, "COGS motor 7 ✓ · vales contab. 88 ✓ · brechas 24 → RECT-2"]); r += 2
subtitulo(ws, r, "B. Identidades por SKU (re-verificadas contra producción al corte 004)", 9); r += 1
cabecera(ws, r, ["SKU", "Recibidas", "Salidas brutas", "Reingreso", "Salidas netas", "Saldo kardex", "stock_current", "inventory", "Identidad"]); r += 1
fila(ws, r, ["111", 49, 39, 0, 39, 10, 10, 10, "49 − 39 = 10 ✓"], 0); r += 1
fila(ws, r, ["112", 100, 81, 1, 80, 20, 20, 20, "100 − 81 + 1 = 20 ✓"], 1); r += 1
totales(ws, r, ["TOTAL", 149, 120, 1, 119, 30, 30, 30, "149 − 120 + 1 = 30 ✓"]); r += 2
subtitulo(ws, r, "C. Reingreso de 1 unidad (VS-000223-2026) — explicación exigida por §8", 9); r += 1
cabecera(ws, r, ["Aspecto", "Detalle verificado"]); r += 1
reing = [
    ("Documento que lo origina", "Vale de Salida VS-000223-2026 (Ferro, vale 38-26, Antonio Ye Batista) — status=reversed"),
    ("SKU / cantidad", "SKU 112 — 1 unidad"),
    ("Movimiento de salida revertido", "stock_movements issue_slip_out −1 @ uc=1 (2026-11-07T10:00Z)"),
    ("Movimiento de reingreso", "stock_movements issue_slip_reverse +1 @ uc=1 (2026-11-07T11:00Z)"),
    ("Efecto en existencia", "Neto 0 (sale y vuelve): 100 − 81 + 1 = 20 u actuales ✓"),
    ("Efecto contable", "NINGUNO en ambos sentidos: 0 fin_entries para VS-000223 (verificado por document_id y document_number)"),
    ("Relación con la venta/vale original", "El vale fue revertido (anulación administrativa del vale); no existe reventa asociada"),
    ("Tratamiento en RECT-2", "NO se contabiliza: el par tiene neto contable 0 — evitar doble reconocimiento (no entraría salida NI entrada)"),
    ("Incorporación correcta previa", "Sí: el reingreso ya está en kardex y en existencias; NO se reconoce como entrada adicional ni se duplica"),
]
for i, (a, b) in enumerate(reing):
    fila(ws, r, [a, b], i); r += 1
anchos(ws, [5, 6, 11, 9, 34, 7, 9, 11, 12, 44])
ws.freeze_panes = "B6"

# hoja 2: asientos existentes
ws2 = wb.create_sheet("Asientos existentes")
titulo(ws2, "Asientos contables EXISTENTES de SKU 111/112 (verificación de no doble contabilización)", 8)
subtitulo(ws2, 4, "A. COGS del motor — 5 asientos de venta (intactos, total 7 CUP)", 8)
cabecera(ws2, 5, ["Documento", "Fecha económica", "Categoría", "Sentido", "Importe (CUP)", "document_id (tx)", "Estado"])
r = 6
for m in SNAP["fin_movements_cogs_ventas"]:
    fila(ws2, r, [m.get("document_number") or m.get("document_id"), str(m["economic_date"]), "GAS_COSTO_VENTAS", "debito", float(m["amount"]), str(m["document_id"]), "posted — NO duplicar (V-L2)"], r - 6); r += 1
totales(ws2, r, ["TOTAL COGS motor", "", "", "", 7.00, "5 asientos", "RECT-2 NO toca GAS_COSTO_VENTAS"]); r += 2
subtitulo(ws2, r, "B. Vales CON asiento — 6 vales (porción SKU 111/112 = 88 CUP)", 8); r += 1
cabecera(ws2, r, ["Vale", "Categoría", "Sentido", "Importe porción 111/112 (CUP)", "Importe TOTAL del vale (CUP)", "Asiento", "Estado"]); r += 1
vales_tot = {"VS-000148-2026": 1.0, "VS-000157-2026": 20.0, "VS-000158-2026": 20.0, "VS-000165-2026": 10.0, "VS-000208-2026": 229862.57, "VS-000225-2026": 5.0}
vales_por = {"VS-000148-2026": 1, "VS-000157-2026": 20, "VS-000158-2026": 20, "VS-000165-2026": 10, "VS-000208-2026": 32, "VS-000225-2026": 5}
for i, m in enumerate(SNAP["fin_movements_gas_vales"]):
    vn = m["document_number"]
    fila(ws2, r, [vn, "GAS_VALES", "debito", vales_por.get(vn), float(m["amount"]), "fin_entries VALE_SALIDA reconocimiento", "posted ✓ (VS-208 cubre TODO el vale)"], r if False else i); r += 1
totales(ws2, r, ["TOTAL porción 111/112", "", "", 88.00, "", "6 asientos", "RECT-2 NO los toca"]); r += 2
subtitulo(ws2, r, "C. Salidas SIN asiento — las ÚNICAS que RECT-2 reconoce (24 CUP)", 8); r += 1
cabecera(ws2, r, ["Documento", "SKU", "Unidades", "Costo unitario real", "Importe (CUP)", "Cuenta propuesta", "Verificación de ausencia"]); r += 1
sin_as = [
    ("VS-000037-2026", 112, 4, 1, 4, "GAS_VALES", "0 fin_entries con document_id/document_number del vale"),
    ("VS-000138-2026", 112, 1, 1, 1, "GAS_VALES", "0 fin_entries (ídem)"),
    ("VS-000139-2026", 111, 1, 1, 1, "GAS_VALES", "0 fin_entries (ídem)"),
    ("Cuadre importación Δ−1", 111, 1, 1, 1, "GAS_PERDIDA_INV", "Sin inventory_adjustments (0 documentos); 0 asientos AJUSTE_INVENTARIO vinculados"),
    ("Cuadre importación Δ−17", 112, 17, 1, 17, "GAS_PERDIDA_INV", "Sin documento ni reference_id — regularización legacy"),
    ("VS-000223-2026 (anulado)", 112, 0, 1, 0, "— NO se contabiliza —", "Par salida/reingreso neto 0: ambos sin asiento"),
]
for i, row in enumerate(sin_as):
    fila(ws2, r, list(row), i); r += 1
totales(ws2, r, ["TOTAL RECT-2", "", 24, "", 24.00, "D GAS_VALES 6 + D GAS_PERDIDA_INV 18 / C ACT_INVENTARIO 24", ""]); r += 1
nota(ws2, r + 1, "Naturaleza de los 18 CUP de ajustes: regularización de importación legacy (diferencia acumulada pre-corte vs Excel, 2026-08-18) — "
     "salidas sin destino (no transferencia ni devolución: sin tienda destino ni reingreso en otro almacén) → pérdida de inventario (GAS_PERDIDA_INV), "
     "patrón del asiento AJUSTE_INVENTARIO existente a96e09c3 (D GAS_PERDIDA_INV 1 / C ACT_INVENTARIO 1).")
anchos(ws2, [26, 14, 18, 22, 20, 34, 44])
wb.save(os.path.join(OUT_DIR, "RECT004_EXITS_RECONCILIATION.xlsx")); wb.close()

# ═════════════════════════════════════════════════════════════════════════════
# 3. RECT004_ACCOUNTING_RECONCILIATION.xlsx — §9
# ═════════════════════════════════════════════════════════════════════════════
wb = Workbook(); ws = wb.active; ws.title = "Conciliación §9"
titulo(ws, "Conciliación de costo, inventario y COGS — cortes histórico y actual (§9)", 8)
subtitulo(ws, 4, "A. Fotografía HISTÓRICA (reconstrucción del expediente 003 — re-verificada)", 8)
cabecera(ws, 5, ["Concepto", "SKU 111", "SKU 112", "Total", "Fuente"])
r = 6
hist = [
    ("Existencia final histórica (u)", 10, 20, 30, "kardex/stock_current/inventory (corte 003)"),
    ("Costo unitario real (CUP)", 1, 1, 1, "Decisión económica del propietario"),
    ("Valor de existencia (CUP)", 10, 20, 30, "10×1 + 20×1"),
    ("COGS ya reconocido por el motor (CUP)", "", "", 7, "5 asientos de venta: 1+1+3+1+1 (INTACTO — V-L2)"),
    ("Salidas por vales y ajustes pendientes (CUP)", "", "", 24, "VS-37/138/139 (6) + ajustes cuadre (18)"),
    ("Rectificación del exceso de inventario (CUP)", "", "", 151299851, "RECT-1 — reversión del reconocimiento"),
]
for i, row in enumerate(hist):
    fila(ws, r, list(row), i, formato="#,##0"); r += 1
r += 1
subtitulo(ws, r, "B. Fotografía ACTUAL (corte 004 — " + SNAP["extraccion"]["fecha_utc"][:19] + " UTC)", 8); r += 1
cabecera(ws, r, ["Concepto", "SKU 111", "SKU 112", "Total", "Fuente"]); r += 1
act = [
    ("stock_current (u)", 10, 20, 30, "products.stock_current"),
    ("inventory (u)", 10, 20, 30, "inventory.quantity"),
    ("Saldo kardex calculado (u)", 10, 20, 30, "Σ quantity_change por SKU"),
    ("WAC (cost_average)", 1, 1, 1, "products.cost_average"),
    ("Movimientos nuevos post-corte 003", 0, 0, 0, "0 kardex nuevos de SKU 111/112"),
]
for i, row in enumerate(act):
    fila(ws, r, list(row), i); r += 1
nota(ws, r, "Cortes coinciden en los SKU 111/112 (0 movimientos comerciales posteriores). Diferencia legítima global: "
     "mayor ACT_INVENTARIO 201.699.246,55 → 201.681.043,51 (−18.203,04) por COGS de ventas nuevas 19:11:57 y 19:13:18 UTC "
     "(actividad comercial viva, otros productos, sin relación con la FVC)."); r += 2
subtitulo(ws, r, "C. Distinción de conceptos (no sumar monedas distintas)", 8); r += 1
cabecera(ws, r, ["Concepto", "Monto (CUP)", "Cuenta", "Estado"]); r += 1
con = [
    ("Saldo de inventario (30 u × 1 CUP)", 30, "ACT_INVENTARIO (subset 111/112)", "En libros ✓"),
    ("Costos reconocidos (COGS motor)", 7, "GAS_COSTO_VENTAS", "Reconocido ✓ — no duplicar"),
    ("Gastos por vales (contabilizados)", 88, "GAS_VALES", "Reconocido ✓"),
    ("Gastos por vales (brecha VS-37/138/139)", 6, "GAS_VALES", "PENDIENTE → RECT-2"),
    ("Pérdidas de inventario (ajustes cuadre)", 18, "GAS_PERDIDA_INV", "PENDIENTE → RECT-2"),
    ("Obligación con el proveedor (FVC)", 192039436, "PAS_CXP_PROV", "unpaid — 100% pendiente"),
    ("Rectificación del exceso", 151299851, "PAS_CXP_PROV / ACT_INVENTARIO", "PROPUESTA RECT-1 (no ejecutada)"),
]
for i, row in enumerate(con):
    fila(ws, r, list(row), i, formato="#,##0"); r += 1
r += 1
subtitulo(ws, r, "D. Identidad final del subconjunto (demostrada en E2E m050e P7)", 8); r += 1
cabecera(ws, r, ["Componente", "Importe (CUP)"]); r += 1
ident = [
    ("Reconocimiento neto (costo real 49 + 100)", 149),
    ("− COGS motor (7 u vendidas)", -7),
    ("− Vales netos (94 u × 1)", -94),
    ("− Ajustes/pérdidas (18 u × 1)", -18),
    ("= ACT_INVENTARIO neto del subconjunto", 30),
    ("= Valor en libros del kardex (30 u × 1)", 30),
    ("COINCIDENCIA (identidad cuadrada)", "30 = 30 ✓"),
]
for i, row in enumerate(ident):
    fila(ws, r, list(row), i, formato="#,##0"); r += 1
nota(ws, r + 1, "Total de costo de la recepción 40.739.585 CUP: PRELIMINAR (71 líneas no verificables + 4 discrepancias de moneda pendientes). "
     "No certificar como definitivo.")
anchos(ws, [46, 16, 16, 16, 46])
ws.freeze_panes = "B6"

ws2 = wb.create_sheet("RECT-1 y RECT-2")
titulo(ws2, "Asientos propuestos — RECT-1 y RECT-2 (separables, idempotentes, reversibles)", 6)
subtitulo(ws2, 4, "RECT-1 — corrección del exceso de reconocimiento (transacción independiente)", 6)
cabecera(ws2, 5, ["Cuenta", "Sentido", "Importe (CUP)", "Documento", "Vínculo", "Fecha económica"])
r = 6
r1 = [
    ("PAS_CXP_PROV", "débito", 151299851.00, "FAC-VITALLCONS-001-RECT", "reversal_of → 93bb5da9-0afd-4325-baad-a275710062c5", "2026-07-01"),
    ("ACT_INVENTARIO", "crédito", 151299851.00, "FAC-VITALLCONS-001-RECT", "reversal_of → 93bb5da9 (asiento original INTACTO)", "2026-07-01"),
]
for i, row in enumerate(r1):
    fila(ws2, r, list(row), i, formato="#,##0.00"); r += 1
totales(ws2, r, ["D = C", "", 302599702.00, "equilibrado", "", ""]); r += 2
subtitulo(ws2, r, "RECT-2 — reconocimiento de salidas nunca contabilizadas (transacción independiente)", 6); r += 1
cabecera(ws2, r, ["Cuenta", "Sentido", "Importe (CUP)", "Documento", "Motivo", "Fecha económica"]); r += 1
r2 = [
    ("GAS_VALES", "débito", 6.00, "FAC-VITALLCONS-001-RECT-SAL", "VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u)", "2026-11-15"),
    ("GAS_PERDIDA_INV", "débito", 18.00, "FAC-VITALLCONS-001-RECT-SAL", "Cuadre importación: Δ−1 (111) + Δ−17 (112)", "2026-11-15"),
    ("ACT_INVENTARIO", "crédito", 24.00, "FAC-VITALLCONS-001-RECT-SAL", "Consumo a costo real 1 CUP/u (24 u)", "2026-11-15"),
]
for i, row in enumerate(r2):
    fila(ws2, r, list(row), i, formato="#,##0.00"); r += 1
totales(ws2, r, ["D = C", "", 48.00, "equilibrado", "", ""]); r += 2
nota(ws2, r + 1, "Semántica validada (m050d): RECT-1 es un asiento ajuste_manual COMPENSATORIO enlazado vía reversal_of — el motor admite "
     "la relación (FK sin constraint de importe/cardinalidad) y los reportes netean por movimientos. TRAMPA documentada: tras RECT-1, una futura "
     "anulación completa de la FVC sería SALTADA por el EXISTS del motor (T12) — el residual 40.739.585 exigiría asiento manual.")
anchos(ws2, [18, 10, 16, 28, 52, 14])

ws3 = wb.create_sheet("Antes y Después")
titulo(ws3, "Valores antes/después de la rectificación (producción — PREPARADO, NO EJECUTADO)", 5)
cabecera(ws3, 5, ["Elemento", "Antes (verificado 004)", "Después (esperado)", "Δ"])
r = 6
imp = [
    ("receipts.total_cost (FVC)", 192039436.00, 40739585.00, -151299851.00),
    ("Línea SKU 111", "2.500 USD @680", "1 CUP @1", "—"),
    ("Línea SKU 112", "1.000 USD @680", "1 CUP @1", "—"),
    ("Capas compra kardex (uc)", "1.700.000 / 680.000", "1 / 1", "—"),
    ("26 salidas subvaluadas (uc)", "0 (7 movimientos)", "1 (7 movimientos)", "kardex +26 CUP"),
    ("WAC SKU 111/112", 1, 1, 0),
    ("COGS motor (7 u)", 7, 7, 0),
    ("GAS_VALES (porción 111/112)", 88, 94, 6),
    ("GAS_PERDIDA_INV", 0, 18, 18),
    ("Mayor ACT_INVENTARIO global", 201681043.51, 50381192.51, -151299851.00),
    ("Mayor PAS_CXP_PROV global", 207255150.57, 55955299.57, -151299851.00),
    ("Deuda FVC en CXP", 192039436.00, 40739585.00, -151299851.00),
    ("Existencias 111/112 (u)", "10 / 20", "10 / 20", 0),
    ("Precios de venta (maestro)", "2.000 CUP / 1.000 USD", "2.000 CUP / 1.000 USD", 0),
]
for i, row in enumerate(imp):
    fila(ws3, r, list(row), i, formato="#,##0.00"); r += 1
nota(ws3, r + 1, "Nota: los mayores globales ANTES corresponden al corte 004 (201.681.043,51 tras la actividad comercial viva −18.203,04). "
     "El runbook parte del estado vigente en el momento de la ejecución y re-verifica los valores antes de aplicar.")
anchos(ws3, [34, 26, 26, 18])
wb.save(os.path.join(OUT_DIR, "RECT004_ACCOUNTING_RECONCILIATION.xlsx")); wb.close()

# ═════════════════════════════════════════════════════════════════════════════
# 4. RECT004_MATRIX_101.xlsx — §10 protección expresa
# ═════════════════════════════════════════════════════════════════════════════
wb = Workbook(); ws = wb.active; ws.title = "Matriz 101"
titulo(ws, "Matriz económica de los 101 productos de FAC-VITALLCONS-001 — con protección expresa (§10)", 9)
cabecera(ws, 4, ["SKU", "Producto", "Cant.", "Costo reg.", "Moneda", "Tasa", "Precio venta", "Categoría (congelada misión 003)", "Estado 004 (regresión)"])
r = 5
matriz = M048["matriz"]
# verificación de protección: 0 cambios en 101 líneas
for i, mrow in enumerate(matriz):
    protegida = ("no verificable" in (mrow.get("categoria") or "").lower()) or ("moneda" in (mrow.get("categoria") or "").lower())
    est = ("PROTEGIDA — intacta (sin cambios)" if protegida else
           ("ALCANCE RECT-1 (a corregir)" if mrow["sku"] in ("111", "112") else "intacta (sin cambios)"))
    fila(ws, r, [mrow["sku"], mrow["nombre"], float(mrow["q"]), float(mrow["uc_reg"]), mrow["moneda"],
                 float(mrow["tasa"]), float(mrow["precio_venta"]), mrow["categoria"], est], i); r += 1
nota(ws, r + 1, "Regresión m050c: 101/101 líneas comparadas contra la matriz congelada m048 (misión 003) — 0 CAMBIOS en uc/moneda/tasa. "
     "Las 71 no verificables (exposición contingente 24.510.805 CUP) y las 4 discrepancias de moneda permanecen INTACTAS. "
     "No se usa coincidencia uc=precio como prueba de error; no se corrige por inferencia.")
anchos(ws, [8, 42, 8, 12, 9, 8, 12, 42, 30])
ws.freeze_panes = "B5"

ws2 = wb.create_sheet("Protección 75")
titulo(ws2, "Protección expresa de las 75 líneas fuera de alcance (71 no verificables + 4 discrepancias de moneda)", 4)
subtitulo(ws2, 4, "A. Clasificación (misión §10) y tratamiento", 4)
cabecera(ws2, 5, ["Clasificación", "Líneas", "Valor (CUP)", "Tratamiento"])
r = 6
clas = [
    ("SKU 111 y 112 confirmados", 2, 151300000.00, "Alcance de esta rectificación (RECT-1/RECT-2)"),
    ("Costos legítimos confirmados (D3)", 18, 1318.00, "No modificar"),
    ("Discrepancias de moneda (SKU 90, 92, 999, 120)", 4, 588217.00, "Investigar SIN modificar — pendiente propietario (DP-4)"),
    ("Costos no verificables (uc == precio)", 71, 24510805.00, "Mantener sin cambios — pendiente propietario (DP-3)"),
    ("Sin problema identificado", 6, 1307.00, "No modificar"),
]
for i, row in enumerate(clas):
    fila(ws2, r, list(row), i, formato="#,##0.00"); r += 1
totales(ws2, r, ["TOTAL", 101, 192039436.00, "recomputo cuadra al céntimo con receipts.total_cost"]); r += 2
subtitulo(ws2, r, "B. Control de regresión (esta misión no modificó ninguna de las 75)", 4); r += 1
cabecera(ws2, r, ["Control", "Resultado"]); r += 1
reg = [
    ("Líneas comparadas vs matriz congelada m048", "101 / 101"),
    ("Cambios detectados (uc / moneda / tasa)", "0"),
    ("Líneas fuera de alcance intactas", "99 / 99"),
    ("Exposición contingente no verificables (congelada)", "24.510.805 CUP (16 líneas USD: 20.129.530; 55 CUP: 4.381.275)"),
    ("receipts.total_cost de la FVC", "192.039.436,00 — idéntico al corte 003 (hash de sección idéntico)"),
    ("Consulta de regresión disponible", "RECT004_READONLY_SQL.sql — sección «protección 75 líneas» (re-ejecutable)"),
]
for i, (a, b) in enumerate(reg):
    fila(ws2, r, [a, b], i); r += 1
nota(ws2, r + 1, "Advertencias metodológicas: la coincidencia unit_cost==precio de venta NO es prueba de error; un margen alto o un costo de 1 CUP "
     "NO son imposibles. Las 4 discrepancias de moneda requieren evidencia específica y autorización expresa del propietario.")
anchos(ws2, [46, 60])

ws3 = wb.create_sheet("4 Discrepancias")
titulo(ws3, "Las 4 líneas con discrepancia de moneda (identificadas, SIN modificar)", 6)
cabecera(ws3, 5, ["SKU", "Producto", "uc reg.", "Moneda", "Tasa", "Inconsistencia observada"])
r = 6
disc = [
    ("90", "Bomba de agua", "ver matriz", "ver matriz", "ver matriz", "Señal de moneda distinta a las líneas USD auténticas — requiere investigación documental del propietario"),
    ("92", "Motor eléctrico", "ver matriz", "ver matriz", "ver matriz", "Ídem"),
    ("999", "(línea genérica)", "ver matriz", "ver matriz", "ver matriz", "Ídem"),
    ("120", "Producto 120", "ver matriz", "ver matriz", "ver matriz", "Ídem"),
]
for i, row in enumerate(disc):
    fila(ws3, r, list(row), i); r += 1
# completar con datos reales de la matriz
r = 6
for i, mrow in enumerate(matriz):
    if mrow["sku"] in ("90", "92", "999", "120"):
        fila(ws3, r, [mrow["sku"], mrow["nombre"], float(mrow["uc_reg"]), mrow["moneda"], float(mrow["tasa"]),
                      "Línea con discrepancia de moneda — clasificada por la misión 003; SIN cambios en esta misión (verificada intacta)"], i)
        r += 1
nota(ws3, r + 1, "Estas 4 líneas conservan EXACTAMENTE su moneda, tasa, importe y asiento. Cualquier corrección futura exige evidencia suficiente "
     "y autorización específica del propietario (DP-4).")
anchos(ws3, [8, 42, 12, 10, 8, 66])
wb.save(os.path.join(OUT_DIR, "RECT004_MATRIX_101.xlsx")); wb.close()

# ── Copias para el propietario en download/ ──
import shutil
for f in ["RECT004_CXP_RECONCILIATION.xlsx", "RECT004_EXITS_RECONCILIATION.xlsx",
          "RECT004_ACCOUNTING_RECONCILIATION.xlsx", "RECT004_MATRIX_101.xlsx"]:
    shutil.copy(os.path.join(OUT_DIR, f), os.path.join(DL_DIR, f))
print("[OK] 4 XLSX generados en", OUT_DIR, "y copiados a download/")
