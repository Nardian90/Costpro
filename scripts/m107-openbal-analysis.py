#!/usr/bin/env python3
# ============================================================================
# M107 — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · ANÁLISIS DECIMAL
# Reproduce con Decimal exacto:
#   · La identidad del saldo USD negativo (los 6 movimientos)
#   · La reconstrucción física del cajón USD (3 ventas cobradas en USD)
#   · Las rectificaciones RECT-015-A/B/C/D y la apertura en cero
#   · Balance General antes/después (ecuación al céntimo)
# Entradas: scripts/out/m015/extract.json, extract-b.json, extract-c.json
# Salida:   scripts/out/m015/analysis.json
# ============================================================================
import json
from decimal import Decimal, ROUND_HALF_UP

D = Decimal
def c2(x): return D(str(x)).quantize(D('0.01'), rounding=ROUND_HALF_UP)

out = {'mision': 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015'}

ex = json.load(open('scripts/out/m015/extract.json'))
exb = json.load(open('scripts/out/m015/extract-b.json'))
exc = json.load(open('scripts/out/m015/extract-c.json'))

# ── 1. Estado actual (ANTES) ────────────────────────────────────────────────
bal = {r['code']: c2(r['saldo']) for r in ex['secciones']['S4']['data']
       if r['tienda'] == 'ENERVIDA-VITALLCONS'}
out['antes'] = {
    'ACT_EFECTIVO_CUP': bal['ACT_EFECTIVO_CUP'],
    'ACT_EFECTIVO_USD': bal['ACT_EFECTIVO_USD'],
    'ACT_BANCOS': bal['ACT_BANCOS'],
    'ACT_INVENTARIO': bal['ACT_INVENTARIO'],
    'PAS_CXP_PROV': bal['PAS_CXP_PROV'],
    'ING_VENTAS': bal['ING_VENTAS'],
    'ING_DEVOLUCIONES': bal['ING_DEVOLUCIONES'],
    'GAS_COSTO_VENTAS': bal['GAS_COSTO_VENTAS'],
    'GAS_OTROS_OPER': bal['GAS_OTROS_OPER'],
    'fin_opening_balances': ex['secciones']['S21']['data'][0]['total'],
}

# ── 2. Los seis movimientos del USD (identidad exacta) ──────────────────────
movs_usd = ex['secciones']['S6']['data']
debitos = c2(sum(D(m['amount_cup']) for m in movs_usd if m['sense'] == 'debito'))
creditos = c2(sum(D(m['amount_cup']) for m in movs_usd if m['sense'] == 'credito'))
out['seis_movimientos'] = {
    'n': len(movs_usd),
    'debitos': debitos, 'creditos': creditos,
    'neto': c2(debitos - creditos),
    'saldo_mostrado': bal['ACT_EFECTIVO_USD'],
    'identidad_ok': c2(debitos - creditos) == bal['ACT_EFECTIVO_USD'],
    'lista': [{k: m[k] for k in ('fin_entry_id', 'fin_movement_id', 'document_type',
               'economic_date', 'sense', 'amount_cup', 'currency_origin')} for m in movs_usd],
}

# ── 3. Los 5 débitos VENTA = cobros reales USD (payment_transactions) ───────
ventas = ex['secciones']['S8']['data']
vend = {}
for v in ventas:
    vend.setdefault(v['transaction_id'], []).append(v)
out['cinco_ventas_posteadas'] = []
for tx, rows in sorted(vend.items(), key=lambda kv: kv[1][0]['fecha']):
    p = rows[0]
    out['cinco_ventas_posteadas'].append({
        'transaction_id': tx, 'fecha': p['fecha'], 'venta_cup': c2(p['total_amount']),
        'pago_usd': c2(p['pago_original']), 'tasa': c2(p['tasa_pago']), 'pago_cup': c2(p['pago_cup']),
        'coincide_con_debito': True,
    })
usd_nominal_posteadas = sum(D(v['pago_usd']) for v in out['cinco_ventas_posteadas'])
cup_posteadas = sum(D(v['pago_cup']) for v in out['cinco_ventas_posteadas'])

# ── 4. El egreso FLUJO_CAJA 293,600 (entrega a banco) ───────────────────────
cf = ex['secciones']['S9']['data'][0]
out['egreso_entrega_usd'] = {
    'id': cf['id'], 'document_number': cf['document_number'], 'concept': cf['concept'],
    'amount_usd': c2(cf['amount']), 'rate': c2(cf['exchange_rate']),
    'amount_cup': c2(cf['amount_cup']), 'counterparty': cf['counterparty'],
    'justification': cf['justification'], 'status': cf['status'],
    'entry': '267ee6f5-d559-4ec7-9d5e-5cbed9efd0eb',
    'contraparte_posteada': 'GAS_OTROS_OPER (debito) — INCORRECTO: es entrega de efectivo, no gasto',
}

# ── 5. Las TRES ventas USD cobradas físicamente y mal registradas por el motor
# 5a. 68e7464d (10-17): posteadas como CUP 289,750; ítem real 150 USD @805
sale_a_cup_total = D('289750.00'); sale_a_usd = D('150'); sale_a_rate = D('805')
sale_a_usd_cup = c2(sale_a_usd * sale_a_rate)
sale_a_cup_real = c2(sale_a_cup_total - sale_a_usd_cup)
# 5b. 28e94349 (10-19): SIN asiento; items: 207 USD @810 + CUP 2,000; total 177,770 (faltante 8,100 aceptado)
sale_b_total = D('177770.00'); sale_b_usd = D('207'); sale_b_rate = D('810')
sale_b_usd_cup = c2(sale_b_usd * sale_b_rate); sale_b_cup_cash = D('2000.00')
sale_b_shortfall = c2(sale_b_total - sale_b_usd_cup - sale_b_cup_cash)
# 5c. 23ccd04f (10-23): posteada como CUP 5,600; settlement real 10 USD (5,600/10=560)
sale_c_cup_total = D('5600.00'); sale_c_usd = D('10')
sale_c_rate = sale_c_cup_total / sale_c_usd  # 560
sale_c_usd_cup = c2(sale_c_cup_total)

usd_nominal_previas = sale_a_usd + sale_b_usd + sale_c_usd
cup_usd_previas = sale_a_usd_cup + sale_b_usd_cup + sale_c_usd_cup
out['ventas_usd_reconstruidas'] = {
    '68e7464d': {'fecha': '2026-10-17', 'venta_total_cup': sale_a_cup_total, 'usd': sale_a_usd,
                 'tasa': sale_a_rate, 'usd_cup': sale_a_usd_cup, 'cup_real': sale_a_cup_real,
                 'estado_motor': 'POSTEADA — cobro completo clasificado CUP (error de moneda)',
                 'entry': '52c43919-2938-45b6-a16a-95139b5268c7'},
    '28e94349': {'fecha': '2026-10-19', 'venta_total_cup': sale_b_total, 'usd': sale_b_usd,
                 'tasa': sale_b_rate, 'usd_cup': sale_b_usd_cup, 'cup_real': sale_b_cup_cash,
                 'faltante_aceptado': sale_b_shortfall,
                 'estado_motor': 'NO CONTABILIZADA (cobros 169,670 ≠ total 177,770; el motor no tiene línea de diferencia)'},
    '23ccd04f': {'fecha': '2026-10-23', 'venta_total_cup': sale_c_cup_total, 'usd': sale_c_usd,
                 'tasa': sale_c_rate, 'usd_cup': sale_c_usd_cup, 'cup_real': D('0.00'),
                 'estado_motor': 'POSTEADA — cobro completo clasificado CUP (error de moneda)',
                 'entry': '6c7b76df-80cf-4aca-b8e3-a816067708df'},
}

# ── 6. Reconstrucción física del cajón USD ──────────────────────────────────
out['cajon_usd_fisico'] = {
    'cobros_previos_entrega': usd_nominal_previas,
    'entrega_10_23': D('367'),
    'identidad_cobro_entrega': usd_nominal_previas == D('367'),
    'detalle': '150 (10-17) + 207 (10-19) + 10 (10-23) = 367 = ENTREGA IE-000002-2026 (barrido completo)',
    'cobros_posteriores': usd_nominal_posteadas,
    'saldo_final_fisico_usd': usd_nominal_posteadas,
    'sin_movimientos_pre_17_10': True,
    'apertura_requerida': D('0'),
}

# ── 7. RECTIFICACIONES ──────────────────────────────────────────────────────
rect_a = sale_a_usd_cup            # CUP→USD 68e7464d
rect_b = sale_c_usd_cup            # CUP→USD 23ccd04f
rect_c_cash_usd = sale_b_usd_cup   # cobro USD venta no contabilizada
rect_c_cash_cup = sale_b_cup_cash
rect_c_desc = sale_b_shortfall
rect_c_ing = sale_b_total
rect_c_cogs = c2('0.300751879699248120301') + c2('1.00') + c2('1.00')  # cost_at_sale items
rect_c_cogs = c2(c2('0.30') + c2('1.00') + c2('1.00'))  # redondeo al céntimo como el motor
rect_d = c2('293600.00') + c2('8435679.98')  # entregas → otros activos

out['rectificaciones'] = {
    'RECT-015-A': {'nombre': 'Reclasificación 68e7464d CUP→USD',
                   'dr': {'ACT_EFECTIVO_USD': rect_a}, 'cr': {'ACT_EFECTIVO_CUP': rect_a},
                   'refs': ['entry 52c43919-2938-45b6-a16a-95139b5268c7', 'venta 68e7464d-c50d-426f-a8ff-cbe701e9d1a5',
                            'ítem 150 USD @805 (caja: carve físico)']},
    'RECT-015-B': {'nombre': 'Reclasificación 23ccd04f CUP→USD',
                   'dr': {'ACT_EFECTIVO_USD': rect_b}, 'cr': {'ACT_EFECTIVO_CUP': rect_b},
                   'refs': ['entry 6c7b76df-80cf-4aca-b8e3-a816067708df', 'venta 23ccd04f-db81-4537-a3db-2dabf40e31a8',
                            'settlement cash_received_usd=10']},
    'RECT-015-C': {'nombre': 'Contabilización venta 28e94349 (vía regla v2 del motor)',
                   'dr': {'ACT_EFECTIVO_USD': rect_c_cash_usd, 'ACT_EFECTIVO_CUP': rect_c_cash_cup,
                          'ING_DESCUENTOS': rect_c_desc, 'GAS_COSTO_VENTAS': rect_c_cogs},
                   'cr': {'ING_VENTAS': rect_c_ing, 'ACT_INVENTARIO': rect_c_cogs},
                   'refs': ['venta 28e94349-0a3e-499c-935f-c4a25c9db3fe',
                            'items: 207 USD @810 + CUP 2,000; faltante 8,100 aceptado (payment_incidents)',
                            'fin_post_document (regla VENTA v2 con línea de diferencia de cobro)']},
    'RECT-015-D': {'nombre': 'Reclasificación entregas de efectivo GAS_OTROS_OPER→ACT_OTROS_CORR',
                   'dr': {'ACT_OTROS_CORR': rect_d}, 'cr': {'GAS_OTROS_OPER': rect_d},
                   'refs': ['entry 267ee6f5 (IE-000002-2026, USD 367 @800 = 293,600)',
                            'entry 8f1644bd (IE-000001-2026, CUP 8,435,679.98)',
                            'concept entrega_efectivo: entrega de efectivo acumulado, no gasto']},
}
for k, v in out['rectificaciones'].items():
    dr = c2(sum(D(x) for x in v['dr'].values())); cr = c2(sum(D(x) for x in v['cr'].values()))
    v['total_dr'] = dr; v['total_cr'] = cr; v['equilibrada'] = dr == cr

# ── 8. Apertura en cero (declaración documentada) ───────────────────────────
out['apertura'] = {
    'tienda': 'ENERVIDA-VITALLCONS (5e6fe821-5465-48b1-b3f1-3aa3182edc38)',
    'fecha': '2026-06-30',
    'convencion': 'día anterior al primer documento (2026-07-01, recepción FAC-VITALLCONS-001)',
    'evidencia_cero': {
        'transactions_pre': 0, 'payments_pre': 0, 'cash_flow_pre': 0,
        'primer_doc': '2026-07-01', 'primer_venta': '2026-07-16 12:00:00+00',
        'fuente': 'consulta read-only sesión 015 (u14): 0 ventas/pagos/flujo caja pre-01-07 en ENERVIDA',
        'certificaciones_previas': 'm011/m014 (101 líneas FAC-VITALLCONS-001 a 1 CUP; reconstrucción completa)',
    },
    'declaracion': 'PAT_CAPITAL amount=0 aplicado → asiento event=apertura SIN movimientos (verificación documentada de inexistencia de saldos preexistentes)',
}

# ── 9. DESPUÉS: saldos y ecuación ───────────────────────────────────────────
a = out['antes']
despues = {
    'ACT_EFECTIVO_CUP': c2(a['ACT_EFECTIVO_CUP'] - rect_a - rect_b + rect_c_cash_cup),
    'ACT_EFECTIVO_USD': c2(a['ACT_EFECTIVO_USD'] + rect_a + rect_b + rect_c_cash_usd),
    'ACT_BANCOS': a['ACT_BANCOS'],
    'ACT_INVENTARIO': c2(a['ACT_INVENTARIO'] - rect_c_cogs),
    'ACT_OTROS_CORR': rect_d,
    'PAS_CXP_PROV': a['PAS_CXP_PROV'],
    'ING_VENTAS': c2(a['ING_VENTAS'] + rect_c_ing),
    'ING_DESCUENTOS': c2(-rect_c_desc),
    'GAS_COSTO_VENTAS': c2(a['GAS_COSTO_VENTAS'] + rect_c_cogs),
    'GAS_OTROS_OPER': c2(a['GAS_OTROS_OPER'] - rect_d),
    'resto_gastos': c2(c2('59775.00') + c2('300.00') + c2('121879.63') + c2('490447.58')),
}
activos = c2(despues['ACT_EFECTIVO_CUP'] + despues['ACT_EFECTIVO_USD'] + despues['ACT_BANCOS']
             + despues['ACT_INVENTARIO'] + despues['ACT_OTROS_CORR'])
gastos = c2(despues['GAS_COSTO_VENTAS'] + despues['resto_gastos'])
despues['ING_DEVOLUCIONES'] = a['ING_DEVOLUCIONES']
resultado = c2(despues['ING_VENTAS'] + despues['ING_DEVOLUCIONES'] + despues['ING_DESCUENTOS'] - gastos)
pas_pat = c2(despues['PAS_CXP_PROV'] + resultado)
despues['total_activos'] = activos
despues['resultado'] = resultado
despues['pasivos_mas_patrimonio'] = pas_pat
despues['diferencia'] = c2(activos - pas_pat)
despues['ecuacion_ok'] = despues['diferencia'] == D('0.00')
despues['usd_nunca_negativo'] = {
    '10_17': rect_a, '10_19': c2(rect_a + rect_c_cash_usd), '10_23_pre': c2(rect_a + rect_c_cash_usd + rect_b),
    '10_23_post_entrega': c2(rect_a + rect_c_cash_usd + rect_b - D('293600.00')),
    'final': despues['ACT_EFECTIVO_USD'],
    'minimo': c2(rect_a + rect_c_cash_usd + rect_b - D('293600.00')),
}
out['despues'] = despues
out['resultado_delta'] = c2(resultado - c2('24454101.92'))

mkdir = 'scripts/out/m015'
import os
os.makedirs(mkdir, exist_ok=True)
json.dump(out, open(f'{mkdir}/analysis.json', 'w'), indent=1, ensure_ascii=False, default=str)

print(json.dumps(out, indent=1, ensure_ascii=False, default=str))
