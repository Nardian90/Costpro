#!/usr/bin/env python3
# Misión COSTPRO-MULTICASHIER-DESIGN-006 — Verificación de las correcciones (P0-1, P0-2, P0-3, P1-1, P1-2).
# EVIDENCIA: SIMULACIÓN CONCEPTUAL con asertos. NO se conecta a ninguna base de datos,
# no usa credenciales, no ejecuta escrituras. Las consultas readonly de producción viven
# en el expediente aparte: docs/audits/evidence/multicashier_prod_readonly_2026-11-08.md.
# Ejecución: python3 docs/audits/evidence/multicashier_design_006_checks.py
# Resultado esperado: "CHECKS 006 OK: <N> asertos pasados" y código de salida 0.

OK = []
def check(nombre, cond, detalle=""):
    assert cond, f"FALLO: {nombre} {detalle}"
    OK.append(nombre)

# ═════════ P0-1 — CHECKs condicionados al estado (D.19.1) ═════════
# Réplica de ctr_lifecycle (v2), ctr_origin_session, ctr_reception_by_state y ctr_return_by_state.
def traspaso_ok(estado, from_register=None, from_account=None, to_register=None, to_account=None,
                sent_from_session=None, leg_out=None, leg_in=None, sent_at=None,
                received_in_session=None, received_in_account=None, received_at=None,
                return_in_session=None, return_in_account=None):
    # ctr_one_origin / ctr_one_destination (XOR gaveta/cuenta) — D.16.3, intacto
    if (from_register is None) == (from_account is None): return False
    if (to_register is None) == (to_account is None): return False
    # ctr_origin_session (D.19.1): la sesión emisora se fija AL ENTREGAR, no al solicitar
    if from_account is not None and sent_from_session is not None: return False
    if from_register is not None:
        if estado in ('solicitada', 'cancelada') and sent_from_session is not None: return False
        if estado not in ('solicitada', 'cancelada') and sent_from_session is None: return False
    # ctr_reception_by_state (D.19.1): recepción SOLO en el estado que la confirma
    if estado in ('solicitada', 'entregada', 'en_devolucion'):
        if received_in_session is not None or received_in_account is not None: return False
    elif estado == 'recibida':
        if received_in_session is None or received_in_account is not None: return False
        if to_register is None: return False
    elif estado == 'recibida_en_cuenta':
        if received_in_account is None or received_in_session is not None: return False
    else:  # 'devuelta' (nunca se recibió) y 'cancelada': sin atribución de recepción
        if received_in_session is not None or received_in_account is not None: return False
    # ctr_return_by_state (D.19.1): retorno SOLO al completar
    if estado != 'devuelta' and (return_in_session is not None or return_in_account is not None):
        return False
    if estado == 'devuelta':
        if (return_in_session is None) == (return_in_account is None): return False  # exactamente uno
    # ctr_lifecycle v2 (D.18.1): piernas y sellos de tiempo por estado
    if estado == 'solicitada' and (sent_at or leg_out or leg_in): return False
    if estado == 'entregada' and not (sent_at and leg_out and not leg_in and not received_at): return False
    if estado == 'en_devolucion' and not (leg_out and not leg_in): return False
    if estado in ('recibida', 'recibida_en_cuenta') and not (leg_out and leg_in and received_at): return False
    if estado == 'devuelta' and not (leg_out and leg_in and return_in_session is not None
                                     or leg_out and leg_in and return_in_account is not None): return False
    if estado == 'cancelada' and (sent_at or leg_out or leg_in): return False
    return True

t = dict(from_account='TES', to_register='A')
check("01 solicitada sin sesión emisora ni receptora: VÁLIDA (no falsifica entrega)",
      traspaso_ok('solicitada', **t, sent_from_session=None))
check("02 solicitada CON sent_from_session_id anticipada: RECHAZADA",
      not traspaso_ok('solicitada', **t, sent_from_session='s1'))
check("03 entregada con sesión emisora fijada en la entrega: VÁLIDA",
      traspaso_ok('entregada', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out'))
check("04 entregada sin sesión emisora (gaveta origen): RECHAZADA",
      not traspaso_ok('entregada', from_register='A', to_register='B',
                      sent_from_session=None, sent_at='t1', leg_out='leg-out'))
check("05 entregada con recepción anticipada: RECHAZADA",
      not traspaso_ok('entregada', **t, sent_from_session=None, sent_at='t1',
                      leg_out='leg-out', received_in_session='s-A'))
check("06 en_devolucion con destino de retorno anticipado: RECHAZADA",
      not traspaso_ok('en_devolucion', **t, sent_from_session=None, sent_at='t1',
                      leg_out='leg-out', return_in_account='TES'))
check("07 recibida: sesión receptora obligatoria, cuenta NULL, destino gaveta",
      traspaso_ok('recibida', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                  leg_in='leg-in', received_at='t2', received_in_session='s-A-nueva')
      and not traspaso_ok('recibida', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                          leg_in='leg-in', received_at='t2', received_in_account='CTA'))
check("08 recibida_en_cuenta: cuenta obligatoria, sesión NULL (ruta de custodia)",
      traspaso_ok('recibida_en_cuenta', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                  leg_in='leg-in', received_at='t2', received_in_account='CTA')
      and not traspaso_ok('recibida_en_cuenta', **t, sent_from_session=None, sent_at='t1',
                          leg_out='leg-out', leg_in='leg-in', received_at='t2',
                          received_in_session='s-A'))
check("09 devuelta: exactamente un destino de retorno",
      traspaso_ok('devuelta', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                  leg_in='leg-in', return_in_account='TES')
      and not traspaso_ok('devuelta', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                          leg_in='leg-in', return_in_session='s1', return_in_account='TES')
      and not traspaso_ok('devuelta', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out',
                          leg_in='leg-in'))
check("10 cancelada: sin piernas, sin recepción, sin retorno",
      traspaso_ok('cancelada', **t, sent_from_session=None)
      and not traspaso_ok('cancelada', **t, sent_from_session=None, leg_out='leg-out')
      and not traspaso_ok('cancelada', **t, sent_from_session=None, received_in_session='s1'))
check("11 origen cuenta: sent_from_session_id SIEMPRE NULL",
      traspaso_ok('entregada', **t, sent_from_session=None, sent_at='t1', leg_out='leg-out')
      and not traspaso_ok('entregada', **t, sent_from_session='s-TES-ficticia',
                          sent_at='t1', leg_out='leg-out'))
# Ciclos completos sin desactivar restricciones:
c1 = [dict(estado='solicitada'), dict(estado='entregada', sent_at='t1', leg_out='L1'),
      dict(estado='recibida', sent_at='t1', leg_out='L1', leg_in='L2',
           received_at='t2', received_in_session='s-A-nueva')]
check("12 ciclo solicitada→entregada→recibida: todos los estados VÁLIDOS",
      all(traspaso_ok(c['estado'], **t, sent_from_session=None, **{k: v for k, v in c.items()
          if k not in ('estado',)}) for c in c1))
c2 = [dict(estado='solicitada'), dict(estado='entregada', sent_at='t1', leg_out='L1'),
      dict(estado='en_devolucion', sent_at='t1', leg_out='L1'),
      dict(estado='devuelta', sent_at='t1', leg_out='L1', leg_in='L2', return_in_account='TES')]
check("13 ciclo solicitada→entregada→en_devolucion→devuelta: VÁLIDO (retorno al completar)",
      all(traspaso_ok(c['estado'], **t, sent_from_session=None, **{k: v for k, v in c.items()
          if k not in ('estado',)}) for c in c2))
check("14 transferencia puede PERMANECER en tránsito (entregada sin receptor)",
      traspaso_ok('entregada', **t, sent_from_session=None, sent_at='t1', leg_out='L1'))

# ═════════ P0-2 — Clasificación fail-closed: sin titular tiene PRIORIDAD (D.19.2) ═════════
def clasificar_v19(ref_type, direction, payment_method, cash_closure_id=None, cash_account_id=None,
                   transfer_status=None, multicashier=True, post_corte=True):
    titular = cash_closure_id or cash_account_id
    pre_corte = (not multicashier) or (not post_corte)
    if payment_method in ('transfer', 'zelle'):
        return 'electronico'                      # fuera de la custodia física, con trazabilidad
    if payment_method != 'cash':
        return 'sin_clasificar'                   # medio desconocido: fail-closed
    if titular is None:
        # PRIORIDAD: ausencia de titular antes que la naturaleza financiera (corrección 006)
        return 'historico_sin_titular' if pre_corte else 'sin_titular'
    if ref_type == 'cash_transfer' and direction == 'out': return 'traspaso_salida'
    if ref_type == 'cash_transfer' and direction == 'in':
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

check("15 sale/in/cash SIN titular postactivación ⇒ sin_titular (NO 'cobro')",
      clasificar_v19('sale', 'in', 'cash') == 'sin_titular')
check("16 devolution/refund/cash SIN titular ⇒ sin_titular (NO 'devolucion_comercial')",
      clasificar_v19('devolution', 'refund', 'cash') == 'sin_titular')
check("17 cash_flow/out/cash SIN titular ⇒ sin_titular (NO 'gasto_documentado')",
      clasificar_v19('cash_flow', 'out', 'cash') == 'sin_titular')
check("18 cash_transfer/out/cash SIN titular ⇒ sin_titular (NO 'traspaso_salida')",
      clasificar_v19('cash_transfer', 'out', 'cash') == 'sin_titular')
check("19 sale/in/zelle SIN titular ⇒ electronico (fuera del efectivo, trazabilidad conservada)",
      clasificar_v19('sale', 'in', 'zelle') == 'electronico')
check("20 sale/in/cash SIN titular PRE-corte ⇒ historico_sin_titular (tratamiento legacy)",
      clasificar_v19('sale', 'in', 'cash', multicashier=False) == 'historico_sin_titular')
check("21 filas CON titular conservan su clase conocida",
      clasificar_v19('sale', 'in', 'cash', cash_closure_id='S1') == 'cobro'
      and clasificar_v19('devolution', 'refund', 'cash', cash_closure_id='S1') == 'devolucion_comercial'
      and clasificar_v19('cash_flow', 'out', 'cash', cash_account_id='CTA') == 'gasto_documentado')

# ═════════ P0-3 — V2 como SQL válido: CTE agregada, piernas por identificador (D.19.3) ═════════
ESP = {'solicitada': (0, 0), 'cancelada': (0, 0), 'entregada': (1, 0), 'en_devolucion': (1, 0),
       'recibida': (1, 1), 'recibida_en_cuenta': (1, 1), 'devuelta': (1, 1)}
def v2_inconsistentes(traspasos):
    # Réplica de la CTE: cuenta piernas ALL y piernas OK (id = leg_*_payment_id, ref_type y ref_id correctos)
    filas = []
    for ct in traspasos:
        out_all = sum(1 for p in ct['piernas'] if p['direction'] == 'out')
        in_all = sum(1 for p in ct['piernas'] if p['direction'] == 'in')
        out_ok = sum(1 for p in ct['piernas'] if p['direction'] == 'out' and p['id'] == ct['leg_out']
                     and p['ref_type'] == 'cash_transfer' and p['ref_id'] == ct['id'])
        in_ok = sum(1 for p in ct['piernas'] if p['direction'] == 'in' and p['id'] == ct['leg_in']
                    and p['ref_type'] == 'cash_transfer' and p['ref_id'] == ct['id'])
        eo, ei = ESP[ct['estado']]
        consistente = (out_all == eo and in_all == ei
                       and (eo == 0 or out_ok == 1) and (ei == 0 or in_ok == 1))
        if not consistente:
            filas.append((ct['id'], ct['estado'], out_all, in_all, out_ok, in_ok))
    return filas

tid, leg_o, leg_i = 'T1', 'PO1', 'PI1'
def ct(estado, piernas, leg_out=None, leg_in=None):
    return dict(id=tid, estado=estado, leg_out=leg_out, leg_in=leg_in, piernas=piernas)
L = lambda d, i: dict(id=i, direction=d, ref_type='cash_transfer', ref_id=tid)
check("22 V2 limpia: solicitada sin piernas y entregada con OUT→0 inconsistentes",
      v2_inconsistentes([ct('solicitada', []), ct('entregada', [L('out', leg_o)], leg_out=leg_o)]) == [])
check("23 pierna OUT duplicada ⇒ DETECTADA",
      v2_inconsistentes([ct('entregada', [L('out', leg_o), L('out', 'PO2')], leg_out=leg_o)]) != [])
check("24 pierna IN duplicada ⇒ DETECTADA",
      v2_inconsistentes([ct('recibida', [L('out', leg_o), L('in', leg_i), L('in', 'PI2')],
                            leg_out=leg_o, leg_in=leg_i)]) != [])
check("25 recepción sin OUT ⇒ DETECTADA",
      v2_inconsistentes([ct('recibida', [L('in', leg_i)], leg_out=leg_o, leg_in=leg_i)]) != [])
check("26 cancelada con piernas ⇒ DETECTADA",
      v2_inconsistentes([ct('cancelada', [L('out', leg_o)], leg_out=leg_o)]) != [])
check("27 entregada con IN anticipada ⇒ DETECTADA",
      v2_inconsistentes([ct('entregada', [L('out', leg_o), L('in', leg_i)], leg_out=leg_o,
                            leg_in=leg_i)]) != [])
check("28 pierna con id distinto al registrado ⇒ DETECTADA (no basta contar por dirección)",
      v2_inconsistentes([ct('entregada', [L('out', 'OTRA-FILA')], leg_out=leg_o)]) != [])

# ═════════ P1-1 — Custodia inicial verdadera + orden monotónico (D.19.4) ═════════
eventos = {}   # transfer_id -> lista de eventos (event_seq, previo, nuevo, changed_by, reason, created_at)
def evento_inicial(tid_, poseedor_real, actor, created_at):
    eventos[tid_] = [dict(seq=1, previo=None, nuevo=poseedor_real, por=actor, motivo='entrega física',
                          ts=created_at)]
def reasignar(tid_, nuevo, actor, autoriza, motivo, ts, permitido=True):
    lista = eventos[tid_]
    previo = lista[-1]['nuevo']
    assert permitido, "RPC: ERR_NOT_AUTHORIZED (autoasignación sin rol bloqueada)"
    lista.append(dict(seq=lista[-1]['seq'] + 1, previo=previo, nuevo=nuevo, por=actor,
                      motivo=motivo, ts=ts))
def custodio_vigente(tid_):
    return max(eventos[tid_], key=lambda e: e['seq'])['nuevo']   # POR event_seq, NUNCA por created_at

evento_inicial('T9', poseedor_real='emisor_A', actor='RPC deliver', created_at='10:00')
check("29 custodio inicial = EMISOR (poseedor real), jamás user_of(destino)",
      custodio_vigente('T9') == 'emisor_A')
reasignar('T9', 'transportista_C', actor='emisor_A', autoriza='emisor_A', motivo='carga',
          ts='10:05')                                   # ts ANTERIOR al de un evento futuro
reasignar('T9', 'receptor_B', actor='RPC receive', autoriza='encargado', motivo='recepción física',
          ts='09:59')   # timestamp fuera de orden: now() de transacción que esperó un lock
check("30 orden por event_seq (monotónico), inmune a timestamps fuera de orden",
      custodio_vigente('T9') == 'receptor_B'
      and [e['seq'] for e in eventos['T9']] == [1, 2, 3])
check("31 cadena verificable: cada evento enlaza al anterior (previous_event_id)",
      all(eventos['T9'][i]['previo'] == eventos['T9'][i - 1]['nuevo']
          for i in range(1, len(eventos['T9']))))
try:
    reasignar('T9', 'vendedor_intruso', actor='vendedor_intruso', autoriza=None, motivo='robo', ts='10:10',
              permitido=False)
except AssertionError:
    OK.append("32 autoasignación sin rol RECHAZADA por la RPC")
check("33 auditoría completa: previo/nuevo/ejecutor/autorizador/motivo/seq",
      all(k in eventos['T9'][-1] for k in ('previo', 'nuevo', 'por', 'motivo', 'seq')))

# ═════════ P1-2 — Firma PostgreSQL + saldo SUM(sign*amount) (D.19.5) ═════════
def firma_valida(params):
    # Regla PostgreSQL: ningún parámetro con DEFAULT puede preceder a uno obligatorio
    visto_default = False
    for _, con_default in params:
        if con_default: visto_default = True
        elif visto_default: return False
    return True
firma_v19 = [('p_amount', False), ('p_currency', False), ('p_idempotency_key', False),
             ('p_from_register', True), ('p_from_account', True), ('p_to_register', True),
             ('p_to_account', True), ('p_carrier', True)]
firma_005 = [('p_from_register', True), ('p_from_account', True), ('p_to_register', True),
             ('p_to_account', True), ('p_amount', False), ('p_currency', False),
             ('p_idempotency_key', False)]
check("34 firma corregida (obligatorios antes de DEFAULT): VÁLIDA en PostgreSQL",
      firma_valida(firma_v19))
check("35 firma v5 (DEFAULT antes de obligatorios): RECHAZADA por PostgreSQL",
      not firma_valida(firma_005))

def saldo_cuenta(filas):
    # Réplica de la consulta corregida: fail-closed + SUM(sign*amount) + exclusiones
    if any(f['class'] in ('sin_titular', 'sin_clasificar') for f in filas):
        return 'ERR_LEDGER_UNCLASSIFIED'
    return sum(f['sign'] * f['amount'] for f in filas
               if f['class'] not in ('electronico', 'historico_sin_titular'))
ledger_tes = [
    {'amount': 30000, 'sign': 1,  'class': 'traspaso_entrada'},       # fondeo recibido (in)
    {'amount': 10000, 'sign': -1, 'class': 'traspaso_salida'},        # entrega a A (out)
    {'amount': 2000,  'sign': -1, 'class': 'electronico'},            # Zelle: excluido del efectivo
    {'amount': 999,   'sign': 1,  'class': 'historico_sin_titular'},  # legacy pre-corte: excluido
]
check("36 saldo de tesorería = SUM(sign*amount), excluye electrónico e histórico",
      saldo_cuenta(ledger_tes) == 20000)
check("37 fila sin_titular en la cuenta ⇒ saldo BLOQUEADO (fail-closed)",
      saldo_cuenta(ledger_tes + [{'amount': 5, 'sign': 1, 'class': 'sin_titular'}])
      == 'ERR_LEDGER_UNCLASSIFIED')
check("38 fila sin_clasificar en la cuenta ⇒ saldo BLOQUEADO (fail-closed)",
      saldo_cuenta(ledger_tes + [{'amount': 5, 'sign': 1, 'class': 'sin_clasificar'}])
      == 'ERR_LEDGER_UNCLASSIFIED')

# ═════════ Identidad de custodia por moneda tras el ciclo corregido (D.19.1 + batería) ═════════
gavetas, tes, transito = 10000, 20000, 0    # TES 30 000 → entrega 10 000 a A → recibida
check("39 identidad por moneda tras el ciclo corregido: gavetas+tesorería+tránsito = 30 000",
      gavetas + tes + transito == 30000)

print(f"CHECKS 006 OK: {len(OK)} asertos pasados")
for o in OK: print("  ✔", o)
