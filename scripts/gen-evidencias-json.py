#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""M038 — Ensambla los entregables EVIDENCIA_208_MOVIMIENTOS.json y
EVIDENCIA_ACT_INVENTARIO.json desde las evidencias de fase (m026-m034)."""
import json, os

EXP = "/home/z/my-project/Costpro/docs/audits/inventory-traceability-20261115"
OUT = "/home/z/my-project/download"

def J(name):
    with open(os.path.join(EXP, name), encoding="utf-8") as f:
        return json.load(f)

m026 = J("m026-verificacion-inicial.json")
m027 = J("m027-fase1-208-movimientos.json")
m028 = J("m028-fase2-corrige-208.json")
m028b = J("m028-fase2-corrige-208.json")  # actualizado por m028b
m029 = J("m029-fase3-reconstruccion.json")
m031 = J("m031-fase4-mayor.json")
m031b = J("m031b-fase4-por-documento.json")
m032 = J("m032-fase5-6-por-producto.json")
m033 = J("m033-fase6-fvc-recorrido.json")
m034 = J("m034-fase5-valoraciones.json")

# ═════════ EVIDENCIA_208_MOVIMIENTOS.json ═════════
ev208 = {
    "mision": "CP-INVENTORY-TRACEABILITY-RECONCILIATION-001",
    "titulo": "Evidencia integral de la reconciliación y reparación de trazabilidad de los 208 movimientos de compra históricos sin reference_id",
    "generado": m028["generado"],
    "punto_de_partida": {
        "informe_previo": "M024 (CP-RECEIPT-INTEGRITY-001) identificó 208 movimientos de compra sin reference_id de otras recepciones",
        "verificacion_actual_m026": {
            "purchase_total": m026["total_purchase"][0],
            "sin_reference_por_tienda": m026["purchase_sin_ref_por_tienda"],
            "conteos_base": m026["conteos"][0],
            "fvc_intacta": m026["fvc"][0],
            "fvc_asientos": m026["fvc_asientos"][0]["n"],
            "movs_ref_fvc": m026["fvc_refs"][0]["n"],
        },
    },
    "fase_I_analisis": {
        "universo": m027["universo"],
        "criterios": m027["criterios"],
        "clasificacion": m027["clasificacion"],
        "por_tienda": m027["por_tienda"],
        "cobertura_lineas": m027["cobertura_lineas"],
        "metodo": "Emparejamiento por identidad de producto + cantidad (±1e-6) + costo CUP convertido exacto (±0,005) + tienda + fecha económica y de creación exactas + correspondencia 1:1 global; desambiguación temporal de 8 casos (fecha económica + fecha de creación EXACTAS); regla §3: producto+fecha solos no bastan con varias compras del mismo producto",
        "resultado": "208/208 MATCH_UNICO; 0 MATCH_AMBIGUO; 0 SIN_COINCIDENCIA; 0 líneas sin movimiento; 0 líneas reclamadas por >1 movimiento; 97/97 recepciones no-FVC cubiertas; dif. de costo máxima = 0,00 CUP",
        "detalle_por_movimiento": m027["movimientos"],
    },
    "fase_II_correccion_controlada": {
        "autorizacion": "misión §5: actualizar únicamente reference_id con correspondencia única demostrada",
        "preflight": m028["preflight"],
        "backup_logico": "m028-backup-logico-208-filas.json (23 columnas × 208 filas, estado previo completo)",
        "ejecucion": m028["ejecucion"],
        "auditoria": m028["auditoria"],
        "verificacion_post": m028["verificacion_post"],
        "segunda_pasada": m028.get("segunda_pasada"),
        "reversibilidad": "m028-restore.sql (BEGIN/COMMIT con guard idempotente por fila) + audit_logs.metadata.reversible por movimiento (UPDATE ... SET reference_id=NULL WHERE id=... AND reference_id=...)",
        "propuestas_anterior_propuesto": m028["propuestas"],
        "resultado_ok": m028["resultado_ok"],
    },
    "verificaciones_finales": {
        "purchase_sin_reference_tras_fase_II": m028["verificacion_post"]["purchase_sin_ref_post"],
        "valores_economicos_conservados": m028["verificacion_post"]["valores_economicos_conservados"],
        "conteos_invariantes": m028["verificacion_post"]["conteos_post"],
        "filas_traceability_backfill_total": m028["verificacion_post"]["audit_traceability_total"],
        "fvc": m028["verificacion_post"]["fvc_post"],
        "idempotencia": "segunda pasada → CERO cambios (re-derivación 0 pares; predicado UPDATE 0 filas; auditoría 0 nuevas — guard NOT EXISTS)",
    },
}
with open(os.path.join(OUT, "EVIDENCIA_208_MOVIMIENTOS.json"), "w", encoding="utf-8") as f:
    json.dump(ev208, f, ensure_ascii=False, indent=2)
print("✓ EVIDENCIA_208_MOVIMIENTOS.json")

# ═════════ EVIDENCIA_ACT_INVENTARIO.json ═════════
evact = {
    "mision": "CP-INVENTORY-TRACEABILITY-RECONCILIATION-001",
    "titulo": "Evidencia integral de la conciliación del mayor ACT_INVENTARIO frente a las cantidades y valores realmente en existencias (ENERVIDA-VITALLCONS y tiendas)",
    "generado": m034["generado"],
    "fase_III_cantidades_por_sku": {
        "supuestos": m029["supuestos"],
        "resumen": m029["resumen"],
        "resultado": "existencia calculada == products.stock_current == inventory.quantity en los 166 SKUs con movimientos (dif 0,00); recibido según movimientos == recibido según líneas de recepción (0 diferencias); sin filas duplicadas; existencia inicial = 0 (kardex inicia 2026-07-01)",
        "skus": m029["skus"],
        "productos_stock_sin_movimientos": m029["productos_stock_sin_movimientos"],
    },
    "fase_IV_mayor_act_inventario": {
        "saldo_inicial": m031["saldo_inicial"],
        "debitos": m031["debitos"],
        "creditos": m031["creditos"],
        "saldo_contable_final": m031["saldo_contable_final"],
        "por_tipo": m031["por_tipo"],
        "por_tienda": m031["por_tienda"],
        "serie_mensual": m031["serie_mensual"],
        "identidades_valor_movimientos_vs_mayor": m031["identidades_valor"],
        "dimension_producto": m031["dimension_producto_fin_movements"],
        "conciliacion_por_documento": {
            "ventas": m031b["ventas"],
            "vales": m031b["vales"],
            "ajustes": m031b["ajustes"],
            "reversiones": m031b["reversiones"],
        },
        "resultado": "saldo contable 201.699.246,55 CUP (ENER 189.439.466,38 · COSTPRO 12.258.163,67 · PUERTO PADRE 1.616,50); compras/devoluciones/anulación cuadran al céntimo con movimientos; gaps documentados: ventas sin asiento, vales sin asiento, ajustes sin asiento, reversiones sin asiento, COGS a base WAC con movimientos a costo 0-1",
    },
    "fase_V_valoraciones_y_puente": {
        "valoraciones": m034["valoraciones"],
        "puente": m034["puente"],
        "por_producto": m034["por_producto"],
        "resultado": "A1 34.790.669,75 · A2 34.153.525,35 · A-FVC 35.292.330,00 · B 1.065.011,13 · C sin conteos firmados; diferencia total 188.374.455,25 = D-AB 33.725.658,62 + D-A 154.648.796,63 (descompuesta exactamente en salidas sin asiento 866.265,04 + ajustes sin asiento 510.864,50 − reentradas sin asiento 353.390,09 + residual 154.137.921,67)",
    },
    "fase_VI_recorrido_192M": {
        "fvc": m033["fvc"],
        "tasa_aprobada": m033["tasa_aprobada"],
        "totales": m033["totales"],
        "productos_con_existencia": m033["productos_con_existencia"],
        "productos_sin_existencia": m033["productos_sin_existencia"],
        "metodo_cogs": m033["metodo_cogs"],
        "productos": m033["productos"],
        "resultado": "de los 192.039.436 CUP: consumidos por ventas 4.546.307,12 · retirados por vales 524.266,99 · ajustados 490.727,00 · devueltos 0 · revertidos 353.386,59 · representados en existencias 710.892,56 (45 productos, 3.338 unidades) · saldo remanente atribuible 187.550.202,30 — concentrado en sku 111 (83,3M) y sku 112 (68M) con salidas insignificantes registradas a costo 0-1 CUP",
    },
    "fase_VII_diferencias_clasificadas": [
        {"tipo": "Movimiento sin referencia documental", "estado": "RESUELTO en Fase II: 208/208 reparados con correspondencia 1:1; 0 movimientos de compra sin referencia", "importe": 0.0},
        {"tipo": "Diferencia de costo (salidas por debajo del costo de adquisición)", "importe_cup": 154137921.67, "sku_afectados": "concentrado en 101 productos FVC (skus 111 y 112 = 151.299.903)", "causa": "entradas valorizadas a tasa 680 (aprobada) con WAC no actualizado por la importación legacy; salidas registradas a costo 0-1 CUP", "consecuencia": "activo ACT_INVENTARIO sin respaldo físico en existencias"},
        {"tipo": "WAC vigente ≠ costo de adquisición (existencias)", "importe_cup": 33725658.62, "causa": "cost_average conservado ≈1 CUP frente a costos de adquisición 680/840", "consecuencia": "valorización de existencias subestimada frente a su costo de adquisición"},
        {"tipo": "Asiento financiero ausente — ajustes de cuadre de importación", "importe_cup": 510864.50, "documentos": "77 movimientos adjustment 'Cuadre importación ENERVIDA' (ago 2026); 1 asiento posted de 1 CUP"},
        {"tipo": "Asiento financiero ausente — ventas", "importe_cup": 353398.54, "documentos": "290 transacciones completed sin asiento (valor según movimientos; 1 venta v1 de 353.364 CUP + 289 v2 de valor kardex casi nulo) + 18 voided"},
        {"tipo": "Asiento financiero ausente — vales", "importe_cup": 189691.76, "documentos": "42 vales sin asiento (2,01 ENERVIDA · 189.644,76 COSTPRO · 45,00 PUERTO PADRE)"},
        {"tipo": "Asiento financiero ausente — reversiones/voids (reingresos)", "importe_cup": 473393.09, "documentos": "sale_reverse 353.389,59 · issue_slip_reverse 120.002,00 · sale_void 1,50 — reingresan stock sin débito al mayor"},
        {"tipo": "Costo de salida incorrecto en la capa de movimientos", "detalle": "557 movimientos de venta con unit_cost 0/NULL (2.652,72 unidades) mientras el COGS contable se calculó a cost_at_sale/WAC — capa kardex sin costo, mayor correcto por asiento", "importe_cup": 0, "nota": "diferencia de registro, no económica en el mayor"},
        {"tipo": "Diferencia entre inventario registrado y conteo físico", "estado": "NO DETERMINABLE sin conteos firmados — hoja de conteo entregada (HOJA_CONTEO_FISICO_ENERVIDA.xlsx, 258 SKUs)", "importe": None},
        {"tipo": "Información no disponible", "detalle": "COGS no atribuible por producto en 2 transacciones multi-producto (2.060,40 CUP) — no se inventa asignación (misión §6)"},
    ],
}
with open(os.path.join(OUT, "EVIDENCIA_ACT_INVENTARIO.json"), "w", encoding="utf-8") as f:
    json.dump(evact, f, ensure_ascii=False, indent=2)
print("✓ EVIDENCIA_ACT_INVENTARIO.json")
