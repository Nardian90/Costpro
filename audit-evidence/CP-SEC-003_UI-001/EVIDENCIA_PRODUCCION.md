# CP-SEC-003 + CP-UI-001 — Evidencia de aplicación en PRODUCCIÓN (compuerta T2)

**Compuerta:** frase literal `AUTORIZO SEC-003 UI-001 PROD` emitida por el PROPIETARIO
el 2026-11-04 en la sesión de la misión, con orden explícito de fusionar los PRs.
**Mecanismo:** Supabase Management API
(`POST /v1/projects/wthkddeleylijmonclxg/database/query`), contenido EXACTO de los
archivos de migración (regla 11). Sin secretos ni PII en este documento.

## 1. Identidad y precondiciones revalidadas justo antes de aplicar [MEDIDO 2026-11-04]

Proyecto: **CostproBD**, ref `wthkddeleylijmonclxg`.

| Precondición | Valor |
|---|---|
| policies UPDATE en products | 2 (`products_tenant_update` + débil `products_update_rls` presente) |
| productos con tenant_id NULL | **0** |
| constraints de exclusión en commission_payments | 1 (`no_overlapping_periods`) |
| extensión btree_gist | ON |
| pagos de comisión | 1 |

## 2. Aplicación SEC-003 (PRIMERO, POR SEPARADO — D2.3)

- Archivo: `supabase/migrations/20261022000001_cp_sec_003_products_update_policy_consolidation.sql`
  (contenido íntegro, sin modificaciones — guard fail-closed incluido).
- Resultado: **HTTP 201**.
- Verificación inmediata: `pg_policies` → **`products_tenant_update` como ÚNICA policy de
  UPDATE en products** [MEDIDO]. La débil `products_update_rls` ya no existe.

## 3. Aplicación UI-001 (opción B elegida por el propietario)

El propietario emitió la frase que incluye UI-001 DESPUÉS de leer el hallazgo del
duplicado (PR #1546 §2: producción ya tenía `no_overlapping_periods`, definición
idéntica, desde `20260714000001`). Su frase = decisión de APLICAR igualmente
(documentando el duplicado).

- Archivo: `supabase/migrations/20261022000002_cp_ui_001_commission_payments_no_overlap.sql`
  (contenido íntegro, sin modificaciones — guard + idempotencia incluidos).
- Resultado: **HTTP 201**.
- Verificación inmediata [MEDIDO]: dos constraints de exclusión idénticos en
  commission_payments:
  - `commission_payments_no_overlap` (nueva, la de la migración)
  - `no_overlapping_periods` (preexistente desde julio)
  Definición de ambos: `EXCLUDE USING gist (worker_id WITH =, daterange(period_start,
  period_end, '[]') WITH &&) WHERE (status <> 'cancelled')`.
- **Nota de mantenimiento (duplicado consciente):** funcionalmente inofensivo (cualquiera
  de los dos rechaza); si se desea limpiar, el propietario puede ejecutar
  `ALTER TABLE public.commission_payments DROP CONSTRAINT IF EXISTS commission_payments_no_overlap;`
  (el rollback documentado de la migración) — decisión y ejecución futuras suyas.

## 4. Verificación funcional (sondas no destructivas, CERO residuo)

1. **RLS de products activa contra clientes:** transacción única con
   `SET LOCAL ROLE authenticated` + identidad JWT INEXISTENTE →
   `UPDATE public.products SET name='CP_GATE_PROBE_SENTINEL' WHERE true` →
   **0 filas con sentinel [MEDIDO]** → `ROLLBACK`. Sin fixtures, sin cambios.
2. **Constraint de exclusión activo:** intento de INSERT solapado
   (mismo worker, periodo que se cruza con el pago vigente real) →
   **RECHAZADO con `23P01 conflicting key value violates exclusion constraint`**
   [MEDIDO] — el lote falló entero y PostgreSQL descartó la transacción: sin residuo.
   El error cita `no_overlapping_periods` (cualquiera de los dos gemelos rechaza).

## 5. Post-condiciones finales [MEDIDO 2026-11-04]

| Dato | Valor |
|---|---|
| policies UPDATE en products | **1** (`products_tenant_update`) |
| constraints de exclusión en commission_payments | 2 idénticos (duplicado documentado, opción B) |
| productos tenant-NULL / fixtures creados / residuo | 0 / 0 / 0 |
| Eventos en la app | ninguno afectado: los flujos revisados (T2.2c) no dependían de la policy débil |

## 6. Estados resultantes

- **CP-SEC-003: RESUELTA — APLICADA EN PRODUCCIÓN Y VERIFICADA FUNCIONALMENTE**
  (catálogo + sondas; batería completa 5/5 en CostproE2E sobre el mismo texto de policy).
- **CP-UI-001 ítem 2: RESUELTO — APLICADO EN PRODUCCIÓN Y VERIFICADO FUNCIONALMENTE**
  (solape real rechazado; duplicado consciente documentado y con rollback disponible).
- La verificación funcional completa por flujos de app (POS/caja) sigue siendo tarea del
  dueño del producto en su despliegue; aquí se certifica el comportamiento de la BD.
