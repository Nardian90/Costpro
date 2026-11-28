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

## 3. Aplicación en PRODUCCIÓN (registro §11g)

> Se completa al ejecutar la FASE 7. Formato canónico: PRE (captura), aplicación, POST (7 marcas), PM2/health.

- **PRE** (capturado 2026-11-28T17:15Z): tabla_existe=true · rls_on=true (fuera de banda) · grants_anon=4 · grants_authenticated=4 · filas=1607 · content_hash=`4c151b16a1d2f32e89e95cc5bc849eb7`
- sha256 de la migración: registrado en la ejecución del script.
- **Aplicación**: `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cpsec-fx-apply-prod.mjs`
- **POST**: pendiente de FASE 7 — se rellenará con la salida real (7 marcas OK + filas/hash idénticos).
- **Verificación anónima POST** (read-only en producción): se espera HTTP 401/403 42501 `permission denied for table` (frente al 200/`[]` PRE).
