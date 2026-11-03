# CP-SEC-026 — Evidencia de auditoría de membresías (T1)

Fecha de medición: 2026-11-03. Mecanismo: SQL vía Supabase Management API
(producción SOLO lectura; CostproE2E lecturas + aplicación de migración y pruebas,
tras el guard `e2e_is_isolated_db() = true`). Sin secretos ni PII.

## 1. Estado previo revalidado (producción, solo lectura)

| Dato | Valor medido 2026-11-03 | Nota |
|---|---|---|
| Filas en `user_store_memberships` | 10 | La misión reportaba 7 en su evidencia previa; al revalidar hay 10 (cambió durante el día). No altera el diseño del trigger. [MEDIDO] |
| Eventos de membresías en `audit_logs` | 0 (`action ILIKE '%membership%'`) | Confirma el problema: nadie registraba altas/cambios/bajas. [MEDIDO] |
| Esquema `audit_logs` | 12 columnas: id, created_at, user_id, table_name, record_id, action, old_data, new_data, metadata, updated_at, store_id, trace_id | Leído de producción antes de diseñar (D1.3). [MEDIDO] |
| Esquema `user_store_memberships` | id, user_id, store_id, role (enum user_role), status (enum membership_status), created_at, updated_at | [MEDIDO] |
| `membership_status` | {active, revoked} | El borrado lógico es UPDATE status→'revoked'. [MEDIDO] |
| Grants `audit_logs` | anon/authenticated: INSERT+SELECT+REFERENCES+TRIGGER (SIN UPDATE/DELETE/TRUNCATE — REVOKE de commit e2e2a19 vivo); service_role/postgres: CRUD+TRUNCATE | [MEDIDO] |
| FORCE RLS `audit_logs` | false (dueño postgres) | Permite definer sin bloquear el camino normal. [MEDIDO] |
| Policies RLS `audit_logs` | 5 (2 SELECT, 1 INSERT authenticated con WITH CHECK user_id = auth.uid(), 2 para costpro_transaction_adjuster) | La policy INSERT exige user_id = auth.uid() → en service_role/SQL directo el actor es NULL → por eso el trigger usa SECURITY DEFINER (D1.5: imprescindible). [MEDIDO] |
| Triggers `audit_logs` | trg_set_audit_log_trace_id (BEFORE INSERT), update_audit_logs_updated_at (BEFORE UPDATE) | No escriben en membresías → sin recursión (D1.5). [MEDIDO] |
| Triggers `user_store_memberships` previos | trg_membership_tenant_consistency (BEFORE), update_user_store_memberships_updated_at (BEFORE) | No auditaban. [MEDIDO] |
| FKs de `user_store_memberships` | 3, todas ON DELETE CASCADE (profiles, stores, auth.users vía profiles) | Los borrados en cascada disparan el trigger de DELETE (D1.6). [MEDIDO] |
| RPC de membresías | manage_user_memberships(uuid,jsonb) — DELETE+INSERT/UPSERT; managed_update_membership(uuid,user_role,text,uuid) — UPDATE (revoca lógico con status); managed_revoke_membership(uuid,uuid) — UPDATE status='revoked' | Leídas de producción (patrón anti-spoofing v_caller_uid, FIX H-7). [MEDIDO] |

## 2. Aplicación en CostproE2E (autorizada por la misión)

- Guard previo: `SELECT public.e2e_is_isolated_db()` → `true` (script de aplicación
  lo exige de forma fail-closed antes de tocar la BD).
- Migración aplicada: `supabase/migrations/20261103000001_cp_sec_026_membership_audit_trigger.sql`
- Mecanismo: `POST /v1/projects/<ref-e2e>/database/query` (Management API), guard de
  aislamiento en el script `scripts/agent/mgmt-apply.cjs` (repositorio de sesión).
- Fecha: 2026-11-03.
- Resultado: statements ejecutados sin error; re-aplicación posterior sin error
  (idempotencia verificada en vivo: CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

## 3. Verificación post-aplicación (catálogo, CostproE2E)

```
SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger
WHERE tgrelid='public.user_store_memberships'::regclass
  AND tgname='trg_sec026_membership_audit';
→ CREATE TRIGGER trg_sec026_membership_audit AFTER INSERT OR DELETE OR UPDATE
  ON public.user_store_memberships FOR EACH ROW
  EXECUTE FUNCTION sec026_membership_audit_fn()
```

## 4. Pruebas de contrato (T1.2) — supabase/tests/membership_audit_test.sql

Ejecución en CostproE2E (transaccional, termina en ROLLBACK — cero residuos):

```
node scripts/agent/mgmt-run-sql-test.cjs supabase/tests/membership_audit_test.sql
→ OK: suite completa sin excepciones
```

Cobertura (11 escenarios, todos en verde):
1. INSERT → exactamente 1 evento `membership_grant` con actor, store_id,
   actor_kind=authenticated, new_data.status=active y metadata.target_user_id.
2. UPDATE con cambio de rol → 1 `membership_update` con changed_fields.role.
3. UPDATE sin cambio real → 0 eventos nuevos.
4. UPDATE status→'revoked' → 1 `membership_revoke` (borrado lógico) con estado previo.
5. DELETE real → 1 `membership_revoke` con old_data de la fila eliminada.
6. INSERT/UPDATE/DELETE en `products` → 0 eventos de membresías.
7. Actor service_role (claims) → user_id NULL + metadata.actor_kind='service_role'.
8. Actor SQL directo (sin JWT) → metadata.actor_kind='sql_directo' + db_role registrado.
9. Fallo forzado del INSERT de auditoría (trigger de prueba en audit_logs) → el alta
   de membresía FALLA (fail-closed D1.4); retirado el fallo, el camino normal audita.
10. Vía RPC `manage_user_memberships` (admin autenticado) → grant auditado.
11. Limpieza de usuario vía `e2e_hard_delete_user` → revoke de sus membresías con rastro
    del usuario destino (D1.6).

## 5. CI gate y contract tests (T1.3)

- `node scripts/security-contract-test-static.cjs` →
  `CONTRATO OK con 2 warning(s) MEDIUM/LOW (semántica idéntica al contract LIVE)` —
  0 bloqueantes con la migración nueva presente (Capa A: 175 funciones del surface
  representadas 175/175; Capa B verifica la nueva función sin hallazgos; las funciones
  disparadoras ya están excluidas de los checks 1 y 2 del gate con nota CP-ORG-001 c5).
- Gate SQL EN VIVO contra CostproE2E (con la función ya desplegada):
  `scripts/ci-gate-checks.sql` → 1 fila: `__canary__|checks_completed` →
  **0 hallazgos** en secdef_no_auth / secdef_public_grant / tables_no_rls.
- `ci-gate-allowlist.json` NO se modificó (regla 7): la función del trigger no requiere
  entrada (el check secdef_no_auth excluye funciones disparadoras y su cuerpo contiene
  auth.uid()).
- Manifiesto del replay E2E: la migración nueva entra al tramo (fecha > 20260828).
  `node scripts/e2e/build-migrations-replay.mjs` regenerado → total_incluidos 118 → 119;
  expectativa del test de replay actualizada con la anotación histórica (+1 CP-SEC-026),
  práctica establecida en misiones previas. Test `replay-unblock-create-sale-v2` 7/7 verde.

## 6. Batería local del PR (regla 8)

| Chequeo | Resultado | Nota |
|---|---|---|
| `tsc --noEmit` | NO EJECUTADO LOCALMENTE — OOM kill (exit 137) con --max-old-space-size=6144 y 3000; el sandbox tiene 4 GB | El PR no toca código TypeScript (2 archivos SQL + docs + 1 test de replay + manifiesto). La verificación oficial corre en el CI del PR (job TypeCheck). Limitación declarada, no oculta. |
| `eslint .` | exit 0 — 0 errores, 1426 warnings (preexistentes en main) | [MEDIDO] |
| `vitest run --no-file-parallelism` (suite completa) | exit 0 — 352 archivos, 5010 tests passed, 66 skipped, 0 fallos | [MEDIDO] |

## 7. Estado de la compuerta T1 (producción)

- La frase `AUTORIZO SEC-026 PROD` NO fue emitida en esta sesión → CERO escrituras en
  producción. La aplicación en producción queda PENDIENTE DE COMPUERTA, con:
  - Migración probada e idempotente, idéntica a la aplicada en CostproE2E.
  - Rollback listo (documentado en la migración y en docs/audits/SEC-026_AUDITORIA_MEMBRESIAS.md).
  - Estado previo medido: 10 membresías, 0 eventos (regla 11: registrar fecha, mecanismo,
    resultado y comprobación posterior cuando se ejecute la compuerta).
