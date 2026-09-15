# R1 — VERIFICACIÓN FORENSE (mandato PROD/CERTIFIED RECONCILIATION)

timestamp: 2026-09-15T23:15-23:22Z · alcance: Supabase LIVE `wthkddeleylijmonclxg` (PRODUCCIÓN) · método: Management API + PostgREST, 100% read-only esta sesión

## 0. Contexto de aplicación

Las migraciones fueron aplicadas a PRODUCCIÓN en la sesión inmediatamente anterior
(22:48-22:49Z) por orden explícita del propietario, con captura PRE/POST y zero-touch
(evidencia 00-03 + FINAL-DEPLOY-REPORT de este mismo directorio, commit `eeedc5b9`).
Esta verificación NO ejecuta ninguna escritura: demuestra con evidencia fresca que
la protección existe y opera en PRODUCCIÓN.

## 1. Baseline

- HEAD = origin/main = `eeedc5b9` (hijo directo de `fa0a3b22`, solo añade
  audit-evidence/REM-INV-6R-DEPLOY/* + snapshot regenerado — cero código de aplicación,
  verificado con `git show --name-only`)
- branch: main · worktree: clean · diff / --cached: vacíos

## 2. Migraciones (inspección completa)

### 20260916000003 — materialización canónica (sin cambio de comportamiento)
Objetos: CREATE OR REPLACE `cleanup_expired_idempotency_keys()` y
`register_idempotency(text,text,uuid,text,jsonb)` (ambos plpgsql/SECDEF/search_path
{public,extensions}); REVOKE PUBLIC (+authenticated) / GRANT service_role sobre
`cleanup_old_aggregates(integer)`, `managed_delete_user(uuid)`,
`purge_old_reset_snapshots(integer)`, `validate_active_store()` y las 2 anteriores.
Tablas/columnas/índices/constraints/triggers/RLS/policies: NINGUNO.
Corrige: representación del surface (las 7 funciones rescatadas tras el bug del
detector `DELETE FROM` — divergencias Layer C: NOT_REPRESENTED, ACL replay≠LIVE,
BODY_DRIFT de register_idempotency).

### 20260916000004 — guard de autorización (ÚNICO cambio de comportamiento)
Objeto: CREATE OR REPLACE `get_batch_store_daily_kpis(uuid[], date)`
(plpgsql/STABLE/SECDEF/search_path={public}). Añade guard en body:
`IF auth.role() <> 'service_role' THEN FOREACH s IN ARRAY p_store_ids LOOP
IF NOT has_store_access(s) THEN RAISE EXCEPTION ... ERRCODE='42501'`.
Corrige: hallazgo A6 — lectura cross-tenant de KPIs (RLS bypass por SECDEF +
EXECUTE a authenticated + body sin checks, reproducido dinámicamente en staging
REM-INV-6R evidencia 11/12).

## 3. Objetivo de seguridad (FASE 3)

- Ejecución: proacl = {postgres, authenticated, service_role} — anon sin EXECUTE.
- Parámetros: `p_store_ids uuid[]`, `p_date date` — NO existe `p_user_id`
  (impersonación por parámetro estructuralmente imposible).
- Identidad: derivada de JWT vía `auth.role()`/`auth.uid()` dentro del guard y del
  helper `has_store_access` — nunca de parámetros.
- store: `p_store_ids` es externo PERO cada elemento se valida contra membresía.
- service_role: capability interna sin guard (trust boundary explícita, patrón V2.12.9).
- RLS bypass: existe (SECDEF) — compensado por el guard in-body.

## 4. Matriz de reconciliación (FASE 5/6)

| Migración      | Objeto | Estado esperado | Estado PROD (evidencia) | Resultado |
| -------------- | ------ | --------------- | ----------------------- | --------- |
| 20260916000003 | cleanup_expired_idempotency_keys() | body verbatim + ACL service_role-only | body **byte-igual** a migración; acl=postgres,service_role; secdef | **PRESENTE — EXACTO** |
| 20260916000003 | register_idempotency/5 | body verbatim (versión UPDATE) + ACL service_role-only | body **byte-igual** a migración; acl=postgres,service_role | **PRESENTE — EXACTO** |
| 20260916000003 | cleanup_old_aggregates/1 | EXECUTE solo service_role | acl={postgres,service_role}, sin PUBLIC/authenticated | **PRESENTE — EXACTO** |
| 20260916000003 | managed_delete_user/1 | EXECUTE solo service_role | acl={postgres,service_role} | **PRESENTE — EXACTO** |
| 20260916000003 | purge_old_reset_snapshots/1 | EXECUTE solo service_role | acl={postgres,service_role} | **PRESENTE — EXACTO** |
| 20260916000003 | validate_active_store() | EXECUTE solo service_role | acl={postgres,service_role} | **PRESENTE — EXACTO** |
| 20260916000004 | get_batch_store_daily_kpis/2 | body con guard (has_store_access + auth.role() + 42501), ACL autenticado preservado | body **byte-igual** a migración (guard presente); acl={postgres,authenticated,service_role}; secdef; STABLE | **PRESENTE — EXACTO** |
| (dependencia)  | has_store_access/1 | helper canónico SECDEF, identidad vía auth.uid() + EXISTS memberships | SECDEF, search_path={public,pg_temp}, acl={postgres,authenticated,service_role}, body usa auth.uid()+EXISTS(user_store_memberships), sin parámetro de identidad | **PRESENTE — EXACTO** |

## 5. Evidencia dinámica en PRODUCCIÓN (read-only)

- **Llamada no autenticada (anon vía PostgREST)** → HTTP 401
  `{"code":"42501","message":"permission denied for function
  get_batch_store_daily_kpis"}` — ejecución no autorizada BLOQUEADA.
- **service_role (capability por diseño)** → HTTP 200, 1 fila
  (store ENERVIDA `5e6fe821…`: low_stock=45, visible=85) — ruta operativa.
- Casos authenticated (cross-store, p_user_id/store_id manipulado, usuario sin
  acceso, combinaciones inconsistentes): NO ejecutables en PRODUCCIÓN sin un JWT
  real de un usuario no-miembro (crear usuarios/tiendas en PROD está prohibido).
  Cobertura por equivalencia estructural: el body de PROD es **byte-idéntico** al
  verificado en staging efímero REM-INV-6R (14/14: A6R cross-tenant → 42501;
  L4/L4R miembro legítimo → filas correctas; ACLs idénticas) + helper
  has_store_access es el mismo certificado (A2 spoof → ERR_UNAUTHORIZED,
  L2b binding dinámico). La igualdad byte-a-byte transfiere los resultados.

## 6. Tests post-aplicación (FASE 8)

- Layer A (LIVE contract): 141 verificadas, 0 violaciones, PIN REM-INV-2R OK
- Layer B (estático): 188 SECDEF-write, CONTRATO OK, mismos 9 LOW documentados
- Layer C (reconciliación): 141/141 representadas, **0 divergencias** (sin regresión)
- GET / → HTTP 200 · /api/health → status ok · PM2: 3 procesos online, 0 restarts

## 7. schema_migrations (FASE 4.E)

Top: `20260615000003, 20260615000002, 20260615000001` — el tracking quedó congelado
en junio-2026; TODO el hardening posterior (W9, REM-INV-*) se aplicó out-of-band.
Regla anti-regresión respetada: **migración no registrada ≠ migración no aplicada** —
la evidencia de aplicación es objeto-nivel (defs/ACLs byte-iguales), no el tracking.

## 8. Veredicto

```
R1 — REMEDIATED AND VERIFIED
```

(Cambio real aplicado y autorizado en la sesión anterior con protocolo PRE/POST +
verificación forense fresca de esta sesión. NO es una nueva certificación REM-INV-6R:
la certificación original fa0a3b22 permanece intacta.)
