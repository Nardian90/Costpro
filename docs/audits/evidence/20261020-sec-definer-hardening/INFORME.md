# INFORME — CP-SEC-027 Fase 7: Endurecimiento de funciones SECURITY DEFINER (§3.4)

**Fecha:** 2026-10-20 · **Autor:** agente Security Lead (prompt v2, fases F6–F10)
**Autorización:** propietario, 2026-10-20 — (i) ratificación D-1 (gate contra producción read-only con rol dedicado), (ii) confirmación "aplicar ya (7.4)", (iii) `is_admin_with_access` → categoría (b).
**Estado:** ✅ APLICADA FORMALMENTE A PRODUCCIÓN vía Management API (transacción única, con dry-run atómico previo). Este PR persiste el artefacto en el repo. **NO fusionar hasta revisión del propietario (D-7).**

---

## 1. Hallazgo original (§3.4, verificado vivo 2026-10-20)

- **Check 2** (`secdef_public_grant`): **10** funciones `SECURITY DEFINER` con `EXECUTE` para `anon`/`PUBLIC` — cualquier visitante sin sesión podía invocarlas vía PostgREST, incluidas `e2e_hard_delete_store` / `e2e_hard_delete_user` (borrado duro de tiendas/usuarios).
- **Check 1** (`secdef_no_auth`): **99** funciones `SECURITY DEFINER` sin marcador `auth.uid`/`ERR_PERMISSION_DENIED` (no-trigger), 6 ya en allowlist → **93** fuera de allowlist.
- **Check 3** (`tables_no_rls`): 0 tablas sin RLS en `public` (sin cambios).

## 2. Clasificación y acciones (tabla completa: `clasificacion_tabla.md` + JSON)

| Categoría | Nº | Acción |
|---|---|---|
| (a) E2E borrado duro | 2 | `DROP FUNCTION` (`e2e_hard_delete_store`, `e2e_hard_delete_user`) |
| (a-trigger) trigger protector | 1 | `REVOKE EXECUTE ... FROM PUBLIC, anon` sobre `profiles_block_privileged_update` (guard `auth.uid` interno; el disparo del trigger NO depende de grants → protección intacta) |
| (b) RPCs de negocio | 7 | `REVOKE EXECUTE ... FROM PUBLIC, anon`; `authenticated` se conserva (grant explícito verificado) — `get_paginated_products_v2`, `get_products_for_pos`, `get_transactions`, `register_reception`, `reverse_receipt_v2`, `void_pending_reception`, `is_admin_with_access` (categoría b ratificada por el propietario) |
| Helpers internos (check 1) | 96 | clasificados individualmente (llamadores BD + uso app `rpc()`); **sin exposición anon residual** (solo los 3 expuestos ya cubiertos arriba); allowlist con justificación + expiración |

**Cero escrituras de datos.** Solo DDL de privilegios (DROP/REVOKE). La allowlist (`ci-gate-allowlist.json`, versión 2) añade **91 entradas** con `reason`, `added_by: cp-sec-027-f7` y `expires: 2027-06-30` (las 6 previas conservan su fecha). El total cubre los 97 supervivientes del check 1 → el check queda en 0 hallazgos no permitidos.

## 3. Procedimiento aplicado (pre-vuelo → dry-run → apply → post)

1. **Pre-vuelo:** verificación viva de las firmas exactas (`pg_get_function_identity_arguments`), triggers, grants explícitos y llamadores; confirmación de que la migración no estaba aplicada; hash SHA-256 del fichero registrado (`migracion_sha256.txt`: `c39afd27…`).
2. **Dry-run atómico** (`BEGIN … ROLLBACK`,Management API): resultado interno exacto — e2e_restantes=0, check2_anon=0, check1_total=97, isadmin_anon_exec=0, staff_auth_exec=7, trigger_intacto=1 — y **estado intacto tras ROLLBACK** (e2e_intactas=2, get_transactions_anon=1). Ver `dryrun_resultado.json`.
3. **Aplicación real** (`BEGIN … COMMIT`): mismos valores verificados dentro de la transacción (`apply_resultado.json`) y **persistente** re-consultado 10 s después (e2e=0, check2=0).
4. **Post-verificación (sin regresiones de CP-SEC-027):** `scripts/cpsec027_post_migration_verify.js` → **18/18 PASS** (tablas 401 anon, vistas 200, columnas sensibles ausentes, policies retiradas, grants correctos).
5. **Gate DESPUÉS** (ejecutado localmente como el rol dedicado `ci_gate_ro`, la misma vía que CI): `secdef_no_auth` 97 hallazgos / 97 en allowlist / **0 no permitidos**; `secdef_public_grant` **0**; `tables_no_rls` **0**; canario presente → **exit 0 (TODO PASS)**. Ver `gate_despues_de_f7.txt`.
6. **Sondas PostgREST (anon):** `get_transactions` y `get_paginated_products_v2` → HTTP 401 `permission denied for function`; `is_admin_with_access`, `register_reception`, `e2e_hard_delete_store`, `e2e_hard_delete_user` → HTTP 404 (PGRST202, fuera del API anon); las 3 vistas públicas → HTTP 200 (vitrina intacta).

## 4. Corrección del propio gate (commits en el PR #1428, sin merge)

- **Falso verde del check 2 corregido:** `information_schema.role_routine_grants` filtra por *enabled roles* del usuario → con el rol dedicado de CI devolvía **0 hallazgos** en lugar de 10. Reescrito sobre `pg_proc.proacl` + `aclexplode`/`acldefault` (idéntico para cualquier rol). Commit `c68a1f5`.
- **Allowlist v2** (91 entradas) commiteada al PR #1428: `9447281`.
- Evidencia CI ANTES→DESPUÉS: run #2 del `SQL Security Gate` (failure legítimo: 93+10 hallazgos, log adjunto) → run posterior esperado en verde con BD remediada + allowlist.

## 5. Riesgo residual y seguimiento

- El check 1 sigue señalando las 97 funciones hasta que reciban marcadores de auth reales o pasen a `SECURITY INVOKER`; la allowlist es un registro documentado con **fecha de expiración 2027-06-30** (revisión obligatoria; el job `Allowlist Review` falla si expira).
- `is_admin_with_access` conserva el guard `is_admin() || has_store_access(p_store_id)`; el bypass admin global (D-5 / B.1) queda documentado en las decisiones, no alterado aquí.
- R1 (registro `schema_migrations` estancado, 12 filas) sigue ABIERTO — esta migración no inserta filas al registro, consistente con las 12 existentes.
- Rollback completo disponible: `sql/20261020000002_rollback.sql` (definiciones previas capturadas VIVAS + grants restaurados).

## 6. Artefactos

- `sql/20261020000002_sec_definer_hardening.sql` — migración aplicada (hash `c39afd27…`)
- `sql/20261020000002_rollback.sql` — reversión exacta
- `f7_clasificacion_2026-10-20.json` + `clasificacion_tabla.md` — clasificación viva de todos los hallazgos
- `dryrun_resultado.json`, `apply_resultado.json` — resultados de la transacción
- `gate_antes_de_f7.txt`, `gate_despues_de_f7.txt` — salida del gate como `ci_gate_ro`
- `ci_run2_sql_db_job_antes_de_f7.log` — evidencia CI (run #2, 93+10 hallazgos)
- `postgrest_anon_despues.txt` — sondas HTTP

## 7. Re-certificación del contrato (post-hardening)

El `Security Audit` (Capa C del contract-test estático) detectó en el primer run de
este PR que el snapshot certificado (`supabase/security-contract/contract-surface.sql`)
conservaba los grants PRE-F7 → 2 violaciones `UNEXPECTED_ACL_DRIFT` (bloqueantes,
correcto comportamiento del control). Resolución conforme al proceso documentado en
el propio script ("regenerar con scripts/export-contract-surface.cjs — nunca en CI"):
superficie regenerada en sesión auditada con credenciales del propietario contra la
BD viva post-F7 (135 funciones, sha256 3f179f1a…). Diff revisado línea a línea:
eliminación de los 2 bloques e2e dropeadas, pérdida de PUBLIC en los proacl de
register_reception/reverse_receipt_v2/void_pending_reception y reordenación
alfabética — CERO divergencias inesperadas. El control queda operativo y verde sin
relajarse: sigue comparando superficie viva contra replay de migraciones.
