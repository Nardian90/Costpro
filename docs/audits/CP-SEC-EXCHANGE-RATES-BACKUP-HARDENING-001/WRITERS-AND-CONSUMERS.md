# WRITERS-AND-CONSUMERS.md — Quién escribe y quién lee
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 2

Evidencia: `evidence/writers-evidence-prod-20261128T1718Z.json` (pg_stat_statements con rol ejecutor, catálogo, cron, stats). Se separa explícitamente lo **demostrado** de lo **inferido**.

## 1. Matriz de procesos

| Proceso | Lee | Escribe | Autenticación | Frecuencia | Finalidad |
|---|---|---|---|---|---|
| `scripts/fx-apply-recovery.mjs` (canal gobernado CP-FX-001, repo) | Lee `exchange_rates` (REST service-role) y `exchange_rates_backup_cpfx001` (count de verificación) | **SÍ — UNA VEZ REAL** (CTAS 13:27:04Z; el paso 4 crea/verifica el respaldo en modo `--apply`) | Management API con SUPABASE_ACCESS_TOKEN (rol postgres) + SUPABASE_SERVICE_ROLE_KEY (REST) | bajo demanda (`--apply`, ya ejecutado; idempotente) | Crear el respaldo congelado antes de la recuperación histórica |
| Bloque DO del mismo script (habilitar RLS) | Lee catálogo pg_class | SÍ — UNA VEZ (~17:10Z, ejecutado aislado fuera de banda; identidad humana no demostrable) | Management API (rol postgres) | única | Remediar la exposición detectada |
| `scripts/probe-stray-table-r06v.mjs` (repo, misión previa) | SÍ (census: pg_tables/columnas/count/RLS/grants) | No (read-only) | Management API (rol postgres) | bajo demanda | Sondeo re-ejecutable del hallazgo |
| `scripts/cpsec-fx-table-forensic.mjs` (esta misión) | SÍ (catálogo + pg_stat + pg_stat_statements + hash) | No (read-only, declarado en writers.manifest exceptions) | Management API (rol postgres) | bajo demanda | Forense re-ejecutable |
| Gate CI «SQL DB Security» (check `tables_no_rls`, en vivo contra producción) | SÍ (pg_class; y sondeo de frescura min/max imported_at/captured_at) | No (read-only) | DATABASE_URL secreta del workflow (rol restringido CI) | cada PR | Vigilancia de tablas sin RLS |
| **App COSTPRO (src/)** | **NO** | **NO** | — | — | **CERO referencias en src/** (verificado grep; la app usa `exchange_rates` viva, jamás el respaldo) |
| Cron de captura (workflow `exchange-rates-capture.yml` → `scripts/cron/exchange-rates-capture.ts` → `src/lib/exchange-capture.ts`) | No la tabla de respaldo | No la tabla de respaldo — escribe **`exchange_rates` VIVA** | SUPABASE_SERVICE_ROLE_KEY (secrets de GitHub Actions, server-side) | 2×/día (00:00 y 12:00 UTC) | Actualización de tasas BCC + Diviza |
| Vercel cron `/api/cron/purge-snapshots` | No | No (otro dominio) | Vercel | 03:00 UTC diario | Purga de snapshots — ajeno a la tabla |

## 2. Búsqueda realizada (todos los canales pedidos por la misión)

- **Código actual**: `grep -r cpfx001` → 9 archivos, TODOS scripts/docs/CI (ninguno en `src/`).
- **Historial Git**: `git log --all -S exchange_rates_backup_cpfx001` → 6 commits (f3e6634c0, 7f6caa7cd, 1ffd40944, 9446bcdb8, fd1a334a7, 18d60ff88) — todos ya fusionados a main.
- **Ramas remotas**: la rama de origen (`feat/fx-premium-dashboard-historical-recovery-20261128`) YA está fusionada; `feat/fx-ux-redesign-simulator-20261128` no referencia la tabla. Ningún trabajo sin fusionar la toca.
- **Migraciones**: NINGUNA la referencia (la tabla nació fuera de migraciones — esa es la deuda que la migración 20261128173000 formaliza).
- **Scripts**: los listados arriba.
- **Edge Functions**: no existe `supabase/functions/` en el repo — cero.
- **pg_cron**: la extensión NO está disponible en el proyecto (relación `cron.job` inexistente — verificado) → cero jobs en BD.
- **Cron/Automatizaciones**: GitHub Actions (captura, 2×/día — escribe la tabla viva) y Vercel cron (purge-snapshots). Ninguno toca el respaldo.
- **Webhooks/APIs externas**: fuentes de tasas BCC (`api.bc.gob.cu`), Diviza (`cubadivisas.com`), Cuba Clara (`cubaclara.org`, uso único histórico), elToque (retirada). Todas alimentan `exchange_rates` viva a través del adaptador compartido `src/lib/exchange-capture.ts` — **ninguna escribe el respaldo**.
- **Procesos locales / otros proyectos**: sin evidencia de participación (única vía de escritura demostrada: el canal gobernado del propio repo vía Management API).

## 3. Escrituras activas (§3.1 de la misión) — DESENMASCARADAS

El hallazgo previo decía «escrituras recientes y aparentemente activas». **Evidencia demostrada: NO HAY ESCRITOR ACTIVO.**
- `pg_stat_all_tables`: `n_tup_ins=1607 · n_tup_upd=0 · n_tup_del=0` — exactamente la escritura inicial y nada más.
- `pg_stat_statements` sobre la tabla: TODAS las sentencias ejecutadas son del rol **postgres** (Management API): el CTAS (1), counts (3 — script fx + sondeos previos), el sondeo de frescura del gate (min/max), y las consultas forenses de esta misión. **Cero sentencias de anon/authenticated/service_role** — jamás hubo tráfico PostgREST sobre la tabla.
- La «actividad» aparente del hallazgo = **frescura de los DATOS internos** (`created_at`/`captured_at` hasta 06:25Z del 2026-11-28, herencia del cron de captura de la tabla viva en el instante del CTAS), no escrituras del respaldo.

## 4. Clasificación de la tabla

**Backup congelado / snapshot de rollback** (no caché, no fuente primaria, no integración activa, no temporal de proceso): 
- Uso: artefacto de reversión quirúrgica documentado de CP-FX-001 («`DELETE FROM exchange_rates WHERE import_batch = 'CP-FX-001-<fecha>'`» + verificación «0 reales alteradas») — junto al dump JSON gemelo.
- Consumidor de las tasas: la app consume **`exchange_rates` viva** (resolución canónica server-side, Inteligencia Cambiaria, POS, CxC/CxP) — NUNCA el respaldo.

## 5. Demostrado vs inferido

| Afirmación | Estado |
|---|---|
| Escritor único = canal gobernado fx-apply-recovery.mjs vía Management API (postgres), una vez, 13:27Z | **DEMOstrado** (pg_stat_statements + dump JSON + expediente CP-FX-001) |
| Cero consumidores en la app | **DEMOstrado** (grep src/ = 0; cero funciones/vistas dependientes; cero tráfico PostgREST) |
| Sin escritor activo (congelada) | **DEMOstrado** (pg_stat upd=0/del=0; n_live_tup=count) |
| El DO de RLS se ejecutó aislado ~17:10Z por un operador humano | Ejecución: **demostrada** (pg_stat_statements calls=1). Identidad humana: **no identificable** (logs API 404) — probablemente el propietario aplicando la recomendación del hallazgo previo (inferencia) |
| El cron de captura no afectará al endurecimiento | **Demostrado por construcción**: la migración 20261128173000 tiene cero referencias a `exchange_rates` (test contractual) y el cron no referencia el respaldo (código) |
