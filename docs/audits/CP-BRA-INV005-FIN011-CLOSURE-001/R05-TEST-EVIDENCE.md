# R05-TEST-EVIDENCE — Evidencia de pruebas de la Línea A (R-05 / INV-005)

**Misión:** CP-BRA-INV005-FIN011-CLOSURE-001 · **Fecha:** 2026-11-26
**Rama:** `fix/inventory-adjustment-role-guard-20261126` · **PR:** abierto, NO fusionado
**Instancia de validación:** Supabase aislado **CostproE2E** (ref `lguovmvrozxgssupkwpf`, centinela `e2e_is_isolated_db() = true` verificado con `verify-remote-e2e.mjs`). **Producción NO tocada.**

---

## 1. Pruebas estáticas de contrato de migración (Vitest)

Archivo: `src/__tests__/migrations/cpbra-r05-adjustment-confirmation-migration.test.ts` — **15/15 PASS**.

| # | Aserción | Resultado |
|---|---|---|
| 1 | Migración transaccional (BEGIN/COMMIT) y firma certificada `(uuid, uuid)` preservada | PASS |
| 2 | Guard usa `has_store_role_as` con roles EXACTOS `{admin,manager,encargado}` acotado a `v_adj.store_id` | PASS |
| 3 | Error fail-closed `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED` | PASS |
| 4 | Hueco previo ELIMINADO del código (sin `has_store_access_as` ni `is_admin_check` en el cuerpo) | PASS |
| 5 | `ERR_UNAUTHENTICATED` conservado | PASS |
| 6 | Máquina de estados intacta (`ERR_ADJUSTMENT_NOT_FOUND`, `ERR_NOT_PENDING`, `FOR UPDATE`) | PASS |
| 7 | Auditoría transaccional `ADJUSTMENT_CONFIRMED` DENTRO del cuerpo (tienda, actor, record_id, items con desviación, origen PI) | PASS |
| 8 | Orden: auditoría DESPUÉS de stock y cambio de estado (resultado reconstruible) | PASS |
| 9 | Kardex invariante (`movement_type='adjustment'`, `p_unit_cost := 0`, desviación sin cambios) | PASS |
| 10 | Sin umbrales ni motivo obligatorio (alcance alternativa A — firma sin `p_reason`/`p_threshold`/`p_supervisor`) | PASS |
| 11 | ACL certificada preservada (REVOKE PUBLIC/anon; GRANT authenticated, service_role) | PASS |
| 12 | Rama `service_role` conservada verbatim | PASS |
| 13 | Guards de aplicación fail-closed (`R05-GUARD` firma; `R05-VERIFY` exige guard y detecta persistencia del hueco SIN contar comentarios) | PASS |
| 14 | Sin secretos en el SQL (patrones de detección construidos por partes) | PASS |
| 15 | Drift LIVE-vs-replay declarado en `ci-gate-allowlist.json` (`source_of_truth_baseline`, expira 2026-12-31) | PASS |

Archivo: `src/__tests__/r05-ui-rpc-coherence.test.ts` (caso 14 de la misión §2.6) — **5/5 PASS**:
gate `canConfirmAdj` con la función canónica en ambas vistas; `canConfirm={canAuthorize}` en el panel PI; mapeo de error accionable en ambos llamadores; conjunto de roles frontend = espejo EXACTO del guard server-side; consulta sin confirmar preservada (botón deshabilitado visible, Anular/Revertir sin cambio de política).

## 2. Batería E2E de autorización (BD aislada)

Script: `scripts/e2e/cpbra-r05-authorization-battery-e2e.mjs` (guard `assert-isolated-db`).
Resultado: **16/16 PASS · 0 FAIL · limpieza baseline restaurado · exit=0.**
Re-ejecutable (idempotente); fixture efímero `R05-QA-<ts>`: tiendas A/B, producto con fila `inventory`, 6 usuarios `e2e-r05-*@costpro.test`, 8 ajustes pendientes.

| Caso (misión §2.6) | Resultado | Observación |
|---|---|---|
| 1. Admin de plataforma confirma | **PASS** | + auditoría transaccional presente |
| 2. Manager (membresía) confirma | **PASS** | |
| 3. Encargado (membresía) confirma | **PASS** | |
| 4. Clerk rechazado | **PASS** | `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED`; stock/kardex/audit intactos; sigue `pending` |
| 5. Usuario ordinario rechazado | **PASS** | mismo código; sin efectos |
| 6. Usuario de OTRA tienda rechazado | **PASS** | aislamiento por tienda |
| 7. Sin sesión (anon) rechazado | **PASS** | `permission denied for function confirm_inventory_adjustment` (EXECUTE revocado a anon) |
| 8. Manipulación de actor (`p_user_id`=encargado desde clerk) | **PASS** | `v_caller_uid=auth.uid()` — spoofing ignorado |
| 9. Rol vivo: clerk promovido a encargado en BD | **PASS** | el servidor lee la membresía real, no claims |
| 10. Ajuste inexistente | **PASS** | `ERR_ADJUSTMENT_NOT_FOUND` |
| 11. Ajuste ya confirmado | **PASS** | `ERR_NOT_PENDING` |
| 12. Reintento tras éxito | **PASS** | `ERR_NOT_PENDING` (idempotencia de estado) |
| 13. Fallo del mecanismo de autorización | **PASS** | RENAME temporal de `has_store_role_as` → rechazo seguro SIN estado parcial; restaurada → confirma |
| Integridad stock/kardex | **PASS** | 5 confirmaciones × 1 ítem = **5** movimientos de kardex (exacto, sin duplicados) |
| Integridad auditoría | **PASS** | exactamente **1** fila `ADJUSTMENT_CONFIRMED` por confirmación |
| Limpieza | **PASS** | stores=0, usuarios=0, triggers reactivados, baseline restaurado |

## 3. Validación de migración en aislado (aplicación gobernada)

Script: `scripts/e2e/cpbra-r05-apply-e2e.mjs` (Management API + guard aislamiento + PRE/POST).
- PRE: `usa_hueco_previo=true`, `usa_guard_r05=false` (hash `192e59ea…`).
- Aplicación: HTTP 201; el guard de verificación interno (R05-VERIFY) abortó la PRIMERA corrida por falso positivo de comentarios — rollback atómico verificado (PRE sin cambios), defecto de la verificación corregido (comparación sin comentarios) y re-aplicada.
- POST: `guard_r05=true`, `auditoria_r05=true`, `usa_hueco_previo_codigo=false`, ACL `authenticated,postgres,service_role` intacta.
- NOTA: la migración vive SOLO en la instancia aislada. **NO aplicada a producción** (decisión reservada).

## 4. Contratos del repo (locales, pre-PR)

| Puerta | Resultado |
|---|---|
| `security-contract-test-static.cjs` (Capas A/B/C) | **CONTRATO OK** — 0 divergencias bloqueantes; 3 warnings MEDIUM/LOW preexistentes (firmas históricas) |
| `check-writers.mjs` (writers manifest) | **OK** — 300 escritores declarados |
| `ci-gate-business-rules.js` (modo estático) | **GATE PASS** — 36 críticas, 7 dominios |
| Lint de los 3 archivos tocados | 0 errores (38 warnings preexistentes de estilo) |

## 5. Clasificación de fallos durante la preparación (transparencia)

| Incidente | Clasificación | Resolución |
|---|---|---|
| R05-VERIFY abortó la 1ª aplicación (LIKE pegaba en comentario histórico del cuerpo) | Defecto de test/verificación | Comparación con `regexp_replace(...,'--[^\n]*','','g')`; rollback atómico probado de paso |
| Batería v1: `ERR_INSUFFICIENT_STOCK` en confirmaciones | Defecto de fixture | El guard de kardex valida contra `inventory` (no `products.stock_current`); fixture crea fila `inventory` |
| Batería v1: DROP de `has_store_role_as` imposible | Restricción real del esquema | RLS policies dependen de la función → simulación con RENAME temporal (equivalente, no destructivo) |
| Teardown v1: FK `stock_movements`→products y triggers de auditoría autorreferenciales | Defecto de fixture | Orden de borrado kardex→inventory→product; triggers de auditoría desactivados/reactivados con verificación |
| 12 usuarios residuales de corridas v1 (emails fuera del patrón oficial) | Defecto de fixture | Renombrados al patrón `e2e-*@costpro.test` y eliminados vía RPC oficial `e2e_hard_delete_user` (12/12 OK) |

## 6. Cobertura residual (honestidad de evidencia)

- La batería cubre el RPC y los datos; la **coherencia visual en navegador** (E2E de UI con Playwright) no se ejecutó para esta línea — la alineación UI está probada estáticamente (caso 14) y la política autoritativa vive en el servidor, que es el control exigido.
- El flujo completo de inventario físico (PI → ajuste → confirmación) no se recorrió E2E en esta batería; su lógica interna es VERBATIM de la versión certificada (solo cambió la autorización previa). Regresión cubierta por las pruebas existentes del módulo PI.
- **La migración NO está en main ni en producción**: la regla INV-005 sigue FALTA en ambos hasta aprobación del propietario.
