# R05-APPROVAL-AND-DEPLOY — Aprobación del propietario, fusión y aplicación productiva gobernada (§11g)

**Misión:** CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 · **Fecha:** 2026-11-27
**Regla:** INV-005 (R-05, CRÍTICO en RISK-REGISTER CP-BRA-001)
**Estado resultante: R-05 IMPLEMENTADA EN PRODUCCIÓN — política activa y verificada.**

---

## 1. Autorización del propietario (misión §0.1 — literal)

**APRUEBO la alternativa A de R-05** (`DECISION-R05.md`), preparada en PR #1723:
autorización por rol de gestión para confirmar ajustes de inventario. Roles
autorizados según el modelo real de COSTPRO: **admin, manager, encargado**;
clerk y usuarios ordinarios rechazados. Compatibilidad mantenida con los
administradores de plataforma que el patrón canónico reconoce.

**NO aprobado** (y NO implementado): umbral porcentual, límite monetario,
doble aprobación, supervisor adicional, motivo obligatorio como nuevo
requisito, cambios de política de anulaciones no documentados.

Autorización expresa de **fusión del PR #1723 y aplicación de la migración
20261126170000 a producción mediante el protocolo gobernado §11g**, condicionada a:
revisión final exacta de la política + pruebas verdes + migración verificada en la aislada. Las tres condiciones se cumplieron (§2, §3, §4).

## 2. Revisión final del PR #1723 (misión §2.1) — CONFORME

Head revisado: `c67fc6069` (merge-base `7d6ee95f1`). Diff real: 19 archivos.

| Requisito §2.1 | Verificación | Resultado |
|---|---|---|
| Contiene exclusivamente la política aprobada | Revisión línea a línea de `20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql` (267 líneas): único check nuevo = `has_store_role_as(v_caller_uid, v_adj.store_id, ARRAY['admin','manager','encargado'])`; sin umbrales/doble aprobación/motivo | ✅ |
| `has_store_role_as` (sin funciones paralelas) | Reutiliza migración 20260807000002 (STABLE SECURITY DEFINER); espejo exacto de `canManageStore` (src/lib/roles.ts) y `can_admin_reverse_transaction` | ✅ |
| Protección server-side | Guard DENTRO del RPC SECURITY DEFINER (última barrera); UI alineada pero no es el control | ✅ |
| No confía en rol enviado por cliente | Firma `(uuid, uuid)` sin parámetro de rol; el rol se lee de `user_store_memberships` vivo en BD | ✅ |
| Usa el actor autenticado | `v_caller_uid := auth.uid()` (rama service_role: `COALESCE(p_user_id, auth.uid())` verbatim, con el check de rol aplicado AL usuario indicado) | ✅ |
| Miembro de otra tienda rechazado | Membresía acotada por `v_adj.store_id` (batería E2E caso 6 PASS) | ✅ |
| Validación de tienda y actor | `ERR_UNAUTHENTICATED` conservado + guard por tienda | ✅ |
| Auditoría transaccional `ADJUSTMENT_CONFIRMED` | INSERT en `audit_logs` DENTRO de la misma transacción: tienda, actor, record_id, old_data/new_data (status, items_applied, items con desviación por ítem, origen PI, motivo kardex) | ✅ |
| Error de auditoría no confirma silenciosamente | Fallo del INSERT revierte TODA la confirmación (stock, estado y kardex) | ✅ |
| Rechazados no modifican kardex | El guard precede a TODO write (batería E2E casos 4/5/6: stock/kardex/audit intactos) | ✅ |
| No doble ejecución con stock duplicado | `ERR_NOT_PENDING` + `FOR UPDATE` (batería E2E casos 11/12 PASS) | ✅ |
| Interfaz alineada en las 3 vistas | `InventoryAdjustmentsView.tsx` (tarjetas + tabla vía `canConfirmAdj`) y `PhysicalInventoryDetail.tsx` (panel PI `canConfirm={canAuthorize}`); estados deshabilitados con mensaje accionable; mapeo de `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED` | ✅ |
| Superadmin de plataforma preservado | Bypass `profiles.role IN (admin, superadmin)` dentro de `has_store_role_as` (comportamiento canónico, sin cambios) | ✅ |
| `ci-gate-allowlist.json` sin ampliación de alcance | Comparación semántica JSON viejo→nuevo: ÚNICO cambio = entrada `source_of_truth_baseline confirm_inventory_adjustment/2` (BODY_DRIFT_FROM_MIGRATION, expira 2026-12-31) + nota `_updated`; el resto reformateo cosmético sin cambio de datos | ✅ |
| Pruebas | CI 9/9 success en el head (incl. E2E Aislado); local: contrato de migración 15/15, coherencia UI↔RPC 5/5, replay 7/7; batería de autorización E2E 16/16 en CostproE2E (misión anterior) | ✅ |
| Documentación CP-BRA-001 | BUSINESS-RULES-CATALOG (INV-005), RISK-REGISTER (R-05), TRACEABILITY-MATRIX (TR-INV-005), DOMAIN-INVARIANTS, expediente Línea A (INFORME/R05-IMPLEMENTATION/R05-TEST-EVIDENCE) | ✅ |

**Sin ampliación de alcance ni defecto de seguridad** → condición de fusión cumplida.

## 3. Fusión (misión §2.2)

| Paso | Resultado |
|---|---|
| HEAD SHA confirmado | head del PR `c67fc6069` (re-verificado en el momento de la fusión vía API) |
| Checks verificados | 9/9 check-runs `success` + status Vercel `success`; `mergeable_state=clean` |
| Fusión | **PR #1723 MERGED** — merge commit **`819c0adca97a0023248ff0a44153f15e5e113d2c`** (2026-11-27) |
| main actualizado | local ff a `819c0adca`; árbol limpio; sin reversión del PR #1722 (0 archivos compartidos) |
| Tests post-merge | contrato de migración 15/15 + coherencia UI↔RPC 5/5 + replay 7/7 (27/27); ci-gate business-rules PASS; CHECK-WRITERS OK; suite Vitest completa en ejecución post-fusión (ver §6) |

## 4. Aplicación productiva gobernada (misión §2.3 — protocolo §11g)

### 4.1 Comprobaciones previas (todas conformes, solo lectura)

| Comprobación | Evidencia |
|---|---|
| Contenido y SHA del archivo versionado | sha256(`20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql`) = `5f5fe8a87ab0ea7e9e46b99dc093e3c44b7b31dd5fe127ea71664b0bef56e37a` — idéntico al `e2e-migrations-manifest.json` y a la versión aplicada en la aislada |
| Marcadores de aplicación en producción | `guard_r05_ya=false` — NO aplicada (no se repitió nada) |
| Cuerpo vigente del RPC | body_hash PRE = `192e59ea6e8fa673bc970e24ea134f3b` (cuerpo 20261027030000 con el hueco `has_store_access_as` — defecto vigente) |
| Contrato de superficie SECURITY DEFINER | `prosecdef=true`, `search_path=public`, firma `p_adjustment_id uuid, p_user_id uuid` |
| Permisos y grants | ACL PRE = `authenticated, postgres, service_role` (certificada) |
| Funciones auxiliares | `has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[])` existe (count=1) |
| Drift inesperado | Ninguno: 0 divergencias en `security-contract-test-static.cjs` |

### 4.2 Aplicación (una sola vez)

- **Script gobernado:** `scripts/cpbra-r05-apply-prod.mjs` (patrón `cpbra-apply-migration-prod.mjs`: guard `assert-not-production` + doble flag `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`, marcas idempotentes, `--check` re-ejecutable).
- **Ejecución:** SQL ejecutado sin error · `NOTIFY pgrst, 'reload schema'` (mecanismo canónico) · **11/11 marcas POST OK**.
- **body_hash POST = `26657592d2e4e846991d71166a48eb90`** — IDÉNTICO al hash verificado en CostproE2E tras su aplicación (misión anterior): producción y aislada tienen exactamente el mismo cuerpo, sin drift.
- Fecha de aplicación en producción: **2026-11-27** (sesión CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001). Evidencia: `scripts/r05-prod-apply-evidence.log` (copia en expediente).

### 4.3 Verificación productiva (misión §2.4 — solo lectura, sin movimientos artificiales)

| Verificación | Resultado |
|---|---|
| Estados de ajustes | 1 `confirmed` (histórico), 0 `pending` — el deploy no interrumpe ninguna operación en curso |
| Auditoría `ADJUSTMENT_CONFIRMED` | 0 filas (nadie confirmó tras el deploy — expected) |
| Constraint de `audit_logs` | `audit_logs_store_id_check` compatible: el INSERT del RPC siempre lleva `store_id` del ajuste |
| Historial / compatibilidad | Única confirmación histórica (2026-10-26) hecha por rol **encargado** → pasa la política nueva (caso histórico compatible) |
| ACL final | `authenticated, postgres, service_role` |
| Kardex | 77 movimientos `adjustment` — invariante intacto (el deploy no genera movimientos) |
| Prueba funcional completa | Ejecutada en CostproE2E: batería de autorización 16/16 PASS (misión anterior) — producción NO se usa como banco de pruebas |

### 4.4 Re-certificación del contrato de superficie

- `contract-surface.sql` re-exportado desde producción LIVE: **233 funciones**, sha256 `dd68efe640540ae7a11250f6b0988f30b9f77c88b9bd6e95e9f8b549f56b607e`; el guard R-05 presente en el snapshot.
- Entrada `source_of_truth_baseline confirm_inventory_adjustment/2` **RETIRADA** de `ci-gate-allowlist.json` (drift LIVE-vs-replay resuelto: LIVE = migración = replay).
- `security-contract-test-static.cjs`: 0 divergencias bloqueantes (3 warnings MEDIUM/LOW preexistentes, ajenos a R-05: cancel_transfer, create_received_service_v2, reset_store_data).
- Writers manifest actualizado: `cpbra-r05-apply-prod.mjs` → guardProtected; `cpbra-r05-prod-verify.mjs` → excepción read-only. CHECK-WRITERS OK (304 escritores).

## 5. Límites y riesgos residuales

- Los RIESGOS que la política NO cubre (decisión reservada al propietario, incremento 2 de la opción C): abuso de un encargado autorizado con desviación pequeña — sin umbral ni doble autorización no hay segunda línea de revisión; la auditoría ADJUSTMENT_CONFIRMED hace la operación TRAZABLE, no impide el abuso.
- La migración no tiene DOWN automatizado (política del repo: reversión exige expediente); el guard R05-GUARD garantiza que un DOWN manual opere sobre la firma correcta.
- `p_user_id` sigue existiendo para la rama service_role (conservado verbatim); ningún llamador interno server-side del RPC existe hoy (verificado en la misión anterior).

## 6. Registro de ejecución post-fusión (actualizable)

| Batería | Resultado |
|---|---|
| Contrato de migración (Vitest estático) | 15/15 PASS |
| Coherencia UI↔RPC | 5/5 PASS |
| Replay manifest (218→219, posición 219) | 7/7 PASS |
| ci-gate-business-rules | GATE PASS |
| check-writers | OK (304 detectados, 492 archivos) |
| security-contract-test-static | OK, 0 divergencias bloqueantes |
| Vitest completo post-fusión | (ver INFORME.md §finales de la misión) |
