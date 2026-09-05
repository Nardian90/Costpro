════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 06-direct-rpc-tests.md
GATE 6 + GATE 7 — Pruebas directas RPC contra PostgreSQL live
════════════════════════════════════════════════════════════════════

## Metodología

A) Probes DB directos vía Management API (sesión por request):
   - Identidad: `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"`
     = '{"sub":"<uid>","role":"authenticated"}' — el MISMO mecanismo que PostgREST
     aplica tras verificar el JWT real; auth.uid()/auth.role() lo leen sin diferencia.
   - Sanity P0 (live): session_user=postgres, current_user=postgres, auth.uid()=03524340…,
     auth.role()='authenticated' ⇒ la simulación de identidad funciona.
   - Batería de integridad dentro de la misma transacción (tx_status, stock_movements,
     inventory, products, audit, payments) capturada vía temp table.
   - ⚠️ HALLAZGO DE MÉTODO: los batches sin BEGIN explícito hace AUTOCOMMIT (los
     efectos P1/P4/P11 commit-earon SOLO sobre el fixture sintético b2c0ffee; el
     Test B previo —BEGIN explícito sin commit— sí revirtió: 0 filas persistidas).
     Todos los efectos quedaron limitados a datos sintéticos y fueron ELIMINADOS
     en el cleanup (13-data-integrity.txt: residuo 10×0, PRE==POST 15/15).

B) Probes HTTP reales vía PostgREST /rest/v1/rpc/void_transaction (camino de
   producción, sin simulación): anon (P5) y service_role (P6c, P12).

## Resultados

### Test A — usuario autorizado (mismo store) → ALLOWED (según contrato del sistema)
P1: caller 03524340… (rol 'costo', membership activa tienda A) sobre TX_A (tienda A, seller=caller)
  → SUCCESS {"status":"success","transaction_id":"b2c0ffee-…d1"}
  → tx_status=voided · +1 stock_movement sale_void qty=5 by=03524340… ·
    inventory 0→5 · products.stock_current 0→5 cost_avg=400 (invariante) ·
    audit VOID_SALE user=03524340… store=A · payments=0 (intactos)

### Test B — usuario autenticado NO autorizado → DENIED
P2: caller 037b50b2… (membership SOLO tienda B) sobre TX_A (tienda A)
  → EXCEPTION ERR_UNAUTHORIZED · sus propios efectos: 0 (los registros capturados
    corresponden al efecto previo commiteado de P1; el caller NO añadió nada:
    exactamente 1 audit row y 1 movement en total, ambos de P1)

### Test C — cross-store → DENIED
P7 (simétrico): caller 03524340… (miembro tienda A) sobre TX_B (tienda B)
  → EXCEPTION ERR_UNAUTHORIZED · 0 efectos propios
P2 cubre la dirección inversa con el mismo veredicto.

### Test D — forged user ID → RECHAZADO/SIN EFECTO
P3a: caller NO autorizado (037b50b2…) con p_user_id=03524340… (miembro válido forjado)
  → EXCEPTION ERR_UNAUTHORIZED — el id forjado NO otorga acceso.
P3b': caller autorizado (03524340…) con p_user_id=ADMIN (a1111111…) sobre TX_A2
  → SUCCESS y audit VOID_SALE user=03524340… (NO el admin forjado) ·
    movement by=03524340… — la identidad forjada es IGNORADA y la atribución
    queda en el caller real.

### Test E — caller identity (prevalece auth.uid() sobre parámetros)
Cubierto por P3a/P3b' (08-forged-identity-tests.md): para no-service_role el
parámetro no interviene en NINGUNA decisión ni atribución.

### Test F — anon → DENIED
P5 (PostgREST REAL, clave anon, HTTP real):
  → HTTP 400 {"code":"P0001","message":"ERR_UNAUTHORIZED"}
  (el ACL PUBLIC permite llegar a la fn; el cuerpo la rechaza: auth.uid()=NULL)

## GATE 7 — authenticated vs service_role (probados por separado)

P6c: service_role REAL + p_user_id=03524340… (miembro de la tienda de TX_A3)
  → HTTP 200 {"status":"success"} — ruta de confianza operativa (la que usa /api/reverse).
P12: service_role REAL SIN p_user_id
  → HTTP 400 ERR_UNAUTHORIZED — service_role DEBE suministrar identidad (contrato).
P6b: service_role sobre transacción ya voided → HTTP 400 ERR_ALREADY_VOIDED (guard).

## Extras de estado (sin doble efecto)

P10 (repetición, doble llamada secuencial en misma sesión):
  CALL1 → ERR_ALREADY_VOIDED (sobre tx voided) · CALL2 → ERR_ALREADY_VOIDED ·
  movements totales = 1 (sin duplicación).
P11 (status guard): TX_AP con status='pending' voidada por miembro → SUCCESS
  (diferencia funcional vs V2 que exige 'completed') → BACKLOG B-9.

## Resumen contractual demostrado

  UNAUTHORIZED        → DENIED (P2, P3a, P7)
  CROSS-STORE         → DENIED (P2, P7)
  FORGED IDENTITY     → DENIED / SIN EFECTO (P3a, P3b')
  ANON                → DENIED (P5)
  SERVICE SIN IDENTIDAD → DENIED (P12)
  AUTHORIZED (membresía activa o admin) → ALLOWED (P1, P4, P13, P6c)
