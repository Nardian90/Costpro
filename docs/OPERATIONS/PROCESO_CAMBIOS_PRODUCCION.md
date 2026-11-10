# PROCESO DE CAMBIOS EN PRODUCCIÓN — COSTPRO (CostproBD, `wthkddeleylijmonclxg`)

**Estado:** regla de proceso obligatoria (misión T2 D2.4) · **Vigente desde:** 2026-11-06

## Regla

**Todo cambio de esquema en producción = los cuatro pasos siguientes, sin excepciones:**

1. **Archivo versionado en el repo** — una migración nueva en `supabase/migrations/` con
   guards fail-closed e idempotencia (patrón de PR #1444). Nada se aplica a producción sin su
   archivo en el repo. Prohibido modificar migraciones existentes.
2. **Fila en el libro** — tras aplicar, INSERT en `public.production_migration_ledger`
   (solo-adición): versión, archivo, sha256 del contenido aplicado, mecanismo
   (`management_api`/`sql_editor`/`cli`/`owner_manual`), ruta de evidencia, autor (etiqueta de
   rol, nunca emails ni nombres), estado. Si se revierte: fila NUEVA con `status='rolled_back'`
   (la tabla bloquea UPDATE/DELETE por diseño).
3. **Archivo de evidencia** — en `audit-evidence/<ID>/`: fecha, identidad verificada
   (nombre y ref del proyecto, comprobados inmediatamente antes de escribir), resultado,
   verificación posterior por catálogo. Sin PII y sin secretos.
4. **Informe de deriva posterior** — `node scripts/ops/drift-report.cjs` (credenciales por
   entorno, solo lectura): correrlo ANTES de cada aplicación (línea base) y DESPUÉS
   (verificación), guardando la salida en la evidencia del paso 3.

## Compuertas (frases literales del propietario)

Cualquier escritura en producción exige la frase literal correspondiente de
`docs/audits/CIERRE_PENDIENTES_SEC-005_LEDGER_UI-001_2026-11-06.md`:
`AUTORIZO LEDGER PROD` (siembra del libro), `AUTORIZO MIGRACIONES ATRASADAS PROD: <lista>`,
`AUTORIZO UI-001 LIMPIEZA PROD`, y desde CP-INFRA-020 (2026-11-10):
`AUTORIZO BREAKER PROD` (aplicar el freno de TRUNCATE
`20261110120000_cp_infra_020_truncate_breaker.sql`; procedimiento completo en
`docs/OPERATIONS/BYPASS_FRENO_TRUNCATE.md`). Sin frase exacta: preparar,
probar en CostproE2E y documentar.

## Estado de partida (T0, 2026-11-06) [MEDIDO]

- `supabase_migrations.schema_migrations` (producción): **12 filas**, última `20260615000003`.
- El resto del historial fue aplicado **out-of-band sin registro** — la procedencia está
  declarada en la fila `BASELINE-2026-11-06` del libro (siembra honesta, sin backfill masivo).
- La deriva respecto al repo está medida y clasificada en
  `docs/audits/DERIVA_PRODUCCION_VS_REPO_2026-11-06.md`; el plan de alineación es T2.6.

## Exclusiones

- `pay_commission`: en refactor por otro actor (regla 8 de la misión) — no incluir en
  comparaciones ni migraciones hasta que el propietario lo indique.
- Las funciones de infraestructura del sandbox E2E (`e2e_hard_delete_*`) no son objeto de
  producción.

## Censo de filas con cada respaldo semanal (CP-INFRA-020 T5)

Tras cada respaldo cifrado semanal, correr el censo de filas (solo conteos,
sin datos ni PII; guard de lectura incluido):

```bash
export ALLOW_PROD=read-only
export DATABASE_URL='<cadena de conexión de solo lectura>'   # sin credenciales en el comando
node scripts/ops/row-census.cjs --against scripts/ops/censos/censo-anterior.json
```

Una caída grande (>20% relativo y >50 filas) devuelve exit 1 y un mensaje que
prohíbe restaurar a ciegas: primero revisar el respaldo más reciente y el
acta de la operación. El JSON del censo queda en `scripts/ops/censos/`
(gitignored si se prefiere local; nunca contiene datos de fila).
