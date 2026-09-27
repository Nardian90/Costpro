# FASE F0 — 07 OFFLINE ANALYSIS (sync/batch / ventas offline)

**Fecha**: 2026-09-27 · **Método**: lectura de código activo (`useSalesCatalog.ts`, `lib/sync/*`, `api/sync/batch/route.ts`, `useSync.ts`) + tests de integración existentes. Sin ejecución mutativa.

## Las 10 preguntas del mandato

1. **¿Existe realmente venta offline?** SÍ. `useSalesCatalog.ts:392`: branch `if (!navigator.onLine)` en el checkout del catálogo → `createSale()` (cola local) en lugar del POST a `/api/pos/checkout`. No es código muerto ni flag-gated.
2. **¿Está habilitada actualmente?** SÍ — es parte del flujo live del POS del catálogo (comentario REM-V2-1 P-2: «useCreateSale se conserva SOLO para el queue offline (replay vía create_sale_v2 en /api/sync/batch)»).
3. **¿Hay cola de ventas?** SÍ — `src/lib/sync/offline-storage.ts` (persistencia local) + `src/lib/sync/sync-engine.ts` (replay) + `useSync.ts` (flush periódico a `/api/sync/batch`) + `OfflineConflictResolver.tsx` (UI de conflictos). Cada operación lleva `idempotencyKey`.
4. **¿Qué endpoints utiliza?** `POST /api/sync/batch` (autenticado, rate-limit, CSRF/origin validados) con `entity ∈ {sale, reception, adjustment, transfer}`.
5. **¿Qué datos persiste?** Payload completo de la venta: items con precios/descuentos/pagos, moneda+tasa, `p_operation_date`, `p_discount_reason`, `p_supervisor_user_id`, `p_idempotency_key`. En el route, `p_user_id` se toma de la **sesión server-side** (nunca del payload — anti-spoofing).
6. **¿Puede generar una venta real?** SÍ — el replay llama al RPC canónico `create_sale_v2` (el mismo de la venta online), con idempotencia server-side (chequeo de `sync_log` por `idempotency_key` antes de ejecutar).
7. **¿Cómo obtiene supervisor authorization?** Camino **self-session**: no hay token supervisor encolado (por diseño); el RPC aplica RC-1 — `p_supervisor_user_id == auth.uid()` + rol admin/manager en la tienda. Auditado como `supervisor_path='self_session'`.
8. **¿Cómo se comporta con E-SEC-FINAL?** **Compatible por diseño** (verificado en 02-DESIGN §3.5 y en el código actual): D1 gate por línea se aplica dentro de `create_sale_v2`; D2 el motivo encolado viaja como `p_discount_reason` (route línea 146); D3 no aplica (la sesión firmada del supervisor ES la prueba; no existe token reutilizable que rejugar); D4/D5 snapshot+redondeo viven en el mismo RPC. E-SEC-FINAL verificó SS1/SS2 (compatibilidad offline preservada) y la firma de 24 params con defaults NULL acepta la llamada de 21 args del batch.
9. **¿Qué ocurre si no hay red?** La operación se encola localmente; al recuperar conectividad el SyncEngine la replays por batch; si el servidor la rechaza (p.ej. `ERR_SUPERVISOR_REQUIRED`), el conflicto sale por `OfflineConflictResolver`. **Fail-closed**: una venta offline de un usuario sin rol supervisor con línea ≥15% NUNCA pasará en el replay (el RPC la rechaza) → no existe bypass offline de la política de precios.
10. **¿Es infraestructura futura o funcionalidad activa?** **ACTIVA** — integrada al checkout actual, con tests de integración dedicados (`iteration-11-1.test.ts` PT-11.1.1, `rem-inv-2-dynamic-reachability.test.ts` W2) y spec E2E `sync-batch.spec.ts` (que **pasa** en CI).

## Clasificación

```text
OFFLINE / sync-batch → ACTIVO   (flujo comercial real, contrato funcional definido y compatible con E-SEC-FINAL)
```

## Conclusión

La observación pendiente heredada de E-SEC-FINAL («sync/batch / ventas offline») **NO constituye un defecto**: existe flujo comercial offline activo, su contrato es self-session RC-1, y la política D1–D5 lo cubre sin bypass (replay pasa por el mismo `create_sale_v2`). Queda documentado como **arquitectura soportada**, no como deuda de remediation. Nota menor para diseño futuro: la experiencia de usuario de un rechazo de replay por falta de supervisor (fail-closed correcto) podría informarse mejor en el ConflictResolver — mejora UX, no seguridad.
