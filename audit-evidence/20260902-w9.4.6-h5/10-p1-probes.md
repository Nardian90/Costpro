# W9.4.6 — H-5 · FASES 8-12 · Probes de seguridad (no destructivos)

Fecha: 2026-09-03 · Raw: `raw/probes/` · **Todas las pruebas con datos reales se ejecutaron dentro de `BEGIN … ROLLBACK`** (verificación de zero-persistencia en `raw/probes/p11_nonpersistence.txt`: tx sigue `completed`, 0 filas probe en audit_logs/stock_movements/kardex_entries).

Objetivos de prueba:
- TX real: `cc030ab7-cff5-43de-a66f-0b5a8f73a7cc` (store `5e6fe821-5465-48b1-b3f1-3aa3182edc38`, status `completed`)
- Miembro autorizado: `28ebdfa1-f012-4de3-b5da-137ae9b764c9` (membresía activa en store objetivo)
- Outsider: `225dfa4b-df58-403f-9b5a-1ad183badb99` (**tenant_admin** de store `d1c4ba0e-…`, sin membresía en store objetivo — incluso siendo admin de otro tenant)
- Inexistente: `00000000-0000-0000-0000-000000000000`

## Matriz de resultados

| # | Caso | Vía | Función | Resultado esperado | Resultado OBSERVADO | Veredicto |
|---|---|---|---|---|---|---|
| P1 | anon (browser→PostgREST, key publishable) | PostgREST real | v1 | denial | **HTTP 401 / 42501 permission denied for function** | ✅ PASS |
| P1 | anon (ídem) | PostgREST real | v2 | denial | **HTTP 401 / 42501 permission denied for function** | ✅ PASS |
| P2 | `role=authenticated` + JWT claims reales | SQL (SET LOCAL) | v1 | denial ACL | **42501 permission denied** | ✅ PASS |
| P2 | ídem | SQL (SET LOCAL) | v2 | denial ACL | **42501 permission denied** | ✅ PASS |
| P3 | transacción inexistente (claims service_role) | SQL | v1 | error negocio | **ERR_TX_NOT_FOUND** | ✅ PASS |
| P3 | ídem | SQL | v2 | error negocio | **ERR_TRANSACTION_NOT_FOUND** | ✅ PASS |
| P4 | **suplantación**: claims `authenticated` (sub=miembro) + `p_user_id=outsider` forjado | SQL | v2 | p_user_id ignorado → actúa como sub real | **SUCCESS units_restored=10** — actor efectivo = `auth.uid()` (miembro); forja de p_user_id **neutralizada** | ✅ PASS |
| P5 | **cross-store**: service_role + `p_user_id=outsider` (tenant_admin otra tienda) | SQL | v2 | ERR_UNAUTHORIZED | **ERR_UNAUTHORIZED** (guard línea 23) | ✅ PASS |
| P5 | ídem | SQL | v1 | ERR_UNAUTHORIZED | **ERR_UNAUTHORIZED** (guard línea 19) | ✅ PASS |
| P6 | authorized same-store (miembro real) | SQL | v2 | PASS | **SUCCESS units_restored=10** + `audit_logs(action='REVERSE_TRANSACTION_V2', user_id=<miembro>, store_id=<store>, metadata{reason,units_restored})` | ✅ PASS |
| P7 | double reversal (misma tx, 2ª llamada) | SQL | v2 | idempotente | **`{"status":"idempotent"}`** | ✅ PASS |
| P8 | double reversal | SQL | v1 | rechazo | **ERR_ALREADY_REVERSED** | ✅ PASS |
| P9 | guard WAC single-writer: `UPDATE products SET cost_average` SIN token | SQL | (trigger global) | ERR_WAC_SINGLE_WRITER_VIOLATION | **ERR_WAC_SINGLE_WRITER_VIOLATION: "Unico escritor: fn_recalc_wac"** | ✅ PASS |
| P10 | authorized V1 full flow | SQL | v1 | PASS + trazas | **status→`reversed`**, `reversed_by=<miembro>`, `reversal_reason` capturado | ✅ PASS |
| P11 | zero persistencia post-probes | SQL | — | 0 artefactos | **tx_status=completed, 0 filas probe en audit/stock_movements/kardex** | ✅ PASS |

## Lectura de seguridad

1. **P1 CONFIRMED NO EXISTE** en este par: ni anon ni authenticated alcanzan el cuerpo (ACL de W9 C2, `20260902200923`), y aún si un service_role malicioso pasara un `p_user_id` ajeno, el guard valida membresía de ESE uuid en la tienda de la transacción → cross-store denegado (P5).
2. **Suplantación de autoría imposible para authenticated**: `p_user_id` se ignora salvo `auth.role()='service_role'` (P4: forja devuelta al actor real). El caso service_role+p_user_id es el patrón "act-as" legítimo usado por `/api/reverse` (el servidor fija `p_user_id=session.user.id`).
3. **El guard de store usa `v_tx.store_id`** (de la fila, no del cliente) — el FIX V2.3 está vigente en producción.
4. **W7/single-writer**: el guard `w62_guard_wac_writer` está ACTIVO y operativo (P9); ninguna versión escribe `cost_average`.
5. Doble reversión: V2 idempotente por diseño; V1 rechaza secuencialmente (ventana de carrera concurrente documentada en 08-semantic-diff.md §I — mitigada por ACL service_role-only).
