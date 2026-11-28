# MIGRATION-AND-APPLICATION.md — Migración y aplicación productiva (§11g)
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 5 y 7

## 1. Artefactos

| Artefacto | Contenido |
|---|---|
| `supabase/migrations/20261128173000_cpsec_fx_backup_private.sql` | Guard de tabla ausente (no-op seguro en replay E2E) · `ENABLE ROW LEVEL SECURITY` · `REVOKE ALL` a anon/authenticated/PUBLIC · verificación fail-closed interna (RLS on + grants 0, si no: EXCEPTION) · `COMMENT ON TABLE` documental · `BEGIN/COMMIT` |
| `supabase/rollbacks/20261128173000_rollback_cpsec_fx_backup_private.sql` | Restaura el estado PRE de grants (anon/authenticated SELECT/INSERT/UPDATE/DELETE) con ADVERTENCIA explícita de reintroducción de exposición; RLS se mantiene ON en el rollback (devolverla a OFF sería recrear la ventana). Sin DROP |
| `scripts/cpsec-fx-apply-prod.mjs` | Canal gobernado §11g (patrón cpbra-r06): doble flag `ALLOW_PROD=read-only` + `ALLOW_PROD_WRITE=I_UNDERSTAND` vía `assertNotProduction`; PRE (existencia, RLS, grants, filas, hash) · detección idempotente de «ya aplicada» · aplicación UNA SOLA VEZ · `NOTIFY pgrst 'reload schema'` · POST con 7 marcas re-ejecutables (`--check`): rls_habilitada · grants_anon_cero · grants_authenticated_cero · grants_public_cero · filas_conservadas · hash_datos_intacto · comment_documental |
| `scripts/fx-apply-recovery.mjs` (modificado) | Causa raíz cerrada: el bloque DO endurece la postura COMPLETA (RLS + REVOKE) al crear el respaldo en futuras ejecuciones |
| Gates | writers.manifest +3 entradas (guardProtected/isolationProtected/exceptions) · ci-gate-allowlist: entrada `tables_without_rls` **RETIRADA** · replay E2E: manifiesto 235 migraciones (MATCH) · test contractual 11/11 |

## 2. Orden de ejecución (regla de oro: E2E primero, producción UNA vez)

1. **E2E (BD aislada lguovmvrozxgssupkwpf)**: batería 17/17 PASS — la migración REAL se aplicó sobre una fixture que replicaba el estado PRE vulnerable; ver TEST-EVIDENCE.md.
2. **CI** del PR: verde (todas las ramas).
3. **Fusión del PR** a main.
4. **Aplicación productiva** (§11g, una sola vez, con PRE/POST y evidencia).
5. **POST-productivo**: verificación de accesos anónimos bloqueados + verificación del escritor legítimo + retiro del allowlist YA incluido en el PR (el gate en vivo ya no detecta la tabla: RLS real en producción).

## 3. Aplicación en PRODUCCIÓN (registro §11g — EJECUTADA)

- **PRE** (capturado 2026-11-28T17:15Z, re-verificado 17:52Z antes de aplicar):
  `tabla_existe=true · rls_on=true (fuera de banda ~17:10Z) · grants_anon=4 · grants_authenticated=4 · grants_public=0 · filas=1607 · content_hash=4c151b16a1d2f32e89e95cc5bc849eb7`
- **sha256 de la migración**: `9e4ec43046d75ee14f2b0a2b9f6466e6262b99e98ee9a53d6537952719ec5161`
- **Aplicación** (2026-11-28T17:53Z, UNA SOLA VEZ, post-fusión de PR #1746 en `53e13d022`):
  `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cpsec-fx-apply-prod.mjs`
  → `SQL ejecutado sin error (verificación fail-closed interna superada)` → `NOTIFY pgrst 'reload schema'` enviado.
- **POST — 7/7 marcas OK**: `rls_habilitada ✓ · grants_anon_cero ✓ · grants_authenticated_cero ✓ · grants_public_cero ✓ · filas_conservadas ✓ (1607) · hash_datos_intacto ✓ (4c151b16… PRE→POST idéntico) · comment_documental ✓`
- **Idempotencia**: re-ejecución `--check` → «Endurecimiento YA APLICADO» + 7/7 OK.
- **Verificación anónima POST** (read-only en producción): `GET /rest/v1/exchange_rates_backup_cpfx001` → **HTTP 401 `42501 permission denied for table`** (PRE: 200 con `[]` y content-range `*/0` — la exposición quedó cerrada a nivel de privilegio, no solo de filas). Evidencia: `evidence/forensic-prod-POST-20261128T1755Z.json`.
- **Canal privilegiado legítimo POST**: service_role REST SELECT → HTTP 206, content-range **0-0/1607** (lectura íntegra operativa: canal de rollback/sondeo intacto).
- **Escritor legítimo de tasas (continuidad)**: workflow `exchange-rates-capture.yml` — últimos 5 runs **success** (último hoy 06:25Z); la tabla viva sigue activa (pg_stat: n_tup_upd=936); este endurecimiento no toca nada que el cron use (cero referencias). La integridad del respaldo queda además vigilada por el gate CI `tables_no_rls` en vivo y la atestación de hash re-ejecutable.
- **Estado final en catálogo** (sondeo POST): `relrowsecurity=true · 0 policies · grants: SOLO service_role (7 privilegios) · anon/authenticated/PUBLIC: CERO · filas=1607 · n_tup_upd=0/n_tup_del=0 · hash idéntico`.
