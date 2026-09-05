════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 10-vs-reverse-v2.md
GATE 11 — Comparación contractual void_transaction vs reverse_transaction_v2
════════════════════════════════════════════════════════════════════
Fuente: pg_get_functiondef LIVE de ambos (138000 y 138188).

| Aspecto             | void_transaction (138000)                  | reverse_transaction_v2 (138188)               |
|---------------------|--------------------------------------------|-----------------------------------------------|
| caller identity     | auth.uid() (p_user_id solo service_role)   | auth.uid() (p_user_id solo service_role)      |
| store authorization | has_store_access_as(caller, v_tx.store_id) | has_store_access_as(caller, v_tx.store_id)    |
| role authorization  | NINGUNA (solo bypass admin global)         | NINGUNA (solo bypass admin global)            |
| FOR UPDATE          | ✅ 1ª sentencia                             | ✅ 1ª sentencia                                |
| idempotency         | Guard status='voided' → EXCEPTION          | Guard status='voided' → return 'idempotent'   |
| status guard        | SOLO bloquea ya-voided (pending/completed/… voidables — probe P11) | EXIGE status='completed' (ERR_INVALID_STATUS) |
| ownership check     | NO (P13: ajena same-store voidable)        | NO (idéntico modelo)                          |
| stock               | restaura quantity×conversion_factor por variante (sale_void, notes=tx_id) | restaura quantity sin variants (sale_reverse, p_sale_id=tx_id) |
| payments            | NO toca                                    | NO toca                                       |
| WAC                 | no recalcula cost_average (ruta venta)     | no recalcula cost_average (ruta venta)        |
| audit               | INSERT VOID_SALE (reason, old_status) + trigger trg_audit_transaction_changes + reversión de comisiones por trigger | INSERT REVERSE_TRANSACTION_V2 (reason, units_restored) + mismos triggers |
| API route           | NINGUNA — llamada DIRECTA del cliente vía PostgREST | POST /api/reverse (withAuth+CSRF+rate-limit) con service_role e identidad inyectada server-side |
| direct client RPC   | SÍ (ACL: PUBLIC, authenticated)            | NO (ACL: postgres, service_role)              |
| frontend consumers  | POS "Deshacer" (30s) + SalesHistory invert (canVoid UI-only) | ReverseDocumentModal (sin role gate)          |
| SECURITY DEFINER    | Sí (owner postgres, search_path endurecido)| Sí (owner postgres, search_path público,pg_temp) |
| atribución audit    | user_id = caller REAL (P1/P3b'/P13)        | user_id = p_user_id de la sesión (server-injected, verificado) |

## Clasificación (opciones del contrato)

A — Implementación legítima diferente: ✔ SÍ — es la ruta activa de POS-undo y
    SalesHistory con diferencias funcionales reales (variants conversion_factor,
    void_reason/cancelled_at, acepta op-date backoffice).
B — Legacy equivalente: parcialmente (núcleo idéntico) pero NO es dead code ni
    duplicado exacto.
C — Bypass de seguridad: NO — mismo modelo autorizacional que la ruta canónica;
    cross-store/forged/anon denegados (probes); la diferencia de superficie
    (client-callable) NO cambia QUIÉN puede anular QUÉ a nivel tienda/identidad.
D — Ruta a retirar: NO — 2 consumers activos la requieren (04-code-trace.md).

## Diferencias de duración relevantes para seguridad

1. Ambas comparten la MISMA política de autorización server-side. Por tanto,
   cualquier "gap" (rol, ownership, ventana temporal, status≠completed) existe
   en AMBAS rutas por igual y NO es un defecto diferencial de void_transaction.
   → BACKLOG B-8 (rol/ownership: decisión de producto, fix sistémico en la
     familia + route) y B-9 (status guard de void_transaction).
2. Superficie: void_transaction es alcanzable directamente por PostgREST
   (bypassa CSRF/rate-limit del Next.js) — mitigado por que su autorización
   interna es autocontenida y probada. reverse_transaction_v2 requiere pasar
   por /api/reverse (defensa adicional de middleware).
