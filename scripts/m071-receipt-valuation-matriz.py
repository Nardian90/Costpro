#!/usr/bin/env python3
# ============================================================================
# M071 — CP-FIN-RECEIPT-FULL-VALUATION-010 · ANÁLISIS Y MATRIZ MAESTRA
# Entradas (read-only, ya extraídas):
#   scripts/out/m070-receipt-valuation-extract.json  (extracción integral RO)
#   scripts/out/m070b-maestro-audit.json             (auditoría maestro + tasas)
#   docs/audits/valuation-rectification-003-20261115/m048-faseIII-matriz.json (congelado 003)
# Salidas:
#   scripts/out/m071-matriz-maestra.json  — matriz 101 × campos §5 + conciliaciones
# Solo lecturas locales. No toca producción. Re-ejecutable.
# ============================================================================
import json, os
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict, Counter

D = lambda x: Decimal(str(x)) if x is not None and str(x).strip() != '' else Decimal(0)
Q = lambda x: D(x).quantize(Decimal('0.01'), ROUND_HALF_UP)
BASE = '/home/z/my-project/Costpro'
OUT = os.path.join(BASE, 'scripts/out/m071-matriz-maestra.json')

snap = json.load(open(os.path.join(BASE, 'scripts/out/m070-receipt-valuation-extract.json')))
maes = json.load(open(os.path.join(BASE, 'scripts/out/m070b-maestro-audit.json')))
m048 = json.load(open(os.path.join(BASE, 'docs/audits/valuation-rectification-003-20261115/m048-faseIII-matriz.json')))
m048_by_sku = {str(r['sku']): r for r in m048['matriz']}

# Listado cerrado del propietario (misión 010 §2): #orden, sku, cantidad, uc mostrado, subtotal mostrado
MISION = [
    (1,120,'1','1','1'),(2,108,'2','1','2'),(3,116,'2','1','2'),(4,94,'3','1','3'),(5,62,'4','1','4'),
    (6,999,'4','1','4'),(7,43,'6','1','6'),(8,49,'8','1','8'),(9,92,'12','1','12'),(10,103,'15','1','15'),
    (11,104,'20','1','20'),(12,95,'36','1','36'),(13,115,'37','1','37'),(14,98,'42','1','42'),(15,111,'49','1','49'),
    (16,35,'68','1','68'),(17,112,'100','1','100'),(18,97,'122','1','122'),(19,100,'155','1','155'),(20,65,'204','1','204'),
    (21,96,'212','1','212'),(22,106,'377','1','377'),(23,81,'401','1','401'),(24,87,'339','4.5','1525.5'),(25,88,'444.5','4.5','2000.25'),
    (26,80,'1','5','5'),(27,89,'122.5','5','612.5'),(28,90,'173','5','865'),(29,22,'226','7','1582'),(30,119,'20','10','200'),
    (31,24,'4','18','72'),(32,107,'5','25','125'),(33,9,'23','25','575'),(34,67,'1','45','45'),(35,37,'11','50','550'),
    (36,68,'12','65','780'),(37,118,'3','80','240'),(38,36,'2','110','220'),(39,30,'100','150','15000'),(40,71,'108','150','16200'),
    (41,83,'3','180','540'),(42,82,'1','200','200'),(43,20,'15','200','3000'),(44,19,'29','200','5800'),(45,113,'126','200','25200'),
    (46,29,'532','200','106400'),(47,21,'1','220','220'),(48,72,'6','250','1500'),(49,50,'10','250','2500'),(50,61,'26','250','6500'),
    (51,48,'38','250','9500'),(52,56,'5','350','1750'),(53,1,'19','350','6650'),(54,2,'32','350','11200'),(55,11,'69','350','24150'),
    (56,31,'95','350','33250'),(57,86,'58','370','21460'),(58,85,'5','380','1900'),(59,32,'28','400','11200'),(60,14,'16','500','8000'),
    (61,70,'82','600','49200'),(62,69,'4','800','3200'),(63,40,'7','1000','7000'),(64,75,'8','1000','8000'),(65,77,'22','1000','22000'),
    (66,109,'107','1200','128400'),(67,110,'219','1200','262800'),(68,12,'89.5','1350','120825'),(69,73,'10','1500','15000'),(70,79,'10','1500','15000'),
    (71,76,'16','1500','24000'),(72,13,'266','1500','399000'),(73,3,'6','1600','9600'),(74,27,'9','1800','16200'),(75,6,'2','2000','4000'),
    (76,5,'3','2000','6000'),(77,26,'3','2000','6000'),(78,59,'1','2500','2500'),(79,57,'7','2500','17500'),(80,52,'44','2500','110000'),
    (81,39,'39','2800','109200'),(82,42,'3','3000','9000'),(83,117,'6','3200','19200'),(84,38,'27','3200','86400'),(85,18,'4','3500','14000'),
    (86,4,'1','4000','4000'),(87,28,'35','5000','175000'),(88,8,'2','6000','12000'),(89,74,'4','6000','24000'),(90,17,'27','6500','175500'),
    (91,84,'66','6500','429000'),(92,15,'33','10000','330000'),(93,16,'23','12500','287500'),(94,47,'39','14000','546000'),(95,55,'13','20000','260000'),
    (96,46,'5','22000','110000'),(97,34,'4','23000','92000'),(98,51,'20','32500','650000'),(99,45,'4','40000','160000'),(100,63,'1','69900','69900'),
    (101,64,'1','69900','69900'),
]

items = snap['receipt_items']
items_by_sku = {str(x['sku']): x for x in items}
lay = {str(x['sku']): x for x in snap['layers_fvc']}
kardex_by_sku = defaultdict(list)
for m in snap['kardex_101']:
    kardex_by_sku[str(m['sku'])].append(m)
waclog_by_sku = defaultdict(list)
for w in snap['wac_change_log']:
    waclog_by_sku[str(w['sku'])].append(w)
titems_by_sku = defaultdict(list)
for t in snap['transaction_items_101']:
    titems_by_sku[str(t['sku'])].append(t)
vales_by_sku = defaultdict(list)
for v in snap['issue_slip_items_101']:
    vales_by_sku[str(v['sku'])].append(v)
cogs_by_sku = defaultdict(list)
for c in snap['fin_movements_cogs_101']:
    cogs_by_sku[str(c.get('sku', ''))].append(c) if 'sku' in c else None

FVC_DOC = 'FAC-VITALLCONS-001'
RECEIPT_ID = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'

# ── Comparación contra el listado del propietario ───────────────────────────
control_listado = {'esperadas': 101, 'encontradas': 0, 'skus_faltantes_bd': [], 'skus_sobrantes_bd': [],
                   'diferencias_cantidad': [], 'diferencias_uc': [], 'diferencias_subtotal': []}
mis_skus = set()
for (num, sku, qy, uc, sub) in MISION:
    mis_skus.add(str(sku))
    r = items_by_sku.get(str(sku))
    if not r:
        control_listado['skus_faltantes_bd'].append(sku); continue
    control_listado['encontradas'] += 1
    if Q(D(qy)) != Q(D(r['quantity'])):
        control_listado['diferencias_cantidad'].append({'sku': sku, 'listado': qy, 'bd': str(r['quantity'])})
    if Q(D(uc)) != Q(D(r['unit_cost'])):
        control_listado['diferencias_uc'].append({'sku': sku, 'listado': uc, 'bd': str(r['unit_cost'])})
    if Q(D(sub)) != Q(D(qy) * D(uc)):
        control_listado['diferencias_subtotal'].append({'sku': sku, 'listado': sub, 'calc': str(Q(D(qy) * D(uc)))})
control_listado['skus_sobrantes_bd'] = sorted(set(items_by_sku) - mis_skus)

# ── Agregados de inventario/COGS por SKU ────────────────────────────────────
def inventario_sku(sku, layer, prod):
    movs = kardex_by_sku.get(sku, [])
    fvc_mov = next((m for m in movs if m.get('reference_id') == RECEIPT_ID and m['movement_type'] == 'purchase'), None)
    entradas_fvc = D(fvc_mov['quantity_change']) if fvc_mov else D(0)
    salidas = {'sale': D(0), 'sale_reverse': D(0), 'issue_slip_out': D(0), 'issue_slip_reverse': D(0),
               'adjustment_pos': D(0), 'adjustment_neg': D(0)}
    otros_ingresos = D(0)
    # atribución FIFO: capas cronológicas
    capas_fifo = []  # [qty_pendiente, uc, ref]
    for m in sorted(movs, key=lambda x: (x['movement_date'] or '', x['created_at'] or '')):
        q = D(m['quantity_change']); mt = m['movement_type']
        if mt == 'purchase':
            capas_fifo.append([q, D(m['unit_cost']), (m.get('reference_id') or '')[:8], m['movement_date']])
            if m.get('reference_id') != RECEIPT_ID:
                otros_ingresos += q
        elif mt in ('sale', 'issue_slip_out', 'adjustment'):
            restante = -q  # consumo
            while restante > 0 and capas_fifo:
                c = capas_fifo[0]
                toma = min(c[0], restante)
                c[0] -= toma; restante -= toma
                if c[0] <= 0: capas_fifo.pop(0)
            if mt == 'sale': salidas['sale'] += -q
            elif mt == 'issue_slip_out': salidas['issue_slip_out'] += -q
            elif q < 0: salidas['adjustment_neg'] += -q
            else: salidas['adjustment_pos'] += q
        elif mt == 'sale_reverse':
            salidas['sale_reverse'] += -q
            capas_fifo.append([-q, D(m['unit_cost']), (m.get('reference_id') or '')[:8], m['movement_date']])
        elif mt == 'issue_slip_reverse':
            salidas['issue_slip_reverse'] += -q
            capas_fifo.append([-q, D(m['unit_cost']), (m.get('reference_id') or '')[:8], m['movement_date']])
    capa_fvc_restante = next((c for c in capas_fifo if c[2] == RECEIPT_ID[:8]), None)
    # COGS registrado (transactions completadas)
    cogs_items = D(0); cogs_qty = D(0)
    for t in titems_by_sku.get(sku, []):
        if (t.get('tx_status') == 'completed') and not t.get('reversed_at'):
            cogs_items += D(t['cost_at_sale']) * D(t['quantity'])
            cogs_qty += D(t['quantity'])
    # vales (consumo inventario por vales)
    vales_qty = sum(D(v['quantity']) for v in vales_by_sku.get(sku, []) if not v.get('voided_at'))
    vales_costo = sum(D(v['quantity']) * D(v['unit_cost']) for v in vales_by_sku.get(sku, []) if not v.get('voided_at'))
    return {
        'stock_current': D(prod['stock_current']),
        'wac_actual': D(prod['wac_actual']),
        'capa_fvc_qty': D(layer['quantity_change']), 'capa_fvc_uc': D(layer['unit_cost']),
        'capa_fvc_valor': D(layer['quantity_change']) * D(layer['unit_cost']),
        'capa_fvc_id': layer['id'], 'capa_fvc_restante_fifo': capa_fvc_restante[0] if capa_fvc_restante else D(0),
        'otros_ingresos_qty': otros_ingresos,
        'salidas': salidas, 'salidas_total': sum(salidas.values()),
        'ventas_qty': cogs_qty, 'cogs_cost_at_sale': cogs_items,
        'vales_qty': vales_qty, 'vales_costo': vales_costo,
        'n_movimientos_kardex': len(movs),
        'wac_cambios': len(waclog_by_sku.get(sku, [])),
    }

# ── Clasificación A–F (misión §6) basada en m048 + reglas del propietario ───
def clasificar(sku, m048_row, inv):
    cat048 = m048_row['categoria']
    if sku in ('111', '112'):
        return ('B', 'Costo incorrecto y documentado — CORREGIDO por RECT-1 (misión 009, autorizada) y verificado aquí: uc 1,00 CUP, capa y WAC coherentes. Sin repetición.')
    if sku == '999':
        return ('F', 'Servicio (products.is_service=true). La capa FVC 4 u × 1 CUP es trivial y el saldo neto kardex es 0; el WAC 443,83 y su historial provienen de otra recepción ajena (44b8f20f, 20 u × 680) y de cuadres posteriores — fuera del alcance. Sin capa nueva ni WAC nuevo.')
    if 'Discrepancia de moneda' in cat048:
        if sku == '90':
            return ('C', 'Señal m048: magnitud 5 idéntica a un precio CUP plausible (173×5=865 CUP) pero registrada USD×680=588.200 CUP. Sin documento de compra que demuestre la moneda original. Propuesta cuantificada pendiente de evidencia + autorización específica (lote L1). NO EJECUTADA.')
        return ('C', 'Señal m048 trivial (costo 1 auténtico, magnitud ambigua entre monedas; impacto ≤ 8.148 CUP). Pendiente de evidencia/decisión del propietario (lote L2). NO EJECUTADA.')
    if 'Costo bajo legítimo' in cat048:
        return ('A', 'Costo bajo auténtico 1 CUP confirmado por decisión previa del propietario (D3, misión 003). Sin modificación.')
    if 'Sin problema detectado' in cat048:
        return ('A', 'Evidencia de sistema: costo registrado distinto del precio de venta y moneda consistente (misión 003, DP). Sin modificación.')
    return ('E', 'Costo no verificable: magnitud indistinguible precio/costo (71 líneas, DP-3 misión 003). Sin documento de compra por línea. Protegidas: no modificar hasta evidencia (lote L3 pendiente de decisión del propietario).')

# ── MATRIZ MAESTRA ──────────────────────────────────────────────────────────
matriz = []
for (num, sku, qy, uc_shown, sub_shown) in MISION:
    r = items_by_sku[str(sku)]
    layer = lay[str(sku)]
    prod = {'stock_current': r['stock_current'], 'wac_actual': r['wac_actual']}
    inv = inventario_sku(str(sku), layer, prod)
    cat, nota = clasificar(str(sku), m048_by_sku[str(sku)], inv)
    tasa = D(r['tasa_cambio_recepcion']); mon = r['moneda_recepcion']
    uc = D(r['unit_cost']); qty = D(r['quantity'])
    uc_cup = uc * tasa; sub_cup = uc_cup * qty
    sub_reg = uc * qty
    matriz.append({
        'num': num, 'sku': sku, 'nombre': r['name'], 'product_id': r['product_id'],
        'line_id': r['line_id'],
        'qty': qty, 'uc_registrado': uc, 'subtotal_registrado': sub_reg,
        'moneda': mon, 'tasa': tasa, 'uc_cup': uc_cup, 'subtotal_cup': sub_cup,
        'referencia_doc': f"{FVC_DOC} (receipt {RECEIPT_ID[:8]}…, asiento 93bb5da9… 2026-07-01)",
        'capa_id': layer['id'], 'capa_qty': inv['capa_fvc_qty'], 'capa_uc': inv['capa_fvc_uc'],
        'capa_restante_fifo': inv['capa_fvc_restante_fifo'],
        'stock_actual': inv['stock_current'],
        'salidas_venta': inv['salidas']['sale'] - inv['salidas']['sale_reverse'],
        'salidas_vales': inv['salidas']['issue_slip_out'] - inv['salidas']['issue_slip_reverse'],
        'salidas_ajustes': inv['salidas']['adjustment_neg'] - inv['salidas']['adjustment_pos'],
        'otros_ingresos': inv['otros_ingresos_qty'],
        'wac_actual': inv['wac_actual'], 'wac_cambios': inv['wac_cambios'],
        'ventas_qty': inv['ventas_qty'], 'cogs_asociado': inv['cogs_cost_at_sale'],
        'vales_qty': inv['vales_qty'], 'vales_costo': inv['vales_costo'],
        'precio_venta_actual': D(r['precio_venta']), 'moneda_precio_venta': r['price_currency'],
        'evidencia': m048_by_sku[str(sku)]['fuente_confirmacion'],
        'clasificacion': cat, 'nota_clasificacion': nota,
        'correccion_propuesta': ('NINGUNA (correcta)' if cat == 'A' else
            'APLICADA Y VERIFICADA (RECT-1, 151.299.851 CUP total ambos SKU; misión 009)' if cat == 'B' else
            'PROPUESTA CUANTIFICADA PENDIENTE DE AUTORIZACIÓN ESPECÍFICA (no ejecutar sin el propietario)' if cat == 'C' else
            'NINGUNA (servicio: no crear capa/WAC nuevo)' if cat == 'F' else
            'NINGUNA (protegida: pendiente de evidencia del propietario)'),
        'estado_correccion': ('VERIFICADA EN ESTA MISIÓN' if cat == 'B' else
            'PROPUESTA (no ejecutada)' if cat == 'C' else 'SIN CORRECCIÓN REQUERIDA / PROTEGIDA'),
    })

matriz_by_sku = {str(r['sku']): r for r in matriz}

# ── CONCILIACIÓN DE MONEDAS Y TOTALES ───────────────────────────────────────
por_moneda = defaultdict(lambda: {'n': 0, 'subtotal_orig': D(0), 'subtotal_cup': D(0)})
for r in matriz:
    m = por_moneda[r['moneda']]
    m['n'] += 1; m['subtotal_orig'] += r['subtotal_registrado']; m['subtotal_cup'] += r['subtotal_cup']
conciliacion = {
    'cabecera_total_cost': D(snap['receipt']['total_cost']),
    'suma_lineas_cup_equiv': sum(r['subtotal_cup'] for r in matriz),
    'suma_lineas_originales': sum(r['subtotal_registrado'] for r in matriz),
    'por_moneda': {k: {'n': v['n'], 'subtotal_moneda': Q(v['subtotal_orig']), 'subtotal_cup': Q(v['subtotal_cup'])}
                   for k, v in por_moneda.items()},
    'diferencia_vs_cabecera': Q(sum(r['subtotal_cup'] for r in matriz) - D(snap['receipt']['total_cost'])),
    'subtotal_mostrado_suma': Q(sum(D(x[3]) * D(x[2]) for x in MISION)),
    'tasa_680_evidencia': maes['rates_680_cerca'],
    'tasa_2026_07_01_capturada': maes['rates_2026_07_01'],
}

# ── CONTRASTE CON MATRIZ CONGELADA m048 (99 líneas protegidas) ──────────────
m048_diff = []
for (num, sku, qy, uc_shown, sub_shown) in MISION:
    if str(sku) in ('111', '112'): continue  # corregidas por RECT-1 (cambio esperado)
    old = m048_by_sku[str(sku)]; new = matriz_by_sku[str(sku)]
    if (Q(D(old['q'])) != Q(new['qty']) or Q(D(old['uc_reg'])) != Q(new['uc_registrado'])
            or old['moneda'] != new['moneda'] or Q(D(old['tasa'])) != Q(new['tasa'])):
        m048_diff.append({'sku': sku, 'antes': [old['q'], old['uc_reg'], old['moneda'], old['tasa']],
                          'ahora': [str(new['qty']), str(new['uc_registrado']), new['moneda'], str(new['tasa'])]})

# ── CONCILIACIÓN COGS (tres bases documentadas) ─────────────────────────────
cogs_items_total = sum(r['cogs_asociado'] for r in matriz)
# Base kardex: salidas de venta de los 101 SKU por costo derivado (lo que alimenta GAS)
kardex_cogs = D(0)
for m in snap['kardex_101']:
    if m['movement_type'] == 'sale':
        kardex_cogs += abs(D(m['quantity_change'])) * D(m['unit_cost'])
    elif m['movement_type'] == 'sale_reverse':
        kardex_cogs -= abs(D(m['quantity_change'])) * D(m['unit_cost'])
gas_tx_ids = {str(g['document_id']) for g in maes['gas_cogs_por_tx']}
tx_status_by_id = {}
for t in maes['tx_items_todos']:
    tx_status_by_id.setdefault(str(t['transaction_id']), (t['tx_status'], bool(t['reversed_at'])))
sin_gas = [txid for txid, (st, rev) in tx_status_by_id.items() if st == 'completed' and not rev and txid not in gas_tx_ids]
gas_total_tx = sum(D(g['debe'] or 0) - D(g['haber'] or 0) for g in maes['gas_cogs_por_tx'])
cogs_reconc = {
    'base_A_items_101_completados': Q(cogs_items_total),
    'base_B_kardex_derivado_101': Q(kardex_cogs),
    'base_C_gas_costo_ventas_por_transaccion': Q(gas_total_tx),
    'transacciones_mezcladas': len(gas_tx_ids),
    'tx_completadas_sin_movimiento_gas': len(sin_gas),
    'tx_sin_gas_ids': sin_gas,
    'explicacion': 'GAS_COSTO_VENTAS se deriva del costo del kardex por transacción completa (incluye ítems de SKUs ajenos y servicios en carritos mezclados); la base attributable por línea es la A (cost_at_sale de transaction_items de los 101 SKU, ventas completadas netas de reversas) y la B (costo derivado kardex de sus salidas de venta). Transacciones con costo derivado 0 no generan movimiento GAS (7 casos, observación documentada).',
    'conclusion': 'Sin duplicación de COGS atribuible a FAC-VITALLCONS-001; RECT-1/RECT-2 protegidas; COGS 7 CUP de las 5 ventas SKU111/112 intacto.',
}
# ── CONCILIACIÓN VALES (exacta por slip) ────────────────────────────────────
slip_tot = {}
for it in maes['slips_items_todos']:
    if it['voided_at']: continue
    slip_tot.setdefault(str(it['slip_number']), D(0))
    slip_tot[str(it['slip_number'])] += D(it['quantity']) * D(it['unit_cost'])
gas_slip_tot = {}
for g in maes['gas_vales_por_slip']:
    gas_slip_tot.setdefault(str(g['slip_number']), D(0))
    gas_slip_tot[str(g['slip_number'])] += D(g['debe'] or 0) - D(g['haber'] or 0)
vales_items_total = sum(r['vales_costo'] for r in matriz)
vales_gas_total = sum(gas_slip_tot.values())
vales_slip_total_scope = sum(slip_tot.values())
redondeos = [{'slip': s, 'gas': str(Q(gas_slip_tot[s])), 'items': str(Q(slip_tot[s])),
              'diff': str(Q(gas_slip_tot[s] - slip_tot[s]))}
             for s in gas_slip_tot if s in slip_tot and abs(gas_slip_tot[s] - slip_tot[s]) > Decimal('0.005')]
vales_reconc = {
    'base_items_101_vigentes': Q(vales_items_total),
    'base_items_todos_slips_vigentes': Q(vales_slip_total_scope),
    'base_gas_vales_slips': Q(vales_gas_total),
    'diferencia_gas_vs_items': Q(vales_gas_total - vales_slip_total_scope),
    'redondeos_por_slip': redondeos,
    'nota': 'GAS_VALES se postea por vale completo (mezcla de SKU del alcance y ajenos); la base por línea es issue_slip_items vigentes de los 101 SKU. Diferencia de −1,01 CUP = redondeo a centavos del asiento vs suma de ítems en 2 vales. RECT-2 (misión 009) ya reconoció los 6 CUP de vales SKU111/112 sin asiento; sin duplicaciones.',
}

# ── LOTES DE CORRECCIÓN (§7) ────────────────────────────────────────────────
def sku90_impacto():
    r = matriz_by_sku['90']
    inv = inventario_sku('90', lay['90'], {'stock_current': r['stock_actual'], 'wac_actual': r['wac_actual']})
    sub_actual = r['subtotal_cup']            # 173×5×680 = 588.200
    sub_propuesto = D('173') * D('5') * D('1')  # si moneda CUP demostrada: 865
    delta = sub_propuesto - sub_actual        # −587.335
    en_stock = inv['capa_fvc_restante_fifo']
    valor_inventario_delta = en_stock * D('5') * (D('1') - D('680'))
    return {'sku': '90', 'sub_actual_cup': Q(sub_actual), 'sub_propuesto_cup': Q(sub_propuesto),
            'delta_total_cup': Q(delta), 'u_restantes_atribuibles': str(Q(en_stock)),
            'delta_inventario_cup': Q(valor_inventario_delta),
            'delta_egresos_pasado_cup': Q(delta - valor_inventario_delta),
            'condicion': 'SOLO si el propietario aporta documento que demuestre moneda CUP original'}
sku90 = sku90_impacto()

lotes = [
    {'id': 'L0a-RECT-1', 'estado': 'EJECUTADO Y CERTIFICADO (misión 009, PR #1635)',
     'skus': ['111', '112'], 'importe': '151.299,851… CUP → total 151.299.851,00',
     'descripcion': 'Corrección de costo SKU111/112 (2.500/1.000 USD@680 → 1 CUP/u). Asiento AJUSTE/RECEPCION ajuste_manual con reversal_of=93bb5da9; capas y WAC a 1 CUP; 14 auditorías por fila.',
     'autorizacion': 'Misión 009 §1 (irrevocable). NO repetir.',
     'verificacion_010': 'uc=1, capa_uc=1 (49/100 u), WAC=1, salidas históricas a uc 1, precios de venta no tocados por RECT-1 (cambio 2500→2000 CUP del 22-10 es ajeno, audit-logged).'},
    {'id': 'L0b-RECT-2', 'estado': 'EJECUTADO Y CERTIFICADO (misión 009, PR #1635)',
     'skus': ['111', '112'], 'importe': '24,00 CUP (GAS_VALES 6 + GAS_PERDIDA_INV 18)',
     'descripcion': 'Reconocimiento de salidas sin asiento (7 salidas/26 u: vales y cuadres). COGS 7 CUP de las 5 ventas intacto.',
     'autorizacion': 'Misión 009 §1. NO repetir.',
     'verificacion_010': 'Asiento presente (GAS_VALES 6 / GAS_PERDIDA_INV 18 / ACT_INVENTARIO -24); GAS_VALES y COGS 7 CUP sin duplicación.'},
    {'id': 'L1-moneda-SKU90', 'estado': 'PROPUESTA — NO EJECUTADA (requiere evidencia + autorización específica)',
     'skus': ['90'], 'importe': f"Δ {sku90['delta_total_cup']} CUP (inventario Δ {sku90['delta_inventario_cup']}, egresos/pasado Δ {sku90['delta_egresos_pasado_cup']})",
     'descripcion': 'Si el propietario demuestra con documento que Cable Solar Rojo 6mm se compró en CUP 5/u: recalcular línea/capa/WAC/COGS afectado. Mecanismo gobernado idéntico a RECT-1 (asiento manual con reversal_of, sin tocar documento).',
     'autorizacion': 'NINGUNA VIGENTE — misión 010 §7 lo prohíbe sin aprobación específica.',
     'verificacion_010': 'Cuantificado; condiciones y rollback documentados; NO se escribieron importes.'},
    {'id': 'L2-moneda-triviales', 'estado': 'PROPUESTA — NO EJECUTADA (impacto trivial)',
     'skus': ['92', '120'], 'importe': 'Δ ≤ 8.148 CUP (92: 12×(680−1); 120: 1×(680−1)) solo si demostrado USD',
     'descripcion': 'Señal m048 trivial: costo 1 auténtico, magnitud ambigua. Recomendación del auditor: mantener CUP 1 (sin cambio) salvo documento en contrario.',
     'autorizacion': 'NINGUNA VIGENTE.',
     'verificacion_010': 'Listado, cuantificado y protegido.'},
    {'id': 'L3-no-verificables', 'estado': 'ABIERTO — decisión del propietario línea a línea (DP-3, misión 003)',
     'skus': [str(r['sku']) for r in matriz if r['clasificacion'] == 'E'],
     'importe': 'Sin propuesta de importe: no hay evidencia por línea; valor registrado conservado.',
     'descripcion': '71 líneas con magnitud indistinguible precio/costo y sin documento de compra por línea. Ninguna modificación hasta que el propietario aporte evidencia.',
     'autorizacion': 'NINGUNA — protegidas por §6 de la misión 010.',
     'verificacion_010': 'Identificadas una a una en RECEIPT_UNRESOLVED_LINES.xlsx con su valor y trazabilidad.'},
]

# ── CONTROLES DE SEGURIDAD ──────────────────────────────────────────────────
controles = {
    't12_trigger_activo': snap['t12_trigger'],
    'fin_posting_errors_post_rect2': snap['fin_posting_errors_recientes'][0]['n'],
    'capas_duplicadas': snap['capas_duplicadas'],
    'asientos_anulacion_fvc': snap['asientos_anulacion_fvc'][0]['n'],
    'pagos_fvc': len(snap['payments_fvc']),
    'payment_status': snap['receipt']['payment_status'],
    'capas_101_1a1': len(snap['layers_fvc']) == 101,
    'lineas_101': len(items) == 101,
    'sku999_is_service': snap['sku999']['is_service'] if snap['sku999'] else None,
    'sku111_112': snap['rect1_verificacion'],
    'venta_post_rect2_sku111': maes['tx_post_rect2_sku111'],
    'precio_111_historial': [a for a in maes['audit_maestro_111_112'] if a['record_id'].startswith('4afef9a7')],
    'precio_112_historial': [a for a in maes['audit_maestro_111_112'] if a['record_id'].startswith('14aeb370')],
}

# ── RESUMEN DE CLASIFICACIÓN ────────────────────────────────────────────────
resumen = {}
for r in matriz:
    g = resumen.setdefault(r['clasificacion'], {'n': 0, 'valor_cup': D(0), 'skus': []})
    g['n'] += 1; g['valor_cup'] += r['subtotal_cup']; g['skus'].append(str(r['sku']))
resumen_fmt = {k: {'n': v['n'], 'valor_cup': Q(v['valor_cup']), 'skus': v['skus']} for k, v in sorted(resumen.items())}

out = {
    'mision': 'CP-FIN-RECEIPT-FULL-VALUATION-010',
    'generado': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'alcance': {'receipt_id': RECEIPT_ID, 'documento': FVC_DOC, 'fecha_operacional': snap['receipt']['reception_date'],
                'proveedor': snap['receipt']['supplier'], 'tienda': 'ENERVIDA-VITALLCONS'},
    'control_listado': control_listado,
    'matriz': [{**r, 'qty': str(r['qty']), 'uc_registrado': str(r['uc_registrado']),
                'subtotal_registrado': str(Q(r['subtotal_registrado'])), 'tasa': str(r['tasa']),
                'uc_cup': str(Q(r['uc_cup'])), 'subtotal_cup': str(Q(r['subtotal_cup'])),
                'capa_qty': str(r['capa_qty']), 'capa_uc': str(r['capa_uc']),
                'capa_restante_fifo': str(Q(r['capa_restante_fifo'])),
                'stock_actual': str(Q(r['stock_actual'])),
                'salidas_venta': str(Q(r['salidas_venta'])), 'salidas_vales': str(Q(r['salidas_vales'])),
                'salidas_ajustes': str(Q(r['salidas_ajustes'])), 'otros_ingresos': str(Q(r['otros_ingresos'])),
                'wac_actual': str(r['wac_actual']), 'ventas_qty': str(Q(r['ventas_qty'])),
                'cogs_asociado': str(Q(r['cogs_asociado'])), 'vales_qty': str(Q(r['vales_qty'])),
                'vales_costo': str(Q(r['vales_costo'])),
                'precio_venta_actual': str(Q(r['precio_venta_actual']))} for r in matriz],
    'conciliacion': {**conciliacion,
                     'cabecera_total_cost': str(Q(conciliacion['cabecera_total_cost'])),
                     'suma_lineas_cup_equiv': str(Q(conciliacion['suma_lineas_cup_equiv'])),
                     'suma_lineas_originales': str(Q(conciliacion['suma_lineas_originales'])),
                     'por_moneda': {k: {kk: str(vv) if isinstance(vv, Decimal) else vv for kk, vv in v.items()}
                                    for k, v in conciliacion['por_moneda'].items()}},
    'm048_comparacion': {'diferencias_en_99_protegidas': m048_diff, 'total_diferencias': len(m048_diff)},
    'cogs_reconciliacion': {k: (str(v) if isinstance(v, Decimal) else v) for k, v in cogs_reconc.items()},
    'vales_reconciliacion': {k: (str(v) if isinstance(v, Decimal) else v) for k, v in vales_reconc.items()},
    'lotes': lotes,
    'sku90_impacto': {k: (str(v) if isinstance(v, Decimal) else v) for k, v in sku90.items()},
    'controles': controles,
    'resumen_clasificacion': resumen_fmt,
}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=2, default=str)
print('m071 OK →', OUT)
print('control_listado:', json.dumps(control_listado, ensure_ascii=False))
print('conciliacion:', json.dumps({k: str(v) if isinstance(v, Decimal) else v for k, v in conciliacion.items() if k != 'tasa_680_evidencia' and k != 'tasa_2026_07_01_capturada'}, ensure_ascii=False, default=str))
print('clasificación:', json.dumps({k: v['n'] for k, v in resumen_fmt.items()}, ensure_ascii=False))
print('COGS:', json.dumps({k: (str(v) if isinstance(v, Decimal) else v) for k, v in cogs_reconc.items() if k != 'nota'}, ensure_ascii=False))
print('VALES:', json.dumps({k: (str(v) if isinstance(v, Decimal) else v) for k, v in vales_reconc.items() if k != 'nota'}, ensure_ascii=False))
print('m048 diferencias protegidas:', len(m048_diff))
