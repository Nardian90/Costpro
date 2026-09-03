# W9.4.6 — H-5 · FASE 7.I/J · Locking y search_path

## Locking (7.I)

### V1 — sin locking
- `SELECT * INTO v_tx FROM transactions WHERE id=…` sin `FOR UPDATE`; `UPDATE products` read-modify-write (`stock_current = stock_current + qty`) sin bloqueo de fila.
- Ventana de carrera: dos reversiones concurrentes de la misma venta leen ambas `status='completed'` y restauran stock dos veces (la segunda termina en ERR_ALREADY_REVERSED solo DESPUÉS de escribir; con el UPDATE final ambas restauran antes del commit → doble devolución de stock y kardex duplicado).
- Mitigación estructural en producción: ACL service_role-only (una sola vía de llamada, server-side, rate-limit 5/min en la ruta) + flag OFF. Clasificación: P3-condicional (backlog: añadir FOR UPDATE si V1 debe seguir vivo).

### V2 — locking correcto
- `SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE` → serializa reversiones concurrentes sobre la misma venta.
- Idempotencia por estado (`voided` → success idempotente) — P7 verificado.
- `register_stock_movement` → triggers BEFORE/AFTER sobre stock_movements operan fila a fila; `fn_sync_inventory_on_movement` actualiza inventory con version++ (optimistic column). Sin anomalías detectadas en el flujo de reversa (siempre entrada ⇒ nunca ERR_INSUFFICIENT_STOCK).

## Search path (7.J)

| Función | proconfig | Evaluación |
|---|---|---|
| reverse_transaction (V1) | `search_path=public` | pg_temp implícito PRIMERO (patrón pre-H-1). Mitigación estructural: **todas** las referencias cualificadas (`public.*`, `auth.*`); únicos símbolos no cualificados = pg_catalog (`now()`, `jsonb_build_object`). Shadowing no explotable en el cuerpo actual. P3-hardening. |
| reverse_transaction_v2 (V2) | `search_path=public, pg_temp` | Patrón endurecido H-1 ✔ (pg_temp al final) |
| register_stock_movement (llamada por V2) | `search_path=public` | cuerpo cualificado; ídem P3 (fuera de scope este par) |
| has_store_access_as (llamada por ambas) | `search_path=public` | ídem |
| w62_guard_wac_writer | `search_path=public, pg_temp` | endurecido ✔ |

- Nota H-1: la migración `2f7af7d` no endureció V1 ni los helpers — quedó registrado como pendiente menor (los cuerpos cualificados eliminan el vector práctico).
- Demostración de por qué el riesgo es residual: para shadowing se requeriría crear funciones temporales con firmas idénticas a las llamadas no-cualificadas del cuerpo; al no existir llamadas no-cualificadas definidas por usuario, no hay objetivo.
