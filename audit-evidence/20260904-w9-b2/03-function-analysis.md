════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 03-function-analysis.md
GATE 2 + §5 — Análisis del cuerpo SQL: caller identity, target, autorización
════════════════════════════════════════════════════════════════════

## Cómo obtiene CALLER IDENTITY

```sql
v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                          THEN COALESCE(p_user_id, auth.uid())
                          ELSE auth.uid() END;
```

- Para CUALQUIER caller no-service_role (incluido authenticated y anon):
  `v_caller_uid := auth.uid()` — el parámetro `p_user_id` se IGNORA por completo.
- `auth.uid()` lee `current_setting('request.jwt.claims')::json->>'sub'`, que
  PostgREST setea ÚNICAMENTE desde el JWT cuya firma verificó. Un cliente no
  puede inyectar ese GUC por la ruta RPC (probe P0 documenta el mecanismo; los
  probes DB lo usan para simular exactamente lo que PostgREST hace con un JWT real).
- Para service_role (clave de servidor, jamás en el cliente): se acepta
  `p_user_id` como identidad actuante — es el contrato que usa /api/reverse
  (`p_user_id: session.user.id`). Probe P12 demuestra que service_role SIN
  p_user_id es rechazado (v_caller_uid NULL → ERR_UNAUTHORIZED).

## Cómo obtiene TARGET TRANSACTION

```sql
SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;
```
- Target por `p_transaction_id` (uuid) — el store_id se toma de LA PROPIA FILA
  (`v_tx.store_id`), nunca de un parámetro del cliente ⇒ el caller no puede
  "elegir" la tienda contra la que se valida su membresía.

## Mecanismos de autorización presentes (búsqueda GATE 2)

| Token buscado            | ¿Presente? | Dónde / cómo |
|--------------------------|-----------|--------------|
| auth.uid()               | SÍ        | v_caller_uid (rama no-service_role) |
| has_store_access_as      | SÍ        | IF v_caller_uid IS NULL OR NOT has_store_access_as(v_caller_uid, v_tx.store_id) → ERR_UNAUTHORIZED |
| has_store_access         | No en esta fn (solo RLS helpers) | — |
| profile role             | Parcial   | DENTRO de has_store_access_as: role='admin' → bypass global. Ningún otro rol se evalúa. |
| store membership         | SÍ        | user_store_memberships (user_id, store_id, status='active') |
| permissions              | No        | No existe chequeo de rol granular (manager/encargado/clerk) |
| owner / created_by       | No        | NO hay chequeo de propiedad (seller_id no se compara con el caller) |
| p_user_id del cliente    | IGNORADO  | salvo rama service_role (clave de servidor) |

## Definición live de la barrera (has_store_access_as, OID 136268)

```sql
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role = 'admin' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_store_memberships
                 WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active');
END;
```

Modelo: **admin global** OR **membresía ACTIVA en la tienda de la transacción**.
Sin chequeo de rol (clerk/encargado/manager/costo/usuario/warehouse indistinto).
Sin chequeo de propiedad (seller_id irrelevante).
Sin chequeo de tenant (a diferencia de has_store_access, que sí join-ea tenant_id).

## §5 — Pregunta crítica: ¿equivale a `v_caller_uid := auth.uid()`?

SÍ. La identidad real (JWT) prevalece para todo caller no-service_role.
`p_user_id = usuario autorizado` enviado por el frontend NO otorga ningún
derecho: probado en P3a (forger no autorizado → ERR_UNAUTHORIZED) y P3b'
(caller autorizado con p_user_id=Admin forjado → SUCCESS pero audit/movement
atribuidos al UID REAL 03524340…, no al admin forjado).

## Observaciones adicionales del cuerpo

1. Guard de estado: SOLO `status='voided'` bloquea (ERR_ALREADY_VOIDED).
   NO exige 'completed' ⇒ una transacción 'pending' puede voidarse (probe P11:
   SUCCESS). reverse_transaction_v2 SÍ exige 'completed'. → diferencia funcional
   registrada como BACKLOG B-9.
2. Idempotencia bajo lock: FOR UPDATE como 1ª sentencia + guard de estado
   (P10: doble llamada secuencial → 1er call (sobre tx ya voided por probe previo)
   y 2º call ambos ERR_ALREADY_VOIDED; 1 solo stock movement — sin doble efecto).
3. Efectos: transactions.status→voided + void_reason/cancelled_at; stock restored
   vía register_stock_movement (sale_void, conversion_factor, skip_access_check=TRUE
   — legítimo: la fn YA validó store access del caller); audit_logs VOID_SALE con
   user_id=v_caller_uid (identidad real, probado en P1/P3b'/P13).
4. Pagos: CERO referencias a payment_transactions en el cuerpo (0 cambios — probe
   P1 battery payments=0; PRE==POST checksum global idéntico).
5. WAC: register_stock_movement con p_unit_cost=cost_at_sale en tipo sale_void no
   recalcula cost_average (probe P1: cost_avg=400 invariante) — consistente con H5-B3.
