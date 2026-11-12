# APLICACIÓN EN PRODUCCIÓN — 20261112180000 (Nóminas de Salario SC-4-06, Res. 13/2007 MFP)

**Fecha:** 2026-11-12 · **Autorizada por:** regla de oro productiva del propietario (protocolo 11g:
validar primero en el aislado — `verify-nominas-pg.mjs` 54/54 + `verify-nominas-api.mjs` 39/39 +
`data-hygiene-guard` PASS — y aplicar en producción UNA SOLA VEZ, documentado en este expediente).
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (patrón
`scripts/m002-aplicar-migracion-PRODUCCION.mjs` / `scripts/m012-aplicar-migracion-20261112120000.mjs`),
doble flag del guard CP-INFRA-019 (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`), lote único, sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.
**Script versionado:** `scripts/m013-aplicar-migracion-20261112180000.mjs` (declarado en
`scripts/lib/writers.manifest.json`, guardProtected).
**Evidencia completa:** `docs/audits/NOMINAS-SC406-20261112/m013-verificacion-produccion.txt`.

---

## 1. Migración aplicada — `20261112180000_cp_payrolls_sc406.sql`

- **SHA-256 del archivo:** `4255a3ad3b8cbde3c32b14f54c92ad3e82f0037046b092e4bbec6e3f12795096`
  (idéntico al aplicado y verificado en la BD aislada por `verify-nominas-pg.mjs`, 54/54).
- **Contenido (Nóminas SC-4-06 completo):**
  1. Perfil laboral en `workers` (`expediente_laboral`, `categoria_ocupacional`, `cargo`, `area_trabajo`,
     `ALTER … IF NOT EXISTS` — sin cambios de datos).
  2. Tabla `worker_salary_rates` (tarifa horaria/diaria con historial de vigencia, cierre automático,
     `ERR_RATE_OVERLAP`), RLS FORCED + política de aislamiento por tienda.
  3. Tablas documentales `payrolls` (estado draft/confirmed/paid/voided, `unique(store_id, numero)`,
     snapshot de entidad/moneda) + `payroll_items` (snapshot de identidad + tarifa por línea) +
     `payroll_item_concepts` (sigla, clase, importe), RLS FORCED + aislamiento por tienda.
  4. Numeración `NOM-NNNNNN-AAAA` vía `next_document_number` con el tipo `payroll`.
  5. 7 RPC SECURITY DEFINER (patrón sec_definer_hardening, anti-spoofing V2.12.9, `SET search_path`
     explícito, `has_store_access_as`, advisory lock, `validate_operation_date`, totales SIEMPRE del
     servidor, idempotencia por clave): `set_worker_salary_rate`, `create_payroll`, `update_payroll`,
     `confirm_payroll`, `account_payroll`, `mark_payroll_paid`, `void_payroll`.
  6. ACLs: EXECUTE para `authenticated` + `service_role` en las RPCs gobernadas (la autorización vive
     DENTRO por `has_store_access_as`, verificado con `ERR_UNAUTHORIZED` para usuarios ajenos), REVOKE
     de `anon`/PUBLIC; el helper interno `fn_payroll_validate_items` solo `service_role`.
  7. Guard fail-closed `CP-PAYROLLS-SC406-GUARD` (DO, ejecutado en la misma tanda).
- **Dependencias verificadas ANTES (read-only):** `has_store_access_as`, `document_sequences` (con
  `document_type`), `audit_logs`, `idempotency_registry`, `workers` — todas presentes.

### Estado ANTES (read-only, evidencia)

- Tablas de nómina: 0 de 4 (migración PENDIENTE — aplicación única, sin duplicar; verificación 11f).
- `next_document_number`: rama `payroll` ausente (8 tipos documentales conocidos).

### Aplicación

- HTTP **201** (Management API), resultado `[]` (solo DDL + políticas + RPCs + guard DO).
- `NOTIFY pgrst, 'reload schema'` → HTTP **201** (procedimiento oficial post-DDL).
- Aplicación única, idempotente por diseño (`IF NOT EXISTS` / `CREATE OR REPLACE` /
  `DROP POLICY … IF EXISTS` + re-GRANT/REVOKE).

### Verificación POST (read-only, fail-closed) — 8/8 ✓

1. 4 tablas nuevas presentes (`payrolls`, `payroll_items`, `payroll_item_concepts`, `worker_salary_rates`).
2. Perfil laboral en `workers` (4 columnas).
3. RLS FORCED en las 4 tablas (relrowsecurity + relforcerowsecurity).
4. 4 políticas de aislamiento por tienda (`*_store_isolation`).
5. 7 RPCs SECURITY DEFINER presentes.
6. Numeración `NOM` (rama `payroll` en `next_document_number`, 9 tipos documentales).
7. ACL `create_payroll`: `authenticated` + `service_role` (autorización interna), SIN `anon`/PUBLIC.
8. Delta 0 en tablas preexistentes (`workers`, `stores`, `tenants`, `user_store_memberships`,
   `document_sequences`, `audit_logs`, `idempotency_registry`) — cero escrituras de datos.

### Pruebas negativas (CERO escrituras) — 4/4 ✓

- `create_payroll` canal Management API (postgres) sin usuario real → **ERR_UNAUTHORIZED**
  (guard anti-spoofing: ni el superusuario del canal puede confeccionar con usuario espurio).
- `confirm_payroll` id inexistente → **ERR_PAYROLL_NOT_FOUND**.
- `void_payroll` id inexistente → **ERR_PAYROLL_NOT_FOUND**.
- `set_worker_salary_rate` trabajador inexistente → **ERR_WORKER_NOT_FOUND**.

---

## 2. Gates tras la aplicación

- `security-contract-test.cjs`: **197/197 funciones SECURITY DEFINER, 0 violaciones** (incluye las
  7 RPCs nuevas; evidencia `docs/audits/NOMINAS-SC406-20261112/security-contract-197de197.txt`).
- `contract-surface.sql` regenerado: 197 funciones, sha256
  `1e9884cdcbe34ce25848a5e2f854d03e534a85d02ab76766107b7d3ee3949c83`.
- `ci-gate-evaluate.js` (SQL gate): TODO PASS — 3 checks, 0 hallazgos fuera de allowlist
  (las RPCs de nómina pasan NATIVAMENTE: llevan auth check; no requieren excepciones).
- `check-writers.mjs`: OK (132 escritores; `m013` guardProtected, `verify-nominas-api.mjs`
  isolationProtected).

## 3. Reanudación (protocolo 11f)

La migración YA ESTÁ APLICADA Y VERIFICADA en producción. Para re-verificar sin volver a aplicar:
`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND bun scripts/m013-aplicar-migracion-20261112180000.mjs --only-verify`
(re-ejecutable, read-only, detecta «YA APLICADA» y salta la fase de escritura).
