# FASE E-SEC-FINAL — 03 MIGRATION

**Migración**: `supabase/migrations/20260927000001_esec_final_definitive_policy.sql`
**Aplicación**: Management API `POST /v1/projects/{ref}/database/query` (patrón REM/E-SEC)
**Script**: `/home/z/my-project/scripts/esecf-apply-migration.py` → resultado en `esecf-apply-result.json`

## Contenido de la migración

1. **D4**: 3 columnas en `transaction_items`:
   - `catalog_price_at_sale NUMERIC(12,2)` (nullable — servicios sin referencia)
   - `item_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0`
   - `item_discount_pct NUMERIC(9,2) NOT NULL DEFAULT 0`
2. **D3**: tabla `supervisor_token_usages` (jti PK, supervisor, operador, store, transaction_id, used_at) + `REVOKE ALL FROM anon, authenticated, PUBLIC` + `ENABLE ROW LEVEL SECURITY` (convención `20260902000001_w9_f01`: deny-by-default).
3. **D1–D5**: `CREATE OR REPLACE FUNCTION create_sale_v2` con firma ampliada (3 params nuevos con DEFAULT: `p_supervisor_token_jti`, `p_supervisor_scope`, `p_discount_reason`) + **DROP de la firma previa (21 params)** para evitar un OVERLOAD con dos verdades (la firma vieja sin D1–D5 sería superficie de bypass para llamadas con la firma antigua).

## Verificación pre (drift)

```json
{"step": "pre-sanity-drift",
 "old_matches_baseline": true,
 "mig_old_body_sha": "9ccb2fb33e0e15a3…"}
```
El cuerpo LIVE de `create_sale_v2` (21 params) era **byte-idéntico** a la migración `20260926000001_esec_price_integrity.sql` (el estado verificado por E-SEC-R) antes de aplicar. Comparación por cuerpo (prosrc) + firma normalizada — el formato de firma difiere entre archivo y `pg_get_functiondef`, el cuerpo debe ser idéntico.

## Verificación post

```json
{"step": "post-hash-match",
 "match": true, "sig_match": true, "overloads": 1,
 "mig_new_body_sha": "1f70cd66e296e430…"}
{"step": "structure",
 "snapshot_columns": ["catalog_price_at_sale","item_discount_pct","item_discount_value"],
 "table_exists": true, "rls_enabled": true, "leaked_grants": []}
```
- **1 solo overload** de `create_sale_v2` (24 params) — el cuerpo LIVE es byte-idéntico a la migración del repo.
- 3 columnas snapshot presentes; tabla single-use con RLS y **0 grants** a anon/authenticated.

## Incidencias documentadas durante la aplicación

1. **RAISE con `%` literal**: `RAISE EXCEPTION '…lineas >=15%'` falló compilación (42601 `too few parameters for RAISE`) — corregido con `%%` (comportamiento estándar plpgsql).
2. **Overload accidental**: el primer `CREATE OR REPLACE` con firma de 24 params creó un segundo overload junto al de 21 → resuelto con `DROP FUNCTION IF EXISTS` de la firma previa dentro de la migración. Sin esta caída, `sync/batch` (21 args) podría despachar a la función vieja sin política D1–D5.
3. **Reorden de denegaciones**: la primera versión validaba motivo antes que supervisor → una llamada sin supervisor ni motivo recibía `ERR_DISCOUNT_REASON_REQUIRED` en vez de `ERR_SUPERVISOR_REQUIRED`. Reordenado: supervisor primero (política primaria), motivo después (atributo de la autorización). Re-aplicada y verificada (hash final `1f70cd66e296e430…`).

## Compatibilidad de firma

`p_supervisor_token_jti/p_supervisor_scope/p_discount_reason` tienen DEFAULT NULL → llamadas con 21 args (sync/batch) resuelven a la función única y conservan comportamiento (camino `authenticated` self-session, RC-1 intacto).
