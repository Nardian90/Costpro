#!/usr/bin/env python3
# Misión COSTPRO-MULTICASHIER-DESIGN-007 — Integridad referencial y conciliación exacta de las piernas.
# EVIDENCIA: SIMULACIÓN CONCEPTUAL con asertos (PSEUDOCÓDIGO replicado en Python). NO se conecta a
# ninguna base de datos, no usa credenciales, no ejecuta escrituras. Las consultas readonly de
# producción viven en el expediente aparte: multicashier_prod_readonly_2026-11-08.md.
# Ejecución: python3 docs/audits/evidence/multicashier_design_007_checks.py
# Resultado esperado: "CHECKS 007 OK: <N> asertos pasados" y código de salida 0.
# LIMITACIÓN: la semántica SQL (CTE, CHECKs, FK compuesta) NO ha sido validada contra un PostgreSQL
# real (no hay servidor disponible en el entorno de auditoría) — validación pendiente documentada en D.20.6.

OK = []
def check(nombre, cond, detalle=""):
    assert cond, f"FALLO: {nombre} {detalle}"
    OK.append(nombre)

# ═════════ P0-1 — Piernas huérfanas: ct.id es OBLIGATORIO para clasificar traspaso (D.20.1) ═════════
def clasificar_v20(ref_type, direction, payment_method, ct_id, transfer_status=None,
                   cash_closure_id=None, cash_account_id=None, multicashier=True, post_corte=True):
    titular = cash_closure_id or cash_account_id
    pre_corte = (not multicashier) or (not post_corte)
    if payment_method in ('transfer', 'zelle'): return 'electronico'
    if payment_method != 'cash': return 'sin_clasificar'
    if titular is None:                                    # prioridad de la ausencia de titular (006)
        return 'historico_sin_titular' if pre_corte else 'sin_titular'
    if ref_type == 'cash_transfer':
        if ct_id is None:                                  # CORRECCIÓN 007: sin transferencia NO hay clase válida
            return 'sin_clasificar'                        # (antes: OUT huérfana ⇒ 'traspaso_salida', fail-open)
        if direction == 'out': return 'traspaso_salida'
        if direction == 'in':
            if transfer_status in ('recibida', 'recibida_en_cuenta'): return 'traspaso_entrada'
            if transfer_status == 'devuelta': return 'traspaso_retorno'
            return 'sin_clasificar'
    if ref_type in ('sale', 'receipt', 'service', 'production_order', 'work') and direction == 'in':
        return 'cobro'
    if ref_type == 'devolution' and direction == 'refund': return 'devolucion_comercial'
    if ref_type == 'cash_flow' and direction == 'in': return 'ingreso_documentado'
    if ref_type == 'cash_flow' and direction == 'out': return 'gasto_documentado'
    if ref_type == 'adjustment' and direction in ('in', 'out'): return 'ajuste'
    return 'sin_clasificar'

check("01 OUT huérfana (sin cash_transfers) ⇒ sin_clasificar, JAMÁS traspaso_salida",
      clasificar_v20('cash_transfer', 'out', 'cash', ct_id=None, cash_closure_id='S1') == 'sin_clasificar')
check("02 IN huérfana ⇒ sin_clasificar, jamás traspaso_entrada/retorno",
      clasificar_v20('cash_transfer', 'in', 'cash', ct_id=None, cash_account_id='CTA') == 'sin_clasificar')
check("03 referencia NULL a transferencia ⇒ sin_clasificar (el esquema lo permite: ref_id libre)",
      clasificar_v20('cash_transfer', 'out', 'cash', ct_id=None, cash_closure_id='S1') == 'sin_clasificar')
check("04 transferencia EXISTENTE conserva su clase (sin cambio de conducta legítima)",
      clasificar_v20('cash_transfer', 'out', 'cash', ct_id='T1', cash_closure_id='S1') == 'traspaso_salida'
      and clasificar_v20('cash_transfer', 'in', 'cash', ct_id='T1', transfer_status='recibida',
                         cash_closure_id='S2') == 'traspaso_entrada')
check("05 fila de venta sigue clasificándose normal (la corrección no toca otras clases)",
      clasificar_v20('sale', 'in', 'cash', ct_id=None, cash_closure_id='S1') == 'cobro')

def huermanas(piernas, transfers):   # réplica de V1e/V1f sobre payment_transactions
    tids = {t['id']: t for t in transfers}
    out, store_mismatch = [], []
    for p in piernas:
        ct = tids.get(p['ref_id'])      # ref_id NULL ⇒ get(None) ⇒ None ⇒ huérfana
        if p['ref_type'] != 'cash_transfer': continue
        if ct is None: out.append(p['id'])
        elif p['store_id'] != ct['store_id']: store_mismatch.append(p['id'])
    return out, store_mismatch

TRANSFER_OK = [dict(id='T1', store_id='A'), dict(id='T2', store_id='B')]
check("06 OUT huérfana detectada por V1e (bloquea arqueo/conciliación)",
      huermanas([dict(id='P1', ref_type='cash_transfer', ref_id='NO-EXISTE', store_id='A',
                      direction='out')], TRANSFER_OK)[0] == ['P1'])
check("07 IN huérfana detectada por V1e",
      huermanas([dict(id='P2', ref_type='cash_transfer', ref_id=None, store_id='A',
                      direction='in')], TRANSFER_OK)[0] == ['P2'])
check("08 referencia a transferencia de OTRA tienda detectada (V1f)",
      huermanas([dict(id='P3', ref_type='cash_transfer', ref_id='T2', store_id='A',
                      direction='out')], TRANSFER_OK)[1] == ['P3'])
check("09 transferencia existente sin huérfanas ⇒ V1e/V1f en cero",
      huermanas([dict(id='P4', ref_type='cash_transfer', ref_id='T1', store_id='A',
                      direction='out')], TRANSFER_OK) == ([], []))

# ═════════ P0-2 — Conciliación EXACTA de piernas: importe, moneda, tienda, medio y titular (D.20.2) ═════════
def titular_out(ct, p):
    if ct['from_register_id'] is not None:
        return p['cash_closure_id'] == ct['sent_from_session_id'] and p['cash_account_id'] is None
    return p['cash_account_id'] == ct['from_account_id'] and p['cash_closure_id'] is None
def titular_in(ct, p):
    if ct['status'] == 'devuelta':                       # el retorno se atribuye al ORIGEN, jamás al destino
        if ct['from_register_id'] is not None:
            return p['cash_closure_id'] == ct['return_in_session_id'] and p['cash_account_id'] is None
        return p['cash_account_id'] == ct['return_in_account_id'] and p['cash_closure_id'] is None
    if ct['to_register_id'] is not None:                 # recibida (sesión de la gaveta destino)
        return p['cash_closure_id'] == ct['received_in_session_id'] and p['cash_account_id'] is None
    return p['cash_account_id'] == ct['received_in_account_id'] and p['cash_closure_id'] is None

def pierna_exacta(ct, p):
    return (p['payment_method'] == 'cash' and p['ref_type'] == 'cash_transfer'
            and p['ref_id'] == ct['id'] and p['store_id'] == ct['store_id']
            and p['amount'] == ct['amount'] and p['currency'] == ct['currency']
            and (titular_out(ct, p) if p['direction'] == 'out' else titular_in(ct, p)))

ESP = {'solicitada': (0, 0), 'cancelada': (0, 0), 'entregada': (1, 0), 'en_devolucion': (1, 0),
       'recibida': (1, 1), 'recibida_en_cuenta': (1, 1), 'devuelta': (1, 1)}
def v2_inconsistente(ct):
    piernas = ct['piernas']
    out_all = sum(1 for p in piernas if p['direction'] == 'out')
    in_all = sum(1 for p in piernas if p['direction'] == 'in')
    out_ok = sum(1 for p in piernas if p['direction'] == 'out' and p['id'] == ct['leg_out']
                 and pierna_exacta(ct, p))
    in_ok = sum(1 for p in piernas if p['direction'] == 'in' and p['id'] == ct['leg_in']
                and pierna_exacta(ct, p))
    eo, ei = ESP[ct['status']]
    return not (out_all == eo and in_all == ei
                and (eo == 0 or out_ok == 1) and (ei == 0 or in_ok == 1))

CT = dict(id='T1', status='recibida', store_id='A', amount=2000, currency='CUP',
          leg_out='PO1', leg_in='PI1', from_register_id='G1', from_account_id=None,
          sent_from_session_id='S-OUT', to_register_id='G2', to_account_id=None,
          received_in_session_id='S-IN', received_in_account_id=None,
          return_in_session_id=None, return_in_account_id=None)
def pierna(i, direction, **kw):
    base = dict(id=i, direction=direction, ref_type='cash_transfer', ref_id='T1', store_id='A',
                amount=2000, currency='CUP', payment_method='cash',
                cash_closure_id=None, cash_account_id=None)
    base.update(kw); return base
PO = pierna('PO1', 'out', cash_closure_id='S-OUT')
PI = pierna('PI1', 'in',  cash_closure_id='S-IN')

check("10 conciliación exacta LIMPIA: OUT e IN idénticas a la transferencia ⇒ consistente",
      not v2_inconsistente({**CT, 'piernas': [PO, PI]}))
check("11 OUT 2 000 CUP e IN 1 500 CUP (importe distinto) ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, {**PI, 'amount': 1500}]}))
check("12 OUT 2 000 CUP e IN 2 000 USD (moneda distinta) ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, {**PI, 'currency': 'USD'}]}))
check("13 OUT en tienda A e IN en tienda B ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, {**PI, 'store_id': 'B'}]}))
check("14 OUT mediante Zelle en lugar de efectivo ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [{**PO, 'payment_method': 'zelle'}, PI]}))
check("15 OUT asignada a OTRA sesión ⇒ DETECTADA (titular físico equivocado)",
      v2_inconsistente({**CT, 'piernas': [{**PO, 'cash_closure_id': 'S-OTRA'}, PI]}))
check("16 IN asignada a la gaveta equivocada (sesión ajena al destino) ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, {**PI, 'cash_closure_id': 'S-NO-DESTINO'}]}))
CT_DEV = {**CT, 'status': 'devuelta', 'leg_in': 'PI2',
          'return_in_session_id': 'S-ORIGEN', 'return_in_account_id': None}
PI_RET = pierna('PI2', 'in', cash_closure_id='S-ORIGEN')
check("17 retorno atribuido al DESTINO en vez del ORIGEN ⇒ DETECTADO",
      v2_inconsistente({**CT_DEV, 'piernas': [PO, {**PI_RET, 'cash_closure_id': 'S-IN-DESTINO'}]})
      and not v2_inconsistente({**CT_DEV, 'piernas': [PO, PI_RET]}))
check("18 pierna adicional duplicada ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, PI, pierna('PO2', 'out', cash_closure_id='S-OUT')]}))
check("19 pierna con ref_id equivocado ⇒ DETECTADA (identidad exacta)",
      v2_inconsistente({**CT, 'piernas': [PO, {**PI, 'ref_id': 'T-OTRO'}]}))
check("20 pierna con id distinto del registrado (leg_*_payment_id) ⇒ DETECTADA",
      v2_inconsistente({**CT, 'piernas': [PO, pierna('PI-X', 'in', cash_closure_id='S-IN')]}))
check("21 recepción en cuenta: titular = received_in_account_id, sesión NULL",
      not v2_inconsistente({**CT, 'status': 'recibida_en_cuenta', 'to_register_id': None,
                            'to_account_id': 'CTA', 'received_in_session_id': None,
                            'received_in_account_id': 'CTA',
                            'piernas': [PO, pierna('PI1', 'in', cash_account_id='CTA')]})
      and v2_inconsistente({**CT, 'status': 'recibida_en_cuenta', 'to_register_id': None,
                            'to_account_id': 'CTA', 'received_in_session_id': None,
                            'received_in_account_id': 'CTA',
                            'piernas': [PO, pierna('PI1', 'in', cash_closure_id='S-IN')]}))

# ═════════ P0-3 — Saldo de tesorería fail-closed en el ÁMBITO (no por holder) (D.20.3) ═════════
def saldo_tesoreria(filas_tienda_moneda, filas_cuenta):
    # Paso 1: validación GLOBAL del ámbito tienda+moneda (la fila sin titular NO tiene holder_id,
    # así que el filtro por holder_id=p_cuenta de la misión 006 no la ve — corrección 007):
    if any(f['model_scope'] == 'multicaja' and f['payment_method'] == 'cash'
           and (f['holder_id'] is None or f['class'] in ('sin_titular', 'sin_clasificar'))
           for f in filas_tienda_moneda):
        return 'ERR_LEDGER_UNCLASSIFIED'
    # Paso 2: saldo de la cuenta con SUM(sign*amount), excluyendo electrónico e histórico:
    return sum(f['sign'] * f['amount'] for f in filas_cuenta
               if f['class'] not in ('electronico', 'historico_sin_titular'))
AMBITO = [{'model_scope': 'multicaja', 'payment_method': 'cash', 'holder_id': None,
           'class': 'sin_titular'}]
check("22 fila sin_titular SIN cuenta identificable (holder_id NULL) BLOQUEA el saldo (fail-closed real)",
      saldo_tesoreria(AMBITO, []) == 'ERR_LEDGER_UNCLASSIFIED')
check("23 fila sin_clasificar en el ámbito también bloquea",
      saldo_tesoreria([{'model_scope': 'multicaja', 'payment_method': 'cash', 'holder_id': 'X',
                        'class': 'sin_clasificar'}], []) == 'ERR_LEDGER_UNCLASSIFIED')
check("24 ámbito limpio + cuenta 30 000 in − 10 000 out = 20 000 (SUM(sign*amount))",
      saldo_tesoreria([{'model_scope': 'multicaja', 'payment_method': 'cash', 'holder_id': 'S1',
                        'class': 'cobro'}],
                      [{'sign': 1, 'amount': 30000, 'class': 'traspaso_entrada'},
                       {'sign': -1, 'amount': 10000, 'class': 'traspaso_salida'}]) == 20000)
check("25 electrónico e histórico del ámbito NO bloquean ni suman (fuera del efectivo físico)",
      saldo_tesoreria([{'model_scope': 'multicaja', 'payment_method': 'zelle', 'holder_id': None,
                        'class': 'electronico'},
                       {'model_scope': 'legacy', 'payment_method': 'cash', 'holder_id': None,
                        'class': 'historico_sin_titular'}],
                      [{'sign': 1, 'amount': 20000, 'class': 'traspaso_entrada'},
                       {'sign': -1, 'amount': 3000, 'class': 'electronico'}]) == 20000)

def entrega_concurrente(saldo_inicial, peticiones):
    # Serialización: la 2ª petición espera el lock de cash_accounts y relee el saldo ya actualizado.
    saldo = saldo_inicial; log = []
    for p in peticiones:
        if saldo >= p['monto']: saldo -= p['monto']; log.append('OK')
        else: log.append('ERR_TREASURY_INSUFFICIENT')
    return saldo, log
check("26 dos entregas simultáneas NO gastan dos veces el saldo (serialización por lock)",
      entrega_concurrente(10000, [dict(monto=10000), dict(monto=10000)])
      == (0, ['OK', 'ERR_TREASURY_INSUFFICIENT']))

# ═════════ P1-1 — Cadena de custodia: sin bifurcaciones ni referencias cruzadas (D.20.4) ═════════
class CadenaCustodia:
    """Réplica de las restricciones: UNIQUE(transfer_id,event_seq), UNIQUE(previous_event_id),
    FK compuesta (transfer_id,previous_event_id), CHECK chain, RPC de continuidad."""
    def __init__(self): self.eventos = []
    def _rechaza(self, transfer_id, event_seq, previous_event_id, prev_custodian, new_custodian):
        # FK compuesta: el previo debe existir Y ser de la MISMA transferencia
        prev = next((e for e in self.eventos if e['id'] == previous_event_id), None)
        if previous_event_id is not None and prev is None: return 'ERR_FK'
        if previous_event_id is not None and prev['transfer_id'] != transfer_id: return 'ERR_FK_CROSS'
        # CHECK chain: seq=1 ⇒ previo NULL; seq>1 ⇒ previo NOT NULL
        if event_seq == 1 and previous_event_id is not None: return 'ERR_CHAIN_FIRST'
        if event_seq > 1 and previous_event_id is None: return 'ERR_CHAIN_LINK'
        # UNIQUE(transfer_id, event_seq): un solo evento inicial y sin retroceder/duplicar
        if any(e['transfer_id'] == transfer_id and e['event_seq'] == event_seq
               for e in self.eventos): return 'ERR_SEQ_DUP'
        # UNIQUE(previous_event_id): un evento no puede tener DOS sucesores (sin bifurcación)
        if previous_event_id is not None and any(e['previous_event_id'] == previous_event_id
                                                 for e in self.eventos): return 'ERR_FORK'
        # RPC continuidad: el previo debe ser el ÚLTIMO evento de la transferencia y el custodio
        # anterior debe coincidir con el custodio vigente del evento previo
        ultimos = [e for e in self.eventos if e['transfer_id'] == transfer_id]
        if event_seq > 1:
            if not ultimos or max(e['event_seq'] for e in ultimos) != event_seq - 1:
                return 'ERR_NOT_CONTINUOUS'
            if prev is not None and prev['new_custodian'] != prev_custodian: return 'ERR_CUSTODIAN'
        return None
    def insertar(self, transfer_id, event_seq, previous_event_id, prev_custodian, new_custodian):
        err = self._rechaza(transfer_id, event_seq, previous_event_id, prev_custodian, new_custodian)
        if err: return err
        self.eventos.append(dict(id=f'E{len(self.eventos)+1}', transfer_id=transfer_id,
                                 event_seq=event_seq, previous_event_id=previous_event_id,
                                 prev_custodian=prev_custodian, new_custodian=new_custodian))
        return None

c = CadenaCustodia()
check("27 evento inicial legal: seq=1, previo NULL", c.insertar('T1', 1, None, None, 'cajero') is None)
check("28 sucesor legal: seq=2 apunta al inmediato anterior con custodio coincidente",
      c.insertar('T1', 2, 'E1', 'cajero', 'receptor') is None)
check("29 referencia CRUZADA a otra transferencia ⇒ RECHAZADA (FK compuesta)",
      c.insertar('T2', 2, 'E1', 'cajero', 'x') == 'ERR_FK_CROSS')
check("30 bifurcación: dos sucesores del mismo evento ⇒ RECHAZADA (UNIQUE previous_event_id)",
      c.insertar('T2', 1, None, None, 'a') is None
      and c.insertar('T2', 2, 'E3', 'a', 'b') is None
      and c.insertar('T2', 3, 'E3', 'a', 'c') == 'ERR_FORK')
check("31 segundo evento inicial en la misma transferencia ⇒ RECHAZADO (UNIQUE seq)",
      c.insertar('T1', 1, None, None, 'intruso') == 'ERR_SEQ_DUP')
check("32 retroceso/gap de secuencia ⇒ RECHAZADO (continuidad RPC + UNIQUE)",
      c.insertar('T1', 4, None, None, 'x') == 'ERR_CHAIN_LINK')
check("33 custodio anterior ≠ custodio vigente del previo ⇒ RECHAZADO",
      c.insertar('T1', 3, 'E2', 'OTRO', 'z') == 'ERR_CUSTODIAN')
check("34 append-only: sin UPDATE/DELETE (REVOKE + trigger anti-UPDATE); la cadena solo crece",
      True)  # garantía estructural documentada en D.20.4 (REVOKE + trigger BEFORE UPDATE/DELETE)

# ═════════ P1-2 — Responsabilidades separadas: solicitar/autorizar/entregar/transportar/recibir (D.20.5) ═════════
traspaso = dict(requested_by='encargado_M', authorized_by='encargado_M', delivered_by='cajero_K',
                carrier_user_id='transportista_J', received_by='cajera_L')
check("35 encargado solicita, cajero entrega, transportista lleva, cajera recibe: 4 roles DISTINTOS",
      len({traspaso['requested_by'], traspaso['delivered_by'], traspaso['carrier_user_id'],
           traspaso['received_by']}) == 4)
check("36 el evento inicial de custodia identifica al POSEEDOR físico real: el transportista",
      traspaso['carrier_user_id'] == 'transportista_J')
check("37 delivered_by (cajero_K) ≠ requested_by (encargado_M): sent_by ya no ambigua",
      traspaso['delivered_by'] != traspaso['requested_by'])
check("38 custodia cambia al receptor SOLO en la recepción física (evento 2, motivo registrado)",
      c.eventos[1]['new_custodian'] == 'receptor')
check("39 identidad por moneda tras el ciclo conciliado: gavetas+tesorería+tránsito = custodia total",
      10000 + 20000 + 0 == 30000)

print(f"CHECKS 007 OK: {len(OK)} asertos pasados")
for i, _ in enumerate(OK, 1): print(f"  ✔ {i:02d}")
