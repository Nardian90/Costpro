# REGLA: PRODUCCIÓN NO ES BANCO DE PRUEBAS

**Estado:** Obligatoria desde 2026-11-01 · **Ámbito:** todo script, test, workflow y agente que hable con Supabase fuera de la aplicación Next.js.

---

## 1. La regla en una línea

**CostproBD (ref `wthkddeleylijmonclxg`) es producción con datos comerciales reales. Ninguna prueba, fixture, seed, migración de prueba o verificación automática escribe ahí. Las pruebas van a CostproE2E o a Supabase local.**

## 2. Por qué existe esta regla

Evidencia del ciclo 03-Oct→03-Nov-2026 (ver `docs/audits/ANALISIS_LIMITES_SUPABASE_2026-10-24.md`):

- **Log Ingestion 1,71 GB / 1 GB (171%)** del plan Free, con pico ~420 MB el 04/10.
- **Log Query 31,68 GB / 100 GB** — 29,5 GB consumidos en UN solo día (04/10) por una consulta masiva puntual.
- Muestra del 23/10 15:00–16:00Z [MEDIDO por el propietario]: **53% de las llamadas a la API con user-agent `node`** ejecutando escrituras de caja/ventas contra producción (`open_cash_shift` ×19, `close_cash_shift` ×19, `create_cash_flow_document` ×50, `create_sale_v2` ×15...). La atribución de ese tráfico: **misiones de desarrollo de agentes IA ejecutando pruebas LIVE contra la capa BD viva** (misión Caja Multimoneda v2.24, PR #1465, fusionado el 23/10 a las 15:54Z — la ventana de la muestra coincide exactamente), más el workflow programado de captura de tasas (`exchange-rates-capture.yml`, 2×/día desde GitHub Actions).
- La restricción de cuotas de logs se aplicará tras el período de gracia que termina **al inicio de 2027** (fuente oficial: https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest).

El costo de seguir probando en producción no es solo el riesgo de corromper datos: **cada escritura de prueba genera logs de Postgres/Auth/API que consumen el presupuesto mensual de la organización**, y cada escritura fallida (400/401) genera además entradas de error que duplican la ingestión.

## 3. Destinos permitidos por tipo de operación

| Operación | Destino |
|---|---|
| Pruebas E2E, fixtures, seeds, QA automatizado | **CostproE2E** (ref aportado por el propietario) o **Supabase local** (`supabase start`) |
| Verificación read-only de producción (conteos, políticas, salud) | Producción **solo lectura** con `ALLOW_PROD=read-only` |
| Migraciones SQL | Lote único verificado vía Management API, documentado en `docs/audits/` |
| Captura programada de tasas (workflow GHA) | Producción (operación legítima del producto), frecuencia ya definida en el workflow |
| Pruebas de escritura de caja/ventas/devoluciones | **Nunca producción** — CostproE2E o local |

## 4. El guard compartido (obligatorio)

Todo script del repo que pueda escribir contra Supabase debe pasar por el guard
`scripts/lib/assert-not-production.{mjs,py,sh}`:

```bash
# .mjs / .ts (ESM)
import { assertNotProduction } from './lib/assert-not-production.mjs';
const url = assertNotProduction({ mode: 'write', url: process.env.NEXT_PUBLIC_SUPABASE_URL, context: 'mi-script' });

# .py
from assert_not_production import assert_not_production
url = assert_not_production(mode="write", url=os.environ["NEXT_PUBLIC_SUPABASE_URL"], context="mi-script")

# .sh
source scripts/lib/assert-not-production.sh
assert_not_production write "$SUPA_URL" "mi-script" || exit 1
```

Semántica (fail-closed):

1. Si la URL contiene el ref de producción → **bloquea por defecto** (lectura y escritura).
2. Lectura permitida solo con `ALLOW_PROD=read-only` en el entorno.
3. Escritura permitida solo con **el doble flag**: `ALLOW_PROD=read-only` **y** `ALLOW_PROD_WRITE=I_UNDERSTAND`. El guard imprime un registro visible de la autorización.
4. CostproE2E, Supabase local y cualquier otra URL → paso libre.
5. Los mensajes del guard nunca exponen keys ni query strings.

Tests del contrato: `src/__tests__/scripts/assert-not-production.test.ts` (24 casos, cubre las tres variantes).

### Scripts ya cableados (2026-11-01)

`apply-rpc-fix.sh` · `apply-migration.cjs` · `apply-sql-migration.js` · `apply_migration_20260824000002.mjs` · `m002-aplicar-migracion-20261031140000.mjs` · `m003-aplicar-migracion.mjs` · `m004-aplicar-migracion-20261030130000.mjs` · `m004-aplicar-migracion-20261030143000.mjs` · `pgrst-reload-schema.mjs` · `seed-pick3-history.js` · `landing-demo-cleanup.cjs`.

**Regla para scripts NUEVOS:** un script que escriba contra Supabase sin importar el guard es un bug de revisión (bloqueante en PR).

## 5. Excepciones legítimas (y cómo se documentan)

- **Operaciones productivas puntuales** (aplicar una migración acordada, un fix de datos autorizado): doble flag + expediente en `docs/audits/` con SQL, SHA-256, antes/después y verificación. Es el patrón ya usado por las misiones de migración del repo.
- **Verificaciones read-only** (auditorías de seguridad, conteos): `ALLOW_PROD=read-only`, ventanas acotadas, agregados, sin PII.
- **La captura de tasas** (`scripts/cron/exchange-rates-capture.ts` vía `exchange-rates-capture.yml`): es una función del producto, no una prueba. Si se quiere auditar su consumo, medir con `docs/OPERATIONS/medir-logs.md`.

## 6. Qué NO está cubierto por esta regla

- El tráfico de la aplicación Next.js en sí (usuarios reales) — su optimización se trata en `PRESUPUESTO_LIMITES_SUPABASE_FREE.md` §origen.
- La BD local de desarrollo (`DATABASE_URL=file:./db/custom.db`) — no pasa por Supabase.

## 7. Scripts destructivos y freno de TRUNCATE (CP-INFRA-020, 2026-11-10)

El guard del §4 NO cubría los scripts SQL pensados para pegarse en el SQL
Editor de Supabase (no pasan por `assert-not-production`): el borrado masivo
de producción de sep–oct-2026 encaja con ese patrón (informe
DATA-INTEGRITY-REMEDIATION-001, riesgos R5/R6). CP-INFRA-020 cierra ese hueco:

- **Guard DENTRO del SQL**: todo script destructivo de `supabase/scripts/`
  (el mantenido `reset_demo_data_pro.sql` y los seis de `deprecated/`) abre
  una transacción cuyo primer bloque `DO $guard$` aborta si la BD no es
  desechable: exige la centinela `public.e2e_is_isolated_db()` → true Y la
  ausencia de `public.production_migration_ledger` (esa tabla solo existe en
  producción). CostproE2E tiene ambas → queda bloqueada (no es BD de demos).
  Cómo preparar una BD desechable: `supabase/scripts/README.md`.
- **Lint de CI**: `scripts/ci/check-destructive-guard.cjs` (job `quality` de
  `ci.yml`) falla el build ante cualquier archivo versionado destructivo sin
  guard; las migraciones NUEVAS con TRUNCATE/DROP SCHEMA/DISABLE TRIGGER
  exigen `-- DESTRUCTIVE-OK: CP-xxx`. Excepciones solo con justificación y
  vencimiento ≤90 días (`scripts/ci/destructive-allowlist.json`).
- **Freno de TRUNCATE (PREPARADO, pendiente de compuerta)**: la migración
  `20261110120000_cp_infra_020_truncate_breaker.sql` instala un trigger
  `BEFORE TRUNCATE` con `ENABLE ALWAYS` en 33 tablas críticas: un TRUNCATE
  falla incluso con `session_replication_role='replica'`, salvo bypass
  documentado (`docs/OPERATIONS/BYPASS_FRENO_TRUNCATE.md`). Solo se aplica a
  producción con la frase literal `AUTORIZO BREAKER PROD`.
- **Censo de filas**: `scripts/ops/row-census.cjs` (solo lectura, con guard)
  guarda conteos por tabla y compara contra el censo anterior — correrlo con
  cada respaldo semanal para detectar caídas grandes (>20% y >50 filas) sin
  mirar datos. Ejemplo de uso en `audit-evidence/CP-INFRA-020/`.

Inventario completo de la superficie destructiva (con permisos medidos):
`docs/OPERATIONS/SUPERFICIE_DESTRUCTIVA.md`.
