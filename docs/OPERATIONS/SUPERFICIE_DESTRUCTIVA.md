# SUPERFICIE DESTRUCTIVA — Inventario de todo lo capaz de borrar en masa
**CP-INFRA-020 T3 · 2026-11-10 · SOLO LECTURA sobre producción (CostproBD, ref `wthkddeleylijmonclxg`)**

Este documento inventaría todo lo que puede destruir datos en masa en CostproBD,
su protección actual y su hueco. Se elaboró con consultas de solo lectura
(pg_proc/pg_trigger/information_schema, ver `audit-evidence/CP-INFRA-020/`) y
revisión del código versionado. **No se cambió nada de producción.**

Leyenda de protección: ✅ protegido · 🟡 parcial · ❌ sin protección.

## 1. Scripts SQL versionados (supabase/scripts/)

| Elemento | Qué borra | Protección antes | Protección ahora (CP-INFRA-020 T1/T2) |
| --- | --- | --- | --- |
| `reset_demo_data_pro.sql` (v5.7.13, mantenido) | TRUNCATE CASCADE de 31 tablas de negocio + `DELETE FROM auth.users` + re-siembra | ❌ ninguna: pensado para pegarse en el SQL Editor (no pasa por `assert-not-production`) | ✅ guard DO embebido fail-closed (centinela + ledger) + todo en una transacción; verificado en PG17 local (5/5 escenarios) |
| `deprecated/DEMO_RESET_SCRIPT.sql` (v5.7.25) | TRUNCATE + `DELETE FROM auth.users` | ❌ ninguna | ✅ mismo guard + banner OBSOLETO |
| `deprecated/DEMO_RESET_SCRIPT_V2.sql` (v5.8.3) | TRUNCATE selectivo + `GRANT ALL` masivos | ❌ ninguna | ✅ idem |
| `deprecated/DEMO_RESET_SCRIPT_V3.sql` (v3.0) | TRUNCATE + NOTIFY | ❌ ninguna | ✅ idem (NOTIFY tras COMMIT) |
| `deprecated/fixed_reset_demo_data.sql` (v5.5.0) | TRUNCATE + `DELETE FROM auth.users` | ❌ ninguna | ✅ idem |
| `deprecated/reset_demo_data.sql` (5.7.10) | TRUNCATE + `DROP FUNCTION ... CASCADE` + `DELETE FROM auth.users` | ❌ ninguna | ✅ idem |
| `deprecated/reset_demo_data_fixed.sql` | TRUNCATE + `DELETE FROM auth.users` | ❌ ninguna | ✅ idem |

Otros `.sql` versionados con patrones destructivos: `supabase/tests/membership_audit_test.sql`
(fixture de contrato, corre en transacción con ROLLBACK), `scripts/parser-fixtures/**`
(fixtures del parser, no ejecutables contra BD), `supabase/security-contract/contract-surface.sql`
(snapshot GENERADO de definiciones; solo lectura documental), `docs/audits/evidence/**`
(evidencia histórica). El lint de T2 los clasifica como advertencia/allowlist.

## 2. Funciones/RPC de producción [MEDIDO el 2026-11-10, pg_proc solo lectura]

| Función | Qué borra | Protección | Hueco |
| --- | --- | --- | --- |
| `reset_store_data` (2 sobrecargas) | DELETE masivo de datos de UNA tienda (por diseño, con snapshot) | 🟡 RPC con validación de store/usuario; crea snapshot previo | Ninguno conocido: flujo legítimo. NO incluir en freno de TRUNCATE (no usa TRUNCATE [MEDIDO]) |
| `soft_delete_store` | Marca soft-delete de tienda | 🟡 RPC + snapshot | Flujo legítimo |
| `restore_store_backup` | Restaura snapshot (borra datos actuales de la tienda) | 🟡 RPC + acta | Flujo legítimo |
| `manage_user_memberships` | DELETE de membresías específicas | 🟡 argumentos acotados | — |
| `assign_user_organization`, `grant_catalog_governor`, `managed_create_user_v2` | DELETE acotados dentro de lógica de negocio | 🟡 | — |
| `cleanup_expired_idempotency_keys` | DELETE de claves expiradas | 🟡 auto-limpieza operativa | Nadie la invoca desde el código [MEDIDO en src/]: ejecución manual |
| `purge_old_reset_snapshots` | DELETE de snapshots >30 días | ✅ invocada por cron Vercel diario `/api/cron/purge-snapshots` (0 3 * * *) | Por diseño |
| `cleanup_old_aggregates` | DELETE de agregados viejos | ✅ invocada por `/api/cron/usage-sync` | Por diseño |
| `purge_expired_fc_pdf_cache` | DELETE de caché PDF | 🟡 nadie la invoca desde el código [MEDIDO] | Ejecución manual; es caché, riesgo bajo |
| `e2e_hard_delete_*` | — | ✅ **NO EXISTEN en producción** [MEDIDO: pg_proc → 0 filas] | Ninguno |
| Funciones con TRUNCATE en el cuerpo | — | ✅ **NINGUNA** [MEDIDO: 0 funciones public con TRUNCATE en prosrc] | Ninguno — prerrequisito D4.3 cumplido |

## 3. Endpoints de la app con borrado múltiple (bulk)

| Endpoint | Qué hace | Protección |
| --- | --- | --- |
| `POST /api/stores/bulk/execute` | Borrado suave en masa de tiendas vía RPC `bulk_soft_delete_stores` | ✅ exige `confirmation_text='BULK_DELETE'` + reason ≥10 chars + token; soft-delete con snapshot |
| `POST /api/users/[id]/memberships/bulk` | Asignación masiva de membresías | 🟡 auth + validación |
| `POST /api/catalog/bulk-import` | Importación masiva de catálogo | 🟡 auth + validación |
| `POST /api/accounts-payable/bulk-pay` | Pago masivo de cuentas | 🟡 auth + validación |
| `PATCH/DELETE /api/stores/[id]/archive` | Archivado/borrado suave de tienda | ✅ soft-delete con snapshot |

## 4. Permisos de BD: quién puede TRUNCATE/DELETE [MEDIDO, has_table_privilege]

Resumen sobre 34 tablas de negocio/auditoría (ver JSON completo en evidencia):

| Rol | TRUNCATE | DELETE | Nota |
| --- | --- | --- | --- |
| `postgres` | 34/34 | 34/34 | Dueño (SQL Editor de Supabase corre como postgres) |
| `service_role` | 34/34 | 34/34 | BYPASSRLS — solo servidor/edge functions con la clave |
| `authenticated` | 32/34 | 32/34 | **HUECO**: RLS NO se aplica a TRUNCATE; con un JWT cualquiera, `supabase.rpc` no permite TRUNCATE pero un cliente SQL directo sí |
| `anon` | 31/34 | 31/34 | **HUECO** idéntico |

Tablas con REVOKE real de TRUNCATE para authenticated/anon [MEDIDO]:
`audit_logs`, `stock_movements` (+ `tenants` para anon). **El resto — incluidas
`transactions`, `products`, `stores`, `profiles`, `cash_*`, `business_events` —
conserva el privilegio TRUNCATE en esos roles.** RLS no filtra TRUNCATE
(documentado en PostgreSQL: TRUNCATE no pasa por políticas de fila).

**Este es el principal hueco estructural**: cualquiera con la URL del proyecto
y un JWT anónimo autenticado podría emitir TRUNCATE por un cliente Postgres
directo. El freno de T4 (trigger `block_truncate` con ENABLE ALWAYS) cierra
ese canal también, porque el trigger dispara incluso con
`session_replication_role='replica'` y el bypass exige una GUC explícita.

## 5. Triggers BEFORE TRUNCATE existentes en producción [MEDIDO]

**Ninguno** (pg_trigger → 0 filas). El freno de T4 no colisiona con nada.

## 6. Jobs programados [MEDIDO]

- `pg_cron`: **no instalado** en CostproBD (pg_extension → 0 filas; `cron.jobs` no existe).
- Vercel cron: `/api/cron/purge-snapshots` diario 03:00 UTC (RPC `purge_old_reset_snapshots(30)` — DELETE acotado a snapshots antiguos).
- GitHub Actions scheduled: `daily-audit.yml` (audit-agent, solo lectura), `exchange-rates-capture.yml` (captura de tasas, escribe tasas — no destructivo).

## 7. Riesgo residual y diseño futuro (NO implementado en esta misión)

- **Freno de DELETE**: NO se implementa porque rompería flujos legítimos
  (`reset_store_data`, `soft_delete_store`, `bulk_soft_delete_stores`, crons de
  limpieza). Diseño futuro posible: trigger BEFORE DELETE sin WHERE-like que
  exija `costpro.allow_bulk_delete='on'` SOLO en funciones marcadas como
  mantenimiento (vía `current_setting('app.role')`), más límite de filas por
  transacción con alerta. Requiere diseño propio con el propietario.
- **REVOKE TRUNCATE masivo** (alternativa/complemento al freno): retirar
  TRUNCATE a `anon`/`authenticated` en las 31 tablas restantes. Es una
  migración simple que NO rompe ningún flujo medido (ninguna función ni
  endpoint usa TRUNCATE). Se propone como migración futura: el freno de T4
  la cubre mientras tanto (y cubre además a postgres/service_role).
- **Responsabilidad del borrado original (R5)**: sigue sin responsable
  identificado; los logs de Supabase de la ventana ya no existen. Lo que sí
  quedó: R5/R6 de DATA-INTEGRITY-REMEDIATION-001 ahora apuntan a esta misión
  con los scripts neutralizados.
