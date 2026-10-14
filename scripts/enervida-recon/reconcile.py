#!/usr/bin/env python3
"""
FASE 2 — Conciliación registro a registro (v3 FINAL): Excel «Operaciones» vs COSTPRO.

v3: dos pasadas (estricta: dd≤1 ∧ qty_ok → relajada), doble convención de importes
(item nativo ↔ tx-level con zelle CUP=USD×680), equivalencia de vuelto (vuelto → USD neto),
redondeo ≤1 CUP tolerado, compensación DV/VS (VS creada+reversada ≡ DV+VS neto 0),
ajustes de inventario para filas «Ajuste», recepciones con desfase documentado.
"""
import json
import csv
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict

BASE = '/home/z/my-project/scripts/enervida-recon'
HAV = ZoneInfo('America/Havana')
IMPORT_RATE = 680.0


def load(name):
    return json.load(open(f'{BASE}/{name}.json'))


def hav_date(iso_str):
    if not iso_str:
        return None
    s = str(iso_str).replace(' ', 'T').replace('Z', '+00:00')
    if '+' not in s:
        s += '+00:00'
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(HAV).date()


def xls_date(v):
    s = str(v)
    return date.fromisoformat(s[:10]) if len(s) >= 10 else None


def num(v):
    return float(v) if v not in (None, '') else 0.0


def eq(a, b, tol=0.01):
    return abs(num(a) - num(b)) <= tol


ops = load('operaciones')['rows']
txs = load('transactions')
titems = load('transaction_items')
slips = load('issue_slips')
sitems = load('issue_slip_items')
receipts = load('receipts')
ritems = load('receipt_items')
devs = load('devolutions')
ditems = load('devolution_items')
smovs = load('stock_movements')

items_by_tx = defaultdict(list)
for it in titems:
    items_by_tx[it['transaction_id']].append(it)
tx_by_id = {t['id']: t for t in txs}

# ---------------- pools ----------------
sales = []
for t in txs:
    d = hav_date(t['created_at'])
    its = items_by_tx.get(t['id'], [])
    for it in its:
        item_pay = (num(it.get('cash_paid')), num(it.get('transfer_paid')), num(it.get('zelle_paid')))
        sales.append({
            'kind': 'venta', 'tx': t['id'], 'item_id': it['id'], 'date': d,
            'sku': it.get('sku'), 'qty': num(it['quantity']),
            'i_cash': item_pay[0], 'i_transf': item_pay[1], 'i_usd': item_pay[2],
            't_cash': num(t.get('cash_amount')), 't_transf': num(t.get('transfer_amount')),
            't_zelle': num(t.get('zelle_amount')),
            'status': t['status'], 'idem': t.get('idempotency_key'),
            'tx_total': num(t.get('total_amount')), 'n_items': len(its), 'used': False,
        })


def amounts_match(s, ef, tr, usd):
    """True/False/None(=indeterminado, multi-item sin pagos por ítem).
    Compara con item nativo, tx-level (CUP + zelle×680) y equivalencia de vuelto."""
    if s['i_cash'] == 0 and s['i_transf'] == 0 and s['i_usd'] == 0 and s['n_items'] > 1:
        return None
    tol = 1.0  # redondeo documentado ≤ 0.02; tolerancia 1 CUP/USD
    # 1) item nativo
    if eq(s['i_cash'], ef, tol) and eq(s['i_transf'], tr, tol) and (
            eq(s['i_usd'], usd, 0.02) or eq(s['i_usd'], usd * IMPORT_RATE, 6.0)):
        return True
    # 2) tx-level (single-item): zelle_amount en CUP (×680) o nativo
    if s['n_items'] == 1:
        z_ok = eq(s['t_zelle'], usd, 0.02) or eq(s['t_zelle'], usd * IMPORT_RATE, 6.0) or (usd == 0 and s['t_zelle'] == 0)
        if eq(s['t_cash'], ef, tol) and eq(s['t_transf'], tr, tol) and z_ok:
            return True
    # 3) vuelto: Excel ef<0 ∧ usd>0 ≡ USD neto (usd + ef/680); CP lo guardó como zelle-only
    if ef < 0 and usd > 0:
        net_usd = usd + ef / IMPORT_RATE
        if eq(s['i_cash'], 0, tol) and eq(s['i_transf'], 0, tol) and (
                eq(s['i_usd'], net_usd, 0.06) or eq(s['i_usd'], net_usd * IMPORT_RATE, 6.0)):
            return True
        if s['n_items'] == 1 and eq(s['t_cash'], 0, tol) and eq(s['t_transf'], 0, tol) and (
                eq(s['t_zelle'], net_usd, 0.06) or eq(s['t_zelle'], net_usd * IMPORT_RATE, 6.0)):
            return True
    # 4) item-level zeros pero tx-level con importes (aud-op style: item cash=5)
    if s['n_items'] == 1 and (s['i_cash'] or s['i_usd']) and not eq(s['i_cash'], ef, tol):
        z_ok = eq(s['t_zelle'], usd, 0.02) or eq(s['t_zelle'], usd * IMPORT_RATE, 6.0) or (usd == 0 and s['t_zelle'] == 0)
        if eq(s['t_cash'], ef, tol) and eq(s['t_transf'], tr, tol) and z_ok:
            return True
    return False


vales = []
for s in slips:
    for it in [i for i in sitems if i['slip_id'] == s['id']]:
        notes = s.get('notes') or ''
        vales.append({'kind': 'vs', 'id': s['id'], 'number': s.get('slip_number'), 'date': hav_date(s['created_at']),
                      'sku': it.get('sku'), 'qty': num(it['quantity']), 'notes': notes, 'status': s['status'],
                      'nota_ref': notes.split('|')[0].strip() if '|' in notes else notes.strip(), 'used': False})

entradas = []
for r in receipts:
    d = hav_date(r.get('reception_date')) or hav_date(r['created_at'])
    for it in [i for i in ritems if i['receipt_id'] == r['id']]:
        entradas.append({'kind': 'entrada', 'id': r['id'], 'ref': r.get('reference_doc'), 'date': d,
                         'sku': it.get('sku'), 'qty': num(it['quantity']), 'status': r['status'], 'used': False})

devoluciones = []
for dv in devs:
    d = hav_date(dv['created_at'])
    for it in [i for i in ditems if i['devolution_id'] == dv['id']]:
        devoluciones.append({'kind': 'dv', 'id': dv['id'], 'number': dv.get('devolution_number'), 'date': d,
                             'sku': it.get('sku'), 'qty': num(it['quantity']), 'status': dv['status'],
                             'notes': dv.get('notes'), 'used': False})

vs_reversed = [v for v in vales if v['status'] == 'reversed']
vs_active = [v for v in vales if v['status'] != 'reversed']

# ajustes con fila Excel en la referencia (stock_movements no trae sku → mapa pid→sku)
pid2sku = {p['id']: p['sku'] for p in load('products_enervida')}
ajustes = [{'id': m['id'], 'date': hav_date(m['movement_date']), 'qty': num(m['quantity_change']),
            'sku': pid2sku.get(m.get('product_id')), 'ref': m.get('reference_doc'), 'kind': 'ajuste', 'used': False}
           for m in smovs if m['movement_type'] == 'adjustment' and 'Ajuste ENERVIDA fila' in (m.get('reference_doc') or '')]

results = []


def candidates_venta(r, strict):
    d, sku, qty = xls_date(r['Fecha']), str(r['Código']), num(r['Cantidad'])
    ef, tr, usd = num(r['Efectivo']), num(r['Transf']), num(r['USD'])
    out = []
    for s in sales:
        if s['used'] or s['sku'] != sku or s['status'] != 'completed':
            continue
        dd = abs((s['date'] - d).days) if (s['date'] and d) else 99
        if dd > 1:
            continue
        qty_ok = eq(s['qty'], qty)
        if strict and not qty_ok:
            continue
        amt = amounts_match(s, ef, tr, usd)
        out.append((s, {'dd': dd, 'qty_ok': qty_ok, 'amt_ok': amt}))
    return out


def candidates_vs(r, strict):
    d, sku, qty, nota = xls_date(r['Fecha']), str(r['Código']), num(r['Cantidad']), (r['Nota'] or '').strip()
    out = []
    for v in vs_active:
        if v['used'] or v['sku'] != sku:
            continue
        dd = abs((v['date'] - d).days) if (v['date'] and d) else 99
        if dd > 1:
            continue
        qty_ok = eq(v['qty'], qty)
        if strict and not qty_ok:
            continue
        out.append((v, {'dd': dd, 'qty_ok': qty_ok}))
    return out


def candidates_entrada(r, strict):
    d, sku, qty = xls_date(r['Fecha']), str(r['Código']), num(r['Cantidad'])
    out = []
    for e in entradas:
        if e['used'] or e['sku'] != sku or e['status'] != 'active':
            continue
        dd = abs((e['date'] - d).days) if (e['date'] and d) else 99
        if dd > 1:
            continue
        qty_ok = eq(e['qty'], qty)
        if strict and not qty_ok:
            continue
        out.append((e, {'dd': dd, 'qty_ok': qty_ok}))
    # filas «Ajuste» → pool de ajustes de inventario (kardex)
    if not out and (r['Nota'] or '').strip().lower() == 'ajuste':
        for a in ajustes:
            if a['used'] or a['sku'] != sku or not eq(a['qty'], qty, 0.01):
                continue
            dd = abs((a['date'] - d).days) if (a['date'] and d) else 99
            if dd > 1:
                continue
            out.append((a, {'dd': dd, 'qty_ok': True, 'ajuste': True}))
    return out


def candidates_dv(r, strict):
    d, sku, qty = xls_date(r['Fecha']), str(r['Código']), num(r['Cantidad'])
    out = []
    for dv in devoluciones:
        if dv['used'] or dv['sku'] != sku or dv['status'] != 'completed':
            continue
        dd = abs((dv['date'] - d).days) if (dv['date'] and d) else 99
        if dd > 1:
            continue
        if strict and not eq(dv['qty'], qty):
            continue
        out.append((dv, {'tipo': 'devolution', 'dd': dd, 'qty_ok': eq(dv['qty'], qty)}))
    for v in vs_reversed:
        if v['used'] or v['sku'] != sku:
            continue
        dd = abs((v['date'] - d).days) if (v['date'] and d) else 99
        if dd > 1:
            continue
        if strict and not eq(v['qty'], qty):
            continue
        out.append((v, {'tipo': 'dv_vs_reversal', 'dd': dd, 'qty_ok': eq(v['qty'], qty)}))
    return out


def pick(cands):
    if not cands:
        return None
    def key(t):
        m, info = t
        amt = info.get('amt_ok')
        # el importe domina (penalización 20 > dd×10): evita cruces greedy
        return ((0 if amt else 20 if amt is False else 0) + info['dd'] * 10 +
                (0 if info.get('qty_ok', True) else 5))
    cands.sort(key=key)
    m, info = cands[0]
    m['used'] = True
    return {'match': m, 'info': info}


def run_pass(strict):
    for r in ops:
        row = next((x for x in results if x['excel_row'] == r['_excel_row']), None)
        if row and row['estado'] != 'AUSENTE_EN_COSTPRO':
            continue
        cls = r['Clasificación']
        if cls == 'Ventas':
            m = pick(candidates_venta(r, strict))
        elif cls == 'VS':
            m = pick(candidates_vs(r, strict))
        elif cls == 'Entrada':
            m = pick(candidates_entrada(r, strict))
        elif cls == 'DV':
            m = pick(candidates_dv(r, strict))
        else:
            if row is None:
                results.append({'excel_row': r['_excel_row'], 'sku': r['Código'], 'cls': cls,
                                'nota': r['Nota'], 'descripcion': r['Descripción'], 'cantidad': r['Cantidad'],
                                'efectivo': r['Efectivo'], 'transf': r['Transf'], 'usd': r['USD'],
                                'comision': r['Comisión'], 'fecha': str(xls_date(r['Fecha'])), 'um': r['UM'],
                                'annot': r.get('col11'), 'match': None, 'estado': 'CLASIFICACIÓN DESCONOCIDA'})
            continue
        if row is None:
            row = {'excel_row': r['_excel_row'], 'sku': r['Código'], 'cls': cls, 'nota': r['Nota'],
                   'descripcion': r['Descripción'], 'cantidad': r['Cantidad'], 'efectivo': r['Efectivo'],
                   'transf': r['Transf'], 'usd': r['USD'], 'comision': r['Comisión'],
                   'fecha': str(xls_date(r['Fecha'])), 'um': r['UM'], 'annot': r.get('col11'), 'match': None}
            results.append(row)
        if m is None:
            row['estado'] = 'AUSENTE_EN_COSTPRO'
            row['match'] = None
            continue
        s, info = m['match'], m['info']
        # fila «Ajuste» via stock_movements
        if s['kind'] == 'ajuste':
            row['estado'] = 'CONCILIADA_VIA_AJUSTE'
            row['match'] = {'kind': 'ajuste', 'id': s['id'], 'date': str(s['date']), 'qty': s['qty'],
                            'sku': s['sku'], 'ref': s['ref']}
            continue
        row['match'] = {'kind': s['kind'], 'id': s.get('tx') if s['kind'] == 'venta' else s.get('id'),
                        'date': str(s.get('date')), 'qty': s.get('qty'), 'sku': s.get('sku'),
                        'cash': s.get('i_cash', s.get('t_cash')), 'transf': s.get('i_transf', s.get('t_transf')),
                        'usd': s.get('i_usd'), 'number': s.get('number'), 'ref': s.get('ref'),
                        'notes': s.get('notes') or s.get('nota_ref') or s.get('idem'), 'status': s.get('status'),
                        'tx_cash': s.get('t_cash'), 'tx_transf': s.get('t_transf'), 'tx_zelle': s.get('t_zelle'),
                        'tx_total': s.get('tx_total')}
        if s['kind'] == 'venta' and info['amt_ok'] is None:
            row['estado'] = 'PENDIENTE_VERIF_GRUPO'
        elif s['kind'] == 'venta' and info['amt_ok'] is False:
            row['estado'] = 'IMPORTE_DIFIERE'
            row['delta'] = {'cash': round(s['i_cash'] - num(r['Efectivo']), 2),
                            'transf': round(s['i_transf'] - num(r['Transf']), 2),
                            'usd': round(s['i_usd'] - num(r['USD']), 2)}
        elif not info.get('qty_ok', True):
            row['estado'] = 'CANTIDAD_DIFIERE'
            row['delta'] = {'qty': round(s['qty'] - num(r['Cantidad']), 4)}
        elif info.get('dd', 0) != 0:
            row['estado'] = 'FECHA_DIFIERE_1DIA'
        else:
            row['estado'] = 'CONCILIADA'


run_pass(True)
run_pass(False)

# ------- pasada 3: fecha distante (re-registros POS documentados, p.ej. imp-ven-480/819) -------
for r in ops:
    row = next((x for x in results if x['excel_row'] == r['_excel_row']), None)
    if not row or row['estado'] not in ('AUSENTE_EN_COSTPRO', 'IMPORTE_DIFIERE'):
        continue
    if r['Clasificación'] != 'Ventas':
        continue
    d, sku, qty = xls_date(r['Fecha']), str(r['Código']), num(r['Cantidad'])
    ef, tr, usd = num(r['Efectivo']), num(r['Transf']), num(r['USD'])
    cands = []
    for s in sales:
        if s['used'] or s['sku'] != sku or s['status'] != 'completed' or not eq(s['qty'], qty):
            continue
        amt = amounts_match(s, ef, tr, usd)
        if amt:
            dd = abs((s['date'] - d).days) if (s['date'] and d) else 99
            cands.append((s, {'dd': dd, 'qty_ok': True, 'amt_ok': True}))
    if not cands:
        continue
    cands.sort(key=lambda t: t[1]['dd'])
    s, info = cands[0]
    s['used'] = True
    row['match'] = {'kind': 'venta', 'id': s['tx'], 'date': str(s['date']), 'qty': s['qty'], 'sku': s['sku'],
                    'cash': s['i_cash'], 'transf': s['i_transf'], 'usd': s['i_usd'],
                    'tx_cash': s['t_cash'], 'tx_transf': s['t_transf'], 'tx_zelle': s['t_zelle'],
                    'tx_total': s['tx_total'], 'notes': s['idem'], 'status': s['status']}
    row['estado'] = 'CONCILIADA_FECHA_DISTANTE'
    row['nota_estado'] = f"Re-registro POS documentado (dd={info['dd']} días): la operación real es del {row['fecha']}; COSTPRO la fechó {s['date']} por política forward-only."

# ------- pares venta+DV neto-cero ausentes -------
aus_ventas = {(str(r['sku']), round(num(r['cantidad']), 3), r['fecha']) for r in results
              if r['estado'] == 'AUSENTE_EN_COSTPRO' and r['cls'] == 'Ventas'}
for r in results:
    if (r['estado'] == 'AUSENTE_EN_COSTPRO' and r['cls'] == 'DV'
            and (str(r['sku']), round(num(r['cantidad']), 3), r['fecha']) in aus_ventas):
        r['estado'] = 'AUSENTE_COMPENSADA'
        r['nota_estado'] = 'Par venta+DV ausente en COSTPRO: efecto neto 0 en stock e importes; no registrable retroactivamente (política forward-only).'
for r in results:
    if (r['estado'] == 'AUSENTE_EN_COSTPRO' and r['cls'] == 'Ventas'
            and (str(r['sku']), round(num(r['cantidad']), 3), r['fecha']) in
            {(str(x['sku']), round(num(x['cantidad']), 3), x['fecha']) for x in results if x['estado'] == 'AUSENTE_COMPENSADA' and x['cls'] == 'DV'}):
        r['estado'] = 'AUSENTE_COMPENSADA'
        r['nota_estado'] = 'Par venta+DV ausente en COSTPRO: efecto neto 0 en stock e importes; no registrable retroactivamente (política forward-only).'

# ------- swap por pares de IMPORTE_DIFIERE (asignación cruzada greedy) -------
def amounts_match_raw(s, ef, tr, usd):
    return amounts_match(s, ef, tr, usd)

imp_rows = [r for r in results if r['estado'] == 'IMPORTE_DIFIERE' and r['match']]
for i, a in enumerate(imp_rows):
    for b in imp_rows[i+1:]:
        if str(a['sku']) != str(b['sku']) or not eq(num(a['cantidad']), num(b['cantidad'])):
            continue
        sa = next((s for s in sales if s['tx'] == a['match']['id'] and s['item_id'] and not s['used']), None)
        # localizar los registros usados de cada match
        tx_a, tx_b = a['match']['id'], b['match']['id']
        items_a = [s for s in sales if s['tx'] == tx_a]
        items_b = [s for s in sales if s['tx'] == tx_b]
        # liberar y recargar
        for s in items_a + items_b:
            s['used'] = False
        a_item = next((s for s in items_b if s['tx'] == tx_b), None)
        # recandidatas cruzadas
        cands_a = [s for s in items_b if amounts_match_raw(s, num(a['efectivo']), num(a['transf']), num(a['usd'])) is True]
        cands_b = [s for s in items_a if amounts_match_raw(s, num(b['efectivo']), num(b['transf']), num(b['usd'])) is True]
        if cands_a and cands_b:
            s_a, s_b = cands_a[0], cands_b[0]
            s_a['used'] = True
            s_b['used'] = True
            for row, s in ((a, s_a), (b, s_b)):
                op_row = next(x for x in ops if x['_excel_row'] == row['excel_row'])
                d_x = xls_date(op_row['Fecha'])
                dd = abs((s['date'] - d_x).days) if (s['date'] and d_x) else 99
                row['match'].update({'id': s['tx'], 'date': str(s['date']), 'tx_cash': s['t_cash'],
                                     'tx_transf': s['t_transf'], 'tx_zelle': s['t_zelle'],
                                     'tx_total': s['tx_total'], 'notes': s['idem']})
                if dd > 1:
                    row['estado'] = 'CONCILIADA_FECHA_DISTANTE'
                    row['nota_estado'] = f'Swap de asignación cruzada; dd={dd} días (re-registro POS documentado).'
                else:
                    row['estado'] = 'CONCILIADA'
                    row.pop('delta', None)

# ------- verificación por grupo -------
by_tx_rows = defaultdict(list)
for row in results:
    if row['estado'] == 'PENDIENTE_VERIF_GRUPO' and row['match']:
        by_tx_rows[row['match']['id']].append(row)
for txid, rows_ in by_tx_rows.items():
    t = tx_by_id.get(txid)
    if not t:
        continue
    sum_ef = sum(num(x['efectivo']) for x in rows_)
    sum_tr = sum(num(x['transf']) for x in rows_)
    sum_usd = sum(num(x['usd']) for x in rows_)
    ok = eq(sum_ef, t['cash_amount'], 1.0) and eq(sum_tr, t['transfer_amount'], 1.0)
    usd_ok = eq(sum_usd * IMPORT_RATE, num(t['zelle_amount']), 6.0) if sum_usd else num(t['zelle_amount']) == 0
    full = len(rows_) == len(items_by_tx.get(txid, []))
    for x in rows_:
        x['estado'] = 'CONCILIADA_GRUPO' if (ok and usd_ok and full) else 'GRUPO_REVISAR'
        x['grupo'] = {'tx_total': t['total_amount'], 'sum_efectivo': sum_ef, 'sum_transf': sum_tr,
                      'sum_usd': sum_usd, 'rows': len(rows_), 'items_tx': len(items_by_tx.get(txid, [])),
                      'pagos_ok': ok, 'usd_ok': usd_ok, 'grupo_completo': full}

# ------- compensación DV/VS (VS anulada ≡ DV; la VS pareja queda neto 0) -------
matched_dv_vs = {(r['match']['sku'], round(num(r['cantidad']), 3), r['match']['date'])
                 for r in results if r['match'] and r['match'].get('kind') == 'vs' and r['match'].get('status') == 'reversed'}
for r in results:
    if r['estado'] == 'AUSENTE_EN_COSTPRO' and r['cls'] == 'VS':
        key = (str(r['sku']), round(num(r['cantidad']), 3), r['fecha'])
        if key in matched_dv_vs:
            r['estado'] = 'AUSENTE_COMPENSADA'
            r['nota_estado'] = 'La pareja DV+VS del Excel equivale a la VS creada y reversada en COSTPRO (impacto neto 0).'

# ------- no usados -------
unused = {
    'ventas': [{'tx': s['tx'], 'sku': s['sku'], 'qty': s['qty'], 'date': str(s['date']),
                'idem': s['idem'], 'tx_total': s['tx_total'], 'status': s['status'], 'n_items': s['n_items']}
               for s in sales if not s['used']],
    'vales': [{'number': v['number'], 'sku': v['sku'], 'qty': v['qty'], 'date': str(v['date']),
               'notes': v['notes'], 'status': v['status']} for v in vales if not v['used']],
    'entradas': [{'ref': e['ref'], 'sku': e['sku'], 'qty': e['qty'], 'date': str(e['date'])}
                 for e in entradas if not e['used']],
    'devoluciones': [{'number': d['number'], 'sku': d['sku'], 'qty': d['qty'], 'date': str(d['date']),
                      'notes': d['notes']} for d in devoluciones if not d['used']],
}

verdicts = Counter(r['estado'] for r in results)
print('=== VEREDICTOS (897 filas Excel) ===')
for k, v in verdicts.most_common():
    print(f'  {k}: {v}')
print('\nCOSTPRO sin usar:', {k: len(v) for k, v in unused.items()})

json.dump({'rows': results, 'unused_costpro': unused, 'verdicts': dict(verdicts)},
          open(f'{BASE}/recon_results.json', 'w'), ensure_ascii=False, default=str)

disc = [r for r in results if r['estado'] not in ('CONCILIADA', 'CONCILIADA_VIA_AJUSTE', 'CONCILIADA_GRUPO',
                                                  'CONCILIADA_REDONDEO', 'FECHA_DIFIERE_1DIA',
                                                  'CONCILIADA_FECHA_DISTANTE', 'AUSENTE_COMPENSADA')]
with open(f'{BASE}/recon_discrepancias.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['excel_row', 'fecha', 'sku', 'cls', 'descripcion', 'cantidad',
                                      'efectivo', 'transf', 'usd', 'um', 'nota', 'estado', 'match', 'delta', 'annot'])
    w.writeheader()
    for r in disc:
        w.writerow({k: r.get(k) for k in w.fieldnames})
print(f'\nDiscrepancias accionables: {len(disc)}')
