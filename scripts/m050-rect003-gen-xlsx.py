#!/usr/bin/env python3
# ============================================================================
# M050 — CP-FIN-VALUATION-RECTIFICATION-003 · ENTREGABLES XLSX:
# 1) CRONOLOGIA_119_SALIDAS.xlsx (por unidad de salida)
# 2) MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx (101 líneas, 11 columnas §5)
# 3) RECONCILIACION_RECEPCION.xlsx (192.039.436 → 40.739.585)
# Genera en download/ (para el propietario) y en el expediente del repo.
# ============================================================================
import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT_DL = '/home/z/my-project/download/'
OUT_EXP = '/home/z/my-project/Costpro/docs/audits/valuation-rectification-003-20261115/'

AZUL = '1F4E79'; GRIS = 'F2F2F2'; VERDE = 'E2EFDA'; AMBAR = 'FFF2CC'; ROJO = 'FCE4EC'
hdr_font = Font(bold=True, color='FFFFFF', size=10)
hdr_fill = PatternFill('solid', fgColor=AZUL)
thin = Border(*[Side(style='thin', color='BFBFBF')] * 4)

def style_header(ws, row=1, ncols=None):
    ncols = ncols or ws.max_column
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = thin
    ws.freeze_panes = ws.cell(row=row + 1, column=1)

def autosize(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ═══ 1. CRONOLOGÍA DE LAS 119 UNIDADES SALIDAS ═══════════════════════════════
crono = json.load(open('/home/z/my-project/scripts/out/rect003-faseII-cronologia.json'))
wb = Workbook()
ws = wb.active
ws.title = 'Cronología 119 salidas'
ws.append(['#', 'SKU', 'Fecha', 'Tipo de salida', 'Documento', 'Destino / motivo',
           'Cantidad (u)', 'Costo origen registrado (CUP/u)', 'Costo origen correcto (CUP/u)',
           'Costo contabilizado kardex (CUP/u)', 'Costo correcto (CUP/u)',
           'Valor contabilizado (CUP)', 'Valor correcto (CUP)', 'Estado contable (mayor)'])
style_header(ws)
r = 0
for i, s in enumerate(crono['cronologia_salidas'], 1):
    ws.append([i, s['sku'], s['fecha'], s['tipo_salida'], s['documento'],
               str(s['destino'])[:90], s['cantidad'],
               float(s['costo_origen_registrado_cup']), float(s['costo_origen_correcto_cup']),
               float(s['costo_contabilizado_unitario']), float(s['costo_correcto_unitario']),
               float(s['valor_contabilizado']), float(s['valor_correcto']),
               str(s['estado_contable'])[:100]])
    r = i
    fill = None
    if s['costo_contabilizado_unitario'] == 0:
        fill = PatternFill('solid', fgColor=AMBAR)
    elif str(s['asiento']).startswith('SIN ASIENTO') and s['tipo_salida'] == 'vale':
        fill = PatternFill('solid', fgColor=ROJO)
    if fill:
        for c in range(1, 15):
            ws.cell(row=i + 1, column=c).fill = fill
# fila de reingreso
reing = crono['reingreso_vs000223']
for x in reing:
    r += 1
    ws.append([r, x['sku'], x['fecha'], 'REINGRESO (reversión de vale)', x['documento'],
               str(x.get('notas') or '')[:90], float(x['cantidad']), '—', 1.0,
               float(x['uc_registrado']), 1.0, float(x['valor']), float(x['valor']),
               str(x['estado_contable'])[:100]])
    for c in range(1, 15):
        ws.cell(row=r + 1, column=c).fill = PatternFill('solid', fgColor=VERDE)

# hoja resumen por SKU
ws2 = wb.create_sheet('Reconciliación por SKU')
ws2.append(['SKU', 'Recibidas', 'Salidas brutas (u)', 'Reingreso (u)', 'Salidas netas (u)',
            'Existencia actual', 'Identidad', 'Ventas (u)', 'Vales brutos (u)', 'Ajustes (u)',
            'Valor salidas registrado', 'Valor salidas correcto', 'Subvaluación', 'Unidades uc=0'])
style_header(ws2)
for sku in ['111', '112']:
    k = crono['reconciliacion_por_sku'][sku]
    pt = k['por_tipo']
    ws2.append([f'SKU {sku}', k['recibidas'], k['salidas_brutas']['unidades'], k['reingresos']['unidades'],
                k['salidas_netas'], k['actuales'], k['identidad'] + (' ✓' if k['identidad_ok'] else ' ✗'),
                pt.get('venta', {}).get('unidades', 0), pt.get('vale', {}).get('unidades', 0),
                pt.get('ajuste', {}).get('unidades', 0),
                float(k['valor_salidas_registrado']), float(k['valor_salidas_correcto']),
                float(k['subvaluacion']), k['unidades_uc0']])
cons = crono['consolidado']
ws2.append(['CONJUNTO', 149, cons['salidas_brutas']['unidades'], cons['reingreso'],
            cons['salidas_netas'], 30, '149 − 120 + 1 = 30 ✓', 7,
            cons['por_tipo']['vales_brutos']['unidades'], cons['por_tipo']['ajustes']['unidades'],
            5 + 89, 119.0, 26, 26], )
for c in range(1, 15):
    ws2.cell(row=4, column=c).font = Font(bold=True)
autosize(ws, [4, 6, 11, 12, 22, 34, 9, 12, 12, 12, 12, 12, 11, 40])
autosize(ws2, [10, 10, 12, 10, 12, 10, 24, 8, 10, 8, 12, 12, 10, 8])
wb.save(OUT_DL + 'RECT003_CRONOLOGIA_119_SALIDAS_SKU111_112.xlsx')
wb.save(OUT_EXP + 'CRONOLOGIA_119_SALIDAS_SKU111_112.xlsx')
print('OK cronología xlsx')

# ═══ 2. MATRIZ DE LOS 101 PRODUCTOS ═══════════════════════════════════════════
matriz = json.load(open('/home/z/my-project/scripts/out/rect003-faseIII-matriz.json'))
wb = Workbook()
ws = wb.active
ws.title = 'Matriz 101 productos'
ws.append(['SKU', 'Producto', 'Cantidad', 'Costo registrado', 'Moneda original', 'Tasa',
           'Precio de venta', 'Moneda precio', 'Costo confirmado', 'Fuente de confirmación',
           'Total original (CUP)', 'Total recalculado (CUP)', 'Δ (CUP)', 'Clasificación', 'Señales'])
style_header(ws)
fill_map = {
    'SKU corregido por decisión del propietario': ROJO,
    'Costo no verificable': AMBAR,
    'Discrepancia de moneda': AMBAR,
    'Costo bajo legítimo': VERDE,
    'Sin problema detectado': GRIS,
}
for m in matriz['matriz']:
    cat = m['categoria']
    fill = None
    for k, color in fill_map.items():
        if cat.startswith(k):
            fill = PatternFill('solid', fgColor=color)
    ws.append([m['sku'], str(m['nombre'])[:48], float(m['q']), float(m['uc_reg']),
               m['moneda'], float(m['tasa']), float(m['precio_venta']), m['moneda_producto'],
               float(m['costo_confirmado']), m['fuente_confirmacion'],
               float(m['total_original']), float(m['total_recalculado']), float(m['delta']),
               cat, ' | '.join(m['senales'])[:150]])
    if fill:
        for c in range(1, 16):
            ws.cell(row=ws.max_row, column=c).fill = fill
ws.append([])
ws.append(['', 'TOTALES', 101, '', '', '', '', '', '', '',
           float(matriz['verificacion_totales']['total_original_suma']),
           float(matriz['verificacion_totales']['total_recalculado_suma']),
           float(matriz['verificacion_totales']['reduccion']), '', ''])
for c in range(1, 16):
    ws.cell(row=ws.max_row, column=c).font = Font(bold=True)

ws2 = wb.create_sheet('Resumen clasificación')
ws2.append(['Clasificación', 'Líneas', 'Valor conjunto (CUP)'])
style_header(ws2)
resumen_valores = {}
for m in matriz['matriz']:
    resumen_valores[m['categoria']] = [resumen_valores.get(m['categoria'], [0, 0])[0] + 1,
                                       resumen_valores.get(m['categoria'], [0, 0])[1] + m['total_original']]
for cat, (n, v) in sorted(resumen_valores.items(), key=lambda x: -x[1][1]):
    ws2.append([cat, n, float(v)])
ws2.append([])
ws2.append(['TOTAL', 101, float(matriz['verificacion_totales']['total_original_suma'])])
for c in range(1, 4):
    ws2.cell(row=ws2.max_row, column=c).font = Font(bold=True)
autosize(ws, [7, 42, 9, 10, 8, 7, 9, 7, 9, 34, 13, 13, 12, 44, 60])
autosize(ws2, [56, 8, 16])
wb.save(OUT_DL + 'RECT003_MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx')
wb.save(OUT_EXP + 'MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx')
print('OK matriz xlsx')

# ═══ 3. RECONCILIACIÓN FINAL DE LA RECEPCIÓN ═════════════════════════════════
wb = Workbook()
ws = wb.active
ws.title = 'Reconciliación FVC'
ws.append(['FAC-VITALLCONS-001 (fd9d6c88-5db8-49ea-b185-8bc96cc93e63) — Reconciliación final'])
ws['A1'].font = Font(bold=True, size=13)
ws.append([])
rows = [
    ('Componente', 'Importe (CUP)', 'Detalle', '', True),
    ('Total original (cabecera vigente)', 192039436.00, 'Σ 101 líneas: q × uc × tasa — cuadra al céntimo con receipts.total_cost', '', False),
    ('Corrección SKU 111 (Grapas plásticas c/ clavo acero)', -83299951.00, '49 u: 2.500 USD@680 (83.300.000) → 49 × 1 CUP = 49 · Δ −83.299.951', '', False),
    ('Corrección SKU 112 (Grapas metálicas 3/4 c/ tornillo)', -67999900.00, '100 u: 1.000 USD@680 (68.000.000) → 100 × 1 CUP = 100 · Δ −67.999.900', '', False),
    ('Reducción total', -151299851.00, 'Exceso de reconocimiento a revertir (D PAS_CXP_PROV / C ACT_INVENTARIO)', '', True),
    ('TOTAL CORREGIDO (PRELIMINAR)', 40739585.00, '79 líneas CUP 5.129.706 + 20 líneas USD auténticas 35.609.730 (52.367,25 × 680) + 2 líneas corregidas 149', '', True),
    ('— Provisionalidad', None, 'Preliminar mientras existan 71 líneas no verificables (24.510.805 CUP contingentes) y 4 discrepancias de moneda pendientes del propietario', '', False),
]
for row in rows:
    ws.append(row[:3])
hdr_row = 3
for c in range(1, 4):
    cell = ws.cell(row=hdr_row, column=c)
    cell.font = hdr_font; cell.fill = hdr_fill; cell.border = thin
for i in range(4, 10):
    ws.cell(row=i, column=2).number_format = '#,##0.00'
    if ws.cell(row=i, column=3).font.bold if hasattr(ws.cell(row=i, column=3).font, 'bold') else False:
        pass
ws.append([])
ws.append(['Descomposición del total corregido', 'Importe (CUP)', 'Líneas'])
ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
comp = [
    ('79 líneas CUP (tasa 1)', 5129706.00, 79),
    ('20 líneas USD auténticas (tasa 680 aprobada D1)', 35609730.00, 20),
    ('SKU 111 corregida (49 × 1)', 49.00, 1),
    ('SKU 112 corregida (100 × 1)', 100.00, 1),
    ('TOTAL', 40739585.00, 101),
]
for c, v, n in comp:
    ws.append([c, v, n])
    ws.cell(row=ws.max_row, column=2).number_format = '#,##0.00'
    if c == 'TOTAL':
        for cc in range(1, 4):
            ws.cell(row=ws.max_row, column=cc).font = Font(bold=True)
ws.append([])
ws.append(['Clasificación de las 101 líneas', 'Líneas', 'Valor original (CUP)'])
ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
for cat, (n, v) in sorted(resumen_valores.items(), key=lambda x: -x[1][1]):
    ws.append([cat, n, float(v)])
    ws.cell(row=ws.max_row, column=3).number_format = '#,##0.00'
autosize(ws, [52, 18, 95, 10])
wb.save(OUT_DL + 'RECT003_RECONCILIACION_RECEPCION_FAC-VITALLCONS-001.xlsx')
wb.save(OUT_EXP + 'RECONCILIACION_RECEPCION_FAC-VITALLCONS-001.xlsx')
print('OK reconciliación xlsx')
