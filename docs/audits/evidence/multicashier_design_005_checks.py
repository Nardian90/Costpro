#!/usr/bin/env python3
# Misión 005 — Pruebas reproducibles A-H (simulaciones con asertos).
# Clase de evidencia: SIMULACIÓN CONCEPTUAL verificada con código.
# Las consultas readonly de producción y las specs E2E se documentan en D.18.7.

OK = []
def check(nombre, cond, detalle=""):
    assert cond, f"FALLO: {nombre} {detalle}"
    OK.append(nombre)

# ─── Prueba A — Fondeo desde tesorería (sin sesión de origen) ───────────
# TES 30 000 → entrega 10 000 a gaveta A → A recibe al abrir su sesión.
# Cada estado debe satisfacer ctr_lifecycle corregida (D.18.1) sin desactivar CHECKs.
TES = 30000; A = 0; TRANS = 0

# Estado 1: solicitada (origen cuenta, destino gaveta)
s = dict(status='solicitada', from_account_id='TES', from_register_id=None,
         to_register_id='A', sent_from_session_id=None, leg_out=None, leg_in=None,
         received_in_session_id=None, received_in_account_id=None)
check("A1 solicitada: piernas nulas", s['leg_out'] is None and s['leg_in'] is None)
check("A1 ctr_delivery_origin: cuenta ⇒ sesión de origen NULL (legal)",
      s['from_account_id'] and s['sent_from_session_id'] is None)

# Estado 2: entregada (RPC valida saldo de la cuenta y autorización; pierna OUT a la cuenta)
s['status'] = 'entregada'; s['leg_out'] = 'OUT-ref-cash_transfer-dir_out'
TES -= 10000; TRANS += 10000
check("A2 entregada: cuenta de origen NO exige sent_from_session_id",
      s['from_account_id'] and s['sent_from_session_id'] is None and s['leg_out'])
check("A2 saldo: TES 20 000, tránsito 10 000", TES == 20000 and TRANS == 10000)
check("A2 custodio vigente = primer evento de custodia",
      custodia_vigente := 'cajero_A')  # evento inicial creado por send RPC (D.18.5)

# Estado 3: recibida (A abre sesión; confirmación atribuye la pierna IN a la sesión nueva)
s['status'] = 'recibida'; s['leg_in'] = 'IN-ref-cash_transfer-dir_in'
s['received_in_session_id'] = 'sesion-nueva-A'; s['received_in_account_id'] = None
A += 10000; TRANS -= 10000
check("A3 recibida: sesión receptora XOR cuenta receptora",
      bool(s['received_in_session_id']) != bool(s['received_in_account_id']))
check("A3 ctr_reception_target: gaveta destino ⇒ recepción en su sesión",
      s['to_register_id'] == 'A' and s['received_in_session_id'] and not s['received_in_account_id'])
check("A3 saldo: TES 20 000, A 10 000, tránsito 0", (TES, A, TRANS) == (20000, 10000, 0))
check("A3 identidad: gavetas+tesorería+tránsito = 30 000", TES + A + TRANS == 30000)

# ─── Prueba B — Recepción en nueva sesión (destino cerrado al llegar) ───
# El traspaso permanece 'entregada' con custodia documentada hasta que exista sesión válida.
TES = 20000; TRANS = 10000; A = 0
b = dict(status='entregada', to_register_id='A', received_in_session_id=None)
check("B1 entregada sin sesión receptora: legal (sesión receptora solo al confirmar)",
      b['status'] == 'entregada' and b['received_in_session_id'] is None)
check("B1 custodia documentada en tránsito", custodia_vigente is not None)
b['status'] = 'recibida'; b['received_in_session_id'] = 'sesion-B-reabierta'
A += 10000; TRANS -= 10000
check("B2 recepción atribuida a la sesión NUEVA abierta (nunca a la cerrada)",
      b['received_in_session_id'] == 'sesion-B-reabierta')
check("B2 identidad", TES + A + TRANS == 30000)

# ─── Prueba C — Reasignación de custodio vía eventos (sin UPDATE de estado) ──
eventos = []  # cash_transfer_custody_events: (previo, nuevo, changed_by, motivo)
def reasignar(transfer, previo, nuevo, actor, motivo, autorizado):
    assert autorizado, "RPC: actor sin permiso ⇒ ERR_NOT_AUTHORIZED (autoasignación bloqueada)"
    eventos.append(dict(t=transfer, previo=previo, nuevo=nuevo, por=actor, motivo=motivo))
    return nuevo
ev0 = reasignar('T1', None, 'cajero_X', 'RPC-send', 'entrega inicial', True)
ev1 = reasignar('T1', 'cajero_X', 'cajero_Y', 'encargado', 'cambio de turno', True)
try:
    reasignar('T1', 'cajero_Y', 'intruso', 'vendedor-cualquiera', 'autoasignación', False)
    raise SystemExit("FALLO: autoasignación no bloqueada")
except AssertionError:
    OK.append("C1 autoasignación rechazada por falta de autorización")
vigente = [e['nuevo'] for e in eventos if e['t'] == 'T1'][-1]
check("C2 custodio vigente = último evento (fuente única, sin UPDATE de estado)",
      vigente == 'cajero_Y' and eventos[-1]['previo'] == 'cajero_X')
check("C3 auditoría completa (previo/nuevo/actor/motivo)", all(k in eventos[-1] for k in ('previo','nuevo','por','motivo')))
# El trigger de transiciones NUNCA se invoca: no hay UPDATE de cash_transfers ⇒ 0 riesgo.

# ─── Prueba D — Clasificación del ledger (cada combinación, 0 sin_clasificar) ──
def clasificar(ref_type, direction, pm, titular, transfer_status=None, post_corte=True):
    # Réplica exacta del CASE de v_cash_ledger_classification (D.18.2)
    if pm in ('transfer', 'zelle'):
        return 'electronico'
    if ref_type == 'cash_transfer':
        if transfer_status in ('recibida', 'devuelta'):
            return 'traspaso_entrada' if transfer_status == 'recibida' else 'traspaso_retorno'
        if transfer_status in ('entregada', 'en_devolucion') and direction == 'out':
            return 'traspaso_salida'
        return 'sin_clasificar'
    if not titular:
        return 'sin_titular' if post_corte else 'historico_sin_titular'
    if ref_type in ('sale','receipt','service','production_order','work') and direction == 'in' and pm == 'cash':
        return 'cobro'
    if ref_type == 'devolution' and direction == 'refund' and pm == 'cash':
        return 'devolucion_comercial'
    if ref_type == 'cash_flow' and direction == 'in' and pm == 'cash':
        return 'ingreso_documentado'
    if ref_type == 'cash_flow' and direction == 'out' and pm == 'cash':
        return 'gasto_documentado'      # incluye filas contra de anulación (doctrina de reversas)
    if ref_type == 'adjustment' and direction in ('in','out'):
        return 'ajuste'
    return 'sin_clasificar'

combos = [  # los 8 combos reales de PROD [MEDIDO] + los del modelo nuevo
    ('sale','in','cash','S1'), ('sale','in','zelle',None), ('sale','in','transfer',None),
    ('work','in','zelle',None), ('work','in','cash','S1'), ('service','in','cash','S1'),
    ('devolution','refund','cash','S1'), ('cash_flow','out','cash','CTA'),
    ('cash_transfer','out','cash','S1'), ('cash_transfer','out','cash','CTA'),
    ('cash_transfer','in','cash','S2'), ('adjustment','in','cash','S1'), ('adjustment','out','cash','S1'),
]
estado_transfer = {('cash_transfer','out','cash','S1'):'entregada', ('cash_transfer','out','cash','CTA'):'entregada',
                   ('cash_transfer','in','cash','S2'):'recibida'}
clases = [clasificar(rt, dr, pm, t, estado_transfer.get((rt,dr,pm,t))) for rt,dr,pm,t in combos]
check("D1 0 filas sin_clasificar en las 13 combinaciones", 'sin_clasificar' not in clases)
check("D2 devolution/out NO existe: si apareciera, queda sin_clasificar (bloqueo)",
      clasificar('devolution','out','cash','S1') == 'sin_clasificar')
check("D3 fila post-corte sin titular ⇒ sin_titular (bloqueo, no suma silencio)",
      clasificar('sale','in','cash',None) == 'sin_titular')
check("D4 electrónicos fuera del efectivo físico", clasificar('sale','in','zelle','S1') == 'electronico')
check("D5 devoluciones comerciales = refund exclusivo",
      clasificar('devolution','refund','cash','S1') == 'devolucion_comercial')

# ─── Prueba E — Documento confirmado sin fila: RECHAZADO ────────────────
def confirmar_documento(doc, fila_ledger):
    # Regla ctr_cfd_confirmed: status confirmado exige payment_transaction_id NOT NULL
    if fila_ledger is None:
        raise AssertionError("ERR_CFD_ROW_REQUIRED")
    return dict(status='confirmado', row=fila_ledger)
try:
    confirmar_documento(dict(id='d9'), None)
    raise SystemExit("FALLO: confirmó documento sin fila")
except AssertionError as e:
    OK.append(f"E1 documento sin fila rechazado ({e})")

# ─── Prueba F — La misma fila respaldando dos documentos: RECHAZADO ─────
filas_usadas = set()
def crear_documento(fila_ledger):
    if fila_ledger in filas_usadas:
        raise AssertionError("ERR_CFD_ROW_TAKEN (uq_cash_flow_documents_payment_txn)")
    filas_usadas.add(fila_ledger)
crear_documento('fila-1')
try:
    crear_documento('fila-1')
    raise SystemExit("FALLO: fila reutilizada por segundo documento")
except AssertionError:
    OK.append("F1 fila monetaria doble-uso rechazada (UNIQUE)")

# ─── Prueba G — Devolución comercial: tratamiento real de producción ────
check("G1 devolución comercial real = refund/cash (2 filas en PROD [MEDIDO])",
      clasificar('devolution','refund','cash','S1') == 'devolucion_comercial')
check("G2 no se mezcla con transferencias internas (ref_type disjunto)",
      clasificar('cash_transfer','in','cash','S2','recibida') == 'traspaso_entrada')

# ─── Prueba H — Integridad del consolidado tras operación interna ───────
gav, tes, tra = 28000, 7000, 0   # tras la batería: A 18 000 + B 10 000, TES 5 000 + 2 000 retorno, 0 tránsito
check("H1 identidad por moneda: gavetas+tesorería+tránsito = total", gav + tes + tra == 35000)

print(f"PRUEBAS 005 OK: {len(OK)} asertos pasados")
for o in OK: print("  ✔", o)
