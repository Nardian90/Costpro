# CP-INFRA-020 T4 D4.4 — Verificación empírica del freno de TRUNCATE (PG 17 local)

- **Fecha**: 2026-11-10 · **Motor**: PostgreSQL 17.11 local (clúster efímero `localhost:/tmp/pgsock`), BD desechable `cpinfra020_d44` creada y destruida por la prueba. Datos 100% sintéticos. Producción y CostproE2E **intactas**.
- **Migración bajo prueba**: `supabase/migrations/20261110120000_cp_infra_020_truncate_breaker.sql` (PREPARADA, sin aplicar a producción).
- **Salidas crudas**: `d44-aplicar-migracion.txt`, `d44-caso{1a,1b,2,2b,3,3b,4a}.txt`, `d44-perf.txt`.

## Resultados [MEDIDO]

| # | Caso | Resultado |
| --- | --- | --- |
| 1a | `TRUNCATE TABLE public.products` (protegida) | ✅ **Bloqueado**: `ERR_TRUNCATE_BLOQUEADO`, exit≠0, conteos idénticos (50/5000/2000/3000) |
| 1b | `TRUNCATE TABLE public.stores CASCADE` (padre con hijas protegidas) | ✅ **Bloqueado**: el trigger de al menos una tabla del CASCADE aborta la sentencia completa; datos intactos |
| 2 | `SET session_replication_role='replica'; TRUNCATE public.business_events` | ✅ **Bloqueado**: `ENABLE ALWAYS` hace disparar el trigger en modo replica — este era EL hueco del borrado original |
| 2b | `replica` + `TRUNCATE stores CASCADE` | ✅ Bloqueado, datos intactos |
| 3 | Bypass: `BEGIN; SET LOCAL costpro.allow_truncate='on'; TRUNCATE business_events; COMMIT;` | ✅ **Pasa solo con la GUC explícita**: business_events→0, resto intacto |
| 3b | TRUNCATE posterior sin la GUC | ✅ Sigue bloqueado (el bypass `SET LOCAL` muere con la transacción; no queda activado por defecto) |
| 4a | INSERT + UPDATE + DELETE normales con el freno instalado | ✅ Sin efecto: DML funciona igual |
| 4b | Rendimiento DML (UPDATE 5000 filas) | ✅ 21.4 ms sin freno vs 25.1 ms con freno (~0.7 µs/fila, dentro del ruido de una pasada; el trigger BEFORE TRUNCATE **no dispara** en DML) |
| catálogo | `pg_trigger.tgenabled` | ✅ `'A'` (always) — dispara también con `session_replication_role='replica'` y con `DISABLE TRIGGER USER` |

Nota de catálogo: `information_schema.triggers` **no lista** triggers de TRUNCATE
(estándar SQL); la verificación correcta es `pg_trigger` (usada arriba y en el
bloque de verificación de la propia migración).

## D4.2 — Lista final de tablas protegidas (33) [DERIVADO con evidencia]

Fórmula: (tablas que los scripts demo truncan [MEDIDO en los 7 scripts]) ∩
(existentes en producción [MEDIDO information_schema, 34 tablas]) ∩ (negocio y
auditoría) + `tenants` (raíz del multi-tenant, con REVOKE TRUNCATE para anon
pero no para authenticated [MEDIDO]):

`tenants`, `stores`, `profiles`, `user_store_memberships`, `products`,
`product_variants`, `categories`, `suppliers`, `units_of_measure`,
`transactions`, `transaction_items`, `sales`, `sale_items`, `inventory`,
`inventory_movements`, `inventory_batches`, `inventory_snapshots`,
`inventory_adjustments`, `inventory_adjustment_items`, `stock_movements`,
`cash_closures`, `cash_movements`, `cash_register_sessions`,
`purchase_orders`, `purchase_items`, `receipts`, `receipt_items`,
`transfers`, `transfer_items`, `audit_logs`, `business_events`,
`commission_rules`, `idempotency_keys`, `sync_log`.

Exclusiones justificadas:
- `commission_transactions` (mencionado en la misión): **no existe** en
  producción [MEDIDO]; sí existen `commission_payments`,
  `commission_reception_links`, `commission_rule_products`,
  `commission_rule_versions` (snapshots/derivadas de comisiones). Solo
  `commission_rules` (tabla maestra) se protege; las versiones/snapshots son
  precisamente la evidencia que sobrevivió al borrado original y NO deben
  truncarse — quedan cubiertas indirectamente porque no hay flujo legítimo
  que las trunque (0 funciones/scripts con TRUNCATE [MEDIDO]). Propuesta:
  añadirlas explícitamente al array si el propietario lo prefiere.
- `sale_items`/`sales`: existen en producción [MEDIDO] y los scripts demo las
  truncan → incluidas.
- Caché/temporales: ninguna incluida (la misión lo prohíbe).

## D4.3 — Prerrequisitos medidos en producción (solo lectura)

(a) **Ninguna función, trigger, cron ni script de la app ejecuta TRUNCATE**
sobre esas tablas: pg_proc → 0 funciones public con TRUNCATE en prosrc
[MEDIDO]; pg_trigger → 0 BEFORE TRUNCATE [MEDIDO]; pg_cron no instalado
[MEDIDO]; grep del código → 0 usos SQL de TRUNCATE en `src/` y `scripts/`
operativos [MEDIDO]. El único cron (Vercel `purge-snapshots`) usa
`purge_old_reset_snapshots` = DELETE acotado por diseño.
(b) Los REVOKE TRUNCATE existentes de anon/authenticated (audit_logs,
stock_movements; tenants para anon [MEDIDO]) **se mantienen**: la migración no
toca permisos.

## D4.5/D4.6 — Bypass y rollback (documentados, no ejecutados en producción)

- **Bypass** (solo mantenimiento consciente del propietario):
  `BEGIN; SET LOCAL costpro.allow_truncate='on'; TRUNCATE …; COMMIT;` — cada
  uso debe registrarse en `production_migration_ledger` o en un acta. No queda
  activado por defecto (verificado en caso 3b).
- **Rollback**: bloque SQL al final de la propia migración (DROP TRIGGER por
  tabla + DROP FUNCTION; idempotente).
- **Aplicación en producción**: SOLO con la compuerta `AUTORIZO BREAKER PROD`,
  en una transacción, tras verificar identidad de CostproBD
  (`wthkddeleylijmonclxg`) y con respaldo reciente; después verificar por
  catálogo: 33 triggers `trg_cp_infra_020_block_truncate` con `tgenabled='A'`,
  y registrar la fila en el ledger.
