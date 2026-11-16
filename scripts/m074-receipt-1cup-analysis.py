#!/usr/bin/env python3
# ============================================================================
# M074 — CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · ANÁLISIS Y MATRIZ DE CORRECCIÓN
# Regla económica del propietario (misión 011 §1): TODAS las 101 líneas de
# FAC-VITALLCONS-001 a costo unitario 1,00 CUP, moneda CUP, tasa 1.
#
# Entrada (read-only, ya extraída):
#   scripts/out/m070-receipt-valuation-extract.json  (producción, fresco)
#   o --extract <json> (fixture E2E con las mismas claves)
# Salida (--out, por defecto scripts/out/m074-matriz-1cup.json):
#   · matriz 101 líneas: antes/después, canales FIFO (inv/venta/vale/pérdida)
#   · actualizaciones WAC por producto (consistentes con el asiento)
#   · split del asiento ajuste (DR PAS_CXP_PROV / CR INV·COGS·VALES·PÉRDIDA)
#   · controles y guards de preflight (estado congelado esperado)
# Solo cálculo local. No toca ninguna BD. Re-ejecutable.
# ============================================================================
import json, sys, argparse
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
from collections import defaultdict

getcontext().prec = 60
Q2 = lambda x: D(x).quantize(D('0.01'), ROUND_HALF_UP)

ap = argparse.ArgumentParser()
ap.add_argument('--extract', default='scripts/out/m070-receipt-valuation-extract.json')
ap.add_argument('--out', default='scripts/out/m074-matriz-1cup.json')
a = ap.parse_args()

snap = json.load(open(a.extract))
FVC = snap['receipt']['id']              # producción: fd9d6c88… · E2E: fixture
FVC_DOC = snap['receipt'].get('reference_doc') or 'FAC-VITALLCONS-001'
items = snap['receipt_items']
layers = {l['product_id']: l for l in snap['layers_fvc']}
kardex = snap['kardex_101']
by_sku = defaultdict(list)
for m in kardex:
    by_sku[str(m['sku'])].append(m)

# ── Simulación FIFO por SKU con atribución por canal y casación de reversas ──
# La capa FVC es el primer movimiento del kardex en los 101 SKUs (verificado),
# por lo que se modela como cubeta propia al frente. Las compras ajenas y los
# restos de reversas no casadas van a cubetas FIFO posteriores.
def simular(movs):
    fvc_rem = D(0)                                  # existencia neta de la capa FVC
    otros = []                                      # cubetas FIFO ajenas: [rem, uc]
    attr = {'venta': D(0), 'vale': D(0), 'perdida': D(0)}   # consumo NETO atribuido a FVC
    registros = []                                  # para casar reversas: {ref, canal, tomado_fvc}
    stats = {'reversas_casadas': D(0), 'reversas_nocasadas': D(0), 'consumo_sin_capa': D(0)}
    for m in sorted(movs, key=lambda x: (x['movement_date'] or '', x['created_at'] or '', str(x['id']))):
        q = D(str(m['quantity_change'])) if m['quantity_change'] is not None else D(0)
        mt = m['movement_type']
        if mt == 'purchase':
            if m['reference_id'] == FVC:
                fvc_rem += q
            else:
                otros.append([q, D(str(m['unit_cost'])) if m['unit_cost'] is not None else D(0)])
        elif mt in ('sale', 'issue_slip_out') or (mt == 'adjustment' and q < 0):
            canal = 'venta' if mt == 'sale' else ('vale' if mt == 'issue_slip_out' else 'perdida')
            falta = -q
            reg = {'ref': m['reference_id'], 'canal': canal, 'tomado_fvc': D(0)}
            de_fvc = min(fvc_rem, falta)
            if de_fvc > 0:
                fvc_rem -= de_fvc; falta -= de_fvc
                attr[canal] += de_fvc; reg['tomado_fvc'] += de_fvc
            while falta > 0 and otros:
                cub = otros[0]
                toma = min(cub[0], falta)
                cub[0] -= toma; falta -= toma
                if cub[0] <= 0: otros.pop(0)
            if falta > 0:
                stats['consumo_sin_capa'] += falta
            registros.append(reg)
        elif mt in ('sale_reverse', 'issue_slip_reverse'):
            canal = 'venta' if mt == 'sale_reverse' else 'vale'
            dev = q                                       # positivo: unidades devueltas
            # casar contra registros del mismo documento y canal (los más antiguos primero)
            for reg in registros:
                if dev <= 0: break
                if reg['ref'] == m['reference_id'] and reg['canal'] == canal and reg['tomado_fvc'] > 0:
                    back = min(dev, reg['tomado_fvc'])
                    reg['tomado_fvc'] -= back; dev -= back
                    attr[canal] -= back
                    fvc_rem += back                       # las unidades vuelven a la capa FVC
                    stats['reversas_casadas'] += back
            if dev > 0:                                   # resto no atribuible a FVC → cubeta propia
                otros.append([dev, D(str(m['unit_cost'])) if m['unit_cost'] is not None else D(0)])
                stats['reversas_nocasadas'] += dev
        # adjustment positivo (reingreso/cuadre): no crea capa ni atribuye
    return fvc_rem, attr, stats

# ── Matriz por línea ─────────────────────────────────────────────────────────
matriz = []
tie_issues = []
sum_qty = D(0); sum_val_old = D(0); sum_val_new = D(0)
n_valor = 0; n_solo_moneda = 0; n_ya_ok = 0
split = {'inv': D(0), 'cogs': D(0), 'vales': D(0), 'perdida': D(0)}
wac_updates = []
rev_stats_tot = defaultdict(D)

for r in items:
    sku = str(r['sku'])
    qty = D(str(r['quantity'])); uc = D(str(r['unit_cost']))
    mon = r['moneda_recepcion']; tasa = D(str(r['tasa_cambio_recepcion'])) if r['tasa_cambio_recepcion'] is not None else D(1)
    uc_cup = uc * tasa
    capa = layers.get(r['product_id'])
    capa_uc = D(str(capa['unit_cost'])) if capa and capa['unit_cost'] is not None else None
    capa_qty = D(str(capa['quantity_change'])) if capa else None
    if capa_uc is None or capa_qty is None:
        tie_issues.append({'sku': sku, 'problema': 'sin capa FVC'})
        capa_uc, capa_qty = uc_cup, qty
    if capa_uc != uc_cup or capa_qty != qty:
        tie_issues.append({'sku': sku, 'problema': f'capa ({capa_qty}@{capa_uc}) != línea ({qty}@{uc_cup})'})

    fvc_rem, attr, st = simular(by_sku[sku])
    for k2, v2 in st.items(): rev_stats_tot[k2] += v2

    delta = (uc_cup - 1) * qty
    inv_v = (uc_cup - 1) * fvc_rem
    cogs_v = (uc_cup - 1) * attr['venta']
    vales_v = (uc_cup - 1) * attr['vale']
    perd_v = (uc_cup - 1) * attr['perdida']
    if inv_v + cogs_v + vales_v + perd_v != delta:
        tie_issues.append({'sku': sku, 'problema': f'desbalance línea: {inv_v}+{cogs_v}+{vales_v}+{perd_v} != {delta}',
                           'detalle': {'fvc_rem': str(fvc_rem), 'attr': {k: str(v) for k, v in attr.items()}, 'qty': str(qty)}})

    ya_ok = (uc == 1 and mon == 'CUP' and tasa == 1)
    solo_moneda = (delta == 0 and not ya_ok)
    if ya_ok: n_ya_ok += 1
    elif solo_moneda: n_solo_moneda += 1
    else: n_valor += 1

    # WAC nuevo — consistente con el asiento: valor libro = wac×stock − crédito INV
    stock = D(str(r['stock_current'])) if r['stock_current'] is not None else D(0)
    wac_old = D(str(r['wac_actual'])) if r['wac_actual'] is not None else D(0)
    wac_new = None
    if stock > 0 and inv_v != 0:
        wac_new = ((wac_old * stock) - inv_v) / stock
    fila = {
        'sku': sku, 'nombre': r['name'], 'product_id': r['product_id'], 'line_id': r['line_id'],
        'is_service': bool(r['is_service']), 'clasificacion_010': None,
        'qty': str(qty), 'uc_old': str(uc), 'moneda_old': mon, 'tasa_old': str(tasa),
        'uc_cup_old': str(uc_cup), 'subtotal_old_cup': str(uc_cup * qty),
        'uc_new': '1', 'moneda_new': 'CUP', 'tasa_new': '1', 'subtotal_new': str(qty),
        'delta_linea': str(delta),
        'fvc_restante': str(fvc_rem), 'cons_venta': str(attr['venta']), 'cons_vale': str(attr['vale']),
        'cons_perdida': str(attr['perdida']),
        'inv_credito': str(inv_v), 'cogs_credito': str(cogs_v), 'vales_credito': str(vales_v),
        'perdida_credito': str(perd_v),
        'stock_actual': str(stock), 'wac_old': str(wac_old),
        'wac_new': str(wac_new) if wac_new is not None else None,
        'precio_venta': str(r['precio_venta']) if r.get('precio_venta') is not None else None,
        'capa_id': capa['id'] if capa else None,
        'ya_ok': ya_ok, 'solo_moneda': solo_moneda, 'cambio_valor': not (ya_ok or solo_moneda),
    }
    matriz.append(fila)
    sum_qty += qty; sum_val_old += uc_cup * qty; sum_val_new += qty
    split['inv'] += inv_v; split['cogs'] += cogs_v; split['vales'] += vales_v; split['perdida'] += perd_v
    if wac_new is not None and wac_new != wac_old:
        wac_updates.append({'sku': sku, 'product_id': r['product_id'], 'stock': str(stock),
                            'wac_old': str(wac_old), 'wac_new': str(wac_new.quantize(D('0.000000000001'))),
                            'inv_credito': str(inv_v)})

# Clasificación 010 (referencia histórica, la sustituye la regla 1 CUP)
m071 = None
try:
    m071 = json.load(open('scripts/out/m071-matriz-maestra.json'))
    cls_by_sku = {str(x['sku']): x['clasificacion'] for x in m071['matriz']}
    for f in matriz: f['clasificacion_010'] = cls_by_sku.get(f['sku'])
except Exception:
    pass

# ── Controles y asiento ──────────────────────────────────────────────────────
cxp_net = D(0)
for mv in snap.get('fin_movements_fvc', []):
    if mv['category_code'] == 'PAS_CXP_PROV':
        cxp_net += D(str(mv['amount'])) if mv['sense'] == 'credito' else -D(str(mv['amount']))

total_delta = sum_val_old - sum_val_new
asiento = {
    'importe_total': str(total_delta),
    'cxp_debito': str(total_delta),
    'inv_credito': str(split['inv']),
    'cogs_credito': str(split['cogs']),
    'vales_credito': str(split['vales']),
    'perdida_credito': str(split['perdida']),
}
# Exactitud a centavos: los créditos deben sumar EXACTO al débito
q = {k: Q2(v) for k, v in split.items()}
residuo = Q2(total_delta) - (q['inv'] + q['cogs'] + q['vales'] + q['perdida'])
if residuo != 0:
    mayor = max(q, key=lambda k: q[k])
    q[mayor] += residuo
    asiento['ajuste_redondeo'] = {'canal': mayor, 'residuo': str(residuo)}
asiento['creditos_centavos'] = {k: str(v) for k, v in q.items()}
asiento['suma_creditos_centavos'] = str(q['inv'] + q['cogs'] + q['vales'] + q['perdida'])
asiento['balance_debe_haber'] = str(Q2(total_delta) - (q['inv'] + q['cogs'] + q['vales'] + q['perdida']))

out = {
    'mision': 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011',
    'generado': __import__('datetime').datetime.now().astimezone(__import__('datetime').timezone.utc).isoformat(),
    'fuente': a.extract,
    'regla': 'Costo unitario 1,00 CUP · moneda CUP · tasa 1 · subtotal = cantidad × 1 (misión 011 §1/§4)',
    'receipt': {
        'id': FVC, 'documento': FVC_DOC, 'store_id': snap['receipt'].get('store_id'),
        'total_cost_old': str(D(str(snap['receipt']['total_cost']))),
        'total_cost_new': str(sum_val_new),
        'payment_status': snap['receipt'].get('payment_status'),
        'paid_amount': str(snap['receipt'].get('paid_amount') or 0),
        'status': snap['receipt'].get('status'),
    },
    'controles': {
        'lineas': len(matriz), 'skus_distintos': len({f['sku'] for f in matriz}),
        'sum_qty': str(sum_qty), 'sum_val_old_cup': str(sum_val_old), 'sum_val_new_cup': str(sum_val_new),
        'delta_total': str(total_delta),
        'cxp_neto_antes': str(cxp_net), 'cxp_neto_despues': str(cxp_net - total_delta),
        'n_cambio_valor': n_valor, 'n_solo_moneda': n_solo_moneda, 'n_ya_ok': n_ya_ok,
        'objetivo_propietario': {'sum_qty': '5861.5000', 'delta': '40733723.50', 'total_nuevo': '5861.50'},
    },
    'fifo_reversas': {k: str(v) for k, v in rev_stats_tot.items()},
    'asiento': asiento,
    'wac_updates': wac_updates,
    'matriz': matriz,
    'tie_out': {'ok': len(tie_issues) == 0, 'incidencias': tie_issues},
}
json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)

print(f'=== M074 · matriz 1 CUP ({a.out}) ===')
c = out['controles']
print(f"líneas={c['lineas']} skus={c['skus_distintos']} Σqty={c['sum_qty']} (objetivo 5861.5000)")
print(f"Σvalor_old={c['sum_val_old_cup']} → Σvalor_new={c['sum_val_new_cup']} · Δ={c['delta_total']} (objetivo 40733723.50)")
print(f"cambio valor={c['n_cambio_valor']} · solo moneda={c['n_solo_moneda']} · ya ok={c['n_ya_ok']}")
print(f"CXP antes={c['cxp_neto_antes']} → después={c['cxp_neto_despues']}")
print(f"asiento: DR CXP {asiento['importe_total']} / CR INV {asiento['inv_credito']} · COGS {asiento['cogs_credito']} · VALES {asiento['vales_credito']} · PÉRDIDA {asiento['perdida_credito']}")
print(f"balance D-H centavos: {asiento['balance_debe_haber']} · WAC a actualizar: {len(wac_updates)}")
print(f"FIFO reversas: {dict(rev_stats_tot)}")
print(f"tie_out: {'OK' if out['tie_out']['ok'] else str(tie_issues[:5])}")
if tie_issues:
    sys.exit(1)
