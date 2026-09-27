# FASE F4-CI — 06 Fix (cambio mínimo, gate de cambio §18 satisfecho)

## Gate de cambio

```text
CI FAILURE (Security Audit exit 1, BODY_DRIFT_FROM_MIGRATION sobre create_sale_v2/21)
  → ROOT CAUSE (snapshot certificado 09-15 stale + fantasma /21 en replay por DROP no parseado + ACL /24 sin grants en migraciones)
  → F4 LO CAUSÓ (la fase F4 "reconciliación definitiva" era la encargada de cerrar el drift; nunca se completó/pushó)
  → MINIMAL FIX (3 piezas, cero cambios al detector, cero cambios de lógica funcional, cero cambios en main)
```

## Pieza 1 — LIVE: normalización del ACL (restauración del patrón canónico)

```sql
REVOKE EXECUTE ON FUNCTION public.create_sale_v2(<firma 24 args>) FROM anon;
```

- Ejecutado vía Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query` (patrón sancionado por E-SEC/E-SEC-FINAL, ver `audit-evidence/FASE-E-SEC-FINAL/03-MIGRATION.md`).
- **Evidencia before/after**:
  - BEFORE proacl: `{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
  - AFTER proacl: `{=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` (= patrón canónico certificado de la /21, patrón rem_inv_6)
- **Sin cambio de privilegios efectivos**: `anon` conserva EXECUTE vía `PUBLIC` (como en el estado certificado pre-drift y en todo momento). La entrada explícita `anon` era ruido del despliegue E-SEC-FINAL, redundante y ajena a la doctrina del repo (`REVOKE ... FROM anon` en 20260810000003, 20260810000070 y 20260916000002).
- **Integridad verificada post-revoke**: `prosecdef=true`, `proconfig={search_path=public, pg_temp}`, `pg_get_functiondef` = 26981 chars (cuerpo E-SEC-FINAL intacto).

## Pieza 2 — Migración nueva: `supabase/migrations/20260927000002_f4_create_sale_v2_acl_reconciliation.sql`

Únicamente 4 sentencias ACL sobre la firma /24 (patrón idéntico a `20260916000002_rem_inv_6_reconcile_function_acl.sql`):

```sql
REVOKE EXECUTE ON FUNCTION public.create_sale_v2(<24 args>) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(<24 args>) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(<24 args>) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(<24 args>) TO service_role;
```

- Cierra la brecha del replay: la migración `20260927000001` (DROP /21 + CREATE /24) no reestablecía el ACL; un `supabase db reset` limpio dejaba la /24 con ACL por defecto divergente del certificado.
- Tras esta migración: **replay(limpio) == LIVE == snapshot** → `grants EXECUTE = {PUBLIC, authenticated, service_role}`.
- Sin cambios de esquema, sin cambios de cuerpo, sin dependencias.

## Pieza 3 — Snapshot re-certificado: `supabase/security-contract/contract-surface.sql`

Regenerado con el generador canónico (NO edición manual — el header del archivo lo exige):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co \
SUPABASE_ACCESS_TOKEN=<PAT> node scripts/export-contract-surface.cjs
# → ✅ contract-surface.sql written: 141 functions, sha256=5cb2e52a3e3853df0469e7d44bf11d8418927bf8e94329507d455aff8bf5bb08
```

- La entrada `create_sale_v2` pasa de `/21` (cuerpo pre-E-SEC, certificación 09-15) a `/24` (cuerpo E-SEC-FINAL **verbatim desde LIVE**, `pg_get_functiondef`).
- Diferencia de contenido verificada por conjuntos: **exactamente 1 entrada cambiada de 141**; las otras 140 idénticas (el reordenamiento de los overloads `fn_process_receipt/3`+`/4` es posicional, contenido byte-idéntico).

## Lo que NO se hizo (cumplimiento §8/§9/§21)

- ❌ No se modificó el detector (`security-contract-test-static.cjs` intacto — `git diff` vacío sobre el script).
- ❌ No se añadió allowlist, no se bajó severidad, no se eliminó check.
- ❌ No se alteró el cuerpo de `create_sale_v2` (lógica funcional certificada E-SEC-FINAL intacta — verificado 26981 chars + 19/19 propiedades §20).
- ❌ No se tocó `main` (fix exclusivamente en `audit/f4-create-sale-v2-reconciliation`).
- ❌ No se absorbieron los 74 TS checks históricos, los 17 SEARCH_PATH baseline, ni el problema de secrets del E2E de CI.
