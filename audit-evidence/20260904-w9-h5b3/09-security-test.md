# W9.4.9 — H5-B3 — GATE 10: SEGURIDAD (concurrencia ≠ bypass de autorización)

Fecha: 2026-09-04 | Fuente: TESTS E/F/G de w9h5b3_race.mjs (salida cruda en
w9h5b3_race_output.txt) + ACL live (01-live-functions.txt §2).

## Matriz de pruebas ejecutadas (llamadas reales vía PostgREST)

| # | escenario | credencial | p_user_id | resultado | esperado | OK |
|---|---|---|---|---|---|---|
| E | caller service_role con usuario SIN membership (cross-store/forged) | service_role | user sin acceso | HTTP 400 `ERR_UNAUTHORIZED` | rechazo | ✔ |
| F | caller ANÓNIMO | anon key | — | HTTP 401 `42501 permission denied for function reverse_transaction_v2` | rechazo (sin EXECUTE para anon) | ✔ |
| G | service_role + usuario sin acceso (equivalencia server-side de E) | service_role | user sin acceso | HTTP 400 `ERR_UNAUTHORIZED` | rechazo | ✔ |
| A/C/D | caller autorizado (servidor) | service_role | seller con membership activa | success / idempotent según lock | flujo normal | ✔ |

Verificación de intocabilidad: la tx …0105 (blanco de E/F/G) permaneció `completed`, con
0 movimientos, 0 audit — **los intentos no autorizados no produjeron NINGÚN efecto.**

## Diseño de autorización intra-RPC (bajo concurrencia)

- El check `has_store_access_as(v_caller_uid, v_tx.store_id)` corre DESPUÉS de adquirir el
  FOR UPDATE y ANTES de cualquier mutación → un caller no autorizado no puede ganar la carrera
  contra uno autorizado: si el autorizado toma el lock primero, el no autorizado espera,
  re-lee `voided` y sale idempotente; si el no autorizado toma el lock primero, rechaza con
  ERR_UNAUTHORIZED y libera el lock sin mutar.
- service_role puede inyectar p_user_id (por diseño: el servidor /api/reverse inyecta
  session.user.id); cualquier otro rol queda PINNED a auth.uid() (anti-spoofing, V2.12.9).
- El mecanismo de lock NUNCA amplía privilegios: solo ordena temporalmente a los callers;
  el rechazo de autorización es independiente del orden de llegada (determinístico por
  contenido, no por timing).

## ACL live (resumen)

| función | EXECUTE para anon/authenticated | ruta de producción |
|---|---|---|
| reverse_transaction_v2 | NO (postgres+service_role) | /api/reverse (servidor) ✔ |
| void_transaction | SÍ (PUBLIC+authenticated) | legacy POS-undo/SalesHistory (cliente) — ver BACKLOG B-2 |
| reverse_receipt (V1) | NO (postgres+service_role) | sin consumidores con flag true |
| reverse_receipt_v2 | SÍ (PUBLIC+authenticated) | /api/reverse (servidor) |

BACKLOG B-2 (no corregido aquí, scope H5-B3): `void_transaction` con EXECUTE a authenticated
permite a un usuario autenticado invocar anulación por PostgREST directo; la autorización
intra-RPC (store access + identidad real) SÍ aplica, pero el permiso de rol de UI
(`canVoidTransactions`) no se re-evalúa server-side. No es bypass de concurrencia ni de
identidad; es una superficie a endurecer en otro checkpoint.
