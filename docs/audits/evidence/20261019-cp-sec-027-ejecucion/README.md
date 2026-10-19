# CP-SEC-027 — Ventana de ejecución en vivo (2026-10-19)

Evidencia del respaldo de la ventana de ejecución de CP-SEC-027 **aplicada en
producción** (Supabase `wthkddeleylijmonclxg`), ejecutada por el agente con
autorización expresa del propietario y entrega de credenciales (opción (a) del
diagnóstico D0), siguiendo el paquete aprobado
(`PAQUETE_EJECUCION_CP-SEC-027_2026-10-19.docx`, verbatim de la migración
`20261019000001`, PR #1424).

## SHA desplegado y superficie certificada

- **Commit**: `2be38e21bf7c7394e1831972938c8422f659bae1` (merge PR #1423, main)
- **Checksums byte-idénticos** a lo certificado en la revisión previa:
  - `supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql` → `5c2b8f97a2bfef2c…`
  - `scripts/cpsec027_post_migration_verify.js` → `bec0ae2e3f55ec09…`
  - `e2e/flows/catalog-storefront.spec.ts` → `8c180c5795b35a38…`

## Secuencia ejecutada (todas las compuertas go/no-go superadas)

| Fase | Resultado | Evidencia |
|------|-----------|-----------|
| **T-0** línea base (read-only) | Sin deriva: 3 policies anon exactas, grants vivos, vistas inexistentes, RLS activo, migraciones de hoy NO registradas, conteos 103/103/10 exactos, verify pre-fix **18/18 FALLOS** (estado esperado) | `raw/t0_linea_base_viva.json`, `raw/t0_verificacion_pre_migracion.txt` |
| **Fase A** aditiva | 3 vistas security_barrier + GRANT SELECT a anon (6/6 OK) | `raw/fase_a_resultado.json` |
| **Hardening P0** (hallazgo de la ventana) | REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER sobre las vistas a anon+authenticated — see abajo | `raw/sondeo_escritura_vistas_readonly.json`, `raw/hardening_vistas_solo_select.json` |
| **Fase B** arranque en frío PM2 | `main @ 2be38e21b`, `pm2 start ecosystem.config.js --only costpro`, `.env` del propietario (14 vars), `/` → 200; vitrinas local **y Vercel** recuperadas (title real, 85 productos vía vistas) | `raw/fase_b_humo.txt` |
| **Fase C** restricción | DROP policies anon (products/stores) + policy de variantes solo-authenticated (mismo predicado) + REVOKE SELECT ×3 (8/8 OK); post-checks: 0 policies anon, grants tablas `[]`, sondas tablas 401 / vistas 200 | `raw/fase_c_resultado.json` |
| **Verificación oficial** | `cpsec027_post_migration_verify.js` → **18/18 PASS, exit 0** ("fix CP-SEC-027 verificado en vivo") | `raw/verificacion_post_migracion_18checks.txt` |

## Hallazgo P0 nuevo (cerrado durante la ventana)

Al crear las vistas, los **default privileges** de Supabase (`GRANT ALL ON
TABLES` del starter) dieron a `anon` y `authenticated` INSERT/UPDATE/DELETE/
TRUNCATE sobre las vistas nuevas. Con vistas **auto-actualizables** y **owner
`postgres` con BYPASSRLS**, existía una vía de escritura que esquivaba el RLS
de las tablas (defacement del catálogo público con la publishable key). Se
cerró en vivo con un REVOKE (SELECT-only), y este PR la hace **durable** con
la migración `supabase/migrations/20261019000002_cp_sec_027_vistas_solo_select.sql`.

## Contenido

- `sql/` — artefactos VERBATIM del paquete (fases A/C, rollbacks, T-0)
- `raw/` — evidencia JSON/texto de cada fase y de las verificaciones
- `d0/` — sondeo read-only del diagnóstico D0 (404 vitrinas, causa raíz)
- `diagnostico/` — informe de recuperación del entorno + línea base 11:07Z
- `PAQUETE_EJECUCION_CP-SEC-027_2026-10-19.docx` — orden operativa completa
- `WORKLOG_SANDBOX_20261019.md` — bitácora íntegra del programa de trabajo
- `scripts/cp-sec-027-ops/` — herramientas de la ventana (executor, sondeos)

## Notas operativas

- El servidor quedó reactivo bajo **PM2** (app `costpro`, puerto 3000,
  `NODE_ENV=development`, process list persistido con `pm2 save`).
- E2E-SF no se ejecutó (no autorizado): la compuerta de la Fase C se cubrió
  con la alternativa read-only aprobada en la revisión (verify 18/18 + humo).
- Migración `20261018000000` (política temporal) sigue PENDIENTE por decisión
  del propietario (Decisión E; baseline vence 2026-11-30), al igual que el
  backfill david9999 y las decisiones A/B.1/C/D.
