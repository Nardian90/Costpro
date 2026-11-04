# SEC-003 + UI-001 (2/5) — Aplicación de las dos migraciones preparadas

Tarea: T2 de la misión SEC-025/026/003/005/006/UI-001 · PR:
`fix/cp-sec-003-ui-001-migraciones-listas` · Fechas: 2026-11-03 / 2026-11-04
Evidencia: `audit-evidence/CP-SEC-003_UI-001/EVIDENCIA.md`
Estado (regla 10):
- **CP-SEC-003: RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN** (compuerta
  pendiente de la frase literal `AUTORIZO SEC-003 UI-001 PROD`; probado en CostproE2E).
- **CP-UI-001 ítem 2: RESUELTO EN PRODUCCIÓN — PENDIENTE DE VERIFICACIÓN FUNCIONAL**
  (el efecto ya vive en producción como `no_overlapping_periods`; la migración preparada
  sería un duplicado — ver §2).

## 1. Objetivo y decisiones

Eliminar la política débil `products_update_rls` (CP-SEC-003: solo membresía de tienda,
sin check de tenant — PostgreSQL OR-ea policies permisivas y la débil anulaba a la
estricta `products_tenant_update`) y crear la restricción de exclusión de periodos
solapados de comisión (CP-UI-001 ítem 2). Decisiones respetadas: NO se modificó ninguna
de las dos migraciones existentes (D2.1); E2E primero (D2.2); separadas y SEC-003
primero (D2.3).

## 2. Hallazgo mayor: UI-001 ya está resuelto en producción por otra vía

La premisa "el constraint `commission_payments_no_overlap` NO existe en producción" es
cierta por nombre, pero el efecto ya está aplicado: producción tiene
`no_overlapping_periods` con definición IDÉNTICA (EXCLUDE USING gist (worker_id WITH =,
daterange(period_start, period_end, '[]') WITH &&) WHERE status <> 'cancelled'),
originada en la migración committeada `20260714000001_commission_no_overlap_constraint.sql`
(aplicada a producción fuera del registro `schema_migrations`, regla 11).

**Implicación:** aplicar `20261022000002_cp_ui_001_commission_payments_no_overlap.sql`
en producción crearía un constraint duplicado (mismo predicado, otro nombre). Según la
excepción de la misión ("si el código real contradice una premisa, DETENTE en ese punto,
repórtalo con evidencia y sigue con lo demás"), la aplicación de UI-001 en producción
queda **detenida y en espera de decisión del propietario**:
- Opción A (recomendada): NO aplicar; declarar el ítem 2 resuelto por
  `no_overlapping_periods` y archivar la migración como supersada.
- Opción B: aplicar tal cual (duplicado funcional inofensivo) y documentarlo.
La batería de semántica se ejecutó igualmente en E2E (§4): valida el predicado.

## 3. Precondiciones revalidadas (T2.1, solo lectura)

Producción 2026-11-04: 0 productos con tenant_id NULL · 0 pares solapados · btree_gist
ON · 2 policies UPDATE en products (débil viva) · 1 constraint de exclusión
(`no_overlapping_periods`). CostproE2E: ambas migraciones ya consolidadas vía replay
(`products_update_rls` ausente, `commission_payments_no_overlap` presente; además del
constraint de julio). Nota: 5 productos de PRUEBA en E2E con tenant NULL harían abortar
el guard de SEC-003 si se re-aplicara — comportamiento correcto del guard fail-closed.

## 4. Batería ejecutada en CostproE2E (T2.2/T2.3/T2.4) — resultados

- **SEC-003** (`supabase/tests/sec003_products_update_isolation_test.sql`, NUEVA): OK —
  (a) cross-tenant bloqueado (0 filas mutadas); (b) miembro de tienda + tenant correcto
  actualiza; (c) admin global actualiza según la regla vigente (is_admin() AND tenant);
  (c2) admin de otro tenant bloqueado; (d) sin membresía bloqueado. Guard: la policy
  débil no debe existir.
- **UI-001** (`supabase/tests/ui001_commission_no_overlap_test.sql`, NUEVA): OK —
  pago vigente permitido; solapado real rechazado (exclusion_violation); contiguo sin
  día compartido permitido; **frontera compartida '[]' rechazada**; cancelado no
  bloquea; cancelar y recrear el mismo periodo funciona; reabrir con competencia
  rechazado y sin competencia permitido; otro worker no colisiona.
- **isolation_test.sql** (preexistente, REPARADA): OK — tres arreglos mínimos para que
  vuelva a ejecutarse contra el esquema actual (FK profiles→auth.users y perfiles
  auto-creados por handle_new_user; membresías antes de active_store_id por
  validate_active_store; escenario anon adaptado al modelo de grants vigente, que no
  concede SELECT de tabla a anon — aserto con has_table_privilege).
- **Regresión de comisiones (vitest)**: `cp-sec-003-cp-ui-001-migrations.test.ts`
  (valida el contenido de ambas migraciones) + `commissions-manage-modal.test.tsx` +
  `commission-product-confcomisiones.test.ts` → 24/24 OK. La UI (RuleFormModal /
  CommissionsManageModal: calcular, pagar, cancelar) está cubierta por estos tests de
  componente; el flujo "pagar" de la ruta `[id]` mantiene su contrato (draft→approved→
  paid, cancel) y no hay flujo de "reabrir".
- **T1 (regresión)**: `membership_audit_test.sql` sigue OK tras los cambios.

## 5. Flujos de actualización de products revisados (T2.2c)

Rutas con `.update()`/`.upsert()` sobre products: `production-orders/[id]/items` y
`inventory/costeo-dinamico/commit` (cliente de usuario con withAuth) — operan sobre
filas del tenant del usuario (producción tiene 0 filas tenant-NULL), así que la policy
estricta las permite igual; `catalog/bulk-import` y `product-cost-sheets` (+ auto-generate)
usan service_role para las escrituras (bypass RLS, no afectadas); las RPC de dinero son
SECURITY DEFINER (RLS no aplica). La política débil solo añadía alcance sobre filas con
tenant distinto/NULL — población vacía en producción → **ningún flujo legítimo dependía
de ella**. Las RPC SECURITY DEFINER y las rutas service_role quedan confirmadas fuera
del alcance de la política consolidada.

## 6. Semántica de periodos y fronteras (T2.3)

El constraint usa rangos cerrados '[]': compartir el día de corte = solapamiento
(demostrado en la batería, caso 4). La app no genera periodos automáticamente: el usuario
elige fechas (CashReportView → CommissionsManageModal → POST /api/commissions/payments,
con validación period_start ≤ period_end). No se identificó flujo legítimo que fabrique
periodos que compartan frontera; no se requiere ajuste de rango ni de lógica de periodos.

## 7. Aplicación en producción (pendiente de compuerta)

La frase `AUTORIZO SEC-003 UI-001 PROD` NO fue emitida en esta sesión → CERO escrituras.
Cuando el propietario la emita:
1. Identidad de CostproBD (nombre y ref) + repetir precondiciones (§3).
2. **Aplicar SOLO SEC-003 primero** (`20261022000001_cp_sec_003_products_update_policy_
   consolidation.sql` tal cual), por separado, y verificar: `pg_policies` deja
   `products_tenant_update` como ÚNICA policy permisiva de UPDATE en products.
3. Decidir UI-001 según §2 (opción A recomendada: no aplicar).
4. Registrar evidencia de aplicación (fecha, mecanismo, resultado, comprobación
   posterior) en `audit-evidence/CP-SEC-003_UI-001/` — regla 11.
5. Si existe el proceso, actualizar la superficie certificada (contract-surface) o dejar
   el paso documentado para quien lo gestiona.
Comandos exactos de aplicación y ROLLBACK (recrear `products_update_rls` con el texto
vivo de 20260619000006 / `DROP CONSTRAINT commission_payments_no_overlap`) en
`audit-evidence/CP-SEC-003_UI-001/EVIDENCIA.md` §7.

## 8. Estado y pendientes

- SEC-003: RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (compuerta).
- UI-001 ítem 2: efecto ya vivo en producción (`no_overlapping_periods`) — PENDIENTE DE
  VERIFICACIÓN FUNCIONAL EN PRODUCCIÓN y de la decisión propietario sobre la migración
  duplicada (opción A recomendada).
- E2E: batería completa en verde (2026-11-03 y revalidada 2026-11-04 tras reciclado).
