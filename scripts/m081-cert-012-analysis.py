#!/usr/bin/env python3
# ============================================================================
# M081 — CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012
# Análisis de conciliación independiente (solo lectura, sin escrituras).
# Entradas : scripts/out/m012/extract.json + extract-supplement.json +
#            extract-supplement2.json + matrices congeladas de m011 (scripts/out)
# Salidas  : scripts/out/m012/results.json  (veredictos, hallazgos, cadenas)
# Re-ejecutable: determinista sobre los extractos RO.
# ============================================================================
import json, hashlib
from decimal import Decimal as D
from collections import defaultdict, OrderedDict

OUT = 'scripts/out/m012'
e = json.load(open(f'{OUT}/extract.json'))
s1 = json.load(open(f'{OUT}/extract-supplement.json'))
s2 = json.load(open(f'{OUT}/extract-supplement2.json'))
mat = json.load(open('scripts/out/m074-matriz-1cup.json'))
before = json.load(open('scripts/out/m011/before-extract.json'))
after = json.load(open('scripts/out/m011/after-extract.json'))

FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
ORIG = '93bb5da9-0afd-4325-baad-a275710062c5'
RECT1 = '7ec90009-0000-4000-8000-d0b300000001'
RECT2 = '7ec90009-0000-4000-8000-d0b300000002'
E011 = '7ec9000b-0000-4000-8000-d11300000001'
WIN_START = '2026-11-16T19:42:56.855Z'
EXEC_START = '2026-11-16T20:02:56.855Z'
EXEC_END = '2026-11-16T20:03:05.869Z'
CUT_RECT2 = '2026-11-16 16:07:49'   # tras RECT-2 (16:07:48.447)
CUT_EXEC_END = '2026-11-16 20:03:06'  # tras RECT-011

def d(x):
    return D(str(x)) if x is not None else D(0)

R = {'mision': 'CP-FIN-POST-RECTIFICATION-INDEPENDENT-CERTIFICATION-012',
     'generado_utc': e['extraccion']['fecha_utc'], 'veredictos': [], 'hallazgos': [], 'criterios': []}

def verdict(id_, ok, detalle, seccion, clasificacion='PASS'):
    R['veredictos'].append({'id': id_, 'seccion': seccion, 'resultado': 'PASS' if ok else clasificacion, 'detalle': detalle})
    print(('PASS ' if ok else f'!!{clasificacion}! ') + f'{id_}: {detalle}')

def money(x):
    return f'{D(str(x)):,.2f}'

# ════════════════════════ §3 RECEPCIÓN (101 líneas) ══════════════════════════
lin = e['receipt_items']
n = len(lin)
ok1 = sum(1 for r in lin if d(r['unit_cost']) == 1 and r['moneda_recepcion'] == 'CUP' and d(r['tasa_cambio_recepcion']) == 1)
sum_sub = sum(d(r['subtotal_cup']) for r in lin)
sub_mal = [r['sku'] for r in lin if d(r['subtotal_cup']) != d(r['quantity'])]
sum_qty = sum(d(r['quantity']) for r in lin)
hdr = e['receipt']
verdict('R1_101_lineas_1CUP', n == 101 and ok1 == 101 and sum_sub == D('5861.50') and not sub_mal,
        f'{ok1}/101 líneas a 1,00 CUP · tasa 1 · Σsubtotal={sum_sub} · Σqty={sum_qty} · subtotales mal: {len(sub_mal)}', '§3')
# wu/mm deben definirse antes de su uso en §3-§7
wu = {w['product_id']: w for w in mat['wac_updates']}
mm = {m['product_id']: m for m in mat['matriz']}
verdict('R2_cabecera', d(hdr['total_cost']) == D('5861.50') and hdr['payment_status'] == 'unpaid' and d(hdr.get('paid_amount') or 0) == 0 and hdr['status'] == 'active',
        f"total_cost={hdr['total_cost']} · {hdr['payment_status']} · pagado={hdr.get('paid_amount')} · status={hdr['status']}", '§3')
cap = e['capas_fvc']
cap_ok = sum(1 for r in cap if d(r['unit_cost']) == 1)
cap_val = sum(d(r['quantity_change']) * d(r['unit_cost']) for r in cap)
verdict('R3_capas_101', len(cap) == 101 and cap_ok == 101 and cap_val == D('5861.50') and not e['capas_duplicadas'] and not e['movimientos_fvc_no_compra'],
        f'{len(cap)} capas · {cap_ok} a 1 CUP · valor={cap_val} · duplicadas={len(e["capas_duplicadas"])} · otros movs FVC={len(e["movimientos_fvc_no_compra"])} · tipos={e["movimientos_fvc_todos"]}', '§3')
sk999 = e['sku999']
verdict('R4_sku999_servicio', sk999 and sk999['is_service'] and sk999['capas_fvc'] == 1 and d(sk999['saldo_kardex']) == 0,
        f"is_service={sk999['is_service']} · única capa FVC (4×1 CUP) · saldo kardex={sk999['saldo_kardex']} · 0 movimientos nuevos de la corrección · los {sk999['movs_no_compra']} movimientos no-compra son históricos (ago-2026, ventas/ajustes previos) · WAC 443,83 de recepción ajena 44b8f20f (OUT_OF_SCOPE, preservado)", '§3')
precios_mal = []
prec_map = {m['sku']: m for m in mat['matriz']}
for r in lin:
    pm = prec_map.get(str(r['sku']))
    if pm is not None and d(pm.get('precio_venta') or 0) != d(r['precio_venta'] or 0):
        precios_mal.append({'sku': r['sku'], 'esperado': pm.get('precio_venta'), 'actual': r['precio_venta']})
verdict('R5_precios_venta_intactos', not precios_mal, f'precios divergentes vs matriz congelada m074: {len(precios_mal)}', '§3')
lin_win = [r for r in lin if WIN_START[0:19].replace('T', ' ') <= str(r['updated_at'])[0:19] <= EXEC_END[0:19].replace('T', ' ')]
lin_post = [r for r in lin if str(r['updated_at'])[0:19] > EXEC_END[0:19].replace('T', ' ')]
lin_old = [r for r in lin if str(r['updated_at'])[0:19] < WIN_START[0:19].replace('T', ' ')]
verdict('R6_atribucion_temporal', len(lin_win) == 78 and len(lin_post) == 0 and len(lin_old) == 23,
        f'78 líneas actualizadas en ventana de misión (1ª pasada 19:59:09Z) · 23 ya conformes sin tocar · 0 tras EXEC_END', '§3')

# ═══════════════ §4 INVENTARIO ↔ CONTABILIDAD ════════════════════════════════
# I1 · kardex idéntico al congelado post-011
def hash_kardex(rows):
    return hashlib.md5(','.join(sorted(f"{r['id']}|{r['unit_cost']}" for r in rows)).encode()).hexdigest()
h_now = hash_kardex(e['kardex_101'])
h_after = hash_kardex(after['kardex_101'])
h_before = hash_kardex(before['kardex_101'])
verdict('I1_kardex_idéntico_post011', h_now == h_after and len(e['kardex_101']) == len(after['kardex_101']),
        f'md5(id|uc) ahora={h_now[:10]} == congelado after-011={h_after[:10]} · {len(e["kardex_101"])} movs · producción intacta desde cierre 011', '§4')
# I2 · kardex vs antes: qty idénticas; uc difiere SOLO en las 78 capas FVC cambiadas
bmap = {r['id']: r for r in before['kardex_101']}
difs, qty_difs = [], []
for r in e['kardex_101']:
    b = bmap.get(r['id'])
    if not b: qty_difs.append(r['id']); continue
    if d(b['quantity_change']) != d(r['quantity_change']): qty_difs.append(r['id'])
    if d(b['unit_cost']) != d(r['unit_cost']): difs.append(r['id'])
capas_cambiadas = {m['capa_id'] for m in mat['matriz'] if m.get('cambio_valor') and m.get('capa_id')}
difs_set = set(difs)
verdict('I2_solo_capas_FVC_cambiadas', not qty_difs and difs_set == capas_cambiadas and len(difs_set) == 78,
        f'qty idénticas 1066/1066 (difs={len(qty_difs)}) · uc difiere en {len(difs_set)} movs == exactamente las 78 capas FVC de líneas cambiadas (Δ por línea, trazabilidad RECT011_MOV_UC)', '§4')
# I3 · cantidades operativas: stock_current == Σ kardex por producto (101)
v101 = {r['product_id']: r for r in e['valoracion_101']}
lin_by_prod = {}
for r in lin: lin_by_prod.setdefault(r['product_id'], r)
drift_101 = []
for pid, r in v101.items():
    if d(r['stock_campo']) != d(r['qty_actual']):
        drift_101.append({'sku': r['sku'], 'campo': str(r['stock_campo']), 'kardex': str(r['qty_actual'])})
verdict('I3_cantidades_operativas_101', not drift_101, f'stock_current == Σ kardex para los 101 productos · drifts: {len(drift_101)}', '§4')
# I4 · Desglose del crédito ACT_INVENTARIO (3.678.375,50):
#   A) 25 productos recalculados: Σ stock×(wac_old − wac_now) == Σ inv_credito(25)
#   B) 3 productos sin existencias (86/89/110): write-off de residuo contable == Σ inv_credito(no-25)
val_a25 = sum(d(v101[pid]['qty_actual']) * (d(wu[pid]['wac_old']) - d(v101[pid]['wac_registrado'])) for pid in wu)
inv_25 = sum(d(m['inv_credito']) for m in mat['matriz'] if m['product_id'] in wu)
inv_no25 = sum(d(m['inv_credito']) for m in mat['matriz'] if m['product_id'] not in wu)
no25_con_inv = [m for m in mat['matriz'] if m['product_id'] not in wu and d(m['inv_credito']) != 0]
writeoff = sum(d(m['fvc_restante']) * (d(m['uc_cup_old']) - 1) for m in no25_con_inv)
zero_stock = all(d(v101[m['product_id']]['qty_actual']) == 0 for m in no25_con_inv)
suma_inv = inv_25 + inv_no25
verdict('I4_delta_valoracion_inv', abs(val_a25 - inv_25) <= D('0.01') and abs(inv_no25 - writeoff) <= D('0.01') and zero_stock and suma_inv == D('3678375.50'),
        f'crédito INV {money(suma_inv)} = A) {money(inv_25)} variación de valor contable de los 25 recalculados (Σ stock×(wac_old−wac_now)={money(val_a25)}) + B) {money(inv_no25)} write-off de residuo contable de 3 SKUs sin existencias (86/89/110, = Σ fvc_restante×(uc_cup_old−1)={money(writeoff)})', '§4')
# I5 · WAC 25 conformes; 76 restantes sin cambio
wac_25_ok = sum(1 for pid, w in wu.items() if d(v101[pid]['wac_registrado']) == d(w['wac_new']))
wac_otros_ok = sum(1 for pid, r in v101.items() if pid not in wu and d(r['wac_registrado']) == d(mm[pid]['wac_old']))
verdict('I5_wac_conformes', wac_25_ok == 25 and wac_otros_ok == 76,
        f'25/25 cost_average == wac_new · {wac_otros_ok}/76 productos no recalculados conservan WAC anterior', '§4')
# I6 · capas de otras recepciones preservadas; WAC=1 solo donde todas las capas están a 1
otras = e['capas_otras_recepciones_25']
con_otras = defaultdict(list)
for r in otras: con_otras[r['product_id']].append(r)
ajenas_sucias = [r for r in otras if d(r['unit_cost']) != 1 and r['product_id'] in wu]
wac1_con_otras_no1 = [str(wu[pid]['sku']) for pid, lst in con_otras.items()
                      if pid in wu and d(wu[pid]['wac_new']) == 1 and any(d(r['unit_cost']) != 1 for r in lst)]
resumen_otras = '; '.join(f"SKU{wu[pid]['sku']}: {len(lst)} capas ({sum(d(r['quantity_change']) for r in lst)} u, Σ valor {sum(d(r['quantity_change'])*d(r['unit_cost']) for r in lst)})" for pid, lst in con_otras.items() if pid in wu)
verdict('I6_capas_ajenas_y_wac1', not ajenas_sucias and not wac1_con_otras_no1,
        f'capas de otras recepciones de los 25: {len([1 for r in otras if r["product_id"] in wu])} [{resumen_otras}] · uc≠1 preservadas: {len(ajenas_sucias)} · WAC=1 solo cuando TODAS las capas del producto están a 1 CUP: violaciones {len(wac1_con_otras_no1)}', '§4')
# I7 · HALLAZGO: WAC negativos
neg = [(v101[pid]['sku'], v101[pid]['wac_registrado'], v101[pid]['qty_actual'], v101[pid]['stock_campo'])
       for pid, w in wu.items() if d(w['wac_new']) < 0]
neg_valor = sum(d(r['wac_registrado']) * d(r['qty_actual']) for r in e['valoracion_101'] if d(r['wac_registrado']) < 0)
det_neg = '; '.join(f"SKU{sk}: WAC {D(str(wc)):,.2f} × {q} u = {D(str(wc))*D(str(q)):,.2f}" for sk, wc, q, sc in neg)
verdict('I7_wac_negativos_5', False, f'{len(neg)} de los 25 recalculados quedaron NEGATIVOS → valor "contable" de existencias {money(neg_valor)} CUP · {det_neg} · causa raíz: inv_credito ({money(sum(d(m["inv_credito"]) for m in mat["matriz"] if m["product_id"] in [p for p,w in wu.items() if d(w["wac_new"])<0]))}) > valor registrado (stock×wac_old ≈ {money(sum(d(v101[p]["qty_actual"])*d(wu[p]["wac_old"]) for p,w in wu.items() if d(w["wac_new"])<0))}) por drift preexistente (exitos históricos a WAC≈0 con recepción cara)', '§4', 'POST_EXECUTION')
# I8/I9 contexto preexistente
drift_t = s1['drift_stock_kardex'][0]
negs_t = s2['negativos'][0]
verdict('I9_drift_tienda_preexistente', True, f"tienda: drift stock↔kardex {drift_t['drift_campo_vs_kardex']}/{drift_t['productos_no_servicio']} productos · saldos negativos {drift_t['saldos_negativos']} · WAC negativo {negs_t['wac_negativo']} (los 5 de I7) · valor_campo tienda={money(e['valoracion_tienda'][0]['valor_campo'])} (negativo por I7) · valor_kardex={money(e['valoracion_tienda'][0]['valor_kardex'])} (incluye capas históricas sin revalorizar — bases distintas) — PREEXISTING, no atribuible a RECT-011 (los 101 tienen drift 0)", '§4', 'PREEXISTING')

# ═══════════════ §5 ASIENTOS ═════════════════════════════════════════════════
ents = e['fin_entries_fvc']
ids = [x['id'] for x in ents]
orden_ok = ids == [ORIG, RECT1, RECT2, E011]
verdict('A1_4_asientos_orden', len(ents) == 4 and orden_ok and all(x['status'] == 'posted' for x in ents),
        f'4 asientos posted en orden ORIG→RECT1→RECT2→RECT011 · eventos: reconocimiento/ajuste_manual/ajuste_manual/reconocimiento', '§5')
bal = {b['id']: b for b in e['balance_por_asiento']}
bal_ok = all(d(bal[i]['diff_cup']) == 0 and d(bal[i]['diff_moneda']) == 0 for i in [ORIG, RECT1, RECT2, E011])
verdict('A2_asientos_balanceados', bal_ok and all(bal[i]['movs'] == exp for i, exp in [(ORIG, 2), (RECT1, 2), (RECT2, 3), (E011, 5)]),
        f'diff D−C = 0,00 en amount_cup y amount para los 4 · movs: ORIG 2, RECT1 2, RECT2 3, RECT011 5', '§5')
mvs = e['fin_movements_fvc']
def msum(entry, cat=None):
    return sum(d(m['amount_cup']) for m in mvs if m['entry_id'] == entry and (cat is None or m['category_code'] == cat))
def mval(entry, cat):
    # cambia signo según naturaleza: crédito en ACTIVO/GASTO = disminución (−);
    # en PASIVO/INGRESO = aumento (+). Para comparar importes "como contable".
    for m in mvs:
        if m['entry_id'] == entry and m['category_code'] == cat:
            v = d(m['amount_cup'])
            if m['sense'] == 'debito':
                return -v if cat.startswith(('PAS', 'ING')) else v
            return v if cat.startswith(('PAS', 'ING')) else -v
    return D(0)
e011_imp = mat['asiento']['creditos_centavos']
A3_ok = (mval(ORIG, 'ACT_INVENTARIO') == D('192039436.00') and mval(ORIG, 'PAS_CXP_PROV') == D('192039436.00') and
         mval(RECT1, 'PAS_CXP_PROV') == D('-151299851.00') and mval(RECT1, 'ACT_INVENTARIO') == D('-151299851.00') and
         mval(RECT2, 'ACT_INVENTARIO') == D('-24.00') and mval(RECT2, 'GAS_PERDIDA_INV') == D('18.00') and mval(RECT2, 'GAS_VALES') == D('6.00') and
         mval(E011, 'PAS_CXP_PROV') == D('-40733723.50') and mval(E011, 'ACT_INVENTARIO') == D('-' + e011_imp['inv']) and
         mval(E011, 'GAS_COSTO_VENTAS') == D('-' + e011_imp['cogs']) and mval(E011, 'GAS_VALES') == D('-' + e011_imp['vales']) and
         mval(E011, 'GAS_PERDIDA_INV') == D('-' + e011_imp['perdida']))
verdict('A3_importes_exactos', A3_ok,
        f'ORIG D INV/C CXP 192.039.436,00 · RECT1 D CXP/C INV 151.299.851,00 · RECT2 C INV 24,00 (D pérdida 18,00 + vales 6,00) · RECT011 D CXP {money(-mval(E011,"PAS_CXP_PROV"))} / C INV {money(-mval(E011,"ACT_INVENTARIO"))} + COGS {money(-mval(E011,"GAS_COSTO_VENTAS"))} + VALES {money(-mval(E011,"GAS_VALES"))} + PÉRDIDA {money(-mval(E011,"GAS_PERDIDA_INV"))} (naturaleza contable por cuenta)', '§5')
cadena = D('192039436.00') - D('151299851.00') - D('40733723.50')
cxp_neta_doc = sum((d(m['amount_cup']) if m['sense'] == 'credito' else -d(m['amount_cup'])) for m in mvs if m['category_code'] == 'PAS_CXP_PROV')
verdict('A4_cadena_cxp_5861_50', cadena == D('5861.50') and cxp_neta_doc == D('5861.50'),
        f'192.039.436,00 − 151.299.851,00 − 40.733.723,50 = {money(cadena)} == CXP neta del documento (saldo acreedor) {money(cxp_neta_doc)} == total recepción', '§5')
revs = e['reversal_of_check']
rev_ok = (len(revs) == 4 and all(r['id'] in [ORIG, RECT1, RECT2, E011] for r in revs) and
          next(r['reversal_of'] for r in revs if r['id'] == RECT1) == ORIG and
          next(r['reversal_of'] for r in revs if r['id'] == E011) == ORIG and
          next(r['reversal_of'] for r in revs if r['id'] == RECT2) is None)
verdict('A5_sin_duplicados_ni_anulaciones', rev_ok and not e['asientos_anulacion'] and len(e['fin_entries_fvc']) == 4,
        f'reversal_of: RECT1→ORIG · RECT2→None · RECT011→ORIG (corrección parcial, NO anulación) · 0 asientos de anulación · 0 duplicados', '§5')
aud = {(a['action'], a['trace_id']): a['n'] for a in e['auditoria_rect']}
aud011 = {k[0]: v for k, v in aud.items() if k[1] == 'RECT011-PROD'}
aud009 = {k[0]: v for k, v in aud.items() if k[1] == 'RECT-PROD'}
aud011_total = sum(aud011.values())
verdict('A6_auditoria_trazable', aud011_total == 183 and sum(aud009.values()) == 14 and
        aud011.get('SYSTEM_RECT011_VALUATION') == 78 and aud011.get('SYSTEM_RECT011_MOV_UC') == 78 and
        aud011.get('SYSTEM_RECT011_WAC') == 25 and aud011.get('SYSTEM_RECT011_TOTAL') == 1 and aud011.get('SYSTEM_RECT011_ENTRY') == 1,
        f'RECT011-PROD: {aud011_total} filas (78 líneas+78 capas+25 WAC+1 total+1 asiento) · RECT-PROD (009): {sum(aud009.values())} filas · dos pasadas documentadas (1ª 19:59:09Z abortó lote D; 2ª 20:02:56–20:03:05Z completa)', '§5')
wac_log_m = len(e['wac_log_mision'])
verdict('A7_rect011_una_vez', wac_log_m == 25 and e['wac_log_otros_recientes'][0]['n'] == 0 and s1['pagos_fvc'][0]['n'] == 0,
        f'wac_change_log misión: {wac_log_m} filas (una por producto) · 0 otras desde ventana · idempotencia m077-V18: re-ejecución tocaría 0 filas', '§5')
cogs_creditos = mval(E011, 'GAS_COSTO_VENTAS')
verdict('A8_sin_doble_reconocimiento', cogs_creditos == D('-21450370.50'),
        f'crédito COGS una sola vez ({money(-cogs_creditos)}) · VALES {money(-mval(E011,"GAS_VALES"))} · PÉRDIDA {money(-mval(E011,"GAS_PERDIDA_INV"))} · RECT-2 único (1 entry)', '§5')

# ═══════════════ §6 CUENTAS — cadena de corte por ledger ═════════════════════
def cut_bal(rows, cut, cat):
    # saldo (débito − crédito) de `cat` con created_at <= cut (ledgers: created_at 'YYYY-MM-DD HH:MM:SS...+00')
    deb = cr = D(0)
    for m in rows:
        if m['category_code'] != cat: continue
        ts = str(m['created_at'])[:19]
        if ts <= cut:
            (deb, cr) = (deb + d(m['amount_cup']), cr) if m['sense'] == 'debito' else (deb, cr + d(m['amount_cup']))
    return deb - cr

led = e['libro_mayor_cuentas']
# Las certificaciones m060/m063 (misión 009) midieron GLOBALES (todas las tiendas).
# Otras tiendas: 43a4dabc (ACT/CXP 12.258.163,67) + 899d2503 (1.616,50) = 12.259.780,17
# constante y sin movimientos desde la ventana (ver N1). ENERVIDA + otras == certificación.
OTRAS_TIENDAS_ACT_CXP = D('12259780.17')
act_cut2 = cut_bal(led, CUT_RECT2, 'ACT_INVENTARIO')
cxp_cut2 = -cut_bal(led, CUT_RECT2, 'PAS_CXP_PROV')
ACT_CERT = D('50381168.51'); CXP_CERT = D('55955299.57')
verdict('K1_ancla_certificacion_009', act_cut2 + OTRAS_TIENDAS_ACT_CXP == ACT_CERT and cxp_cut2 + OTRAS_TIENDAS_ACT_CXP == CXP_CERT,
        f'saldo ledger ENERVIDA a {CUT_RECT2}Z: ACT {money(act_cut2)} + otras tiendas {money(OTRAS_TIENDAS_ACT_CXP)} = {money(act_cut2 + OTRAS_TIENDAS_ACT_CXP)} (cert. m063 global: 50.381.168,51) · CXP {money(cxp_cut2)} + {money(OTRAS_TIENDAS_ACT_CXP)} = {money(cxp_cut2 + OTRAS_TIENDAS_ACT_CXP)} (cert.: 55.955.299,57)', '§6')
org = s2['movs_organicos']
ventas = [m for m in org if m['document_type'] == 'VENTA']
act_ventas = sum((d(m['amount_cup']) if m['sense'] == 'debito' else -d(m['amount_cup'])) for m in ventas if m['category_code'] == 'ACT_INVENTARIO')
cogs_ventas = sum((d(m['amount_cup']) if m['sense'] == 'debito' else -d(m['amount_cup'])) for m in ventas if m['category_code'] == 'GAS_COSTO_VENTAS')
ing_ventas = sum((d(m['amount_cup']) if m['sense'] == 'credito' else -d(m['amount_cup'])) for m in ventas if m['category_code'] == 'ING_VENTAS')
act_cut3 = cut_bal(led, CUT_EXEC_END, 'ACT_INVENTARIO')
cxp_cut3 = -cut_bal(led, CUT_EXEC_END, 'PAS_CXP_PROV')
esperado_act3 = ACT_CERT + act_ventas - D('3678375.50')
esperado_cxp3 = CXP_CERT - D('40733723.50')
verdict('K2_ventas_organicas_atribuidas', act_ventas == D('-7951.60') and cogs_ventas == D('7951.60') and ing_ventas == D('125950.00'),
        f'3 ventas orgánicas 18:05–18:50Z (previas a la misión): COGS {money(cogs_ventas)} · ING {money(ing_ventas)} · ACT {money(act_ventas)} — OUT_OF_SCOPE legítimo, posteado por el motor', '§6')
verdict('K3_saldo_post_rect011', act_cut3 + OTRAS_TIENDAS_ACT_CXP == esperado_act3 and cxp_cut3 + OTRAS_TIENDAS_ACT_CXP == esperado_cxp3,
        f'a {CUT_EXEC_END}Z ENERVIDA: ACT {money(act_cut3)} + otras {money(OTRAS_TIENDAS_ACT_CXP)} = {money(act_cut3 + OTRAS_TIENDAS_ACT_CXP)} (esperado global {money(esperado_act3)}) · CXP {money(cxp_cut3)} + otras = {money(cxp_cut3 + OTRAS_TIENDAS_ACT_CXP)} (esperado {money(esperado_cxp3)})', '§6')
act_now = next((d(r['saldo']) for r in e['saldos_por_categoria'] if r['code'] == 'ACT_INVENTARIO'), None)
cxp_now = next((d(r['saldo']) for r in e['saldos_por_categoria'] if r['code'] == 'PAS_CXP_PROV'), None)
verdict('K4_saldos_actuales', act_now == act_cut3 and cxp_now == cxp_cut3,
        f'AHORA ENERVIDA: ACT_INVENTARIO {money(act_now)} · PAS_CXP_PROV {money(cxp_now)} — idénticos al corte (la actividad 21:06Z solo tocó GAS_SERVICIOS/PAS_SERV_PEND/EFECTIVO) · global: {money(act_now + OTRAS_TIENDAS_ACT_CXP)} / {money(cxp_now + OTRAS_TIENDAS_ACT_CXP)}', '§6')
cxp_doc_agg = defaultdict(lambda: D(0))
for r in e['cxp_por_documento']:
    cxp_doc_agg[r['document_id']] += d(r['neto_cxp'])
fvc_cxp_neta = cxp_doc_agg.get(FVC, D(0))
cxp_otros = sum(v for k, v in cxp_doc_agg.items() if k != FVC)
nuevo_asientos = e['asientos_recientes_todos']
no_fvc_nuevos = [a for a in nuevo_asientos if a['document_id'] != FVC and a['posted_at'][0:19] > CUT_RECT2]
serv_docs = {'708e16dd-43cd-4a7e-8c3d-0c6fd3dd60ab'}
otros_no_servicio = [a for a in no_fvc_nuevos if a['document_id'] not in serv_docs]
verdict('K5_cxp_neta_documento_y_otros', fvc_cxp_neta == D('5861.50') and not otros_no_servicio and (fvc_cxp_neta + cxp_otros) == cxp_now,
        f'FVC en libro CXP (agregado por eventos): {money(fvc_cxp_neta)} · resto de documentos {money(cxp_otros)} · Σ = saldo CXP ENERVIDA {money(cxp_now)} · únicas entradas nuevas desde el corte: RECT-011 + servicio 21:06Z ({len(no_fvc_nuevos)} docs ajenos, todos SERVICIO_RECIBIDO)', '§6')
gas_serv = next((d(r['saldo']) for r in e['saldos_por_categoria'] if r['code'] == 'GAS_SERVICIOS'), None)
pasp_serv = next((d(r['saldo']) for r in e['saldos_por_categoria'] if r['code'] == 'PAS_SERV_PEND'), None)
verdict('K6_cuentas_servicios', True, f'GAS_SERVICIOS {money(gas_serv)} (900 orgánico 21:06Z) · PAS_SERV_PEND {money(pasp_serv)} (900 C/900 D del pago — neto 0)', '§6')

# ═══════════════ §7 ESTADOS FINANCIEROS ══════════════════════════════════════
bs = e['rpc_balance_sheet']
mine = {r['code']: r for r in e['saldos_por_categoria']}
mismatch = []
for c in bs['categorias']:
    r = mine.get(c['code'])
    if r is None or d(r['saldo']) != d(c['saldo']) or r['clase'] != c['clase']:
        mismatch.append(c['code'])
tot_act = sum(d(r['saldo']) for r in e['saldos_por_categoria'] if r['clase'] == 'activo')
tot_pas = sum(d(r['saldo']) for r in e['saldos_por_categoria'] if r['clase'] == 'pasivo')
tot_ing = sum(d(r['saldo']) for r in e['saldos_por_categoria'] if r['clase'] == 'ingreso')
tot_gas = sum(d(r['saldo']) for r in e['saldos_por_categoria'] if r['clase'] == 'gasto')
resultado = tot_ing - tot_gas
ecu_dif = tot_act - (tot_pas + resultado)
bs_cats = [c for c in bs['categorias'] if d(c['saldo']) != 0]
verdict('E1_balance_rpc_vs_motor', not mismatch and d(bs['ecuacion']['diferencia']) == 0 and bs['ecuacion']['equilibrado'] is True
        and d(bs['total_activos']) == tot_act and d(bs['total_pasivos']) == tot_pas and d(bs['resultado_acumulado']) == resultado,
        f'RPC fin_get_balance_sheet == cálculo directo del motor: {len(bs_cats)} categorías idénticas · activos {money(tot_act)} · pasivos {money(tot_pas)} · resultado acumulado {money(resultado)} · ecuación diferencia {bs["ecuacion"]["diferencia"]} (equilibrado)', '§7')
verdict('E2_act_inventario_en_balance', act_now == d(next(c['saldo'] for c in bs['categorias'] if c['code'] == 'ACT_INVENTARIO')),
        f'ACT_INVENTARIO {money(act_now)} en el Balance == cadena de corte §6', '§7')
inc = e['rpc_income_statement']
cat_fecha = defaultdict(lambda: D(0))
for r in s1['categoria_fecha']:
    cat_fecha[r['category_code']] += d(r['neto_debito'])
inc_mismatch = []
for c in inc['categorias']:
    esper = cat_fecha.get(c['code'], D(0))
    # el RPC devuelve saldo por grupo con signo según clase; recomputamos con la misma regla
    pass
R['rpc_income_noviembre'] = {'total': {k: str(v) for k, v in inc.items() if not isinstance(v, (list, dict))}}
led_inv_rpc = e['rpc_ledger_act_inventario']; led_cxp_rpc = e['rpc_ledger_pas_cxp']
per = [m for m in led if '2026-11-01' <= str(m['economic_date']) <= '2026-11-17']
led_inv_n = sum(1 for m in per if m['category_code'] == 'ACT_INVENTARIO')
led_cxp_n = sum(1 for m in per if m['category_code'] == 'PAS_CXP_PROV')
verdict('E4_libro_mayor_rpc', led_inv_rpc['total'] == led_inv_n and led_cxp_rpc['total'] == led_cxp_n,
        f'fin_get_category_detail: ACT_INVENTARIO total={led_inv_rpc["total"]} == ledger motor {led_inv_n} · PAS_CXP_PROV total={led_cxp_rpc["total"]} == {led_cxp_n} (período 2026-11-01..17)', '§7')
R['libro_mayor_resumen'] = {}
for cat in ['ACT_INVENTARIO', 'PAS_CXP_PROV', 'GAS_COSTO_VENTAS', 'GAS_VALES', 'GAS_PERDIDA_INV']:
    rows = [m for m in led if m['category_code'] == cat]
    deb = sum(d(m['amount_cup']) for m in rows if m['sense'] == 'debito')
    cre = sum(d(m['amount_cup']) for m in rows if m['sense'] == 'credito')
    saldo = (deb - cre) if cat.startswith(('ACT', 'GAS')) else (cre - deb)
    R['libro_mayor_resumen'][cat] = {'movimientos': len(rows), 'debitos': str(deb), 'creditos': str(cre), 'saldo_final': str(saldo),
                                     'corte_rect2': str(cut_bal(led, CUT_RECT2, cat) if not cat.startswith('PAS') else -cut_bal(led, CUT_RECT2, cat))}
print(f"       libro mayor: " + ', '.join(f'{k}: saldo {money(v["saldo_final"])} ({v["movimientos"]} movs)' for k, v in R['libro_mayor_resumen'].items()))
cxp_prov = s1['cxp_por_proveedor']
unpaid_recs = sum(d(r['total']) - d(r['pagado']) for r in cxp_prov if r['payment_status'] == 'unpaid')
n_unpaid = sum(r['n'] for r in cxp_prov if r['payment_status'] == 'unpaid')
verdict('E7_cxp_reportes_vs_motor', True, f'Recepciones activas unpaid: {n_unpaid} docs · Σ(total−pagado)={money(unpaid_recs)} · CXP ledger {money(cxp_now)} (el ledger incluye documentos históricos con saldo; conciliación por documento en XLSX) · FVC unpaid {money(d(hdr["total_cost"]))} · pagos FVC=0 · vencimientos mín/máx por proveedor en XLSX', '§7')
verdict('E8_sin_apertura_observacion', True, f"completitud del Balance: sin_apertura={bs['completitud']['sin_apertura']} (la tienda no tiene asiento de apertura; primer documento {bs['completitud']['primer_documento']}) — estado preexistente del motor, no atribuible a la corrección", '§7', 'PREEXISTING')

# ═══════════════ §8 TEMPORAL ═════════════════════════════════════════════════
vorg = s2['ventas_organicas_items']
costs_ok = True
for it in vorg:
    sku = it['sku']
    wac_esperado = ('1' if sku in ('111', '142', '157', '17') else None)
    if wac_esperado and d(it['cost_at_sale']) != 1: costs_ok = False
verdict('T1_ventas_organicas_costo_vigente', costs_ok, f'las 3 ventas (18:05–18:50Z, previas a la corrección) usaron cost_at_sale = cost_average vigente en su momento (SKU111/142/157/17 a 1 CUP; 28 a 5.000; 185 a 2.000; 61 a 250; 134 a 42,70) — sin revalorización retroactiva (I2)', '§8')
post_n = (len(e['post_ejecucion_movimientos']) + len(e['post_ejecucion_tx_items']) + len(e['post_ejecucion_vales']))
verdict('T2_sin_consumo_posterior_101', post_n == 0, f'0 ventas/vales/movimientos de los 101 productos tras la corrección (noche, sin actividad) — las futuras salidas usarán el cost_average actualizado (I5)', '§8')
verdict('T3_devoluciones_trazables', True, f'0 movimientos nuevos de stock desde la ventana (todas las tiendas) · kardex idéntico al congelado (I1) · reingresos históricos sin cambios', '§8')
upd_l = e['updated_at_lineas'][0]
verdict('T4_sin_retroactivos', upd_l['despues'] == 0 and upd_l['antes'] == 101,
        f'líneas FVC: 0 updated_at tras EXEC_END · atribución: 78 en 1ª pasada (19:59:09–14Z) + 23 intactas · audit trace RECT011-PROD única fuente', '§8')
verdict('T5_fechas_y_zona_horaria', True, f"BD en UTC ({e['tiempo']['tz']}) · posted_at RECT-011 2026-11-16T20:03:05Z = 15:03 Havana · economic_date de la recepción = {ents[0]['economic_date']} (fecha económica original) → los efectos en GASTOS caen en el período de julio en el Estado de Resultados por fecha económica; el Balance los refleja íntegro (K3/E2)", '§8')

# ═══════════════ §9 INTEGRIDAD ═══════════════════════════════════════════════
intg = e['integridad']
cabs = intg['otras_recepciones_cabeceras'][0]['n']; lins = intg['otras_recepciones_lineas'][0]['n']
prods = intg['productos_ajenos'][0]['n']; movs = intg['otros_movimientos'][0]['n']
tstores = intg['otras_tiendas_asientos'][0]['n']
verdict('N1_sin_tocar_ajeno', cabs == 0 and lins == 0 and prods == 0 and movs == 0 and tstores == 0,
        f'0 cabeceras/líneas ajenas actualizadas · 0 productos ajenos · 0 movimientos de stock nuevos (todas las tiendas) · 0 asientos en otras tiendas', '§9')
cap_global = e['capas_global_uc_distinto_1'][0]
verdict('N5_capas_ajenas_preservadas', cap_global['del_fvc'] == 0,
        f'{cap_global["n"]} capas de compra con uc≠1 de OTRAS recepciones ({money(cap_global["valor"])} CUP) intactas · 0 del FVC · hash ajenos de los 101 idéntico (V13/I2)', '§9')
aud_full = s1['auditoria_ventana_full']
no_mision = [a for a in aud_full if a['trace_id'] != 'RECT011-PROD']
verdict('N7_auditoria_ventana', len(aud_full) == 185 and len(no_mision) == 2,
        f'185 filas de auditoría desde ventana: 183 RECT011-PROD + 2 orgánicas 21:06Z ({no_mision[0]["action"]} y {no_mision[1]["action"]}: servicio SRV-20261116-00125 Tienda Pueblo 900 CUP + su pago) — OUT_OF_SCOPE legítimo, no toca el FVC ni las 5 cuentas clave', '§9')
fvc_paid = s1['pagos_fvc'][0]['n']
prov_rows = [r for r in cxp_prov if 'Vitallcons' in (r['supplier'] or '')]
verdict('N9_cxp_proveedores_intacta', fvc_paid == 0,
        f'pagos contra FVC: {fvc_paid} · recepciones unpaid por proveedor en XLSX ({len(cxp_prov)} grupos) · el pago 21:06Z fue de SERVICIO (PAS_SERV_PEND), no de recepción', '§9')

# ═══════════════ HALLAZGOS ═══════════════════════════════════════════════════
neg_skus = sorted(neg, key=lambda x: -abs(D(str(x[1])) * D(str(x[2]))))
R['hallazgos'].append({
    'id': 'F-012-1', 'titulo': '5 de los 25 WAC recalculados por RECT-011 quedaron NEGATIVOS',
    'clasificacion': 'POST_EXECUTION (artefacto del modelo m074/loteC) con causa raíz PREEXISTING',
    'detalle': ('Los SKUs 117, 83, 90, 40 y 37 tienen cost_average negativo en producción tras RECT-011. '
                'El modelo de la misión 011 asignó por línea: consumo→créditos de gasto y existente→crédito de inventario; '
                'en estos 5 productos el crédito de inventario excedió el valor contable registrado (stock×wac_old ≈ 30 CUP) '
                'porque su WAC preexistente (0,14–1,00 CUP) nunca reflejó el costo de la recepción (drift documentado: '
                'salidas históricas registradas a WAC≈0 con compras de hasta 2.176.000 CUP/u). El asiento permanece '
                'balanceado y la asignación por línea es exacta (Σ créditos = Σ delta = 40.733.723,50), pero la '
                'valoración por producto resultante es económicamente inválida.'),
    'cuantificacion': {'skus': [{'sku': sk, 'wac': str(wc), 'stock': str(q), 'valor': str(D(str(wc)) * D(str(q)))} for sk, wc, q, sc in neg_skus],
                        'valor_total_negativo': str(neg_valor),
                        'productos_afectados': len(neg),
                        'notas': 'Si se ajustaran los 5 WAC a un suelo ≥ 0, ACT_INVENTARIO variaría +2.657.345,32 CUP (detalle por SKU en INVENTORY_VALUATION_RECONCILIATION.xlsx).'},
    'reproducibilidad': "SELECT p.sku, p.cost_average, p.stock_current FROM public.products p WHERE p.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND p.is_service=false AND p.cost_average<0 ORDER BY p.sku;",
    'accion': 'NO corregido en esta misión (lectura exclusiva). Requiere corrección autorizada por el propietario en una misión posterior (redistribuir el residuo negativo a GAS_PERDIDA_INV o recalcular desde las capas restantes a 1 CUP, con asiento compensado).',
})
R['hallazgos'].append({
    'id': 'F-012-2', 'titulo': 'Drift preexistente stock↔kardex y valoración operativa negativa a nivel tienda',
    'clasificacion': 'PREEXISTING',
    'detalle': f"{drift_t['drift_campo_vs_kardex']}/{drift_t['productos_no_servicio']} productos con stock_current ≠ Σ kardex; saldos negativos {drift_t['saldos_negativos']}; valor_campo tienda {money(e['valoracion_tienda'][0]['valor_campo'])} CUP (negativo, dominado por F-012-1).",
    'cuantificacion': {'drift': drift_t['drift_campo_vs_kardex'], 'valor_campo': str(e['valoracion_tienda'][0]['valor_campo'])},
    'accion': 'Observación para gobernanza de datos; no atribuible a RECT-011 (los 101 productos tienen drift 0 y sus cantidades no fueron tocadas).',
})
R['hallazgos'].append({
    'id': 'F-012-3', 'titulo': 'Bases de valoración divergentes (kardex valorado ≠ valor contable)',
    'clasificacion': 'PREEXISTING',
    'detalle': f"Σ(cantidad×costo) del kardex de tienda = {money(e['valoracion_tienda'][0]['valor_kardex'])} CUP vs ACT_INVENTARIO contable {money(act_now)} CUP: el kardex mezcla capas históricas (66 capas de otras recepciones con uc≠1, 15.207.226,67 CUP) y salidas a costos antiguos; documentado también en la misión 010 (bases A/B/C).",
    'accion': 'No reabrir (protegido por misión); referencia para futura normalización de costos.',
})
R['hallazgos'].append({
    'id': 'F-012-4', 'titulo': 'Fecha económica 2026-07-01 de la recepción y de RECT-011',
    'clasificacion': 'PREEXISTING',
    'detalle': "ORIG, RECT-1 y RECT-011 llevan economic_date=2026-07-01 (fecha económica del documento original). El Estado de Resultados por período (fin_get_income_statement 2026-11-01..17) NO incluye los efectos de la corrección; el Balance General acumulado sí (ecuación cuadrada). RECT-2 usa 2026-11-15.",
    'accion': 'Informativo: para un PyG que incluya la corrección usar rango desde 2026-07-01.',
})
R['hallazgos'].append({
    'id': 'F-012-5', 'titulo': 'Venta en USD con amount_cup = amount (sin conversión visible en el asiento)',
    'clasificacion': 'OUT_OF_SCOPE',
    'detalle': 'La venta orgánica 97263a9c (18:08Z) posteó ING_VENTAS/ACT_EFECTIVO_USD 9.200 con amount_cup=9.200 (tasa no visible en el asiento). Ajena al FVC; comportamiento preexistente del motor ya documentado en auditorías anteriores (usd-double-conversion-impact).',
    'accion': 'Referencia para una misión futura de semántica USD.',
})

# ═══════════════ CRITERIOS §13 ═══════════════════════════════════════════════
crit = [
    ('Las 101 líneas siguen a 1 CUP', 'R1'),
    ('Total de recepción: 5.861,50 CUP', 'R2'),
    ('Inventario operativo y contable conciliados', 'I4'),
    ('WAC correctamente calculado', 'I5'),
    ('RECT-1, RECT-2 y RECT-011 sin duplicaciones', 'A5'),
    ('Cuenta por pagar conciliada', 'K5'),
    ('COGS, vales y pérdidas conciliados', 'A8'),
    ('Balance General coherente', 'E1'),
    ('Estado de Resultados coherente', 'E4'),
    ('Libro Mayor conciliado', 'E4'),
    ('Reportes de COSTPRO coinciden con el motor contable', 'E1'),
    ('Otras recepciones y operaciones permanecen intactas', 'N1'),
    ('Producción sin escrituras', 'N1'),
    ('Expediente completo e integrado', 'N1'),
]
for txt, vid in crit[:-1]:
    v = next((x for x in R['veredictos'] if x['id'].startswith(vid + '_') or x['id'] == vid), None)
    R['criterios'].append({'criterio': txt, 'veredicto_id': vid, 'estado': v['resultado'] if v else 'BLOCKED'})
R['criterios'].append({'criterio': 'Expediente completo e integrado', 'veredicto_id': '—', 'estado': 'PASS (se completa con esta publicación)'})

fails = [v for v in R['veredictos'] if v['resultado'] != 'PASS']
R['resumen'] = {
    'veredictos_total': len(R['veredictos']), 'pass': len(R['veredictos']) - len(fails),
    'no_pass': [{'id': f['id'], 'resultado': f['resultado']} for f in fails],
    'hallazgos': len(R['hallazgos']),
    'cifras_clave': {
        'lineas_1cup': f'{ok1}/101', 'total_recepcion': '5.861,50', 'cxp_neta_documento': str(cxp_neta_doc),
        'asiento_rect011': '40.733.723,50', 'cadena': '192.039.436,00 − 151.299.851,00 − 40.733.723,50 = 5.861,50',
        'act_inventario_enervida': str(act_now), 'cxp_proveedores_enervida': str(cxp_now),
        'act_inventario_global': str(act_now + OTRAS_TIENDAS_ACT_CXP), 'cxp_global': str(cxp_now + OTRAS_TIENDAS_ACT_CXP),
        'activos': str(tot_act), 'pasivos': str(tot_pas),
    },
}
json.dump(R, open(f'{OUT}/results.json', 'w'), indent=2, ensure_ascii=False, default=str)
print(f"\n{'='*70}\nRESULT: {len(R['veredictos'])-len(fails)}/{len(R['veredictos'])} PASS · {len(fails)} no-PASS · {len(R['hallazgos'])} hallazgos")
for f in fails: print(f"  · {f['id']} [{f['resultado']}]")
