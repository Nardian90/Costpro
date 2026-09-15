# R1 DEPLOY — 02 VERIFICACIÓN POST

timestamp: 2026-09-15T22:50-22:52Z

## Comparación PRE vs POST (deploy-r1-capture.cjs compare)

| Función | firma | def | acl | Nota |
|---|---|---|---|---|
| cleanup_expired_idempotency_keys | = | ≠ (solo CRLF→LF) | = | semántica idéntica: mismo `DELETE FROM public.idempotency_keys WHERE expires_at < now()` |
| register_idempotency | = | = | = | verbatim |
| cleanup_old_aggregates | = | = | = | verbatim |
| managed_delete_user | = | = | = | verbatim |
| purge_old_reset_snapshots | = | = | = | verbatim |
| validate_active_store | = | = | = | verbatim |
| get_batch_store_daily_kpis | = | **≠ (guard añadido)** | = | POST body: `has_store_access=true` · `auth.role()=true` |

Detalle de la única no-igualdad byte-a-byte en 000003: el body LIVE previo de
`cleanup_expired_idempotency_keys` (creada out-of-band) tenía line-endings
CRLF (0x0d 0x0a); tras aplicar la migración quedó LF, igual al stream
canónico. pg_get_functiondef PRE/POST muestran el mismo statement. El diff
unificado de Python (difflib) entre ambos defs es VACÍO a nivel de líneas.

ACL POST de `get_batch_store_daily_kpis`: `postgres=X, authenticated=X,
service_role=X` — sin cambios (legítimo dashboard preservado).

## Layer A (contract LIVE, scripts/security-contract-test.cjs)

```
Funciones SECURITY DEFINER con escritura detectadas: 141
Funciones verificadas: 141
Funciones con violaciones: 0
✅ PIN REM-INV-2R: receive_purchase(uuid) sigue ausente del catálogo
🎉 TODAS LAS FUNCIONES PASAN EL TEST DE CONTRATO
```

## Layer B/C (contract estático, scripts/security-contract-test-static.cjs)

```
── Capa C — reconciliación source-of-truth (REM-INV-6): 141 funciones
Representadas en migraciones: 141/141
Divergencias source-of-truth (bloqueantes): 0
⚠️ CONTRATO OK con 9 warning(s) MEDIUM/LOW (semántica idéntica al contract LIVE)
```

(los 9 warnings son los mismos LOW SEARCH_PATH_NOT_SET ya documentados en
REM-INV-6R — sin allowlist nueva)

## Snapshot regenerado (scripts/export-contract-surface.cjs, census read-only)

`supabase/security-contract/contract-surface.sql`: 141 funciones,
sha256=9d2e3f5378126c3c39e6c62a18e697b573a9bb9ec3c22d0976ff619ae25bb353.
Diff vs snapshot anterior: SOLO timestamp + normalización CRLF→LF de
`cleanup_expired_idempotency_keys` (6 líneas). Nota: el snapshot cubre la
superficie SECDEF-WRITE por diseño; `get_batch_store_daily_kpis` es
SECDEF-READ (STABLE, sin DML) y no figura en él (residual R2 del informe
REM-INV-6R, fase futura).

## App local (pm2)

`GET /api/health` → `{"status":"ok","service":"costpro-enterprise",…}`
post-deploy, 3 procesos online, 0 restarts.

## Comportamiento dinámico del guard

El cuerpo desplegado es byte-por-byte el mismo verificado en staging efímero
de REM-INV-6R (evidencia 11/12): A6R cross-tenant → SQLSTATE 42501
`ERR_UNAUTHORIZED_STORE`; L4/L4R miembro de las tiendas solicitadas → filas
correctas (14/14 PASS). service_role conserva su capability interna sin guard
(patrón identity-binding V2.12.9).
