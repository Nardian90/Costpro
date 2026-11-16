#!/usr/bin/env python3
# ============================================================================
# M064 — CP-FIN-FINAL-VALUATION-EXECUTION-009 · GENERADOR XLSX DEL EXPEDIENTE
# ============================================================================
# Genera los 2 entregables XLSX de la misión 009 a partir de las evidencias
# JSON capturadas por m060/m061/m062/m063 (READ-ONLY, sin acceso a producción):
#   · BEFORE_AFTER_BALANCES.xlsx         — saldos antes/después + asientos
#   · INVENTORY_COST_RECONCILIATION.xlsx — SKU111/112 + salidas + protegidas
# Sistema de diseño: skill xlsx templates/base.py (paleta professional).
# ============================================================================
import sys, os, json

XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from templates.base import (use_palette_explicit, setup_sheet, style_header_row,
                            style_data_row, font_caption, align_number, font_title)

use_palette_explicit("professional")

BASE = "/home/z/my-project/Costpro/docs/audits/cp-fin-valuation-execution-009"
OUT_BAL = os.path.join(BASE, "BEFORE_AFTER_BALANCES.xlsx")
OUT_INV = os.path.join(BASE, "INVENTORY_COST_RECONCILIATION.xlsx")

pre = json.load(open(os.path.join(BASE, "evidencias/m060-preflight-evidencia.json")))
cert = json.load(open(os.path.join(BASE, "evidencias/m063-certificacion-final.json")))
r1 = json.load(open(os.path.join(BASE, "evidencias/m061-rect1-ejecucion.json")))
r2 = json.load(open(os.path.join(BASE, "evidencias/m062-rect2-ejecucion.json")))
r1v = json.load(open(os.path.join(BASE, "evidencias/m061-rect1-postverificacion.json")))
r2v = json.load(open(os.path.join(BASE, "evidencias/m062-rect2-postverificacion.json")))

M_A = pre["baselines"]["mayores_antes"]
M_D = cert["captura"]["mayores_despues"]
CAP = cert["captura"]

NUMFMT = "#,##0.00"

def finish(ws, last_row, last_col):
    for r in range(5, last_row + 1):
        style_data_row(ws, r, 2, last_col, r - 5)
    for r in range(5, last_row + 1):
        for c in range(2, last_col + 1):
            cell = ws.cell(row=r, column=c)
            if isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool):
                cell.number_format = NUMFMT
                cell.alignment = align_number()

# ══════════════════ 1) BEFORE_AFTER_BALANCES.xlsx ════════════════════════════
wb = Workbook()
wb.properties.creator = "Z.ai"

# --- Hoja 1: Resumen ---
ws = wb.active
ws.title = "Resumen"
setup_sheet(ws, title="Misión CP-FIN-FINAL-VALUATION-EXECUTION-009 — Ejecución RECT-1 + RECT-2", last_col=3)
rows = [
    ("Operación", "RECT-1 — corrección del exceso de valoración SKU 111/112", ""),
    ("Importe RECT-1 (CUP)", 151299851.00, "D PAS_CXP_PROV / C ACT_INVENTARIO · reversal_of asiento original"),
    ("Operación", "RECT-2 — reconocimiento de salidas sin asiento", ""),
    ("Importe RECT-2 (CUP)", 24.00, "D GAS_VALES 6 + D GAS_PERDIDA_INV 18 / C ACT_INVENTARIO 24"),
    ("Total ajustado (CUP)", 151299875.00, "Suma de las dos operaciones autorizadas"),
    ("Autorización", "Propietario Nardian90 — misión 009 §1 (expresa e inequívoca)", ""),
    ("Mecanismo", "Runbook RECT004 §5/§6 + addendum T12 · 1 llamada API = 1 transacción atómica", ""),
    ("Ejecución RECT-1 (UTC)", r1["fecha_inicio_utc"], f"entry {r1['ids']['entry']} · HTTP {r1['http_status']}"),
    ("Ejecución RECT-2 (UTC)", r2["fecha_inicio_utc"], f"entry {r2['ids']['entry']} · HTTP {r2['http_status']}"),
    ("Verificación RECT-1", f"{r1v['total']['pass']}/{r1v['total']['pass']+r1v['total']['fail']} PASS", r1v["veredicto"]),
    ("Verificación RECT-2", f"{r2v['total']['pass']}/{r2v['total']['pass']+r2v['total']['fail']} PASS", r2v["veredicto"]),
    ("Certificación final m063", f"{cert['total']['pass']}/{cert['total']['checks']} PASS", cert["veredicto"]),
    ("Nota técnica S3", "Filtro de producto añadido (hallazgo 009)", "Sin filtro tocaría 80 capas — 78 fuera de alcance; alcance económico PRESERVADO"),
]
ws.cell(row=4, column=2, value="Concepto").font = font_caption()
ws.cell(row=4, column=3, value="Detalle").font = font_caption()
r = 5
for a, b, c in rows:
    ws.cell(row=r, column=2, value=a)
    ws.cell(row=r, column=3, value=b if isinstance(b, str) else b)
    if isinstance(b, (int, float)):
        ws.cell(row=r, column=3).number_format = NUMFMT
        ws.cell(row=r, column=3).alignment = align_number()
        ws.cell(row=r, column=2, value=f"{a} (CUP)" if not a.endswith("(CUP)") else a)
    r += 1
style_header_row(ws, 4, 2, 3)
for i in range(5, r):
    style_data_row(ws, i, 2, 3, i - 5)
for i in range(5, r):
    for c in (2, 3):
        ws.cell(row=i, column=c).alignment = Alignment(vertical="top", wrap_text=True)
for col, w in (("B", 30), ("C", 110)):
    ws.column_dimensions[col].width = w

# --- Hoja 2: Saldos antes/después ---
ws2 = wb.create_sheet("Saldos antes-después")
setup_sheet(ws2, title="Mayores contables — antes / ajuste / después (CUP)", last_col=7)
headers = ["Cuenta", "Antes (preflight m060)", "Ajuste RECT-1", "Ajuste RECT-2", "Después esperado", "Después real", "Delta"]
for i, h in enumerate(headers):
    ws2.cell(row=4, column=2 + i, value=h)
style_header_row(ws2, 4, 2, 8)
X_act = pre["baselines"]["X_act"]; X_cxp = pre["baselines"]["X_cxp"]
rows2 = [
    ("ACT_INVENTARIO", X_act, -151299851.00, -24.00, X_act - 151299875, M_D["ACT_INVENTARIO"]["neto"], M_D["ACT_INVENTARIO"]["neto"] - (X_act - 151299875)),
    ("PAS_CXP_PROV", X_cxp, -151299851.00, 0.00, X_cxp - 151299851, M_D["PAS_CXP_PROV"]["neto"], M_D["PAS_CXP_PROV"]["neto"] - (X_cxp - 151299851)),
    ("GAS_VALES", M_A["GAS_VALES"]["neto"], 0.00, 6.00, M_A["GAS_VALES"]["neto"] + 6, M_D["GAS_VALES"]["neto"], M_D["GAS_VALES"]["neto"] - (M_A["GAS_VALES"]["neto"] + 6)),
    ("GAS_PERDIDA_INV", M_A["GAS_PERDIDA_INV"]["neto"], 0.00, 18.00, M_A["GAS_PERDIDA_INV"]["neto"] + 18, M_D["GAS_PERDIDA_INV"]["neto"], M_D["GAS_PERDIDA_INV"]["neto"] - (M_A["GAS_PERDIDA_INV"]["neto"] + 18)),
    ("GAS_COSTO_VENTAS", M_A["GAS_COSTO_VENTAS"]["neto"], 0.00, 0.00, M_A["GAS_COSTO_VENTAS"]["neto"], M_D["GAS_COSTO_VENTAS"]["neto"], M_D["GAS_COSTO_VENTAS"]["neto"] - M_A["GAS_COSTO_VENTAS"]["neto"]),
]
r = 5
for row in rows2:
    for i, v in enumerate(row):
        ws2.cell(row=r, column=2 + i, value=v)
    r += 1
finish(ws2, r - 1, 8)
note = ws2.cell(row=r + 1, column=2, value="Convención: ACT/GAS = débito positivo; PAS_CXP_PROV = crédito positivo (igual que el preflight m060). GAS_VALES/GAS_PERDIDA_INV/GAS_COSTO_VENTAS = saldos globales de la tienda (la porción 111/112 se detalla en INVENTORY_COST_RECONCILIATION). Deltas < 0.01 = redondeo numérico.")
note.font = font_caption(); note.alignment = Alignment(wrap_text=True, vertical="top")
ws2.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=8)
ws2.column_dimensions["B"].width = 22

# --- Hoja 3: Asientos ---
ws3 = wb.create_sheet("Asientos de la FVC")
setup_sheet(ws3, title="Partida doble — recepción FAC-VITALLCONS-001 (3 asientos, todos D=C)", last_col=7)
headers3 = ["Asiento", "Fecha económica", "Cuenta", "Debe (CUP)", "Haber (CUP)", "Enlace"]
for i, h in enumerate(headers3):
    ws3.cell(row=4, column=2 + i, value=h)
style_header_row(ws3, 4, 2, 7)
ORIG = "93bb5da9-0afd-4325-baad-a275710062c5"
E1 = r1["ids"]["entry"]; E2 = r2["ids"]["entry"]
p1 = [m for m in CAP["entries_fvc"] if m["id"] == E1][0]["posted_at"]
p2 = [m for m in CAP["entries_fvc"] if m["id"] == E2][0]["posted_at"]
rows3 = [
    ("ORIGINAL 93bb5da9 (reconocimiento, posted, INTACTO)", "2026-07-01", "ACT_INVENTARIO", 192039436.00, None, "—"),
    ("ORIGINAL 93bb5da9", "2026-07-01", "PAS_CXP_PROV", None, 192039436.00, "—"),
    ("RECT-1 " + E1, "2026-07-01", "PAS_CXP_PROV", 151299851.00, None, f"reversal_of={ORIG}"),
    ("RECT-1", "2026-07-01", "ACT_INVENTARIO", None, 151299851.00, f"posted {p1[:19]}"),
    ("RECT-2 " + E2, "2026-11-15", "GAS_VALES", 6.00, None, "VS-37/138/139 (6 u)"),
    ("RECT-2", "2026-11-15", "GAS_PERDIDA_INV", 18.00, None, "cuadre Δ−1 (111) + Δ−17 (112)"),
    ("RECT-2", "2026-11-15", "ACT_INVENTARIO", None, 24.00, f"posted {p2[:19]}"),
]
r = 5
for row in rows3:
    for i, v in enumerate(row):
        ws3.cell(row=r, column=2 + i, value=v)
    r += 1
finish(ws3, r - 1, 7)
ws3.cell(row=r + 1, column=2, value="Todos los asientos: balance_debe = 0.00 exacto (m063 R2). Asiento original sin alterar (W5/m061 V4).").font = font_caption()
ws3.column_dimensions["B"].width = 52; ws3.column_dimensions["G"].width = 30

wb.save(OUT_BAL)
print(f"OK {OUT_BAL}")

# ══════════════════ 2) INVENTORY_COST_RECONCILIATION.xlsx ════════════════════
wb2 = Workbook()
wb2.properties.creator = "Z.ai"

# --- Hoja 1: SKU 111/112 ---
wsi = wb2.active
wsi.title = "SKU 111-112"
setup_sheet(wsi, title="Reconciliación de costos de inventario — SKU 111 / 112 (costo real 1 CUP/u)", last_col=8)
headers_i = ["Concepto", "SKU 111", "SKU 112", "Nota"]
for i, h in enumerate(headers_i):
    wsi.cell(row=4, column=2 + i, value=h)
style_header_row(wsi, 4, 2, 5)
rows_i = [
    ("Unidades recibidas (FAC-VITALLCONS-001)", 49, 100, "líneas del alcance"),
    ("Costo unitario ANTES (CUP-equivalente)", 1700000.00, 680000.00, "2.500/1.000 USD × tasa 680 — precio de venta importado como costo"),
    ("Costo unitario DESPUÉS (CUP)", 1.00, 1.00, "costo real confirmado por el propietario"),
    ("Capas de compra kardex ANTES", 1700000.00, 680000.00, "S3 corregido (con filtro de producto)"),
    ("Capas de compra kardex DESPUÉS", 1.00, 1.00, "2 filas exactas"),
    ("WAC antes / después (CUP)", 1.00, 1.00, "invariable — ya saneado (wac_correction previo)"),
    ("Salidas totales (unidades)", 39, 81, "21 movimientos en el kardex"),
    ("Salidas uc=0 ANTES (unidades)", 3, 23, "7 filas / 26 u en total"),
    ("Salidas uc=0 DESPUÉS", 0, 0, "T1 valorizó las 7 filas"),
    ("Existencias (stock = inventario)", 10, 20, "sin alteración de cantidades"),
    ("Kardex valorizado DESPUÉS (CUP)", 10.00, 20.00, "30,00 total = valor en libros (m063 R4)"),
    ("Precio de venta (maestro)", 2000.00, 1000.00, "2000 CUP / 1000 USD — SIN alteración (m063 R7)"),
    ("COGS motor de las 5 ventas (CUP)", 7.00, None, "INTACTO — 0 GAS_COSTO_VENTAS nuevo (m063 R5)"),
]
r = 5
for row in rows_i:
    for i, v in enumerate(row):
        wsi.cell(row=r, column=2 + i, value=v)
    r += 1
finish(wsi, r - 1, 5)
wsi.column_dimensions["B"].width = 40; wsi.column_dimensions["E"].width = 60

# --- Hoja 2: Salidas valorizadas ---
wsj = wb2.create_sheet("Salidas valorizadas RECT-2")
setup_sheet(wsj, title="Las 7 salidas uc=0 → uc=1 (26 unidades · 24 CUP contabilizados + 2 ventas con COGS previo)", last_col=7)
headers_j = ["Movimiento (id)", "Tipo", "Documento", "SKU", "Unidades", "uc ANTES", "uc DESPUÉS"]
for i, h in enumerate(headers_j):
    wsj.cell(row=4, column=2 + i, value=h)
style_header_row(wsj, 4, 2, 8)
rows_j = [
    ("68a3ff08-a301-4232-937a-85f183452d5c", "sale", "Venta POS v2 (2026-07-24)", "111", 1, 0.00, 1.00),
    ("673ede95-75cc-4c4e-aa19-1dc893c5cd79", "sale", "Venta POS v2 (2026-10-04)", "111", 1, 0.00, 1.00),
    ("a1330957-1e49-43ed-a309-c7a20c2ee714", "adjustment", "Cuadre importación Δ−1", "111", 1, 0.00, 1.00),
    ("a8a82720-df49-485d-949c-acfc082fc3b6", "adjustment", "Cuadre importación Δ−17", "112", 17, 0.00, 1.00),
    ("335e2fcc-f4d3-426b-a7ff-878af184acab", "issue_slip_out", "VS-000037-2026", "112", 4, 0.00, 1.00),
    ("9d47f6c1-756a-4e0f-9e56-85d1dc2ca557", "issue_slip_out", "VS-000138-2026", "112", 1, 0.00, 1.00),
    ("25db100f-9238-45b4-b53e-c3559eb60651", "issue_slip_out", "VS-000139-2026", "111", 1, 0.00, 1.00),
]
r = 5
for row in rows_j:
    for i, v in enumerate(row):
        wsj.cell(row=r, column=2 + i, value=v)
    r += 1
# fila de totales
wsj.cell(row=r, column=2, value="TOTAL")
wsj.cell(row=r, column=6, value=26)
wsj.cell(row=r, column=7, value=0.00)
wsj.cell(row=r, column=8, value=26.00)
tot_row = r
r += 1
finish(wsj, r - 1, 8)
for c in range(2, 9):
    wsj.cell(row=tot_row, column=c).font = Font(bold=True, name=wsj.cell(row=tot_row, column=c).font.name)
note = wsj.cell(row=r + 1, column=2, value="Las 2 ventas (2 u) ya tenían COGS reconocido por el motor (2 de los 7 CUP): no se contabilizan de nuevo. RECT-2 contabiliza 24 CUP: D GAS_VALES 6 (vales) + D GAS_PERDIDA_INV 18 (cuadre) / C ACT_INVENTARIO 24. VS-000223 (par neto 0) NO se contabiliza. Totales escritos como valores calculados (verificación programática).")
note.font = font_caption(); note.alignment = Alignment(wrap_text=True, vertical="top")
wsj.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=8)
wsj.column_dimensions["B"].width = 44; wsj.column_dimensions["D"].width = 30

# --- Hoja 3: Líneas protegidas ---
wsp = wb2.create_sheet("Líneas protegidas")
setup_sheet(wsp, title="Protección del alcance — líneas de la recepción NO tocadas (m063 R8: 99/99 idénticas al congelado)", last_col=6)
headers_p = ["Grupo protegido", "Líneas", "Control", "Resultado"]
for i, h in enumerate(headers_p):
    wsp.cell(row=4, column=2 + i, value=h)
style_header_row(wsp, 4, 2, 5)
rows_p = [
    ("Costos no verificables (71 líneas)", 71, "hash por línea vs snapshot congelado m050b", "INTACTAS"),
    ("Discrepancias de moneda (SKU 90/92/999/120)", 4, "valores exactos uc/moneda/tasa", "INTACTAS"),
    ("Costos legítimos confirmados", 18, "hash por línea", "INTACTAS"),
    ("Sin problema", 6, "hash por línea", "INTACTAS"),
    ("TOTAL líneas fuera del alcance", 99, "comparación exhaustiva id a id", "99/99 IDÉNTICAS"),
    ("Precios de venta maestros", 2, "2000 CUP (111) · 1000 USD (112)", "SIN ALTERACIÓN"),
    ("Cantidades físicas de inventario", 2, "10 u / 20 u (stock = inventario)", "SIN ALTERACIÓN"),
    ("Transacciones comerciales ajenas", "—", "asientos posteriores al preflight", "0 (sin actividad viva en la ventana)"),
    ("Valoración preliminar recepción completa", "101", "40.739.585,00 CUP tras RECT-1", "NO es certificación de las 101 líneas"),
]
r = 5
for row in rows_p:
    for i, v in enumerate(row):
        c = wsp.cell(row=r, column=2 + i, value=v)
    r += 1
for i in range(5, r):
    style_data_row(wsp, i, 2, 5, i - 5)
wsp.cell(row=r + 1, column=2, value="Las 4 discrepancias de moneda conservan sus valores exactos: SKU 999 1 CUP@1 · SKU 90 5 USD@680 · SKU 120 1 CUP@1 · SKU 92 1 CUP@1 (m063 R8).").font = font_caption()
wsp.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=5)
wsp.column_dimensions["B"].width = 44; wsp.column_dimensions["D"].width = 44; wsp.column_dimensions["E"].width = 34

wb2.save(OUT_INV)
print(f"OK {OUT_INV}")
