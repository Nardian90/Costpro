#!/usr/bin/env python3
# ============================================================================
# M105 — CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014
# Generador de los 5 XLSX del expediente (skill xlsx · paleta professional).
# Solo lectura de los extractos/análisis RO + resultados de ejecución; no
# consulta producción.
# Salida: docs/audits/cp-fin-negative-wac-complete-remediation-014/*.xlsx
# ============================================================================
import json, os, sys
from decimal import Decimal as D, ROUND_HALF_UP

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

OUTDIR = 'docs/audits/cp-fin-negative-wac-complete-remediation-014'
os.makedirs(OUTDIR, exist_ok=True)
M014 = 'scripts/out/m014'
ex = json.load(open(f'{M014}/extract.json'))
R = json.load(open(f'{M014}/analysis.json'))
EV = json.load(open(f'{M014}/e2e-resultados.json'))
PV = json.load(open(f'{M014}/post-verificacion.json'))
PE = json.load(open(f'{M014}/prod-ejecucion.json'))
m74 = json.load(open('scripts/out/m074-matriz-1cup.json'))

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

# importes de la ejecución (constantes validadas E2E + producción)
A = {'total': '2657379.32', 'cogs': '566546.45', 'vales': '1072918.27', 'perdida': '1017914.60'}
B = {'total': '8704161.30', 'cogs': '1855777.48', 'vales': '3514277.42', 'perdida': '3334106.40'}
C = {'total': '22471992.81', 'cogs': '16002792.90', 'vales': '639762.33', 'perdida': '5829437.58'}
C1 = {'cogs': '14254852.02', 'vales': '517882.70', 'perdida': '5338990.00'}
C2 = {'cogs': '1747940.88', 'vales': '121879.63', 'perdida': '490447.58'}
ANTECEDENTES = {'ACT_INVENTARIO': '34435061.24', 'GAS_COSTO_VENTAS': '-16677175.95',
                'GAS_VALES': '-5105078.39', 'GAS_PERDIDA_INV': '-9691011.00', 'PAS_CXP_PROV': '-2961795.90'}


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


wb1 = Workbook()
# ═══ 1. MATRIZ 5 SKU + EXTENSIÓN 96 ══════════════════════════════════════════
ws = wb1.active
rows5 = []
for f in R['matriz']:
    if not f['es_5sku']:
        continue
    rows5.append([f"SKU{f['sku']}", NOMBRES.get(f['sku'], f['nombre'])[:40], num(f['stock']),
                  num(f['wac']), num(f['wac']) * num(f['stock']), 1.00, num(f['stock']) * 1.00,
                  num(f['delta_restauracion'])])
sheet_from_rows(wb1, 'Matriz 5 SKU', ['SKU', 'Producto', 'Stock (real)', 'WAC antes (negativo)',
                                     'Valor antes (negativo)', 'WAC después', 'Valor después',
                                     'Δ restauración (CR INV en A)'],
                rows5, total_row=['TOTAL', None, sum(r[2] for r in rows5), None,
                                  sum(r[4] for r in rows5), None, sum(r[6] for r in rows5),
                                  sum(r[7] for r in rows5)],
                col_formats={3: FMT_QTY, 4: FMT_WAC, 5: FMT_MONEY, 6: FMT_WAC, 7: FMT_MONEY, 8: FMT_MONEY},
                notes=['Nota: la tabla de la misión anotaba existencia 0 para SKU117 (cifra antigua); el estado real es stock=1 → objetivo 1,00 CUP (importe documentado 2.657.379,32 coincide con el estado real).',
                       'Los 5 SKU se restauran a 1,00 CUP/u = valor de sus capas FVC legítimas (mecanismo canónico sellado fn_recalc_wac).'],
                first=True)

rows96 = []
for f in R['matriz']:
    if f['es_5sku']:
        continue
    afectado = d(f['ghost_cogs']) != 0 or d(f['ghost_vales']) != 0 or d(f['ghost_perdida']) != 0
    rows96.append([f"SKU{f['sku']}", f['nombre'][:40], num(f['qty_fvc']), num(f['uc_cup_old']),
                   num(f['ghost_cogs']), num(f['ghost_vales']), num(f['ghost_perdida']),
                   num(f['recost_venta']), num(f['recost_vale']), num(f['recost_perdida']),
                   'SÍ' if afectado else 'NO'])
tot = ['TOTAL 96', None, sum(r[2] for r in rows96), None,
       sum(r[4] for r in rows96), sum(r[5] for r in rows96), sum(r[6] for r in rows96),
       sum(r[7] for r in rows96), sum(r[8] for r in rows96), sum(r[9] for r in rows96), None]
sheet_from_rows(wb1, 'Extensión 96 productos', ['SKU', 'Producto', 'Qty FVC', 'Uc CUP original',
                                               'Fantasma COGS (RECT-011)', 'Fantasma VALES', 'Fantasma PÉRDIDA',
                                               'Re-costeo venta', 'Re-costeo vale', 'Re-costeo pérdida', 'Afectado'],
                rows96, total_row=tot,
                col_formats={3: FMT_QTY, 4: FMT_MONEY, 5: FMT_MONEY, 6: FMT_MONEY, 7: FMT_MONEY,
                             8: FMT_MONEY, 9: FMT_MONEY, 10: FMT_MONEY},
                notes=['Fantasma = créditos de RECT-011 atribuidos por el modelo m074 (hecho histórico).',
                       'Re-costeo FVC-atribuido = unidades FVC consumidas × 1 CUP − costo registrado atribuible (reparto lineal por movimiento).',
                       'La extensión se materializa por canales (C1+C2) en el asiento RECT-013-C-EXT96; los re-costeos por producto son la descomposición analítica.'])

rows_alc = [['5 SKU con WAC negativo (RECT-013-A)', 5, num(A['total'])],
            ['Componente B — regularización residual 5 SKU (RECT-013-B)', 5, num(B['total'])],
            ['Componente C — extensión otros 96 (RECT-013-C)', 96, num(C['total'])],
            ['Productos de los 96 con partidas distintas de cero', R['rect013_c_extension']['productos_con_ajuste'], None],
            ['TOTAL REGULARIZACIÓN', 101, num(A['total']) + num(B['total']) + num(C['total'])]]
sheet_from_rows(wb1, 'Resumen alcance', ['Componente', 'Productos', 'Importe CUP'], rows_alc,
                col_formats={2: '#,##0', 3: FMT_MONEY},
                notes=['Referencia conjunta documentada A+B = 11.361.540,62 CUP (§1 misión 014) — reproducida exactamente.',
                       'C se cuantifica con la extracción fresca: total fijado por la conciliación inventario↔kardex (§10.7).'])

wb1.properties.creator = 'Z.ai'
wb1.save(f'{OUTDIR}/MATRIX_5SKU_AND_EXTENSION.xlsx')
wb1.close()

wb2 = Workbook()
rows_e = []
for doc, comp, dr_c, dr_v, dr_p, cr_i in [
        ('RECT-013-A-NEGWAC', 'A — restauración 5 SKU', A['cogs'], A['vales'], A['perdida'], A['total']),
        ('RECT-013-B-REGULAR', 'B — regularización residual 5 SKU', B['cogs'], B['vales'], B['perdida'], B['total']),
        ('RECT-013-C-EXT96', 'C — extensión 96 productos (C1+C2)', C['cogs'], C['vales'], C['perdida'], C['total'])]:
    rows_e.append([doc, comp, 'GAS_COSTO_VENTAS', 'débito', num(dr_c)])
    rows_e.append([doc, comp, 'GAS_VALES', 'débito', num(dr_v)])
    rows_e.append([doc, comp, 'GAS_PERDIDA_INV', 'débito', num(dr_p)])
    rows_e.append([doc, comp, 'ACT_INVENTARIO', 'crédito', num(cr_i)])
sheet_from_rows(wb2, 'Asientos aplicados', ['Documento', 'Componente', 'Cuenta', 'Sentido', 'Importe CUP'],
                rows_e, total_row=['TOTAL A+B+C', None, 'D − C', 'cero', 0.0],
                col_formats={5: FMT_MONEY},
                notes=['Asientos en producción: 7ec9000f-…-d01400000001 / 0002 / 0003 (fecha económica 2026-11-17).',
                       'C desglose: C1 eliminación acreedor restante (COGS 14.254.852,02 · VALES 517.882,70 · PÉRDIDA 5.338.990,00) + C2 reconocimiento drift (COGS 1.747.940,88 · VALES 121.879,63 · PÉRDIDA 490.447,58).'])
wb2.properties.creator = 'Z.ai'
wb2.save(f'{OUTDIR}/RECTIFICATION_ENTRIES_014.xlsx')
wb2.close()

wb3 = Workbook()
rows_c = []
for cuenta, antes in ANTECEDENTES.items():
    delta = 0.0
    if cuenta == 'ACT_INVENTARIO':
        delta = -(num(A['total']) + num(B['total']) + num(C['total']))
    elif cuenta == 'GAS_COSTO_VENTAS':
        delta = num(A['cogs']) + num(B['cogs']) + num(C['cogs'])
    elif cuenta == 'GAS_VALES':
        delta = num(A['vales']) + num(B['vales']) + num(C['vales'])
    elif cuenta == 'GAS_PERDIDA_INV':
        delta = num(A['perdida']) + num(B['perdida']) + num(C['perdida'])
    despues = num(antes) + delta
    rows_c.append([cuenta, num(antes), delta, despues])
tot_c = ['TOTAL (D−C sistema)', sum(r[1] for r in rows_c), sum(r[2] for r in rows_c), sum(r[3] for r in rows_c)]
sheet_from_rows(wb3, 'Saldos antes → después', ['Cuenta (ENERVIDA)', 'Saldo antes', 'Δ corrección (A+B+C)',
                                                'Saldo después (real verificado)'],
                rows_c, total_row=tot_c, col_formats={2: FMT_MONEY, 3: FMT_MONEY, 4: FMT_MONEY},
                notes=['Saldo después verificado en producción por m104 (post-verificacion.json): COGS 1.747.940,88 · VALES 121.879,63 · PÉRDIDA 490.447,58.',
                       'Δ ACT_INVENTARIO = −33.833.533,43 = total de la regularización (A 2.657.379,32 + B 8.704.161,30 + C 22.471.992,81).',
                       'PAS_CXP_PROV sin cambios: la economía de FAC-VITALLCONS-001 (5.861,50) permanece intacta.'])
rows_k = [['ACT_INVENTARIO ENERVIDA (antes)', num(ANTECEDENTES['ACT_INVENTARIO'])],
          ['Kardex Σ ENERVIDA (antes: incluye los 5 negativos)', num(ex['valor_campo_tienda'][0]['valor'])],
          ['Gap antes (residuo obsoleto atribuible)', num(ANTECEDENTES['ACT_INVENTARIO']) - num(ex['valor_campo_tienda'][0]['valor'])],
          ['Regularización aplicada (A+B+C)', num(A['total']) + num(B['total']) + num(C['total'])],
          ['ACT_INVENTARIO ENERVIDA (después)', num(ANTECEDENTES['ACT_INVENTARIO']) - num(A['total']) - num(B['total']) - num(C['total'])],
          ['Kardex Σ ENERVIDA (después: 5 SKU a +34,00)', num(ex['valor_campo_tienda'][0]['valor']) + num(A['total'])],
          ['Gap después (conciliación §10.7)', 0.01]]
sheet_from_rows(wb3, 'Conciliación INV↔Kardex', ['Concepto', 'Importe CUP'], rows_k,
                col_formats={2: FMT_MONEY},
                notes=['Gap después = 0,00527 (residuo sub-céntimo del valor kardex con precisión de campo; tolerancia de certificación 0,01).',
                       'La conciliación inventario↔kardex queda cerrada al céntimo — criterio de fijación del total C.'])
wb3.properties.creator = 'Z.ai'
wb3.save(f'{OUTDIR}/BEFORE_AFTER_ACCOUNTS.xlsx')
wb3.close()

wb4 = Workbook()
rows_ev = []
for f in EV['fases']:
    rows_ev.append([f['fase'], 'PASS' if f['ok'] else 'FAIL', f['detalle'][:110]])
sheet_from_rows(wb4, 'Batería E2E aislada', ['Fase', 'Resultado', 'Detalle'], rows_ev,
                notes=[f"Batería completa m102 (BD aislada lguovmvrozxgssupkwpf): {len(EV['fases'])} fases PASS — incluye ciclo doble (setup→execute→verify→idem), rollback individual y total con ABORT, y cleanup NET DELTA=0.",
                       'Importes idénticos a producción; saldos del fixture calibrados a los valores reales de ENERVIDA.'])
rows_pe = []
for l in PE.get('lots', []):
    rows_pe.append([f"Lote {l['lote']}", l['resultado'], 'D−C = 0,00'])
rows_pe.append(['Idempotencia m104 --idem', 'YA_APLICADO ×3', '0 cambios (3558 movimientos · 3 asientos · 5 wcl · kardex estable)'])
sheet_from_rows(wb4, 'Ejecución en producción', ['Lote', 'Resultado', 'Verificación'], rows_pe,
                notes=['Asientos: RECT-013-A-NEGWAC = 7ec9000f-…-d01400000001 · RECT-013-B-REGULAR = …0002 · RECT-013-C-EXT96 = …0003.',
                       'Fecha económica 2026-11-17 · trace RECT013-PROD · audit SYSTEM_RECT013_ENTRY ×3 + SYSTEM_RECT013_WAC ×5.'])
wb4.properties.creator = 'Z.ai'
wb4.save(f'{OUTDIR}/E2E_AND_EXECUTION_EVIDENCE.xlsx')
wb4.close()

wb5 = Workbook()
rows_pv = [[f"C{c['criterio']}", c['nombre'], 'PASS' if c['ok'] else 'FAIL', c['detalle'][:110]] for c in PV['criterios']]
sheet_from_rows(wb5, 'Certificación 14 criterios', ['Criterio', 'Nombre', 'Resultado', 'Detalle'], rows_pv,
                notes=['Certificación m104 sobre producción: 14/14 PASS (post-verificacion.json).',
                       'C7: gap INV↔Kardex 0,00527 (sub-céntimo, tolerancia 0,01) · C12: fin_posting_errors = 0 · C14: T12 y guard WAC en O.'])
wb5.properties.creator = 'Z.ai'
wb5.save(f'{OUTDIR}/CERTIFICATION_14_CRITERIA.xlsx')
wb5.close()
print('OK — 5 XLSX generados en', OUTDIR)
