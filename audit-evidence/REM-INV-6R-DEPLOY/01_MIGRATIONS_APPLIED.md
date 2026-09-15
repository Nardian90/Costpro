# R1 DEPLOY — 01 MIGRACIONES APLICADAS

timestamp: 2026-09-15T22:48-22:49Z · operador: sesión REM-INV-6R-R1 · autorización: propietario del proyecto (orden explícita en chat)

## Método

Script existente del repo `scripts/apply-sql-migration.js` (Management API
`POST /v1/projects/wthkddeleylijmonclxg/database/query`, token `sbp_…`).
Decisión de proceso: NO se usó `supabase db push` porque la tabla
`supabase_migrations.schema_migrations` de LIVE está congelada en
`20260615000003` — todo el hardening posterior (W9, serie REM-INV) se aplicó
out-of-band con SQL directo; se mantiene el proceso de facto. No se insertaron
filas en `schema_migrations` (mínima intervención; alterarlo crearía un estado
de tracking parcialmente inconsistente que ya existía).

## Ejecución (orden del stream)

1. `20260916000003_rem_inv_6r_rescue_hidden_write_surface.sql` (4110 bytes) → HTTP OK,
   respuesta vacía (sin errores). Contenido: CREATE OR REPLACE de
   `cleanup_expired_idempotency_keys` y `register_idempotency` (verbatim LIVE)
   + REVOKE PUBLIC/GRANT service_role en 6 funciones (no-ops en LIVE, ya
   service_role-only — materialización de representación).
2. `20260916000004_rem_inv_6r_kpi_store_access_guard.sql` (4698 bytes) → HTTP OK,
   respuesta vacía. Contenido: CREATE OR REPLACE de
   `get_batch_store_daily_kpis(uuid[], date)` con guard de autorización
   (FOREACH store → `has_store_access(s)` para callers ≠ service_role,
   SQLSTATE 42501).

## Naturaleza del cambio

- 000003: sin cambio de comportamiento (reproduce estado LIVE certificado).
- 000004: ÚNICO cambio de comportamiento — añade barrera de autorización en
  body a `get_batch_store_daily_kpis` (hallazgo A6 de REM-INV-6R: lectura
  cross-tenant por RLS bypass SECDEF, reproducido dinámicamente en staging
  y remediado con el helper canónico `has_store_access` — evidencia
  audit-evidence/REM-INV-6R/11 y 12, staging 14/14 con A6R denegado y
  L4/L4R legítimos PASS).
- ACL de `get_batch_store_daily_kpis` SIN cambios: `authenticated` se
  conserva (caller legítimo del dashboard client-side).
