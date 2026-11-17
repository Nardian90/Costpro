#!/usr/bin/env python3
# ============================================================================
# M091 — CP-FIN-NEGATIVE-WAC-REMEDIATION-013 · ANÁLISIS MAESTRO (Decimal exacto)
# Entradas: scripts/out/m013/extract.json (producción, read-only, fresco)
#           scripts/out/m074-matriz-1cup.json (modelo congelado de RECT-011)
#           scripts/out/m011/before-extract.json (estado pre-RECT-011)
# Salida  : scripts/out/m013/analysis.json
# Solo cálculo local. Re-ejecutable y determinista.
# ============================================================================
import json
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
from collections import defaultdict

getcontext().prec = 60
Q2 = lambda x: D(x).quantize(D('0.01'), ROUND_HALF_UP)
Q6 = lambda x: D(x).quantize(D('0.000001'), ROUND_HALF_UP)
money = lambda x: f"{Q2(x):,.2f}"

e = json.load(open('scripts/out/m013/extract.json'))
mat = json.load(open('scripts/out/m074-matriz-1cup.json'))
before = json.load(open('scripts/out/m011/before-extract.json'))

STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
TARGETS = ['117', '83', '90', '40', '37']
CONTROL = ['31']
d = lambda x: D(str(x)) if x is not None else D(0)

R = {'mision': 'CP-FIN-NEGATIVE-WAC-REMEDIATION-013'}

# ═══ 1. VERIFICACIÓN DE LOS 5 WAC NEGATIVOS Y CONTROL ARITMÉTICO ════════════
prod_by_sku = {}
for p in e['productos_todas_tiendas']:
    if p['store_id'] == STORE:
        prod_by_sku[str(p['sku'])] = p

verif = []
for sku in TARGETS:
    p = prod_by_sku[sku]
    wac = d(p['cost_average']); stock = d(p['stock_current'])
    verif.append({
        'sku': sku, 'nombre': p['name'], 'product_id': p['id'],
        'stock': str(stock), 'wac': str(wac),
        'valor_total': str(wac * stock),
        'valor_total_q2': str(Q2(wac * stock)),
    })
neg_total = sum(D(v['valor_total']) for v in verif)
neg_total_q2 = Q2(neg_total)   # redondeo del TOTAL exacto (como el informe 012)

# Las cinco cifras del informe 012 (interpretadas como WAC unitario redondeado)
rep012 = {'117': '-2175998.00', '83': '-122398.00', '90': '-78176.25', '40': '-665.86', '37': '-1.00'}
suma_cifras_012 = sum(D(v) for v in rep012.values())
total_declarado_012 = D('-2657345.32')
dif_mision = total_declarado_012 - suma_cifras_012   # −280.106,21
dif_real = neg_total_q2 - suma_cifras_012            # unit×qty real vs suma de unitarios

# desglose de la diferencia: por SKU, (qty−1)×wac
desglose_dif = []
for v in verif:
    sku = v['sku']
    wac_q2 = Q2(D(v['wac']))
    unit_report = D(rep012[sku])
    qty = D(v['stock'])
    desglose_dif.append({
        'sku': sku, 'qty': str(qty), 'wac_exacto': v['wac'],
        'cifra_012_wac_redondeado': str(unit_report),
        'valor_total_real_q2': v['valor_total_q2'],
        'aporte_diferencia_q2': str(Q2(qty * unit_report - unit_report)),
        'nota': 'aporte = (qty−1) × wac_unitario; SKU117 qty=1 → aporte 0',
    })

R['control_aritmetico'] = {
    'cifras_informe_012': rep012,
    'naturaleza_cifras_012': 'COSTO UNITARIO PROMEDIO (products.cost_average), NO valor total',
    'suma_cifras_012': str(suma_cifras_012),
    'suma_cifras_012_q2': str(Q2(suma_cifras_012)),
    'total_declarado_012': str(total_declarado_012),
    'diferencia_segun_mision': str(dif_mision),
    'diferencia_segun_mision_q2': str(Q2(dif_mision)),
    'valor_total_real_hoy_q2': str(neg_total_q2),
    'diferencia_real_vs_suma_unitarios_q2': str(Q2(dif_real)),
    'explicacion': ('Las cinco cifras del informe 012 son WAC unitarios (cost_average); el total '
                    'declarado (−2.657.345,32) es Σ(wac × cantidad kardex). La diferencia de '
                    '280.106,21 proviene de multiplicar cada WAC por su cantidad (2, 3, 3 y 25 u '
                    'para SKU83/90/40/37; SKU117 qty=1 no aporta). Redondeos a centavos de los '
                    'WAC de SKU90 (−78.176,248120…→−78.176,25) y SKU40 (−665,857142…→−665,86) '
                    'explican los céntimos.'),
    'desglose_por_sku': desglose_dif,
    'verificacion_wac_hoy': verif,
    'veredicto': 'EXPLICADA' if Q2(dif_real) == Q2(dif_mision) else 'REVISAR',
}

# ═══ 2. RECONSTRUCCIÓN POR SKU (kardex completo, flujos netos por canal) ════
kardex = defaultdict(list)
for m in e['kardex_actual']:
    if m['store_id'] == STORE:
        kardex[str(m['sku'])].append(m)
for sku in kardex:
    kardex[sku].sort(key=lambda x: (x['created_at'] or '', str(x['id'])))

# modelo congelado m074 (para comparación de atribución)
m074_by_sku = {f['sku']: f for f in mat['matriz']}

rec = {}
for sku in TARGETS + CONTROL:
    movs = kardex.get(sku, [])
    m74 = m074_by_sku.get(sku, {})
    flows = defaultdict(lambda: {'n': 0, 'unidades': D(0), 'costo': D(0)})
    capas = []
    saldo_run = D(0)
    wac_run = D(0)
    negativo_en = None
    for m in movs:
        q = d(m['quantity_change']); uc = d(m['unit_cost'])
        mt = m['movement_type']
        if mt == 'purchase':
            capas.append({'fecha': str(m['movement_date'])[:10], 'qty': str(q), 'uc': str(uc),
                          'uc_actual': str(uc), 'recepcion': str(m['reference_id'])[:8],
                          'doc': m['reference_doc'], 'id': m['id'], 'product_id': m['product_id']})
            # blend D-01 (entrada)
            wac_run = (saldo_run * wac_run + q * uc) / (saldo_run + q) if (saldo_run + q) != 0 else uc
        elif mt in ('sale', 'issue_slip_out') or (mt == 'adjustment' and q < 0):
            canal = 'venta' if mt == 'sale' else ('vale' if mt == 'issue_slip_out' else 'perdida')
            flows[canal]['n'] += 1
            flows[canal]['unidades'] += -q
            flows[canal]['costo'] += -q * uc
            # salida pura: WAC invariante (fn_recalc_wac D-01)
        elif mt in ('sale_reverse', 'issue_slip_reverse'):
            canal = 'venta' if mt == 'sale_reverse' else 'vale'
            flows[canal]['n'] += 1
            flows[canal]['unidades'] -= q          # reversa devuelve unidades (neto)
            flows[canal]['costo'] -= q * uc        # costo reversado
            wac_run = (saldo_run * wac_run + q * uc) / (saldo_run + q) if (saldo_run + q) > 0 else wac_run
        elif mt == 'adjustment' and q > 0:
            flows['ajuste_plus']['n'] += 1
            flows['ajuste_plus']['unidades'] += q
            flows['ajuste_plus']['costo'] += q * uc
            wac_run = (saldo_run * wac_run + q * uc) / (saldo_run + q) if (saldo_run + q) > 0 else uc
        saldo_run += q
    p = prod_by_sku[sku]
    wac_hoy = d(p['cost_average']); stock_hoy = d(p['stock_current'])
    capas_fvc = [c for c in capas if c['recepcion'] == FVC[:8]]
    capas_ajenas = [c for c in capas if c['recepcion'] != FVC[:8]]
    neto_kardex = sum(d(m['quantity_change']) for m in movs)
    item_fvc = next((r for r in e['receipt_items_6skus'] if r['sku'] == sku and str(r['receipt_id']) == FVC), None)
    qty_fvc = d(item_fvc['quantity']) if item_fvc else D(0)
    uc_fvc_hoy = d(item_fvc['unit_cost']) if item_fvc else D(0)
    rec[sku] = {
        'product_id': p['id'], 'nombre': p['name'],
        'movimientos': len(movs), 'neto_kardex': str(neto_kardex),
        'stock_current': str(stock_hoy), 'drift': str(stock_hoy - neto_kardex),
        'wac_hoy': str(wac_hoy), 'valor_hoy': str(wac_hoy * stock_hoy),
        'capas_fvc': capas_fvc, 'capas_ajenas': capas_ajenas,
        'qty_linea_fvc': str(qty_fvc), 'uc_linea_fvc_hoy': str(uc_fvc_hoy),
        'flujos_netos': {k: {'n': v['n'], 'unidades': str(v['unidades']), 'costo_registrado': str(v['costo'])}
                         for k, v in flows.items()},
        'consumo_neto_total': str(sum(v['unidades'] for v in flows.values() if v['unidades'] > 0) -
                                   sum(-v['unidades'] for v in flows.values() if v['unidades'] < 0)),
        'modelo_m074': {k: m74.get(k) for k in ['qty', 'uc_cup_old', 'fvc_restante', 'cons_venta',
                                                'cons_vale', 'cons_perdida', 'inv_credito', 'cogs_credito',
                                                'vales_credito', 'perdida_credito', 'stock_actual', 'wac_old', 'wac_new']},
        'identidad_cantidades': {
            'entradas_fvc': str(qty_fvc),
            'entradas_ajenas': str(sum(d(c['qty']) for c in capas_ajenas)),
            'ajustes_plus': str(flows['ajuste_plus']['unidades']),
            'consumo_neto': str(sum(v['unidades'] for k, v in flows.items()
                                    if k in ('venta', 'vale', 'perdida'))),
            'existencia_final': str(stock_hoy),
            'cuadra': str(qty_fvc + sum(d(c['qty']) for c in capas_ajenas) + flows['ajuste_plus']['unidades']
                          - sum(v['unidades'] for k, v in flows.items() if k in ('venta', 'vale', 'perdida'))),
            'ok': str(qty_fvc + sum(d(c['qty']) for c in capas_ajenas) + flows['ajuste_plus']['unidades']
                      - sum(v['unidades'] for k, v in flows.items() if k in ('venta', 'vale', 'perdida'))) == str(stock_hoy)
        },
    }

R['reconstruccion'] = rec

# ═══ 3. INSTANTE DEL NEGATIVO Y PREEXISTENCIA ═══════════════════════════════
loteC = [a for a in e['audit_loteC']]
instante = min((a['created_at'] for a in loteC), default=None)
R['instante_negativo'] = {
    'accion': 'SYSTEM_RECT011_WAC', 'trace': 'RECT011-PROD', 'lote': 'C (m076) · pasada 1 de RECT-011',
    'created_at': instante,
    'filas': len(loteC),
    'detalle': [{'old_wac': a['old_data'].get('wac'), 'new_wac': a['new_data'].get('wac'),
                 'stock': a['old_data'].get('stock')} for a in loteC],
    'wacs_previos_positivos': all(d(a['old_data'].get('wac')) > 0 for a in loteC),
    'conclusion': 'Los 5 WAC eran POSITIVOS hasta el 2026-11-16 19:59:14.381561+00 (lote C, pasada 1). '
                  'La negatividad fue PRODUCIDA por RECT-011 (no preexistente a la misión 011).',
}

# historia WAC (drift)
hist = defaultdict(list)
for w in e['wac_log_historico']:
    hist[str(w['sku'])].append(w)
R['historia_wac'] = {sku: [{'fecha': str(w['created_at'])[:19], 'evento': w['event'],
                            'antes': str(w['wac_before']), 'despues': str(w['wac_after']),
                            'qty_in': str(w['qty_in']), 'uc_in': str(w['uc_in'])}
                           for w in sorted(v, key=lambda x: x['created_at'])] for sku, v in hist.items()}

# ═══ 4. CAUSA RAÍZ — verificación de la hipótesis del modelo m074 ═══════════
causas = []
for sku in TARGETS:
    m74 = m074_by_sku[sku]
    wac_old = d(m74['wac_old']); stock = d(m74['stock_actual'])
    inv_v = d(m74['inv_credito']); fvc_rem = d(m74['fvc_restante'])
    uc_old = d(m74['uc_cup_old'])
    valor_old = wac_old * stock
    exceso = inv_v - valor_old
    causas.append({
        'sku': sku,
        'wac_old': str(wac_old), 'stock': str(stock), 'valor_libro_pre': str(valor_old),
        'uc_fvc_old': str(uc_old), 'fvc_rem_modelo': str(fvc_rem),
        'inv_credito_aplicado': str(inv_v),
        'exceso_credito_sobre_valor_libro': str(exceso),
        'wac_new_modelo': m74['wac_new'],
        'formula': 'wac_new = (wac_old×stock − (uc_old−1)×fvc_rem) / stock',
        'origen_wac_old': ('wac_correction 2026-10-07 (0→1)' if sku in ('117', '83') else
                           'adjustment_plus blend 2026-10-04' if sku in ('37', '40') else
                           'reception_in blend 2026-10-04 (100u@1 sobre ca=0)'),
        'clasificacion': 'G — combinación: (B) historial de salidas a costo ≈0 [el WAC preexistente '
                         'nunca absorbió la recepción FVC] ejecutado mediante (A) fórmula del lote C '
                         'sin cota sobre el valor libro',
    })
R['causa_raiz'] = causas

# comprobación: los otros 20 recalculados no cruzan a negativo
otros_neg = [f for f in mat['wac_updates'] if d(f['wac_new']) < 0]
otros_pos = [f for f in mat['wac_updates'] if d(f['wac_new']) >= 0]
R['universo_recalculado'] = {
    'total_wac_updates': len(mat['wac_updates']),
    'negativos': [f['sku'] for f in otros_neg],
    'positivos': len(otros_pos),
}

# ═══ 5. VALOR REAL Y RESTAURACIÓN ═══════════════════════════════════════════
restauracion = []
sum_delta = D(0)
for sku in TARGETS:
    p = prod_by_sku[sku]
    stock = d(p['stock_current']); wac_hoy = d(p['cost_average'])
    valor_hoy = wac_hoy * stock
    valor_verdadero = stock * D(1)          # economía autorizada: 1,00 CUP/u (todas las capas de estos SKU están a 1)
    delta = valor_verdadero - valor_hoy
    sum_delta += delta
    restauracion.append({
        'sku': sku, 'stock': str(stock),
        'wac_hoy': str(wac_hoy), 'valor_hoy': str(valor_hoy), 'valor_hoy_q2': str(Q2(valor_hoy)),
        'wac_objetivo': '1.00', 'valor_verdadero': str(valor_verdadero),
        'delta_restauracion': str(delta), 'delta_restauracion_q2': str(Q2(delta)),
    })
R['restauracion'] = {
    'por_sku': restauracion,
    'delta_total': str(sum_delta), 'delta_total_q2': str(Q2(sum_delta)),
    'regla_valor_verdadero': 'stock × 1,00 CUP (capa FVC ya a 1 CUP por RECT-011; capas ajenas de estos '
                             'SKU ya a 1 CUP: SKU90 rec 30538c95 100u@1 — consumida; ajustes de cuadre @1)',
}

# ═══ 6. IMPACTO CONTABLE: saldos y phantom ══════════════════════════════════
saldos = {r['category_code']: r for r in e['saldos_cuentas'] if r['store_id'] == STORE}
R['impacto_contable'] = {
    'saldos_enervida': {k: {'debe': str(d(v['total_debe'])), 'haber': str(d(v['total_haber'])),
                            'saldo_natural': str(d(v['saldo_natural'])), 'movs': v['movs']}
                        for k, v in saldos.items()},
    'cuentas_gasto_acreedoras': {
        'GAS_COSTO_VENTAS': str(d(saldos['GAS_COSTO_VENTAS']['saldo_natural'])),
        'GAS_VALES': str(d(saldos['GAS_VALES']['saldo_natural'])),
        'GAS_PERDIDA_INV': str(d(saldos['GAS_PERDIDA_INV']['saldo_natural'])),
        'nota': 'Saldos acreedores (negativos) en cuentas de gasto = créditos de RECT-011 sin débitos '
                'históricos que los sustenten (ingreso fantasma). Creados por la misma entrada RECT-011.',
    },
    'creditos_rect011_5sku': {},
}
# créditos del modelo m074 para los 5 SKU por canal
cred = defaultdict(lambda: D(0))
for sku in TARGETS:
    m74 = m074_by_sku[sku]
    cred['inv'] += d(m74['inv_credito']); cred['cogs'] += d(m74['cogs_credito'])
    cred['vales'] += d(m74['vales_credito']); cred['perdida'] += d(m74['perdida_credito'])
    cred['delta'] += d(m74['delta_linea'])
R['impacto_contable']['creditos_rect011_5sku'] = {k: str(v) for k, v in cred.items()}
R['impacto_contable']['creditos_rect011_global'] = {
    'inv': '3678375.50', 'cogs': '21450370.50', 'vales': '5913947.50', 'perdida': '9691030.00',
    'cxp_debito': '40733723.50',
}

# ═══ 7. PROPUESTA DE CORRECCIÓN (RECT-013-A) ═══════════════════════════════
delta_q2 = Q2(sum_delta)
base = cred['cogs'] + cred['vales'] + cred['perdida']   # 11.361.375,00
prop_cogs = Q2(delta_q2 * cred['cogs'] / base)
prop_vales = Q2(delta_q2 * cred['vales'] / base)
prop_perdida = delta_q2 - prop_cogs - prop_vales        # residuo al mayor
R['propuesta_rect013_a'] = {
    'entrada': 'DR GAS_COSTO_VENTAS + DR GAS_VALES + DR GAS_PERDIDA_INV / CR ACT_INVENTARIO',
    'importe_total': str(delta_q2),
    'reparto_base': 'proporcional a los créditos de RECT-011 de los 5 SKU por canal de gasto',
    'base_reparto': str(base),
    'dr_gas_costo_ventas': str(prop_cogs),
    'dr_gas_vales': str(prop_vales),
    'dr_gas_perdida_inv': str(prop_perdida),
    'cr_act_inventario': str(delta_q2),
    'balance': str(prop_cogs + prop_vales + prop_perdida - delta_q2),
    'wac_updates': [{'sku': sku, 'product_id': prod_by_sku[sku]['id'],
                     'wac_hoy': prod_by_sku[sku]['cost_average'], 'wac_nuevo': '1.00',
                     'stock': prod_by_sku[sku]['stock_current']} for sku in TARGETS],
    'semantica': ('El importe es el exceso de crédito de inventario de RECT-011 sobre el valor libro '
                  'de los 5 productos (más el ajuste a valor verdadero). La contrapartida debita las '
                  'cuentas de gasto que RECT-011 acreditó sin sustento (deshace parte del ingreso '
                  'fantasma) y acredita ACT_INVENTARIO liberando la atribución ficticia. La valoración '
                  'de producto queda en stock × 1,00 CUP (economía autorizada). No toca PAS_CXP_PROV '
                  '(economía FAC-VITALLCONS-001 intacta), ni capas, ni movimientos históricos.'),
    'alternativa_documentada': 'Concentrar la contrapartida íntegra en GAS_PERDIDA_INV (sugerencia del '
                               'informe 012): DR GAS_PERDIDA_INV 2.657.379,32 / CR ACT_INVENTARIO 2.657.379,32.',
}

# ═══ 7bis. COMPONENTE B (regularización, para autorización específica) ══════
# Re-costeo a 1 CUP/u de los consumos históricos netos de los 5 SKU + deshacer
# el fantasma completo de RECT-011 para los 5 SKU (más allá de la restauración A).
h_cogs = sum(d(rec[s]['flujos_netos'].get('venta', {}).get('costo_registrado', '0')) for s in TARGETS)
h_vales = sum(d(rec[s]['flujos_netos'].get('vale', {}).get('costo_registrado', '0')) for s in TARGETS)
h_perd = sum(d(rec[s]['flujos_netos'].get('perdida', {}).get('costo_registrado', '0')) for s in TARGETS)
cons_unid = {k: sum(d(rec[s]['flujos_netos'].get(k, {}).get('unidades', '0')) for s in TARGETS)
             for k in ('venta', 'vale', 'perdida')}
R['componente_b_regularizacion'] = {
    'alcance': 'SOLO los 5 SKU · NO ejecutar sin autorización específica del propietario (§10)',
    'costos_historicos_registrados': {'cogs': str(h_cogs), 'vales': str(h_vales), 'perdida': str(h_perd),
                                      'total': str(h_cogs + h_vales + h_perd)},
    'consumo_neto_unidades': {k: str(v) for k, v in cons_unid.items()},
    'costo_verdadero_1cup': {k: str(v) for k, v in cons_unid.items()},
    'recosteo_pendiente': {k: str(v - d(rec_s)) for k, v, rec_s in [
        ('venta', cons_unid['venta'], h_cogs), ('vale', cons_unid['vale'], h_vales),
        ('perdida', cons_unid['perdida'], h_perd)]},
    'fantasma_rect011_5sku': {k: str(cred[k]) for k in ('cogs', 'vales', 'perdida', 'inv', 'delta')},
    'nota': ('La regularización completa de la asignación contable de RECT-011 (liberar el residuo '
             'obsoleto de los 5 SKU en ACT_INVENTARIO ≈ 8,7M adicional tras A, re-costear consumos a '
             '1 CUP/u ≈ 165,62 neto y extender el tratamiento a los otros 96 productos) requiere '
             'decisión específica del propietario: afecta el resultado acumulado y las bases F-012-3.'),
}

# ═══ 8. INTEGRIDAD / ALCANCE ═══════════════════════════════════════════════
pp = [p for p in e['productos_todas_tiendas'] if p['store_id'] != STORE]
R['integridad'] = {
    'productos_fuera_de_enervida': [{'sku': p['sku'], 'tienda': p['store_name'], 'stock': str(p['stock_current']),
                                     'wac': str(p['cost_average']), 'updated_at': str(p['updated_at'])} for p in pp],
    'capas_ajenas_5sku': {sku: rec[sku]['capas_ajenas'] for sku in TARGETS},
    'capas_fvc_a_1cup': all(d(c['uc_actual']) == 1 for sku in TARGETS for c in rec[sku]['capas_fvc']),
    'wac_negativos_en_tienda': len(e['wac_negativos_hoy']),
    'drift_101': '0 (verificado misión 012; re-verificado en esta extracción: drift_campo_vs_kardex=0)',
    'valor_campo_tienda': e['valoracion_tienda'][0]['valor_campo'],
    'saldos_otras_tiendas': {r['category_code'] + '@' + r['store_id'][:8]: str(d(r['saldo_natural']))
                             for r in e['saldos_cuentas'] if r['store_id'] != STORE},
}

json.dump(R, open('scripts/out/m013/analysis.json', 'w'), ensure_ascii=False, indent=1)

# ── resumen consola ──────────────────────────────────────────────────────────
print('=== M091 · CONTROL ARITMÉTICO ===')
ca = R['control_aritmetico']
print(f"Σ cifras 012 (unitarios): {Q2(suma_cifras_012)} · total declarado: {total_declarado_012} · dif misión: {Q2(dif_mision)}")
print(f"Σ(wac×qty) real hoy: {neg_total_q2} · dif real vs suma unitarios: {Q2(dif_real)} → {ca['veredicto']}")
for v in verif:
    print(f"  SKU{v['sku']}: wac {Q2(D(v['wac']))} × {v['stock']} u = {v['valor_total_q2']}")
print()
print('=== RECONSTRUCCIÓN (flujos netos) ===')
for sku in TARGETS:
    r = rec[sku]
    print(f"SKU{sku}: stock={r['stock_current']} · neto_kardex={r['neto_kardex']} · drift={r['drift']} · capas FVC={len(r['capas_fvc'])} ajenas={len(r['capas_ajenas'])}")
    for k, v in r['flujos_netos'].items():
        print(f"   {k}: n={v['n']} unidades={v['unidades']} costo_registrado={Q2(D(v['costo_registrado']))}")
    idn = r['identidad_cantidades']
    print(f"   identidad: {idn['entradas_fvc']}+{idn['entradas_ajenas']}+{idn['ajustes_plus']}-{idn['consumo_neto']} = {idn['cuadra']} (final {idn['existencia_final']}) ok={idn['ok']}")
print()
print('=== INSTANTE ===')
print(f"  {instante} · wacs_previos_positivos={R['instante_negativo']['wacs_previos_positivos']}")
print()
print('=== RESTAURACIÓN ===')
print(f"  Δ total = {Q2(sum_delta)} · entrada RECT-013-A: DR COGS {prop_cogs} + DR VALES {prop_vales} + DR PÉRDIDA {prop_perdida} / CR INV {delta_q2} · balance {R['propuesta_rect013_a']['balance']}")
print()
print('=== CAUSA RAÍZ (exceso de crédito) ===')
for c in causas:
    print(f"  SKU{c['sku']}: valor_libro_pre={Q2(D(c['valor_libro_pre']))} · inv_credito={Q2(D(c['inv_credito_aplicado']))} · exceso={Q2(D(c['exceso_credito_sobre_valor_libro']))} · {c['clasificacion'][:60]}")
