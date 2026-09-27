# FASE F4-CI — 03 Root Cause

## Cadena causal completa (demostrada con evidencia)

### 1. Tres versiones de `create_sale_v2` coexistían en las tres fuentes de verdad

| Fuente | Firma | Estado | Origen |
|---|---|---|---|
| **LIVE** (Supabase wthkddeleylijmonclxg) | `/24` args (E-SEC-FINAL D1–D5) | 26981 chars (`pg_get_functiondef`) | Hotfix aplicado por Management API (patrón REM/E-SEC, ver `audit-evidence/FASE-E-SEC-FINAL/03-MIGRATION.md`) |
| **Migraciones** (replay) | `/24` E-SEC-FINAL (en `20260927000001_esec_final_definitive_policy.sql`, commit `cad8e446` 09-26 21:45, directo a main) + **`/21` fantasma** (cuerpo R-SEC-1 de `20260926000001`) | — | La migración hace `DROP FUNCTION IF EXISTS .../21` + `CREATE .../24` |
| **Snapshot certificado** (`contract-surface.sql`) | `/21` (cuerpo pre-E-SEC) | certificación 2026-09-15 (`eeedc5b9`) | `export-contract-surface.cjs` — nunca re-ejecutado tras E-SEC |

### 2. E-SEC-FINAL nunca re-certificó el snapshot

- `20260926000001_esec_price_integrity.sql` (E-SEC R-SEC-1, commit 3e5758bd 09-26 02:53) → cambió el cuerpo en migraciones; snapshot no refrescado.
- `20260927000001_esec_final_definitive_policy.sql` (E-SEC-FINAL D1–D5, commit cad8e446 09-26 21:45) → DROP /21 + CREATE /24 + ALTER TABLE + tabla `supervisor_token_usages`; snapshot no refrescado.
- El header del propio snapshot dice: "GENERATED FILE — DO NOT EDIT BY HAND. Re-run the generator to re-certify after authorized production changes." — ese re-run nunca ocurrió → **esta es la razón por la que F4 existía como fase y por la que CI falla**.

### 3. El parser del replay no procesa `DROP FUNCTION`

`scripts/security-contract-test-static.cjs` (líneas 627–629) solo extrae eventos `fn` (CREATE), `acl` (GRANT/REVOKE) y `alter` (ALTER FUNCTION). El `DROP FUNCTION IF EXISTS .../21` de `20260927000001` es **ignorado**, dejando en el estado de replay una entrada **fantasma** `create_sale_v2/21` con el cuerpo R-SEC-1 de `20260926000001`.

### 4. Colisión en Capa C

Capa C itera las funciones del **snapshot** y las compara contra el replay:

- snapshot `create_sale_v2/21` (cuerpo pre-E-SEC de la certificación 09-15)
- vs replay `create_sale_v2/21` (fantasma: cuerpo R-SEC-1 de 20260926000001)
- → `normBody` distinto → **BODY_DRIFT_FROM_MIGRATION** → exit 1 → BUILD BLOQUEADO.

La firma `/24` real (LIVE == migración 20260927000001, cuerpos **byte-idénticos tras normalización**: 25895 chars ambos lados) ni siquiera participaba en la comparación, porque el snapshot no la contenía.

### 5. Segundo desajuste descubierto al cerrar el primero (ACL)

Tras re-certificar el snapshot con la `/24`, el contract reveló `UNEXPECTED_ACL_DRIFT`:

- LIVE `/24` proacl: `{=X, postgres, anon, authenticated, service_role}` (el despliegue directo dejó una entrada `anon` explícita — ruido de despliegue, ajeno al patrón canónico)
- Replay `/24`: `[PUBLIC]` (la migración `20260927000001` no incluía GRANT/REVOKE para la nueva firma; el replay inicializa `{PUBLIC: true}` por defecto)

El patrón ACL canónico del repo (establecido por `20260916000002_rem_inv_6_reconcile_function_acl.sql` para la `/21`, y por `20260810000003`/`20260810000070`: `REVOKE FROM anon` + `GRANT TO PUBLIC/authenticated/service_role`) es `{PUBLIC, authenticated, service_role}` — sin entrada `anon`.

## Clasificación del fallo

**El fallo de CI lo causa el trabajo F4 incompleto** (categoría A con matiz: no una regresión introducida por un cambio F4, sino la **ausencia** de la reconciliación F4 que debía cerrar `BODY_DRIFT_FROM_MIGRATION` tras los despliegues E-SEC/E-SEC-FINAL a main+LIVE sin re-certificación). El detector funciona correctamente y NO fue modificado (§8: sin allowlist, sin bajar severidad, sin eliminar check).

## Confirmación de no-responsabilidad de terceros

- **Merge E2E (#1325) NO causó**: `main@9d220a36` (pre-merge, 05:30Z) ya fallaba con el error idéntico.
- **Quality NO afectado**: job quality (TypeCheck+Lint+Unit+Build) success en todos los runs de main.
- **F3 NO causó**: el fallo existe en `main@9d220a36` que INCLUYE el fix F3 (merge #1323 01:30Z) y en el run del propio PR F3 (36296366950, 05:09Z) — de hecho el fallo BODY_DRIFT ya estaba presente en los runs desde el 09-26 (cuerpo R-SEC-1 en migraciones vs snapshot 09-15).
