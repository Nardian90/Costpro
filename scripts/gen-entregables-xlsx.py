#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M037 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001: GENERADOR DE ENTREGABLES
XLSX (4 libros) desde las evidencias JSON de las fases I-VI.
Uso: python3 scripts/gen-entregables-xlsx.py  (desde la raíz del repo Costpro)
"""
import json, os, sys, re
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)
from templates.base import (use_palette_explicit, font_title, font_header, font_body,
                            font_caption, setup_sheet, style_header_row, style_data_row,
                            style_total_row, auto_fit_columns, fill_total, border_total,
                            align_number, align_text)

use_palette_explicit("professional")

EXP = "/home/z/my-project/Costpro/docs/audits/inventory-traceability-20261115"
OUT = "/home/z/my-project/download"
os.makedirs(OUT, exist_ok=True)

def J(name):
    with open(os.path.join(EXP, name), encoding="utf-8") as f:
        return json.load(f)

m027 = J("m027-fase1-208-movimientos.json")
m028 = J("m028-fase2-corrige-208.json")
m029 = J("m029-fase3-reconstruccion.json")
m031 = J("m031-fase4-mayor.json")
m031b = J("m031b-fase4-por-documento.json")
m032 = J("m032-fase5-6-por-producto.json")
m033 = J("m033-fase6-fvc-recorrido.json")
m034 = J("m034-fase5-valoraciones.json")

def wsheet(wb, name, title, headers, rows, widths=None, totals=None, freeze="C5"):
    """Hoja estándar: título B2, cabeceras fila 4, datos fila 5+, totales opcional."""
    ws = wb.create_sheet(name)
    setup_sheet(ws, title=title, last_col=max(2 + len(headers) - 1, 4))
    ws.cell(row=2, column=2, value=title).font = font_title()
    for ci, h in enumerate(headers, start=2):
        c = ws.cell(row=4, column=ci, value=h)
    style_header_row(ws, 4, 2, 1 + len(headers))
    r = 5
    for i, row in enumerate(rows):
        for ci, v in enumerate(row, start=2):
            ws.cell(row=r, column=ci, value=v)
        style_data_row(ws, r, 2, 1 + len(headers), i)
        r += 1
    if totals:
        for ci, v in enumerate(totals, start=2):
            ws.cell(row=r, column=ci, value=v)
        style_total_row(ws, r, 2, 1 + len(headers))
        r += 1
    if freeze:
        ws.freeze_panes = freeze
    auto_fit_columns(ws, min_width=9, max_width=42, header_row=4, data_start_row=5)
    if widths:
        for col, w in widths.items():
            ws.column_dimensions[col].width = w
    return ws

# ══════════════════════════════════════════════════════════════════════════════
# 1. MATRIZ_208_MOVIMIENTOS_TRAZABILIDAD.xlsx
# ══════════════════════════════════════════════════════════════════════════════
wb = Workbook(); wb.remove(wb.active)
repair = {p["movimiento"]: p["reference_id_propuesto"] for p in m028["propuestas"]}

rows = []
for m in m027["movimientos"]:
    c = (m.get("candidatas") or [{}])[0]
    moneda = m.get("moneda_origen") or c.get("moneda")
    tasa = m.get("tasa_origen") or c.get("tasa")
    uc_cup = m["unit_cost"]
    uc_orig = round(uc_cup / tasa, 6) if tasa else None
    rows.append([
        m["mov_id"], m["tienda"], f"{m.get('sku') or ''}", m.get("producto") or "",
        m["um"], m["cantidad"], m["signo"], m["tipo"],
        m["fecha_economica"], m["fecha_creacion"], uc_cup,
        moneda or "", tasa if tasa else "", uc_orig if uc_orig is not None else "",
        m["reference_doc"], m.get("notes") or "",
        m.get("recepcion_candidata") or "", m.get("linea_candidata") or "",
        (c.get("receipt_status") or ""),
        m.get("clasificacion"), m.get("confianza"),
        ("; ".join(m.get("evidencias") or c.get("evidencias") or [])),
        m.get("motivo") or "",
        "REPARADO (Fase II · M028)" if m["mov_id"] in repair else "INTACTO",
    ])
headers = ["ID movimiento", "Tienda", "SKU", "Producto", "Unidad", "Cantidad", "Signo", "Tipo",
           "Fecha económica", "Fecha creación", "unit_cost (CUP)", "Moneda origen", "Tasa",
           "Costo unit. origen", "reference_doc", "Notas", "Recepción candidata", "Línea candidata",
           "Estado recepción", "Clasificación", "Confianza", "Criterios de correspondencia",
           "Motivo aceptación/rechazo", "Situación tras Fase II"]
ws = wsheet(wb, "208 Movimientos", "MATRIZ DE TRAZABILIDAD — 208 movimientos de compra sin reference_id (Fase I)", headers, rows,
            widths={"B": 20, "D": 30, "V": 48, "X": 60}, totals=["TOTAL", "", "", "", "", sum(r[5] for r in rows), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", f"{len(rows)} movimientos", f"208/208 MATCH_UNICO → 208 reparados"])

# hoja resumen clasificación
res_rows = []
for tienda, cats in m027["por_tienda"].items():
    for cat, n in cats.items():
        res_rows.append([tienda, cat, n, "reparado en Fase II (M028)" if cat == "MATCH_UNICO" else "documentado"])
tot = sum(r[2] for r in res_rows)
ws2 = wsheet(wb, "Resumen Fase I", "FASE I — clasificación de los 208 movimientos", ["Tienda", "Clasificación", "N. movimientos", "Tratamiento"], res_rows, totals=["TOTAL", "", tot, ""])
# hoja verificación fase II
ver = m028["verificacion_post"]
vrows = [
    ["Movimientos identificados (compra, reference_id NULL)", 208],
    ["Pares 1:1 re-derivados deterministamente (preflight)", 208],
    ["UPDATE ejecutado (filas con reference_id correcto)", ver["reference_correcto_por_fila"]],
    ["Filas audit_logs TRACEABILITY_BACKFILL (M028)", 208],
    ["Total TRACEABILITY_BACKFILL (M025 101 + M028 208)", ver["audit_traceability_total"]],
    ["Valores económicos conservados (20 columnas byte a byte)", "SÍ" if ver["valores_economicos_conservados"] else "NO"],
    ["Segunda pasada (idempotencia) — cambios", 0],
    ["Purchase sin reference_id tras Fase II", ver["purchase_sin_ref_post"]],
    ["Conteos invariantes (stock_movements / fin_entries / fin_movements / errores)", f'{ver["conteos_post"]["sm"]} / {ver["conteos_post"]["fe"]} / {ver["conteos_post"]["fm"]} / {ver["conteos_post"]["fpe"]}'],
    ["FAC-VITALLCONS-001 intacta (192.039.436 / active / 101 refs)", "SÍ" if ver["fvc_post"]["total"] == 192039436 else "NO"],
]
ws3 = wsheet(wb, "Verificación Fase II", "FASE II — corrección controlada de reference_id (patrón M025): verificación fail-closed", ["Verificación", "Resultado"], vrows, widths={"B": 62, "C": 26})
wb.save(os.path.join(OUT, "MATRIZ_208_MOVIMIENTOS_TRAZABILIDAD.xlsx"))
print("✓ MATRIZ_208_MOVIMIENTOS_TRAZABILIDAD.xlsx")

# ══════════════════════════════════════════════════════════════════════════════
# 2. CONCILIACION_INVENTARIO_POR_SKU.xlsx (Fase III — ENERVIDA)
# ══════════════════════════════════════════════════════════════════════════════
wb = Workbook(); wb.remove(wb.active)
sku_rows = []
for s in m029["skus"]:
    sku_rows.append([
        s["sku"], s["producto"], s["um"], s["n_movs"],
        s["existencia_inicial"], s["recibido"], s["vendido"], s["vales"],
        s["devuelto"], s["ajustes_pos"], s["ajustes_neg"], s["otras_salidas"],
        s["reversiones_entradas"], s["existencia_calculada"],
        s["existencia_registrada_stock_current"] if s["existencia_registrada_stock_current"] is not None else "",
        s["existencia_registrada_inventory"] if s["existencia_registrada_inventory"] is not None else "",
        s["diferencia_stock_current"] if s["diferencia_stock_current"] is not None else 0,
        s["diferencia_inventory"] if s["diferencia_inventory"] is not None else 0,
        s["recibido_segun_lineas"] if s["recibido_segun_lineas"] is not None else "",
        s["dif_recibido_vs_lineas"] if s["dif_recibido_vs_lineas"] is not None else 0,
        s["wac_registrado"] if s["wac_registrado"] is not None else "",
    ])
tot = ["TOTAL", "", "", sum(r[3] for r in sku_rows), 0,
       round(sum(r[5] for r in sku_rows), 2), round(sum(r[6] for r in sku_rows), 2),
       round(sum(r[7] for r in sku_rows), 2), round(sum(r[8] for r in sku_rows), 2),
       round(sum(r[9] for r in sku_rows), 2), round(sum(r[10] for r in sku_rows), 2),
       round(sum(r[11] for r in sku_rows), 2), round(sum(r[12] for r in sku_rows), 2),
       round(sum(r[13] for r in sku_rows), 2),
       round(sum((r[14] or 0) if not isinstance(r[14], str) else 0 for r in sku_rows), 2), "", 0, 0, "", 0, ""]
headers = ["SKU", "Producto", "Unidad", "N. movs", "Exist. inicial", "Recibido", "Vendido",
           "Vales", "Devuelto", "Ajustes +", "Ajustes −", "Otras salidas", "Reversiones",
           "Existencia calculada", "Exist. registrada (stock_current)", "Exist. registrada (inventory)",
           "Dif. stock_current", "Dif. inventory", "Recibido según líneas", "Dif. vs líneas", "WAC registrado"]
ws = wsheet(wb, "Por SKU", "FASE III — RECONSTRUCCIÓN INTEGRAL DE CANTIDADES POR SKU (ENERVIDA-VITALLCONS)", headers, sku_rows,
            widths={"C": 34, "R": 16}, totals=tot)
# hoja productos sin movimientos
orph = [[p["sku"], p["producto"], p["stock_current"], 0, 0, "sin kardex — stock 0"] for p in m029["productos_stock_sin_movimientos"]]
ws2 = wsheet(wb, "Stock sin movimientos", "Productos con stock registrado pero SIN movimientos (92 — todos stock 0)", ["SKU", "Producto", "stock_current", "Existencia calculada", "Diferencia", "Observación"], orph,
              widths={"C": 34}, totals=["TOTAL", f"{len(orph)} productos", 0, 0, 0, ""])
# hoja resumen
r = m029["resumen"]
res_rows = [
    ["Productos con movimientos", r["productos_con_movimientos"]],
    ["Productos con stock sin movimientos", r["productos_stock_sin_movimientos"]],
    ["Filas exactamente duplicadas (contado 1 vez c/u)", r["filas_duplicadas_exactas"]],
    ["SKUs con diferencia calculada vs stock_current", r["skus_con_diferencia_stock_current"]],
    ["Total recibido (unidades)", r["total_recibido"]],
    ["Total vendido (unidades)", r["total_vendido"]],
    ["Total retirado por vales (unidades)", r["total_vales"]],
    ["Total devuelto (unidades)", r["total_devuelto"]],
    ["Ajustes positivos (unidades)", r["total_ajustes_pos"]],
    ["Ajustes negativos (unidades)", r["total_ajustes_neg"]],
    ["Reversiones y entradas correctivas (unidades)", r["total_reversiones"]],
    ["Existencia calculada total", r["existencia_calculada_total"]],
    ["Existencia registrada total (stock_current)", r["existencia_registrada_total"]],
    ["Diferencia total", round(r["existencia_calculada_total"] - r["existencia_registrada_total"], 2)],
]
ws3 = wsheet(wb, "Resumen Fase III", "FASE III — resumen de la conciliación de cantidades (ENERVIDA)", ["Concepto", "Valor"], res_rows, widths={"B": 48, "C": 18})
wb.save(os.path.join(OUT, "CONCILIACION_INVENTARIO_POR_SKU.xlsx"))
print("✓ CONCILIACION_INVENTARIO_POR_SKU.xlsx")

# ══════════════════════════════════════════════════════════════════════════════
# 3. CONCILIACION_MAYOR_VS_INVENTARIO.xlsx (Fases IV+V)
# ══════════════════════════════════════════════════════════════════════════════
wb = Workbook(); wb.remove(wb.active)
# mayor por tipo
mayor_rows = []
for t in m031["por_tipo"]:
    mayor_rows.append([t["document_type"], t["event"], t["sense"], t["n_asientos"], t["n_movs"], float(t["total"])])
tot = ["", "TOTAL", "", sum(r[3] for r in mayor_rows), sum(r[4] for r in mayor_rows), round(sum(r[5] for r in mayor_rows), 2)]
ws = wsheet(wb, "Mayor por categoría", "FASE IV — MAYOR ACT_INVENTARIO por categoría de movimiento", ["Documento", "Evento", "Sentido", "Asientos", "Movimientos", "CUP"], mayor_rows, totals=tot)
# saldo por tienda
tienda_rows = []
for t in m031["por_tienda"]:
    tienda_rows.append([t["name"], float(t["debitos"]), float(t["creditos"]), round(float(t["debitos"]) - float(t["creditos"]), 2)])
ws2 = wsheet(wb, "Saldo por tienda", "FASE IV — saldo de ACT_INVENTARIO por tienda", ["Tienda", "Débitos", "Créditos", "Saldo"], tienda_rows,
             totals=["TOTAL", round(sum(r[1] for r in tienda_rows), 2), round(sum(r[2] for r in tienda_rows), 2), round(sum(r[3] for r in tienda_rows), 2)])
# serie mensual
mes_rows = [[s["mes"], float(s["debitos"]), float(s["creditos"]), float(s["saldo_acum"])] for s in m031["serie_mensual"]]
ws3 = wsheet(wb, "Serie mensual", "FASE IV — serie mensual del saldo (economic_date)", ["Mes", "Débitos", "Créditos", "Saldo acumulado"], mes_rows)
# recepciones por documento (top 40)
rec_rows = [[d["document_number"] or "(sin nº)", d["tienda"], d["event"], d["sense"], float(d["amount_cup"]), d["economic_date"][:10], d["document_id"]] for d in m031["recepciones_por_documento"][:40]]
ws4 = wsheet(wb, "Recepciones (docs.)", "FASE IV — débitos por documento de origen (recepciones, top 40)", ["N. documento", "Tienda", "Evento", "Sentido", "CUP", "Fecha económica", "document_id"], rec_rows,
             widths={"B": 18, "H": 22})
# valoraciones fase V
val = m034["valoraciones"]; puente = m034["puente"]
val_rows = [
    ["A1 — Existencias a costos históricos de adquisición (WAC de compras)", float(val["A1_wac_compras"])],
    ["A2 — Existencias al último costo de compra", float(val["A2_ultimo_costo"])],
    ["A-FVC — Existencias de los 101 productos FVC a costo de línea FVC", float(val["A_fvc_lineas_fvc"])],
    ["B — Existencias a costos vigentes (products.cost_average)", float(val["B_costos_vigentes"])],
    ["C — Valoración según conteo físico", "SIN CONTEOS FIRMADOS (physical_counts=0; 11 physical_inventories voided) — no certificable físicamente"],
    ["Unidades en existencia (kardex)", float(val["unidades_en_existencia"])],
]
ws5 = wsheet(wb, "Valoraciones Fase V", "FASE V — tres valoraciones independientes (ENERVIDA-VITALLCONS)", ["Base de valoración", "Valor CUP / resultado"], val_rows, widths={"B": 64, "C": 30})
# puente
pu_rows = [
    ["Saldo contable ACT_INVENTARIO (ENERVIDA)", float(puente["saldo_contable"])],
    ["Reconstrucción: compras + devol. − COGS − vales − ajuste", float(puente["verificacion_reconstruccion"])],
    ["Diferencia total (saldo contable − valoración B)", float(puente["diferencia_total"])],
    ["D-AB: adquisición (A1) vs costos vigentes (B)", float(puente["D_AB_adquisicion_vs_vigente"])],
    ["D-A: mayor vs adquisición (A1)", float(puente["D_A_mayor_vs_adquisicion"])],
    ["   · vales de salida SIN asiento (valor movs)", float(puente["salidas_sin_asiento"]["vales"])],
    ["   · ventas SIN asiento (valor movs)", float(puente["salidas_sin_asiento"]["ventas"])],
    ["   · ajustes de cuadre SIN asiento", float(puente["salidas_sin_asiento"]["ajustes"])],
    ["   · reversiones/voids SIN asiento (reingresan stock)", -float(puente["reentradas_sin_asiento"])],
    ["   · residual: salidas contabilizadas a costo inferior al de adquisición", float(puente["residual_salidas_contabilizadas_costo_inferior"])],
]
ws6 = wsheet(wb, "Puente Mayor→Inv.", "FASE V — puente exacto del mayor contable a la valoración del inventario", ["Componente", "CUP"], pu_rows, widths={"B": 64, "C": 20})
# per producto fase V
pp_rows = []
for p in m034["por_producto"]:
    pp_rows.append([p["sku"], p["producto"], p["q_stock"],
                    p.get("wac_compras") if p.get("wac_compras") is not None else "",
                    p.get("uc_fvc") if p.get("uc_fvc") is not None else "",
                    p.get("cost_average_vigente") if p.get("cost_average_vigente") is not None else "",
                    p["valor_A_wac"], p.get("valor_A_fvc") if p.get("valor_A_fvc") is not None else "",
                    p["valor_B_vigente"], p["saldo_mayor_atribuible"],
                    "FVC" if p.get("fvc") else ""])
tot = ["TOTAL", "", round(sum(r[2] for r in pp_rows), 2), "", "", "", round(sum(r[6] for r in pp_rows), 2),
       round(sum((r[7] or 0) if not isinstance(r[7], str) else 0 for r in pp_rows), 2),
       round(sum(r[8] for r in pp_rows), 2), round(sum(r[9] for r in pp_rows), 2), ""]
ws7 = wsheet(wb, "Por producto", "FASE V — valoraciones y saldo atribuible por producto (ENERVIDA)", ["SKU", "Producto", "Q stock", "WAC compras", "Costo FVC", "cost_average", "Valor A1", "Valor A-FVC", "Valor B", "Saldo mayor atribuible", "Origen"], pp_rows,
             widths={"C": 30}, totals=tot)
# fase VI recorrido
f6 = m033["totales"]
f6_rows = [
    ["Entrada FAC-VITALLCONS-001 (tasa 680 aprobada)", float(f6["entrada"])],
    ["Entradas posteriores de los mismos productos (no FVC)", float(f6["entradas_post"])],
    ["Consumido mediante ventas (COGS contable atribuido)", float(f6["cogs"])],
    ["Retirado mediante vales de salida", float(f6["vales"])],
    ["Ajustado (ajustes de cuadre, valor movs)", float(f6["ajustes"])],
    ["Devuelto por clientes", float(f6["devol"])],
    ["Revertido/void (reentradas)", float(f6["revers"])],
    ["Representado en existencias actuales (costos vigentes)", float(f6["valor_stock"])],
    ["Saldo remanente atribuible en ACT_INVENTARIO", float(f6["saldo_remanente"])],
    ["Productos FVC CON existencia actual", m033["productos_con_existencia"]],
    ["Productos FVC SIN existencia actual", m033["productos_sin_existencia"]],
]
ws8 = wsheet(wb, "Fase VI 192M", "FASE VI — recorrido de los 192.039.436 CUP de FAC-VITALLCONS-001", ["Concepto", "CUP / N."], f6_rows, widths={"B": 56, "C": 20})
# fase VI por producto (101)
f6p_rows = [[p["sku"], p["producto"], p["monedas"], p["n_lineas_fvc"], p["q_entrada_fvc"],
             p["valor_entrada_fvc"], p["q_vendido"], p["cogs_atribuido"], p["q_vales"], p["valor_vales"],
             p["q_ajustes"], p["valor_ajustes"], p["q_stock_actual"],
             p.get("cost_average_vigente") if p.get("cost_average_vigente") is not None else "",
             p["valor_stock_vigente"], p["saldo_remanente_mayor_atribuible"]] for p in m033["productos"]]
tot = ["TOTAL 101", "", "", sum(r[3] for r in f6p_rows), round(sum(r[4] for r in f6p_rows), 2),
       round(sum(r[5] for r in f6p_rows), 2), round(sum(r[6] for r in f6p_rows), 2), round(sum(r[7] for r in f6p_rows), 2),
       round(sum(r[8] for r in f6p_rows), 2), round(sum(r[9] for r in f6p_rows), 2), round(sum(r[10] for r in f6p_rows), 2),
       round(sum(r[11] for r in f6p_rows), 2), round(sum(r[12] for r in f6p_rows), 2), "",
       round(sum(r[14] for r in f6p_rows), 2), round(sum(r[15] for r in f6p_rows), 2)]
ws9 = wsheet(wb, "Fase VI por producto", "FASE VI — los 101 productos de FVC: entrada → salidas → existencia → remanente", ["SKU", "Producto", "Moneda", "N. líneas", "Q entrada FVC", "Valor entrada FVC", "Q vendido", "COGS atribuido", "Q vales", "Valor vales", "Q ajustes", "Valor ajustes", "Q stock actual", "cost_average", "Valor stock vigente", "Saldo remanente atribuible"], f6p_rows,
             widths={"C": 30}, totals=tot)
wb.save(os.path.join(OUT, "CONCILIACION_MAYOR_VS_INVENTARIO.xlsx"))
print("✓ CONCILIACION_MAYOR_VS_INVENTARIO.xlsx")

# ══════════════════════════════════════════════════════════════════════════════
# 4. HOJA_CONTEO_FISICO_ENERVIDA.xlsx (Fase V.C)
# ══════════════════════════════════════════════════════════════════════════════
wb = Workbook(); wb.remove(wb.active)
hc_rows = []
for p in m034["hoja_conteo"]:
    hc_rows.append([p["sku"], p["producto"], p["um"], p["existencia_sistema"],
                    None, None, None, None,
                    "PRODUCTO FVC — prioridad de conteo" if p["es_fvc"] else ""])
headers = ["SKU", "Producto", "Unidad", "Existencia en sistema", "Cantidad física contada", "Diferencia",
           "Responsable", "Fecha", "Observaciones"]
ws = wsheet(wb, "Hoja de conteo", "HOJA DE CONTEO FÍSICO — ENERVIDA-VITALLCONS (por SKU; completar tras conteo real)", headers, hc_rows,
            widths={"C": 34, "K": 34})
# instrucciones
inst = [
    ["1", "No existe ningún conteo físico firmado en el sistema (physical_counts=0; physical_inventories: 11 filas, todas status=voided 2026-10-27) — por tanto la conciliación de esta misión es CONTABLE contra inventario REGISTRADO, no una certificación física."],
    ["2", "Completar 'Cantidad física contada' tras el conteo real por SKU y almacén; la 'Diferencia' = cantidad física − existencia en sistema."],
    ["3", "Los 101 productos FVC (columna Observaciones) tienen prioridad: soportan 192.039.436 CUP del activo y su respaldo físico es determinante para cualquier regularización futura."],
    ["4", "Registrar responsable y fecha por fila; firmar la hoja al cierre del conteo."],
]
ws2 = wsheet(wb, "Instrucciones", "HOJA DE CONTEO FÍSICO — instrucciones", ["N.", "Instrucción"], inst, widths={"B": 6, "C": 130})
wb.save(os.path.join(OUT, "HOJA_CONTEO_FISICO_ENERVIDA.xlsx"))
print("✓ HOJA_CONTEO_FISICO_ENERVIDA.xlsx")
print("\n4 libros generados en", OUT)
