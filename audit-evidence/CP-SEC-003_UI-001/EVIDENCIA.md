# CP-SEC-003 + CP-UI-001 — Evidencia de aplicación (T2)

Fechas de medición: 2026-11-03 (batería original) y 2026-11-04 (revalidación tras
reciclado del sandbox). Mecanismo: SQL vía Supabase Management API (producción SOLO
lectura; CostproE2E lecturas + pruebas, tras el guard `e2e_is_isolated_db() = true`).
Sin secretos ni PII.

## 1. Precondiciones revalidadas (T2.1)

| Dato | Producción (CostproBD wthkddeleylijmonclxg) | CostproE2E (lguovmvrozxgssupkwpf) |
|---|---|---|
| productos con tenant_id NULL | **0** [MEDIDO 2026-11-04] | **5** (artefactos de prueba; el guard SEC-003 abortaría si se re-aplicara) [MEDIDO] |
| pares solapados vigentes en commission_payments | **0** [MEDIDO] | **0** [MEDIDO] |
| extensión btree_gist | **ON** [MEDIDO] | **ON** [MEDIDO] |
| pagos de comisión | 1 | 3 |
| policies UPDATE en products | **2**: `products_tenant_update` (estricta) + `products_update_rls` (débil: solo membresía, sin tenant) | **1**: `products_tenant_update` (la débil YA no existe) |
| constraint de exclusión en commission_payments | **1**: `no_overlapping_periods` | **2**: `commission_payments_no_overlap` + `no_overlapping_periods` (misma definición) |

## 2. HALLAZGO MAYOR (T2, excepción de la misión: premisa contradicha por el código)

La evidencia previa de la misión decía "el constraint `commission_payments_no_overlap`
NO existe" en producción. Es cierto POR ESE NOMBRE, pero **el efecto ya está aplicado en
producción**: existe `no_overlapping_periods` (EXCLUDE USING gist (worker_id WITH =,
daterange(period_start, period_end, '[]') WITH &&) WHERE status <> 'cancelled') con
definición IDÉNTICA a la que crea la migración preparada `20261022000002`.

- Origen: `supabase/migrations/20260714000001_commission_no_overlap_constraint.sql`
  (migración COMMITTEADA en el repo, aplicada a producción fuera del registro
  `schema_migrations` — regla 11).
- Consecuencia: aplicar `20261022000002` en producción crearía un **constraint
  DUPLICADO** (mismo predicado con otro nombre). Inofensivo funcionalmente, pero añade
  ruido de esquema y dos constraints que mantener.
- **Recomendación al propietario: NO aplicar `20261022000002` en producción**; el ítem 2
  de UI-001 ya está resuelto en producción por `no_overlapping_periods`. Si se desea la
  conservación del nombre canónico, crear una migración NUEVA que renombre/consolide
  (DROP del redundante tras crear el canónico) — decisión del propietario, NO ejecutada.
- La batería de semántica se ejecutó igualmente en CostproE2E (que tiene ambos
  constraints): valida el comportamiento del predicado.

## 3. Estado de CostproE2E (ambas migraciones ya consolidadas vía replay)

El replay oficial incluye migraciones con fecha > 2026-08-28, por lo que CostproE2E ya
refleja ambas: `products_update_rls` ausente (SEC-003) y `commission_payments_no_overlap`
presente (UI-001; junto al `no_overlapping_periods` de julio). La re-aplicación literal
de `20261022000001_cp_sec_003_...sql` sobre E2E abortaría por su guard fail-closed
(5 productos de prueba con tenant_id NULL) — comportamiento CORRECTO del guard. Las
pruebas de T2.2/T2.3 se ejecutaron contra el estado ya consolidado.

## 4. Batería ejecutada en CostproE2E (resultados reales)

| Suite | Alcance | Resultado |
|---|---|---|
| `supabase/tests/sec003_products_update_isolation_test.sql` (NUEVA) | (a) cross-tenant UPDATE → 0 filas mutadas; (b) miembro de tienda + tenant correcto → SÍ actualiza; (c) admin global → SÍ según regla vigente; (c2) admin de OTRO tenant → 0 filas; (d) sin membresía → 0 filas. Guard: exige que `products_update_rls` no exista. | **OK** |
| `supabase/tests/ui001_commission_no_overlap_test.sql` (NUEVA) | (1) base permitida; (2) solapado real rechazado; (3) contiguo permitido; (4) frontera compartida '[]' rechazada; (5) cancelado no bloquea; (6) cancelar y recrear OK; (7a) reabrir con competencia rechazado; (7b) reabrir sin competencia OK; (8) otro worker no colisiona. | **OK** |
| `supabase/tests/isolation_test.sql` (REPARADA) | suite preexistente de aislamiento multi-tenant | **OK** (3 arreglos mínimos: FK a auth.users + perfiles auto-creados por handle_new_user; membresías antes de active_store_id (validate_active_store); escenario anon adaptado al modelo de grants vigente (sin SELECT de tabla a anon), aserto con has_table_privilege) |
| `supabase/tests/membership_audit_test.sql` (T1, regresión) | 11 escenarios del trigger SEC-026 | **OK** |
| vitest `cp-sec-003-cp-ui-001-migrations.test.ts` + `commissions-manage-modal.test.tsx` + `commission-product-confcomisiones.test.ts` | migraciones + UI de comisiones (RuleFormModal/Calcular/Pagar/Cancelar a nivel componente) | **24/24 OK** |

## 5. T2.2c — Todos los flujos que actualizan products con cliente de usuario

Búsqueda exhaustiva en `src/app/api` de `.update(`/`.upsert(` sobre `from('products')`:

| Ruta | Cliente | ¿Afectada por SEC-003? |
|---|---|---|
| `production-orders/[id]/items/route.ts` | usuario (withAuth) | No en producción: opera sobre filas con tenant del usuario (0 filas tenant-NULL en producción); la policy estricta las permite igual |
| `inventory/costeo-dinamico/commit/route.ts` | usuario (withAuth) | Ídem |
| `catalog/bulk-import/route.ts` | service_role para los upserts (withAuth para autorizar) | No (service_role bypassa RLS) |
| `product-cost-sheets/route.ts` y `auto-generate/route.ts` | service_role | No |
| RPC de dinero (`create_sale_v2`, etc.) | SECURITY DEFINER | No (RLS no aplica al definer) |

La política débil SOLO añadía alcance sobre filas cuyo tenant no coincide con el del
usuario (o NULL). En producción existen **0** filas así → ningún flujo legítimo dependía
de ella. En E2E las 5 filas tenant-NULL quedan congeladas para clientes (correcto y
deseable; son artefactos de prueba).

## 6. Semántica de periodos de la app (T2.3)

- El constraint usa rangos CERRADOS '[]': dos periodos que comparten el día de corte se
  consideran solapados (verificado: caso 4 de la batería, rechazado con
  exclusion_violation).
- La app NO genera periodos automáticamente: el usuario elige las fechas
  (`CashReportView` startDate/endDate → `CommissionsManageModal` → POST
  `/api/commissions/payments` con period_start/period_end; validación `period_start >
  period_end` en la ruta). No existe flujo legítimo que fabrique periodos contiguos
  compartiendo frontera: pagar el mismo periodo dos veces ya estaba bloqueado por el
  UNIQUE, y solapar un rango con uno vigente es justamente el caso a bloquear.
- "Reabrir": no existe flujo de reabrir en `PATCH /api/commissions/payments/[id]`
  (transiciones draft→approved→paid y cancel). A nivel BD, reabrir un cancelado sin
  competencia está permitido y con competencia lo rechaza el constraint (casos 7a/7b).

## 7. Comandos exactos para producción (SOLO tras compuerta)

Identidad previa obligatoria: proyecto `CostproBD`, ref `wthkddeleylijmonclxg`;
repetir precondiciones de §1 (deben dar 0/0/ON). Mecanismo: el que use el propietario
(Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query` con el contenido
del archivo; registrar fecha/mechanismo/resultado en audit-evidence — regla 11).

**SEC-003 (RECOMENDADA — la policy débil sigue viva en producción):**
```sql
-- Aplicar tal cual el contenido de:
--   supabase/migrations/20261022000001_cp_sec_003_products_update_policy_consolidation.sql
-- Verificación posterior:
SELECT policyname FROM pg_policies
WHERE schemaname='public' AND tablename='products' AND cmd='UPDATE';
-- Esperado: solo products_tenant_update
```
Rollback SEC-003 (recrear la policy débil con el texto vivo medido en producción
2026-11-04, origen 20260619000006):
```sql
CREATE POLICY products_update_rls ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM user_store_memberships m
  WHERE m.user_id = auth.uid() AND m.status = 'active'::membership_status
    AND m.store_id = products.store_id));
```

**UI-001 (NO RECOMENDADA — duplicaría un constraint vivo):**
si el propietario aun así decide aplicar `20261022000002`:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- (contenido íntegro de 20261022000002_cp_ui_001_commission_payments_no_overlap.sql;
--  el guard pasa: 0 solapes — el constraint vigente ya lo garantiza)
-- Verificación: SELECT conname FROM pg_constraint
--   WHERE conrelid='public.commission_payments'::regclass AND contype='x';
--   → no_overlapping_periods + commission_payments_no_overlap (DUPLICADO funcional)
```
Rollback UI-001:
```sql
ALTER TABLE public.commission_payments DROP CONSTRAINT IF EXISTS commission_payments_no_overlap;
```

## 8. Compuerta T2

- La frase `AUTORIZO SEC-003 UI-001 PROD` NO fue emitida en esta sesión → CERO
  escrituras en producción.
- Estado propuesto tras este PR: SEC-003 lista para compuerta (una sola aplicación);
  UI-001 EN ESPERA DE DECISIÓN DEL PROPIETARIO (aplicar duplicado vs. declarar el
  ítem 2 ya resuelto por `no_overlapping_periods` y archivar la migración).
