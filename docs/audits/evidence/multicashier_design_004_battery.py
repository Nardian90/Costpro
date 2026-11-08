#!/usr/bin/env python3
# Batería numérica misión 004 — 10 casos, conciliación por moneda.
# Modelo: ledger único (payment_transactions); clases mutuamente excluyentes.
# Titulares: sesión (gaveta) | cuenta (tesorería). Tránsito = legs OUT de
# transferencias 'entregada' (dinero fuera de todo titular, custodio identificado).

def estado(sesiones, cuentas, transito):
    total = sum(sesiones.values()) + sum(cuentas.values()) + transito
    return f"A={sesiones.get('A',0):,} B={sesiones.get('B',0):,} C={sesiones.get('C',0):,} TES={cuentas.get('TES',0):,} TRANS={transito:,} TOTAL={total:,}"

def check(nombre, sesiones, cuentas, transito, esperado):
    total = sum(sesiones.values()) + sum(cuentas.values()) + transito
    ok = "OK " if total == esperado else "¡FALLO!"
    print(f"  [{ok}] {nombre}: {estado(sesiones, cuentas, transito)}")
    assert total == esperado, nombre
    return total

print("═"*100)
print("CASO 1 — Apertura de tres cajas (tesorería 30 000 → 10 000 a cada gaveta)")
print("  Ledger: 3 legs OUT ref_type=cash_transfer dir=out (titular: cuenta TES) +")
print("          3 legs IN dir=in (titulares: sesiones A/B/C al confirmar en la apertura)")
s, c, t = {}, {'TES': 30000}, 0
print("   inicial:", estado(s, c, t))
# 3 transferencias: treasury→A, treasury→B, treasury→C (entregadas, luego confirmadas en apertura)
for g in ('A', 'B', 'C'):
    c['TES'] -= 10000; t += 10000          # leg OUT en entrega
    s[g] = s.get(g, 0) + 10000; t -= 10000 # leg IN al abrir sesión (confirmación)
check("final", s, c, t, 30000)
print("  Arqueo gaveta A: leg IN fondo (+10 000) → esperado 10 000. La FOTO opening_balance=10 000")
print("  es informativa y NO se suma (validación: foto == suma ledger → reconciliada).")

print("═"*100)
print("CASO 2 — Transferencia aceptada (A 20 000, B 10 000; A entrega 2 000 a B, B confirma)")
s, c, t = {'A': 20000, 'B': 10000}, {'TES': 5000}, 0
print("   inicial:", estado(s, c, t))
s['A'] -= 2000; t += 2000                # leg OUT (sesión A)
s['B'] += 2000; t -= 2000                # leg IN (sesión B)
check("final", s, c, t, 35000)

print("═"*100)
print("CASO 3 — Transferencia en tránsito (B aún no confirma)")
s, c, t = {'A': 20000, 'B': 10000}, {'TES': 5000}, 0
s['A'] -= 2000; t += 2000                # solo leg OUT; custodio = emisor (o transportista)
check("final (dinero en tránsito con custodio identificado)", s, c, t, 35000)
print("  B no aumentó; A disminuyó; los 2 000 viven en el bucket TRÁNSITO (≠ gasto: clase 'traspaso_salida').")

print("═"*100)
print("CASO 4 — Transferencia rechazada (retorno físico a A; pierna de retorno dir='in' a sesión A)")
s, c, t = {'A': 20000, 'B': 10000}, {'TES': 5000}, 0
print("   inicial:", estado(s, c, t))
s['A'] -= 2000; t += 2000                # leg OUT  (entrega)
s['A'] += 2000; t -= 2000                # leg IN   (retorno físico a A — ¡direction='in', NO 'refund'!)
check("final", s, c, t, 35000)
print("  El rechazo NO es devolución comercial: la clase 'traspaso_entrada_retorno' suma + a A.")
print("  (Con el error v2: refund contaría −2 000 a A → A quedaría en 16 000 → ¡FALLO! detectado.)")

print("═"*100)
print("CASO 5 — Cancelación ANTES de la entrega (estado 'cancelada': cero piernas)")
s, c, t = {'A': 20000, 'B': 10000}, {'TES': 5000}, 0
print("   inicial:", estado(s, c, t))
print("   Ledger: ninguna fila. Estado del documento: solicitada→cancelada (motivo auditable).")
check("final (sin variación)", s, c, t, 35000)

print("═"*100)
print("CASO 6 — Venta con cambio (venta 750; cliente entrega 1 000; vuelto 250)")
s, c, t = {'A': 5000}, {'TES': 5000}, 0
print("   inicial:", estado(s, c, t))
# Fila ÚNICA: pt ref_type='sale' dir='in' amount=750 (neto; identidad recibido−vuelto=fila validada server-side)
s['A'] += 750
check("final (gaveta A +750 exactos; el vuelto NUNCA se resta en el arqueo)", s, c, t, 10750)
print("  La venta SÍ incrementa la custodia total (+750): dinero del cliente que entra a la tienda.")

print("═"*100)
print("CASO 7 — Cobro parcial por dos vendedores (venta A 10 000; A cobra 4 000; B cobra 6 000 después)")
s, c, t = {'A': 20000, 'B': 10000}, {'TES': 5000}, 0
print("   inicial:", estado(s, c, t))
# pt fila 1: transaction_id=V, dir='in', 4 000, cash_closure_id=sesión A
s['A'] += 4000
# pt fila 2: transaction_id=V, dir='in', 6 000, cash_closure_id=sesión B (cobro posterior)
s['B'] += 6000
check("final (seller_id=A intacto en transactions; cada cobro a su sesión)", s, c, t, 45000)

print("═"*100)
print("CASO 8 — Cierre con traspaso pendiente (A entregó 2 000 a B; cierran en momentos distintos)")
s, c, t = {'A': 18000, 'B': 10000}, {'TES': 5000}, 2000
print("   estado en tránsito:", estado(s, c, t))
print("  Regla ORIGEN: A NO puede cerrar (transfer 'entregada' propia) → cierre admin auditable como único")
print("  camino alternativo; el tránsito conserva custodio. Regla DESTINO: B SÍ puede cerrar (el dinero")
print("  no es suyo). Recepción posterior: sesión nueva de B (esc. B) o cuenta tesorería (esc. C).")
# Escenario B: B reabre y confirma
s['B'] += 2000; t -= 2000
check("tras recepción en sesión nueva de B (esc. B)", s, c, t, 35000)
# Escenario C: retorno a cuenta tesorería (sesión de A ya cerrada por admin)
s2, c2, t2 = {'A': 18000, 'B': 10000}, {'TES': 5000}, 2000
c2['TES'] += 2000; t2 -= 2000
check("tras retorno a tesorería (esc. C, A cerrada por admin)", s2, c2, t2, 35000)

print("═"*100)
print("CASO 9 — Fondo inicial sin doble contabilización")
print("  Apertura de A con entrega de fondo 10 000 (caso 1) + ventas 5 000:")
s, c, t = {'A': 10000}, {'TES': 0}, 0
s['A'] += 5000   # filas de venta
check("arqueo A = 15 000 = fondo(10 000, ledger) + ventas(5 000)", s, c, t, 15000)
print("  La fórmula v5 NO tiene término 'Apertura': la foto opening_balance es validación, no sumando.")
print("  Doble conteo prohibido: 10 000(fondo)+10 000(foto)+5 000 = 25 000 ≠ físico 15 000.")

print("═"*100)
print("CASO 10 — Bimoneda (USD separado; sin mezclar nominales)")
print("  USD: TES 1 000; A abre con fondo 300 USD; A→B 100 USD aceptada; venta B 50 USD.")
su, cu, tu = {}, {'TES': 1000}, 0
cu['TES'] -= 300; tu += 300; su['A'] = 300; tu -= 300   # fondo a A
su['A'] -= 100; tu += 100; su['B'] = su.get('B',0)+100; tu -= 100  # traspaso
su['B'] += 50                                            # venta USD (+50: dinero del cliente entra)
total_usd = sum(su.values()) + sum(cu.values()) + tu
print(f"   USD: A={su['A']} B={su['B']} TES={cu['TES']} TRANS={tu} TOTAL={total_usd}")
assert total_usd == 1050
print("   CUP (caso 2) y USD se concilian por separado; conversión amount_cup solo para reportes.")

print("═"*100)
print("INVARIANTE I-1 verificada en los 10 casos: gavetas + tesorería + tránsito = custodia total.")
