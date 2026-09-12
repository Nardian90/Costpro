# REM-INV-2 — 05: DYNAMIC REACHABILITY (interceptación de handlers reales)

Instrumento permanente: `src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts` (vitest).
Método: se **conducen los handlers POST reales** de los tres workflows de recepción con un cliente Supabase capturador (mock de frontera — patrón ya validado en REM-V2-3); se registra el nombre exacto de cada RPC invocada. No se toca ninguna base de datos. El resultado de la corrida del gate:

```text
 RUN  v4.1.10 — src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts
 ✓ W1: POST /api/inventory/receptions invokes register_reception
 ✓ W2: POST /api/sync/batch entity=reception (offline replay) invokes register_reception
 ✓ W3: POST /api/purchase-orders/[id] (receive against PO) invokes receive_against_po
 ✓ GATE: no reception workflow ever invokes receive_purchase

 Test Files  1 passed (1) — Tests  4 passed (4)
```

## 1. Workflows interceptados y RPC efectivamente ejecutada

| Workflow | Handler real conducido | RPC capturada | ¿receive_purchase? |
|---|---|---|---|
| W1 — recepción directa (endpoint sync REC-2) | `POST /api/inventory/receptions` (route.ts real) | `register_reception` (7 args firma C, `p_user_id` desde sesión servidor) | NO |
| W2 — replay offline (SyncEngine) | `POST /api/sync/batch`, `entity='reception'` (case real de dispatch) | `register_reception` (mismo armado explícito de args) | NO |
| W3 — recepción contra OC (UI almacén) | `POST /api/purchase-orders/[id]` (postHandler real) | `receive_against_po` | NO |
| GATE — agregado sobre todos los workflows | — | `receive_purchase` aparece **0 veces** | **NO** |

## 2. Alcance y límites de la evidencia

- **Alcanzado**: frontera aplicación→DB de los tres únicos caminos por los que una recepción entra al sistema (directo/online, directo/offline-replay, contra-OC). Todos resuelven a la familia canónica.
- **Estructura cubierta además por estática (04)**: hooks de cliente (`useRegisterReception`, `useReceiveAgainstPO`, `useConfirmPendingReception`), cola offline (`addToQueue('reception')` → `executeOperation` → W2), y llamadas RPC directas de cliente (`supabase.rpc('register_reception')` en useInventory.ts:122). Toda llamada de cliente pasa por la misma RPC canónica verificada en W1–W3 o es exactamente ella.
- **No ejecutado dinámicamente**: llamada directa `supabase.rpc('receive_purchase')` desde un cliente autenticado. Ese vector no pasa por ningún handler del repo (es uso directo de la API PostgREST de Supabase) y es exactamente el vector S17 de 04-static-reachability.md — reconocido, clasificado REACHABLE, y remitido al REVOKE diferido. No existe interceptación a nivel app posible para un llamado que no atraviesa la app.
- Cumplimiento del protocolo: **STATIC REACHABILITY ✓ + DYNAMIC REACHABILITY ✓** — no se aceptó "no parece usarse" como evidencia; se demostró qué función se ejecuta realmente en cada workflow.

## 3. Conclusión

La recepción de compras **en ejecución real** invoca `register_reception` / `receive_against_po` — jamás `receive_purchase`. Combinado con el censo estático (0 referencias, 0 callers internos DB, 0 triggers, 0 dependencias), la V1 queda certificada como **muerta a nivel aplicación** con una única superficie residual de EXECUTE directo.
