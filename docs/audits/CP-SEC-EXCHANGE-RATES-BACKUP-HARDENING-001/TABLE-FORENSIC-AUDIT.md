# TABLE-FORENSIC-AUDIT.md — Auditoría forense de `public.exchange_rates_backup_cpfx001`
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 1

Todas las consultas fueron de **solo lectura** contra producción (`wthkddeleylijmonclxg`) vía Supabase Management API (endpoint SQL). Sondeo re-ejecutable: `scripts/cpsec-fx-table-forensic.mjs`. Evidencia cruda: `evidence/forensic-prod-20261128T1715Z.json`. Sin vuelco de las 1.607 filas; solo estadísticas agregadas y metadatos sanitizados.

## 1. Estructura (los 14 puntos de la misión)

| # | Punto | Resultado medido (2026-11-28T17:15Z) |
|---|---|---|
| 1 | Columnas (20) | `id uuid · rate_date date · captured_at timestamptz · currency text · source text · rate numeric · variation_daily/weekly/monthly/yearly numeric · created_at timestamptz · segment text · capture_method text · source_updated_at timestamptz · rate_source_url text · reconstruction_method text · confidence_level text · notes text · imported_at timestamptz · import_batch text` — espejo exacto de `exchange_rates` en el instante del CTAS |
| 2 | Clave primaria | **NINGUNA** |
| 3 | Índices | **NINGUNO** |
| 4 | Relaciones / FKs | **NINGUNA** |
| 5 | Triggers | **NINGUNO** |
| 6 | Funciones asociadas | **NINGUNA** (cero dependencias de definición) |
| 7 | Políticas RLS | **CERO policies** |
| 8 | `relrowsecurity` | **TRUE** — habilitada fuera de banda ~17:10Z (ver §3) |
| 9 | `relforcerowsecurity` | FALSE (el rol propietario `postgres` no está forzado — canal legítimo de sondeos/rollback preservado) |
| 10 | Grants | anon: SELECT/INSERT/UPDATE/DELETE · authenticated: SELECT/INSERT/UPDATE/DELETE · service_role: ALL + REFERENCES/TRIGGER/TRUNCATE · PUBLIC: ninguno. Grantor: postgres (default privileges de Supabase al crear tablas vía postgres) |
| 11 | Vistas/funciones dependientes | **NINGUNA** (cero consumidores SQL) |
| 12 | Publicaciones/replicación | Ninguna publicación la incluye; `supabase_realtime` no la cubre |
| 13 | Fecha de creación | **2026-11-28T13:27:04Z** — CTAS único (pg_stat_statements: `CREATE TABLE IF NOT EXISTS ... AS SELECT ...` calls=1; last_autovacuum 13:27:53; dump JSON gemelo del expediente CP-FX-001 sellado a 13-27-04) |
| 14 | Frecuencia de escrituras | **ESCRITURA ÚNICA**. `pg_stat_all_tables`: `n_live_tup=1607 · n_tup_ins=1607 · n_tup_upd=0 · n_tup_del=0` — la tabla está **CONGELADA** desde su creación. **NO EXISTE ESCRITOR ACTIVO** |

## 2. Contenido (agregado sanitizado)

- 1.607 filas · `rate_date` 2025-12-25 → 2026-11-28 · `import_batch` NULL en TODAS (pre-recuperación).
- Por fuente: **BCC 1.004 (real) · elToque 498 (real, retirada 2026-07-28) · Diviza 105 (real)**.
- Segmentos: 3 → 937 · 1 → 335 · 2 → 335 (segmentos del mercado BCC, no tiendas).
- `created_at` máx 2026-11-28T06:25Z · `captured_at` máx 2026-11-28T06:25Z — frescura de DATOS internos (capturas de esa mañana por el cron de la tabla viva), **no** escrituras de la tabla de respaldo.
- Hash de contenido (canónico de la misión): `md5 4c151b16a1d2f32e89e95cc5bc849eb7` — usado como atestación del estado congelado (PRE/POST de la aplicación).
- **Identidad con el respaldo doble de CP-FX-001 DEMOSTRADA**: la tabla (1.607 = 1.004 BCC + 603 informales) coincide exactamente con el dump JSON `docs/audits/CP-FX-001/backup-exchange-rates-2026-11-28T13-27-04.json` (603 informales: 498 elToque + 105 Diviza).

## 3. Cronología forense (demostrada con evidencia)

| Momento (UTC) | Hecho | Evidencia |
|---|---|---|
| 2026-11-28 ~12:21Z | Último CI verde de main antes del hallazgo (PR #1742) | worklog |
| 2026-11-28 13:25:25Z | Dump JSON de respaldo (e2e) | `backup-exchange-rates-2026-11-28T13-25-25.json` |
| 2026-11-28 13:27:04Z | **CTAS único** de la tabla en producción (rol postgres vía Management API) — RLS OFF + grants default (exposición completa CRUD anon) | pg_stat_statements calls=1; dump JSON 13-27-04; expediente CP-FX-001 |
| 2026-11-28 13:27:53Z | autovacuum del CTAS | pg_stat_all_tables |
| 2026-11-28 14:48Z | Commit f3e6634c0 (script fx fase 8) — aún SIN bloque RLS | git history |
| 2026-11-28 15:16Z | Commit 9446bcdb8 — el script fx AÑADE el bloque DO de RLS (posterior a la creación) | `git log -S "ENABLE ROW LEVEL SECURITY"` |
| 2026-11-28 15:55Z | PR #1744: el gate en vivo detecta la tabla «sin RLS» → allowlist tables_without_rls (expira 2026-12-31) | FINAL-STATUS §3.1 previo |
| 2026-11-28 16:02Z | PR #1745 (CP-FX-001) fusionado — el script con bloque DO entra a main | GitHub API |
| 2026-11-28 17:06Z | CP-FIN-REM-001 (PR #1743) aún mide «tablas sin RLS: 1» | CP-FIN_REVISION_INDEPENDIENTE.md |
| 2026-11-28 ~17:10Z | **El bloque DO (habilitar RLS) se ejecuta AISLADO contra producción** (rol postgres vía Management API; pg_stat_statements: calls=1, rows=0) — RLS queda ON sin policies | pg_stat_statements; sondeo propio 17:15Z |
| 2026-11-28 17:15Z+ | Esta misión: forense completo + endurecimiento (FASE 5-7) | este expediente |

**Identidad del operador del DO:** el catálogo solo registra el ROL (`postgres`, canal Management API). Los endpoints de logs de la Management API devuelven 404 con el token disponible — **la identidad humana NO es demostrable** y se reporta como no identificada (más probable: el propietario aplicando la recomendación del hallazgo; inferencia, no demostración).

## 4. Conclusión forense

La tabla es el **respaldo congelado de `exchange_rates`** creado una sola vez por el canal gobernado de CP-FX-001 antes de aplicar la recuperación histórica (138 días de la serie informal USD). No es basura ni tabla huérfana: es el artefacto de reversión documentado de una misión fusionada, con valor de rollback. El hallazgo de seguridad era real: ~3h43m con RLS OFF y CRUD completo anónimo (13:27Z→17:10Z), parcialmente remediado fuera de banda (RLS on) pero **sin formalizar en migración y sin revocar los grants residuales** — deuda que esta misión cierra.
