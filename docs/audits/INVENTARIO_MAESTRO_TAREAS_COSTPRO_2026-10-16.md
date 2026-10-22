# INVENTARIO MAESTRO DE TAREAS — COSTPRO 4 MULTITIENDA

**Fecha de auditoría:** 2026-10-16
**Tipo de misión:** MISIÓN 1 — Auditoría global READ-ONLY (sin correcciones, sin escrituras de datos)
**Repositorio:** `Nardian90/Costpro` — clon local `/home/z/my-project/costpro-app/Costpro`
**Rama auditada:** `main` · **Commit de referencia (HEAD):** `13762b31f9a3e784b3e01c4b3a8b30006c03abb2` (2026-10-16, merge PR #1414 `feat/pos-transf-exterior`)
**Estado del working tree al inicio:** limpio (0 cambios locales). Esta auditoría solo AÑADE documentos en `docs/audits/`; no modifica código, migraciones, configuración ni datos.
**Entorno de referencia:** producción = https://costpro4.vercel.app (no se escribió); local = clon en modo dev con PM2 (reconstruido en esta misión, sin datos de negocio).

---

## 0. METODOLOGÍA Y REGLAS DE CONTABILIZACIÓN

**Fuentes recorridas (FASE 2):**
- `docs/audits/` — 39 documentos (.md/.txt/.json), incluidos los 4 de más de 40 KB por secciones.
- Documentos de primer nivel: 30 en `docs/*.md`, 3 en la raíz del repo (`DIAGNOSTICO_VALES_SALIDA.md`, `E2E-COVERAGE-REPORT.md`, `README.md`), `docs/quality/`, `docs/evaluations/`, `docs/automation/`, `knowledge/help/…/08-seccion-en-desarrollo.md`, `agent-ctx/*.md`.
- Código: `src/` (API routes, hooks, componentes, lib), `supabase/migrations/` (465 migraciones SQL, 2024-01 → 2026-10-15), `e2e/`, `tests/`, `.github/workflows/`, `scripts/` (censo + lectura dirigida), `ecosystem.config.js`, `next.config.ts`, `vercel.json`, `.npmrc`.
- Git: últimos 60 commits de `main` (2026-10-12 → 2026-10-16) + commits clave citados por los informes.

**Verificación (FASE 3):** cada tarea relevante se contrastó con el código actual mediante lectura directa y greps dirigidos. Los resultados de verificación directa están marcados como `[VERIFICADO HOY]` en las fichas. El resto de estados se apoya en evidencia documental + evidencia de código leída por los análisis de exploración.

**Reglas de contabilización:**
1. Los duplicados inter-documentales **se consolidaron en una única tarea** (p. ej. `f854`/`f873` aparecen en 4 informes y se cuentan una sola vez en CP-RES-006). Las referencias cruzadas se conservan en cada ficha.
2. No se cuentan como tareas las notas puramente históricas sin acción posible (se clasifican OBSOLETA O REEMPLAZADA con justificación).
3. «Implementado en el repositorio» ≠ «desplegado» ≠ «verificado funcionalmente en producción»: cuando no hubo verificación funcional, el estado lo refleja (RESUELTA con nota, o NO VERIFICABLE).
4. Esta auditoría **no ejecutó ninguna escritura** contra Supabase/producción: toda la evidencia de BD es documental o de migraciones en el repo.

**Leyenda de evidencia:** `[DOC]` documental · `[CÓD]` código actual · `[TEST]` pruebas · `[BD]` migraciones/BD · `[DEPLOY]` entorno desplegado (solo informes, no comprobado aquí).

---

## 1. RESUMEN DE ESTADOS (totales coherentes con la tabla y las fichas)

> **ACTUALIZACIÓN MISIÓN 2 (2026-10-17):** CP-POS-003, CP-POS-007, CP-CAT-004 y CP-SEC-019 pasan a PENDIENTE DE VERIFICACIÓN (corrección implementada + tests de regresión + suite completa 3170/3170 + tsc 0 errores; falta verificación funcional en entorno desplegado). CP-SEC-012 pasa a PARCIALMENTE RESUELTA (BUG-013/017/022 verificados CORREGIDOS con evidencia pasiva local 401; BUG-024 sigue abierto).

| Estado | Cantidad |
|---|---|
| PENDIENTE CONFIRMADA | **60** |
| PARCIALMENTE RESUELTA | **10** |
| PENDIENTE DE VERIFICACIÓN | **4** |
| RESUELTA VERIFICADA | **21** |
| NO VERIFICABLE | **3** |
| NO REPRODUCIDA | 0 |
| OBSOLETA O REEMPLAZADA | **3** |
| DUPLICADA | 0 (consolidadas; ver regla 1) |
| **TOTAL TAREAS ÚNICAS** | **101** |

**Distribución de prioridad sobre las 80 tareas abiertas** (PENDIENTE + PARCIAL + NO VERIFICABLE + OBSOLETA):

| Prioridad | Cantidad |
|---|---|
| P0 — Crítica | 1 |
| P1 — Alta | 17 |
| P2 — Media | 35 |
| P3 — Baja | 27 |

---

## 2. TABLA MAESTRA

| ID | Área | Tarea o incidencia | Estado verificado | Prioridad | Evidencia principal | Causa raíz conocida | Dependencias |
| -- | ---- | ------------------ | ----------------- | --------- | ------------------- | ------------------- | ------------ |
| CP-POS-001 | POS | Kardex de la era V2.1: sin reconciliación automática stock↔ledger | PARCIALMENTE RESUELTA | P2 | [BD] `20261005140000_drop_v1_sale_devolution.sql` + [CÓD] `create_sale_v2` endurecido | Caminos V2.1 parcheados fueron reemplazados por V2 endurecido; falta rutina programada | Ninguna |
| CP-POS-002 | POS | Offline sync sin reserva de stock ni resolución de conflictos | PENDIENTE CONFIRMADA | P1 | [DOC] audit_v3_multi_store §9 + [CÓD] `sync-engine.ts`, `useSync.ts`, `sync/batch/route.ts` | Diseño offline idempotente parcial (solo 23505) | CP-POS-001 |
| CP-POS-003 | POS | «Venta por Conteo» rota: «0 de 0 productos» permanente | PENDIENTE DE VERIFICACIÓN (M2) | P1 | [CÓD] fix en `useInventoryCount.ts` + [TEST] 2/2 `useInventoryCount-storeId.test.tsx` | fetch sin `storeId`; `/api/inventory/products` exige storeId (400) | Ninguna |
| CP-POS-004 | POS | Fallback de atribución de comisiones POS sobre-atribuye a todos los workers | PENDIENTE CONFIRMADA | P2 | [DOC] AUDITORIA_TRABAJADORES §14.2 | Regla de negocio sin definir (fallback 2026-07-17) | Decisión de negocio |
| CP-POS-005 | POS | Firmas del Reporte Entrega globales en localStorage (no scoped por tienda) | PENDIENTE CONFIRMADA | P3 | [DOC] AUDITORIA_TRABAJADORES §14.3 | `LS_KEYS.deliveredBy/recipient` sin prefijo de tienda | Ninguna |
| CP-POS-006 | POS | Falta test de integración del pro-rateo del motor de comisiones | PENDIENTE CONFIRMADA | P2 | [DOC] AUDITORIA_TRABAJADORES §14.4 | Fix verificado en vivo pero sin test que lo proteja | CP-INFRA-011 |
| CP-POS-007 | POS | Notas de venta del Catálogo de Ventas se descartan silenciosamente | PENDIENTE DE VERIFICACIÓN (M2) | P1 | [CÓD] fix 4 puntos (`useSalesCatalog`, `schemas.ts`, `sync/batch`) + [TEST] 8/8 | `confirmCheckout(notes)` no incluye `notes` en el body del checkout | Ninguna |
| CP-POS-008 | POS | Tasa USD 680 hardcodeada como fallback en 8+ puntos del cliente | PENDIENTE CONFIRMADA | P2 | [CÓD] `usePOSCheckout.ts:184`, `useSalesCatalog.ts:416,464`, `salesCatalogImport.ts:102` | Default de硬codificación pre-validación server-side | Ninguna |
| CP-POS-009 | POS | Selector de fecha date-only a medianoche; Vales de Salida sin selector de fecha en UI | PENDIENTE CONFIRMADA | P2 | [DOC] agent-ctx/informe-final-mision-multitienda | `validate_operation_date` forward-only + UI date-only | Ninguna |
| CP-POS-010 | POS | Reporte Entrega: 7 discrepancias contables D1-D7 + migración `ref_type` no aplicada | PARCIALMENTE RESUELTA | P1 | [DOC] auditoria-reporte-entrega.md + FIX_REPORTE_ENTREGA_1510 | Correcciones en repo; dato histórico y deploy pendientes | CP-INFRA-009 |
| CP-INV-001 | INV | 4 productos Puerto Padre: `inventory.quantity` ≠ Σ movimientos (seed legacy) | PENDIENTE CONFIRMADA | P2 | [DOC] BACKUP_RESTORE_INVENTORY_TRUTH_MODEL | Seed legacy con cantidades simbólicas; Modelo A (inventory=primary) | Decisión de remediación |
| CP-INV-002 | INV | Productos 160-177 sin precio/costo y nombre provisional | PENDIENTE CONFIRMADA | P2 | [DOC] REGISTRO_MOVIMIENTOS D-5 | Alta sin datos comerciales (negocio aún no los informó) | Dato de negocio |
| CP-INV-003 | INV | `unit_cost=1 CUP` placeholder en 13 recepciones | PENDIENTE CONFIRMADA | P2 | [DOC] REGISTRO_MOVIMIENTOS D-6 | Costo no informado al registrar | Dato de negocio |
| CP-INV-004 | INV | Precios de catálogo obsoletos (SKU 92, 134, 111) | PENDIENTE CONFIRMADA | P1 | [DOC] REGISTRO_MOVIMIENTOS D-3/D-4 | Gate de supervisor inoperativo al vender sobre precio viejo | Ninguna |
| CP-INV-005 | INV | 4 divergencias de conciliación (SKU 113/127/135/141) + política de stock negativo sin decidir | DECISIÓN RATIFICADA — EFECTO PENDIENTE (MC, 2026-10-21) | P2 | [DOC] DECISION_A_STOCK_NEGATIVO_2026-10-20 + PR #1431 (merge cc4ce985f) | Política «nunca negativo» ratificada 2026-10-20; 4 divergencias ya reconciliadas; regularización de artefactos QA pendiente de autorización por lote | Autorizar lotes de ajustes QA |
| CP-INV-006 | INV | Desfase de 1 día en 54 recepciones importadas (`reception_date` 16:00 UTC) | PENDIENTE CONFIRMADA | P3 | [DOC] AUDITORIA_CONCILIACION §3.2 | Artefacto de importación del 04/10; UPDATE opcional no ejecutado | Autorización de UPDATE |
| CP-INV-007 | INV | SKU 81: ledger «inconsistente» (apertura −100) | OBSOLETA O REEMPLAZADA | P3 | [DOC] REGISTRO_MOVIMIENTOS D-1 + INCIDENTE_IPV §A.6 | Era historial real (venta 100u revertida + recepción +100), no defecto | — |
| CP-INV-008 | INV | `transfer-service.ts:142` con comentario «stubs pendientes» ambiguo | PENDIENTE CONFIRMADA | P3 | [CÓD] `src/services/transfer-service.ts:142-143` | Comentario obsoleto sobre `cancelTransfer` ya implementado | Ninguna |
| CP-INV-009 | INV | Vales de Salida sin superficie UI de reversión (backend existe) | PARCIALMENTE RESUELTA | P2 | [DOC] ENERVIDA-FLOW-DISCOVERY §2/§8.A + [CÓD] `useReverseDocument.ts` | `ReversibleDocType` no incluye vale_salida en UI | Ninguna |
| CP-IPV-001 | IPV | PRE_LEDGER/RECONCILIATION permanentes (CENTRAL/ENERVIDA) + 26 PRICE_ANOMALY | PENDIENTE CONFIRMADA | P2 | [DOC] AUDITORIA_IPV §5/§15 + INCIDENTE_IPV §D | Cargas iniciales sin ledger; devoluciones de agosto sin `return` | Backfill requiere autorización |
| CP-IPV-002 | IPV | TAREA 3: re-costeo de COGS histórico no iniciado | PENDIENTE CONFIRMADA | P2 | [DOC] ENERVIDA-WAC-ZERO-COST-CIERRE + COST-PROVENANCE §10 | Requiere política por clase de costo + facturas externas | CP-IPV-003, decisión contable |
| CP-IPV-003 | IPV | 4 WAC vigentes inflados 680x (SKU 67/68/107/121) + diluciones SKU 90/999 | PENDIENTE CONFIRMADA | P1 | [DOC] ENERVIDA-COST-PROVENANCE §8-bis | WAC pre-log irreconstruible (era sin `wac_change_log`) | CP-IPV-002 |
| CP-IPV-004 | IPV | Procedencia de costos ENERVIDA: 0% con evidencia documental | PENDIENTE CONFIRMADA | P3 | [DOC] ENERVIDA-COST-PROVENANCE (reporte-solo) | Era pre-log; 51% costo=precio de venta | CP-IPV-002 |
| CP-IPV-005 | IPV | Deuda técnica del módulo IPV clásico (Dexie, componentes sobredimensionados) | PENDIENTE CONFIRMADA | P3 | [DOC] EVALUACION_IPV | Acoplamiento MatchingEngine↔Dexie; refactor en 4 fases propuesto | Ninguna |
| CP-CAT-001 | CAT | Categorías como texto libre en `products.category` | PENDIENTE CONFIRMADA | P3 | [DOC] audit_v3_multi_store §1 | Sin tabla de categorías ni FK | Ninguna |
| CP-CAT-002 | CAT | `confirm_transfer` casa producto destino solo por SKU | PENDIENTE CONFIRMADA | P3 | [DOC] audit_v3_multi_store §6 | Match sin unidad de medida ni tenant | Ninguna |
| CP-CAT-003 | CAT | `catalog_selectedCategories` persiste entre sesiones | PENDIENTE CONFIRMADA | P3 | [DOC] INVENTORY-CATALOG-REGRESSION-1379 §9.1 | Misma clase de defecto que F20 (corregida solo para searchTerm) | Ninguna |
| CP-CAT-004 | CAT | Alta de producto en recepción sin `tenant_id` → 403 RLS | PENDIENTE DE VERIFICACIÓN (M2) | P1 | [CÓD] fix `useReceptions.ts` (patrón RLS-FIX) + [TEST] 5/5 `useSavePendingReception-tenant-rls.test.tsx` | Insert sin tenant_id contra policy `products_tenant_insert` | Ninguna |
| CP-CAT-005 | CAT | `/api/catalog/bulk-import` sin Zod por fila + `store_id` del body | PENDIENTE CONFIRMADA | P1 | [CÓD] `route.ts:34,46,75` [VERIFICADO HOY] | Validación manual débil; confianza en body para admin | Ninguna |
| CP-CAT-006 | CAT | `received_services` históricos con `service_type_id` NULL | PENDIENTE CONFIRMADA | P3 | [DOC] AUDITORIA_SERVICIOS §13.1 | Backfill por nombre no ejecutado (históricos intactos por diseño) | Ninguna |
| CP-CAT-007 | CAT | Gestión de tipos de servicio por tienda sin UI | PENDIENTE CONFIRMADA | P3 | [DOC] AUDITORIA_SERVICIOS §13.2 | Solo admin global; soporte por tienda documentado como extensión | CP-RES-008 |
| CP-CAT-008 | CAT | Formulario/modal de servicios sin pase manual con sesión real | NO VERIFICABLE | P3 | [DOC] AUDITORIA_SERVICIOS SR-01/02/13 | Entorno sin credenciales en esa misión | CP-RES-008 |
| CP-SEC-001 | SEC | RLS «Productos públicos - lectura» cross-tenant | RESUELTA VERIFICADA | — | [BD] `20260726000032_v2_12_critical_fixes.sql:168` [VERIFICADO HOY] | Policy pública sin filtro de tienda, DROP + reemplazo por policy anon por store | — |
| CP-SEC-002 | SEC | Lectura de ventas por ex-vendedores (policy `seller_id`) | RESUELTA VERIFICADA | — | [BD] `20260807000012_v2_21_5` DROP + `20260807000005:84` `transactions_tenant_select` [VERIFICADO HOY] | Policy antigua con término `seller_id` reemplazada por tenant/store access | — |
| CP-SEC-003 | SEC | `deny_client_writes` de products anulado por policies OR de update | PENDIENTE CONFIRMADA | P2 | [DOC] audit_v3_multi_store §2.5 | Policies OR posteriores anulan la policy DENY | Consolidación de policies |
| CP-SEC-004 | SEC | Sin `audit_logs` en transfers directos y updates/voids de recepciones | PARCIALMENTE RESUELTA | P1 | [DOC] audit_v3_multi_store §7 + [CÓD] `transfers/route.ts:114-133`, `useReceptions.ts:88-192` | INSERT directo a DB bypass de RPC sin auditoría | CP-RES-012 (create_sale_v2 ya audita) |
| CP-SEC-005 | SEC | Debilidades residuales anti-spoofing (patrón legacy, GRANTs, `?all=true`) | PARCIALMENTE RESUELTA | P1 | [DOC] audit_self_evaluation_v2 + [BD] 30 archivos con patrón [VERIFICADO HOY] | Fix LIVE out-of-band certificado; migraciones históricas no saneadas | CP-INFRA-004 |
| CP-SEC-006 | SEC | 52 endpoints sin Zod/validación de auth (backlog Security CI Gate) | PENDIENTE CONFIRMADA | P1 | [DOC] SECURITY_CI_GATE_FINDINGS_BACKLOG (5 Alta, 21 Media, 26 Baja) | Endpoints pre-gate; regla de remoción nunca aplicada | CP-INFRA-004 |
| CP-SEC-007 | SEC | Security CI Gate: checks SQL se auto-desactivan sin `DATABASE_URL`; doc desactualizado | PARCIALMENTE RESUELTA | P2 | [CÓD] `.github/workflows/security-gate.yml` + [DOC] SECURITY_CI_GATE_DESIGN §9 | Diseño implementado a medias; skip silencioso con exit 0 | Ninguna |
| CP-SEC-008 | SEC | Backlog formal DT-01..DT-18 (is_admin duplicada, cleanup jobs, store laboratorio…) | PENDIENTE CONFIRMADA | P2 | [DOC] AUDIT_CLOSURE_REPORT_v1 + SECURITY_BASELINE_SNAPSHOT_v1 | Deuda registrada sin resolución por ítem | Varias (DT-03/06 propias) |
| CP-SEC-009 | SEC | Modelo de autorización: H-09-AUTH-01..04 (is_admin≡is_global_admin, roles mixtos) | PENDIENTE CONFIRMADA | P2 | [DOC] ITERATION_9_AUTH_MODEL_AUDIT | Duplicación role↔role_id y `manager` global inconsistente | CP-SEC-008 (DT-01) |
| CP-SEC-010 | SEC | DT-03: decisión single vs multi-tenant sin aprobar | DECISIÓN RATIFICADA — EFECTO PARCIAL (MC, 2026-10-21) | P2 | [DOC] DECISIONES_PENDIENTES_MISION_C §B (confirmada 2026-10-19) + evidence/20261019-dt03-matriz-acceso | Arquitectura multi-tenant conservada; single-tenant solo descriptivo; 1 backfill ejecutado (ratificación A7 pendiente) + 10 perfiles SIN EVIDENCIA sin tocar | Ratificar A7 + evidencia individual de 10 perfiles |
| CP-SEC-011 | SEC | DT-06: reconciliación de auth.users huérfanos sin implementar | PENDIENTE CONFIRMADA | P2 | [DOC] USER_RECONCILIATION_DESIGN | Diseño listo, FK sin CASCADE, implementación pendiente de aprobación | Aprobación |
| CP-SEC-012 | SEC | Bugs de seguridad ACTIVOS documentados como `test.fail` (BUG-013/017/022/024) | RESUELTA EN CÓDIGO — VERIFICADA (MB, 2026-10-21) | P0 | [TEST] 24/24 contrato+regresión ejecutados en SHA e6d885 (2026-10-21) + [CI] 3 checks success en e6d885 + [CURL] 401 local M2 2026-10-17 | 4/4 subcasos corregidos; BUG-024 resuelto por Decisión D ratificada (audit_logs, PR #1431 fusionado por el propietario); cierre formal pendiente | Índice 20261020000005 (A4); actualización de specs E2E (test.fail/skip obsoletos); sonda de despliegue |
| CP-SEC-013 | SEC | Rate limit in-memory; Upstash Redis obligatorio en prod no configurado | PENDIENTE CONFIRMADA | P1 | [CÓD] `rate-limit.ts:77` + [.env.example] | Límites por instancia, no distribuidos | Credenciales Upstash |
| CP-SEC-014 | SEC | CSP con `'unsafe-inline'` permanente en producción | PENDIENTE CONFIRMADA | P2 | [CÓD] `src/proxy.ts:39-48` | Excepción por compatibilidad con preview Space-Z | Ninguna |
| CP-SEC-015 | SEC | Enumeración de roles inconsistente (`superadmin` vs `super_admin` vs `encargado`) | PENDIENTE CONFIRMADA | P2 | [CÓD] `users/route.ts:31` vs `pick3/advisor/route.ts:273` | Dos convenciones de nombres de rol conviven | CP-SEC-009 |
| CP-SEC-016 | SEC | Webhook Telegram: IP allowlist cosmética sin reverse proxy (checklist 8 ítems sin ejecutar) | PENDIENTE CONFIRMADA | P2 | [DOC] reverse-proxy-trusting-x-forwarded-for.md | `getRealClientIp()` prioriza XFF spoofable | Despliegue de proxy |
| CP-SEC-017 | SEC | Supabase Admin API `/auth/v1/admin/users` devuelve 500 | NO VERIFICABLE | P2 | [DOC] FIX_SUPERADMIN_TIPOS_SERVICIO §9.3 | Causa externa al repo (proyecto Supabase) | Soporte Supabase |
| CP-SEC-018 | SEC | `/api/users/managed-create` responde 400 ERR_EMAIL_ALREADY_EXISTS tras crear bien | PENDIENTE CONFIRMADA | P2 | [DOC] E2E-FIXTURE-REUSE §9.3 (DEFECT-003) | Doble verificación de email en ruta | Ninguna |
| CP-SEC-019 | SEC | 35→52 rutas API con `z.string().uuid()` estricto (fallan con UUID sintético de Central) | PENDIENTE DE VERIFICACIÓN (M2: 52→0) | P1 | [CÓD] codemod 36 archivos → `uuidLoose`/`uuidRegex` + [TEST] 5/5 `uuid-loose-central-contract.test.ts` | Validación cliente más estricta que Postgres (mismo patrón que F24 resuelto) | Ninguna |
| CP-SEC-020 | SEC | RPCs legacy con EXECUTE anon/PUBLIC (5 dropeadas; `manage_user_memberships` queda) | PARCIALMENTE RESUELTA | P2 | [DOC] PT_9_5 + AUDIT_CLOSURE (v2.12.50) | Bloqueo legacy: delete→410, 5 RPCs dropeadas; DT-02 queda abierta | CP-SEC-008 |
| CP-UI-001 | UI | CRUD de reglas de comisión desde UI + sub-ítems contables | PARCIALMENTE RESUELTA | P2 | [DOC] decisions-complejas §1-5 + [CÓD] `WorkersView.tsx:2770` [VERIFICADO HOY] | RuleFormModal implementado; exclusion constraint y sub-ítems siguen | Query previa de solapes |
| CP-UI-002 | UI | Fases C/D/E del refinamiento Inventario/Vitrina sin ejecutar | PENDIENTE CONFIRMADA | P3 | [DOC] ux-refinamiento-inventario-vitrina | Fases A/B implementadas (PR #1373); C/D/E con checklists vacíos | Ninguna |
| CP-UI-003 | UI | UX-002..UX-014: breadcrumbs falsos, móvil, sesiones envejecidas, tablón default | PARCIALMENTE RESUELTA | P2 | [DOC] plan-estrategico-ux-ia | Solo el dominio Fichas de Costo está RESUELTO/CERTIFIED | Decisiones de producto |
| CP-UI-004 | UI | Módulos oficiales «En desarrollo» (IPV/Pick3/Billetera/Wiki/Academia/Legal/Conciliación beta) | PENDIENTE CONFIRMADA | P3 | [DOC] knowledge/help 08-seccion-en-desarrollo | Parcialidad por diseño; se moverán al madurar | Evolución por módulo |
| CP-UI-005 | UI | Diagnóstico Vales de Salida P1-P10 con plan de 7 commits sin constancia de cierre | PARCIALMENTE RESUELTA | P2 | [DOC] DIAGNOSTICO_VALES_SALIDA + [CÓD] `ValeSalidaDetalleModal.tsx` | P2/P7 cubiertos por modal de detalle; resto sin evidencia | Ninguna |
| CP-UI-006 | UI | MVP FC: bug de sesión `useSessionManager`, cuentas locales hardcodeadas, sync manual `/fc/` | PENDIENTE CONFIRMADA | P2 | [DOC] fc-mvp-integration + fc-access-flow-fix | Fix de sesión «ciclo separado» nunca ejecutado | CP-INFRA-002 |
| CP-DATA-001 | DATA | Decisiones humanas de limpieza de datos E2E/QA (6 tiendas D, 16 usuarios D, residuos 9-oct, vales del propietario) | PENDIENTE CONFIRMADA | P2 | [DOC] E2E-DATA-CLEANUP-INVENTORY §D + E2E-FIXTURE-REUSE §6 | Regla de oro: no borrar sin confirmación humana | Confirmación del propietario |
| CP-DATA-002 | DATA | `security.spec` desactualizado (buscaba create_sale V1, PGRST202) | RESUELTA VERIFICADA | — | [TEST] `e2e/security.spec.ts:169-212` [VERIFICADO HOY] | Spec re-orientado a V2 + anti-resurrección en FINALIZE-V2 | — |
| CP-DATA-003 | DATA | Transacciones históricas de prueba dentro de pilotos A/B sin limpieza | PENDIENTE CONFIRMADA | P3 | [DOC] E2E-FIXTURE-REUSE §9.2 | Cleanup extendido cubre productos, no histórico | CP-DATA-001 |
| CP-DATA-004 | DATA | review_queue: 29 componentes sin documentar, webhook no configurado, artefacto en cuarentena | PENDIENTE CONFIRMADA | P3 | [DOC] automation/review_queue.json + ARCHITECTURE_MAINTENANCE_PIPELINE | Cierre parcial (orphan views 23→0); resto sin dueño | Ninguna |
| CP-DATA-005 | DATA | Pares neto-cero no representables (Excel filas 569+570, papel f536/f537, f790/f791) | PENDIENTE CONFIRMADA | P3 | [DOC] ENERVIDA-EXCEL-IMPORT §7.3 + AUDITORIA_CONCILIACION §6.2 | Decisión documentada: registro con fecha actual de valor dudoso | Decisión de negocio |
| CP-DATA-006 | DATA | 20 filas de comisiones de julio con tarifa unitaria antigua | PENDIENTE CONFIRMADA | P3 | [DOC] AUDITORIA_CONCILIACION §8 | ConfComisiones importada como config vigente; sin reconstrucción histórica | Decisión de negocio |
| CP-INFRA-001 | INFRA | E2E de CI deshabilitado (`if: false`) + `continue-on-error` heredado | **BD AISLADA LISTA (CostproE2E preparada y verificada 2026-10-22 — ver CP-INFRA-011); reactivación de jobs en PR pendiente de 3 corridas verdes y orden explícita del propietario** — jobs antiguos INTACTOS (`if: false`) por mandato; workflow manual independiente `e2e-isolated.yml` listo | P1 | [CÓD] `.github/workflows/ci.yml`, `test-coverage.yml` [DOC] e2e-contamination-cleanup-20261009 | Contaminación en vivo 2026-10-09 (48 tiendas/26 usuarios); desactivación como mitigación | CP-INFRA-011 |
| CP-INFRA-002 | INFRA | OOM estructural (4 GB): build/tsc local imposible; CI única autoridad | PENDIENTE CONFIRMADA | P2 | [DOC] 7+ informes + [CÓD] `next.config.ts`, vitest.config | Contenedor 4 GB sin swap; exit 137 ×6 documentado | Infraestructura mayor |
| CP-INFRA-003 | INFRA | `bun audit` no bloqueante (`|| echo` + continue-on-error) + dual lockfile | PENDIENTE CONFIRMADA | P2 | [CÓD] `ci.yml` job security + `bun.lock`/`package-lock.json` | Auditoría decorativa; riesgo de drift de dependencias | Ninguna |
| CP-INFRA-004 | INFRA | 27 supresiones de `ci-gate-allowlist.json` expiran 2026-12-31; replay reintroduce SQL vulnerable | PENDIENTE CONFIRMADA | P1 | [CÓD] `ci-gate-allowlist.json` (21 estáticas + 6 SECDEF) | Fixes LIVE out-of-band sin migración de saneamiento del histórico | CP-SEC-005/006 |
| CP-INFRA-005 | INFRA | ~100+ skips E2E condicionales + 12 unit skips sin plan + cobertura excluida | PENDIENTE CONFIRMADA | P2 | [TEST] `e2e/global-setup.ts:4-10`, specs ×25; vitest skips ×12 | Tokens/credenciales ausentes → skip silencioso; umbrales rebajados | CP-INFRA-011 |
| CP-INFRA-006 | INFRA | 15 escenarios E2E sin cobertura (2 P0: recepción de mercancía y contra OC) | PENDIENTE CONFIRMADA | P2 | [DOC] E2E-COVERAGE-REPORT §escenarios | Fixtures multi-paso no creados (~2 días estimados) | CP-INFRA-011 |
| CP-INFRA-007 | INFRA | Cementerio de scripts one-off (45 MB, ~60+ scripts de misión, hardcodes) | PENDIENTE CONFIRMADA | P3 | [CÓD] `scripts/` censo + `apply-rpc-fix.sh` | Acumulación sin política de limpieza | Ninguna |
| CP-INFRA-008 | INFRA | Inconsistencias de infra: PM2 en modo dev, crons divergentes (24 h vs 5 min), docker 512M, 3 superficies de despliegue | PENDIENTE CONFIRMADA | P2 | [CÓD] `ecosystem.config.js`, `vercel.json`, `docker-compose.yml`, `Dockerfile` | Comentarios desfasados; perfiles de memoria incoherentes | Ninguna |
| CP-INFRA-009 | INFRA | Gate de proceso: PRs mergeados con previews en ERROR o E2E advisory | PENDIENTE CONFIRMADA | P1 | [DOC] VERCEL-PREVIEW-FAILURE §8.3 + vercel-deploy-outage-1381 | Política ausente: TS2739 y TS18048 llegaron a producción así | Ninguna |
| CP-INFRA-010 | INFRA | Presupuesto de bundles en CI + carrito con `Product` completos en localStorage (CB5) + landing RSC (CB3) | PENDIENTE CONFIRMADA | P2 | [DOC] COSTPRO-PERFORMANCE-AUDIT §11.3/§11 + [CÓD] `cart.ts` | CB1-CB4 resueltos; CB5/CB3 y size-limit pendientes | Ninguna |
| CP-INFRA-011 | INFRA | Sin proyecto Supabase aislado para E2E/perf | **BD CostproE2E PREPARADA (2026-10-22)**: guard fail-closed en todos los entrypoints (producción rechazada sin conectar) + baseline certificado (snapshot 2026-08-28 transformado y documentado) + tramo 70/70 migraciones con guards del stream en verde + centinela true + contrato 137/137 funciones certificadas + RLS 149/149 + workflow manual `e2e-isolated.yml`. Pendiente propietario: environment `e2e-isolated` + 4 secretos + corrida manual (docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md) | P1 | [DOC] COSTPRO-PERFORMANCE-AUDIT §10/§11.4 · [EVID] audit-evidence/INFRA-011/ (fase0-inventario, manifiesto, remote/*, contract-compare) | Único fixture es admin sobre BD compartida | Crea entorno aislado |
| CP-INFRA-012 | INFRA | Sin métricas de campo (web-vitals p75) + awaits secuenciales restantes (4 endpoints) | PENDIENTE CONFIRMADA | P3 | [DOC] COSTPRO-PERFORMANCE-AUDIT §11.5/§11.6 | Instrumentación no instalada | CP-INFRA-011 |
| CP-INFRA-013 | INFRA | Reevaluación Vercel AI SDK postergada a Q3 2026 sin tracking | PENDIENTE CONFIRMADA | P3 | [DOC] vercel-ai-sdk-migration-eval | Decisión deliberada de no migrar (alucinaciones de tools) | Ninguna |
| CP-INFRA-014 | INFRA | Branch protection y secrets de GitHub no verificables desde el repo | NO VERIFICABLE | P3 | [DOC] branch-protection.md (documento de intención) | Requiere acceso admin a GitHub | Acceso admin |
| CP-INFRA-015 | INFRA | Warnings de deploy Vercel (módulo `stripe` opcional + 16 warnings tracing 11.120 archivos) | PENDIENTE CONFIRMADA | P3 | [DOC] VERCEL-PREVIEW-FAILURE §8 | Import condicional + `outputFileTracingIncludes` amplio | Ninguna |
| CP-INFRA-016 | INFRA | Auto-commits diarios del agente auditor a la rama default | PENDIENTE CONFIRMADA | P3 | [CÓD] `.github/workflows/daily-audit.yml` | Cron auto-commitea mapa_vistas/audits como «AI Auditor Agent» | Ninguna |
| CP-INFRA-017 | INFRA | `turbopack.memoryLimit` no soportada en Next 16.3.3; Sentry monitors omitidos con Turbopack | PENDIENTE CONFIRMADA | P3 | [CÓD] `next.config.ts` (comentarios verificados) | Limitaciones de la versión; sin forma declarada de limitar memoria | CP-INFRA-002 |
| CP-RES-001 | SEC | Spoofing de `p_user_id` en 31 RPCs + BOLA en `confirm_transfer` + H7/H4 | RESUELTA VERIFICADA | — | [BD] `20260727000006/7` (V2.12.9/10) + `stores/route.ts` (V2.12.11) + hot test | Anti-spoofing `auth.uid()` en RPCs; ACL de tiendas en API | — |
| CP-RES-002 | SEC | Seteo directo de contraseña por Super Admin (multi-tienda) | RESUELTA VERIFICADA | — | [CÓD] `SetPasswordModal.tsx`, `/api/users/reset-password` + 30 tests | server-side `auth.admin.updateUserById` + auditoría sin secretos | — |
| CP-RES-003 | UI | Aislamiento del landing del tema/modos de la app | RESUELTA VERIFICADA | — | [CÓD] `landing-shield.css` + 211/211 checks TEST 1-8 | Escudo `:has(#landing-root)` + eliminación de forzado de clases | — |
| CP-RES-004 | INFRA | Performance: chunks jspdf/xlsx fuera del grafo POS (CB1), splash (CB2), sync/batch (CB4) | RESUELTA VERIFICADA | — | [CÓD] dynamic imports `a49fc7045`/`b1bfc94a6`/`7075dab71` + LCP −40% | Code-splitting y montaje paralelo; verificado en CI | — |
| CP-RES-005 | DATA | Higiene de datos E2E: limpieza 2.638 tiendas + hard-delete + gobernanza UUID | RESUELTA VERIFICADA | — | [DOC] E2E-DATA-HYGIENE + `e2e_hard_delete_*` migraciones + net-zero guardrail | Cleanup soft-only de 3 meses corregido con RPCs y guardrail | — |
| CP-RES-006 | DATA | Importación ENERVIDA 480 ops + conciliación 179/179 (f854, f873, alta SKUs 160-173, nomenclatura D-9) | RESUELTA VERIFICADA | — | [BD] migraciones 20261004120000/1/2 + PR #1355/#1403/#1404 + REGISTRO_MOVIMIENTOS | Flujos oficiales (create_sale_v2/create_vale_salida/register_reception) + alta oficial | — |
| CP-RES-007 | IPV | WAC cero: TAREA 2 (44 reconstruidos) y TAREA 2B (13 a 1 CUP, decisión contable) | RESUELTA VERIFICADA | — | [BD] `fn_recalc_wac` + `wac_change_log` + PR #1370 + cierres before/after | Protocolo gobernado con stock 71/71 y 157/157 delta 0 | — |
| CP-RES-008 | CAT | Regresión catálogo 1379 + UUID Central + tipos de servicio global + super admin tipos | RESUELTA VERIFICADA | — | [CÓD] `CatalogView.tsx` efímero + `useCatalogProducts.ts` uuidRegex + migración 20261015000001 + `useServiceTypes.ts` + PRs #1379/#1413 | 4 fixes con suites 2.947-2.964/0 y E2E reales | — |
| CP-RES-009 | IPV | IPV Ventas (vista/API/PDF/Excel) + truncado PostgREST 1000 filas + texto «2 Kgcalc» | RESUELTA VERIFICADA | — | [CÓD] `src/lib/supabase-fetch-all.ts` + commits `c23904c`/`19ce3f6` + PR #1411 CI 6/6 | Paginación obligatoria de 5 fuentes; 22 tests; verificación en vivo 12/12 | — |
| CP-RES-010 | POS | Comisiones Reporte Entrega: modal gestionable + criterio «fecha del pago» + fecha operativa | RESUELTA VERIFICADA | — | [CÓD] `CommissionsManageModal.tsx` + `period-attribution.ts` + PRs #1406/#1412 + 16 unit + 8 E2E | Cadena de 4 fallas corregida; criterio canónico con date picker | — |
| CP-RES-011 | SEC | Endurecimiento RLS histórico: productos públicos cross-tenant + transactions seller_id | RESUELTA VERIFICADA | — | [BD] `20260726000032:168` + `20260807000005:84` + `20260807000012` [VERIFICADO HOY] | Reemplazo por policies por tienda/tenant | — |
| CP-RES-012 | POS | Eliminación de caminos V1 de venta/devolución + endurecimiento `create_sale_v2` | RESUELTA VERIFICADA | — | [BD] `20261005140000_drop_v1_sale_devolution.sql` + `20261004130000_h0r` (audit_logs :686) [VERIFICADO HOY] | V1 física y lógicamente eliminada; anti-resurrección en spec | — |
| CP-RES-013 | INFRA | Cortes de deploy Vercel TS2739 (#1373) y TS18048 (#1381) — fixes | RESUELTA VERIFICADA | — | [DOC] VERCEL-PREVIEW-FAILURE + vercel-deploy-outage-1381 + fix `107cb3ba` | Props requeridas y undefined corregidos; tsc 0 | — |
| CP-RES-014 | INV | `/api/inventory/adjust` 500 en happy path (DEFECT-001) | RESUELTA VERIFICADA | — | [CÓD] `adjust/route.ts:41-60` mapeo movementType→delta [VERIFICADO HOY] | Contrato 'add'/'subtract'/'set' mapeado a enum de negocio | — |
| CP-RES-015 | INV | Trazabilidad + Kardex: P1-P5 del diagnóstico (iteración 11) | RESUELTA VERIFICADA | — | [CÓD] `StockHistoryView.tsx`, `kardexPeriod.ts`, `get_product_stock_ledger_paginated` | 2.700 tests 0 fallos; regresión 217/217 | — |
| CP-RES-016 | INFRA | Backup/Restore BR-2 (migraciones + ejecutor PT-4..PT-8) | RESUELTA VERIFICADA | — | [BD] `20260802000007/8` + BACKUP_RESTORE_FINAL | Iteración 7 certificada; 4 preguntas respondidas por implementación | — |
| CP-RES-017 | DATA | Suite E2E 382/382 certificada + guardrail net-zero en 13 chunks | RESUELTA VERIFICADA | — | [DOC] E2E-INCREMENTAL-STABILIZATION + PR #1366 | Fallos clasificados 100%; 2 fixes de producto legítimos | — |
| CP-RES-018 | UI | Certificaciones UI/PDF: Arena FC (9.3/10), 7 plantillas PDF, IPV bancario 96/100, motor costo 94/100 | RESUELTA VERIFICADA | — | [DOC] evaluations/ + quality/ + ipv_audit_report + audit_costo_roi | Certificaciones ISO/OWASP con evidencia | — |
| CP-OBS-001 | INFRA | Documentos con cifras obsoletas (SUPABASE_AUDIT 103 tablas→127, mapa_vistas pre-reorg, E2E_TEST_PLAN vencido) | OBSOLETA O REEMPLAZADA | P3 | [DOC] comparación con SECURITY_BASELINE_SNAPSHOT_v1 | Superados por baseline v2.12.50 y suite Playwright E2E-80 | — |
| CP-OBS-002 | INFRA | Pipeline de mantenimiento automatizado: ciclos 2/3 sin ejecutar (embeddings RAG, Fase 6, manual how-to) | OBSOLETA O REEMPLAZADA | P3 | [DOC] REORGANIZATION_CHECKPOINT_v9 + PIPELINE_IMPROVEMENTS | Dirigido a agente externo (Jules); sin evidencia de ciclo 3 | — |

## 3. FICHAS DETALLADAS

### 3.1 Área POS — Ventas y punto de venta

#### CP-POS-001 — Kardex de la era V2.1: sin reconciliación automática stock↔ledger
- **ID estable:** CP-POS-001 · **Área:** POS/INV · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** `audit_v3_multi_store.md` documentó como CRITICAL que `create_sale` V2.1/V2.10.5/V2.11.3 actualizaba `products.stock_current` directamente sin llamar `register_stock_movement` (kardex roto), que `void_transaction` creaba stock de la nada y que no existía rutina de reconciliación.
- **Comportamiento esperado:** toda mutación de stock genera movimiento de ledger; una rutina compara `stock_current` vs Σ ledger periódicamente.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §4-§5 (hallazgos F1-F3).
- **Archivo y sección:** audit_v3_multi_store.md, secciones de migraciones 20260726000004/26/30 y §5 recomendaciones.
- **Fecha del registro original:** previa al 2026-10-12 (migraciones de jul-2026 analizadas).
- **Evidencia en el código actual [VERIFICADO HOY]:** la venta V1 fue **eliminada físicamente** (`supabase/migrations/20261005140000_drop_v1_sale_devolution.sql`); `create_sale_v2` es el único camino con advisory lock + `FOR UPDATE` + `register_stock_movement` y escribe `audit_logs` (`20261004130000_h0r_create_sale_v2_hardening.sql:686`); `void_transaction` actual (w9_b8, `20260905000001:170,248`) **sí** llama `register_stock_movement`; existe RPC `reconcile_stock(p_store_id, p_fix)` (`20260726000034_v2_12_2_stock_reconciliation.sql`) y trigger `fn_sync_inventory_on_movement` (`20260820000006`).
- **Pruebas realizadas:** lectura de migraciones y grep de `register_stock_movement`/`audit_log` en los SQL citados.
- **Resultado observado:** los tres defectos originales no existen en el camino de venta actual; la conciliación existe como RPC manual pero sin pg_cron ni superficie de UI.
- **Impacto de mantenerla pendiente:** bajo si solo se usa V2; la divergencia solo reaparecería por caminos laterales (ajustes manuales, seeds legacy — ver CP-INV-001).
- **Causa raíz confirmada o hipótesis:** los defectos eran de los overloads V2.1 (jul-2026), reemplazados por el camino endurecido H0-R.
- **Dependencias y riesgos:** ninguna crítica; el riesgo real migró a CP-INV-001 (datos legacy).
- **Trabajo que faltaría realizar:** opcional: cron/pg_cron o vista admin que ejecute `reconcile_stock` y alerte.
- **Criterios de aceptación propuestos:** divergencias stock↔ledger detectadas automáticamente < 24 h.
- **Método recomendado para verificar la corrección:** correr `reconcile_stock` en entorno aislado y comparar con reportes.
- **Limitaciones de la auditoría:** no se verificó funcionalmente contra la BD de producción (solo lectura de migraciones).

#### CP-POS-002 — Offline sync sin reserva de stock ni resolución de conflictos
- **ID estable:** CP-POS-002 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** el motor offline no reserva stock al despachar en local; los conflictos solo se detectan para el código 23505; la idempotency-key se regenera en cada doble clic (riesgo de doble venta); el snapshot offline no tiene TTL. El informe lo calificó CRITICAL («el cliente se va con el producto y la venta falla»).
- **Comportamiento esperado:** reserva/preflight de stock al confirmar en offline; conflicto resuelto con re-validación server-side; una única venta por intento del usuario.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §9 (Offline sync), con 5 recomendaciones concretas.
- **Archivo y sección:** audit_v3_multi_store.md, sección 9.
- **Fecha del registro original:** previa al 2026-10-12.
- **Evidencia en el código actual:** `src/lib/sync/sync-engine.ts:120-141`, `src/hooks/useSync.ts:147-164`, `src/app/api/sync/batch/route.ts:159-160` (replay de `create_sale_v2`); sin reserva de stock ni lógica de resolución más allá de 23505.
- **Pruebas realizadas:** lectura del código de sincronización por agente de exploración; no se reprodujo offline funcionalmente.
- **Resultado observado:** el diseño descrito por el informe sigue presente.
- **Impacto de mantenerla pendiente:** venta fallida post-facto sin ruta UX de recuperación; riesgo de doble venta si la key se regenera.
- **Causa raíz confirmada o hipótesis:** diseño offline priorizó replay idempotente simple; la reserva no se implementó.
- **Dependencias y riesgos:** relacionado con CP-POS-001 (integridad stock); mitigación parcial por `ERR_IDEMPOTENCY_KEY_REUSE` server-side.
- **Trabajo que faltaría realizar:** preflight de stock offline, resolución de conflictos por error canónico, key estable por intento, TTL de snapshot.
- **Criterios de aceptación propuestos:** venta offline con stock insuficiente produce alerta en el momento del reintento, no después; doble clic no genera 2 ventas.
- **Método recomendado para verificar la corrección:** prueba E2E offline→online con stock insuficiente y doble submit.
- **Limitaciones de la auditoría:** no se ejecutó el flujo offline real (requiere navegador + red manipulada).

#### CP-POS-003 — «Venta por Conteo» rota: «0 de 0 productos» permanente
- **ID estable:** CP-POS-003 · **Área:** POS · **Estado verificado:** PENDIENTE DE VERIFICACIÓN (M2, 2026-10-17) · **Prioridad:** P1
- **Descripción del problema:** `useInventoryCount.fetchProducts()` llama `/api/inventory/products` sin `storeId`; el endpoint exige el parámetro y responde 400; la vista muestra «0 de 0 productos» de forma permanente. Reproducido en vivo el 2026-10-15 y documentado como preexistente y fuera del alcance de esa misión.
- **Comportamiento esperado:** el módulo lista los productos de la tienda activa y permite registrar conteos.
- **Origen documental:** `docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md` §14.1.
- **Archivo y sección:** AUDITORIA_TRABAJADORES…, §14.1 (hallazgo en vivo).
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual [VERIFICADO HOY]:** `src/components/views/terminal/views/inventory_count/useInventoryCount.ts:148-155` — `fetch('/api/inventory/products', { headers: { Authorization: Bearer … } })` sin `storeId`; `src/app/api/inventory/products/route.ts:13-19` — «storeId es requerido» → 400.
- **Pruebas realizadas:** lectura directa de ambos archivos hoy.
- **Resultado observado:** el defecto sigue exactamente igual que el reporte del 15/10.
- **Impacto de mantenerla pendiente:** módulo completo inutilizable (conteo físico/venta por conteo); afecta operación diaria si se usa.
- **Causa raíz confirmada o hipótesis:** el hook nunca adjuntó el parámetro requerido por el endpoint (regresión o implementación incompleta del módulo).
- **Dependencias y riesgos:** ninguna; fix de 1 línea + test.
- **Trabajo que faltaría realizar:** añadir `storeId` (tienda activa) a la query; test unitario del hook; pase E2E del flujo de conteo.
- **Criterios de aceptación propuestos:** «Venta por Conteo» lista productos de la tienda activa y permite guardar un conteo.
- **Método recomendado para verificar la corrección:** abrir el módulo con tienda activa y verificar carga + guardar conteo en BD de prueba.
- **Limitaciones de la auditoría:** no se ejecutó la UI en vivo (solo evidencia de código + repro documentado del 15/10).
- **REMEDIACIÓN MISIÓN 2 (2026-10-17):**
  - **Estado anterior:** PENDIENTE CONFIRMADA → **nuevo estado:** PENDIENTE DE VERIFICACIÓN.
  - **Cambio aplicado:** `useInventoryCount.fetchProducts()` ahora adjunta `?storeId=<tienda activa>` (patrón de LotsView/DevolutionsView/WorkersView, con `encodeURIComponent`); fail-closed con error accionable si no hay tienda activa; el `useEffect` re-fetch al cambiar de tienda (`user?.activeStoreId` en deps).
  - **Pruebas de regresión:** `src/__tests__/hooks/useInventoryCount-storeId.test.tsx` — 2/2 ✓ (fetch con storeId + fail-closed sin tienda). Estas pruebas habrían FALLADO con el código anterior (fetch sin query).
  - **Verificación adicional:** suite completa vitest 3170/3170 ✓; `tsc --noEmit` EXIT 0 ✓.
  - **Evidencia pendiente para cierre:** pase funcional de la vista «Venta por Conteo» en entorno desplegado con tienda activa real (carga de listado + guardar conteo).
  - **Rama/PR:** `fix/mision-2-hotfixes-operativos` (MISIÓN 2).

#### CP-POS-004 — Fallback de atribución de comisiones POS sobre-atribuye a todos los workers
- **ID estable:** CP-POS-004 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el fallback de atribución (2026-07-17) asigna TODAS las ventas POS a TODOS los workers activos si no hay atribución explícita; si el admin confirma el Reporte Entrega sin revisar, paga comisiones sobre-atribuidas (ejemplo documentado: propuesta de 5.070 CUP a «Dependiente 1 Pueblo»).
- **Comportamiento esperado:** atribución determinista documentada o bloqueo de confirmación sin revisión.
- **Origen documental:** `docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md` §14.2.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** fallback vigente según informe; no se localizó cambio posterior en el motor (`commission-engine`).
- **Pruebas realizadas:** evidencia documental con caso real del 14/10; lectura del informe.
- **Resultado observado:** regla de negocio explícita pendiente; el flujo actual exige revisión manual del admin.
- **Impacto de mantenerla pendiente:** pago incorrecto de comisiones por error operativo (impacto económico directo).
- **Causa raíz confirmada o hipótesis:** decisión de negocio no tomada (a quién atribuir cuando no hay seller_id).
- **Dependencias y riesgos:** depende de decisión del negocio; interactúa con CP-POS-006 (test del pro-rateo).
- **Trabajo que faltaría realizar:** definir regla; implementar atribución o gate de confirmación; test.
- **Criterios de aceptación propuestos:** ninguna venta queda atribuida a workers sin relación real; confirmación exige revisión explícita si hay fallback.
- **Método recomendado para verificar la corrección:** reproducir venta sin seller y revisar propuesta de comisiones.
- **Limitaciones de la auditoría:** comportamiento server-side no verificado en vivo.

#### CP-POS-005 — Firmas del Reporte Entrega globales en localStorage
- **ID estable:** CP-POS-005 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `LS_KEYS.deliveredBy` y `LS_KEYS.recipient` son globales: la firma de una tienda se reutiliza como valor por defecto en otra tienda.
- **Comportamiento esperado:** claves scoped por tienda (`key = base:storeId`).
- **Origen documental:** `docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md` §14.3 (con evidencia en PDF de la misión).
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** no se detectó refactor posterior de esas claves.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** riesgo de firma incorrecta en reporte de entrega (valor legal operativo menor).
- **Causa raíz confirmada o hipótesis:** implementación inicial sin multi-tienda en mente.
- **Dependencias y riesgos:** ninguno técnico; migración de claves para no perder firmas existentes.
- **Trabajo que faltaría realizar:** scope de claves + migración de valores existentes.
- **Criterios de aceptación propuestos:** al cambiar de tienda, el campo de firma no hereda la de otra tienda.
- **Método recomendado para verificar la corrección:** test E2E multi-tienda del Reporte Entrega.
- **Limitaciones de la auditoría:** verificación de código delegada al agente de exploración.

#### CP-POS-006 — Falta test de integración del pro-rateo del motor de comisiones
- **ID estable:** CP-POS-006 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el fix de pro-rateo del motor de comisiones se verificó en vivo (470/150 exactos el 14/10) pero no quedó protegido por test de integración.
- **Comportamiento esperado:** test unitario/integración del pro-rateo que falle si el criterio cambia.
- **Origen documental:** `docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md` §14.4.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** no se halló test específico de pro-rateo en `src/__tests__/` (búsqueda del agente).
- **Pruebas realizadas:** búsqueda de tests de pro-rateo.
- **Resultado observado:** deuda de prueba confirmada.
- **Impacto de mantenerla pendiente:** regresión silenciosa del cálculo de comisiones (impacto económico).
- **Causa raíz confirmada o hipótesis:** fix urgente en misión con verificación manual; test pospuesto.
- **Dependencias y riesgos:** CP-POS-010 (mismo dominio); CP-INFRA-011 (entorno de pruebas).
- **Trabajo que faltaría realizar:** test con escenario multi-período.
- **Criterios de aceptación propuestos:** propuesta de comisión exacta en escenario pro-rateado conocido.
- **Método recomendado para verificar la corrección:** correr suite de comisiones.
- **Limitaciones de la auditoría:** búsqueda de tests no exhaustiva por nombre.

#### CP-POS-007 — Notas de venta del Catálogo de Ventas se descartan silenciosamente
- **ID estable:** CP-POS-007 · **Área:** POS · **Estado verificado:** PENDIENTE DE VERIFICACIÓN (M2, 2026-10-17) · **Prioridad:** P1
- **Descripción del problema:** el modal de checkout del Catálogo de Ventas recoge «notas de venta» y se las pasa a `confirmCheckout(notes?, operationDate?)`, pero el body enviado a `/api/pos/checkout` no incluye `notes` (ni online ni offline): las notas se pierden silenciosamente. Contradice el requisito de persistencia de notas del área Ventas.
- **Comportamiento esperado:** la nota viaja al backend, se persiste con la transacción y es visible en recibo/historial.
- **Origen documental:** verificación directa de esta auditoría (no hay informe previo que lo documente).
- **Archivo y sección:** `src/components/views/terminal/views/pos/useSalesCatalog.ts` (confirmCheckout y construcción del body).
- **Fecha del registro original:** 2026-10-16 (esta auditoría).
- **Evidencia en el código actual [VERIFICADO HOY]:** `confirmCheckout = useCallback(async (notes?: string, operationDate?: string)` — el `body: JSON.stringify({ store_id, seller_id, payment_method, … })` construido para `/api/pos/checkout` no contiene `notes`; el schema del endpoint tampoco lo consume en ese payload.
- **Pruebas realizadas:** lectura del hook y del body del fetch; grep de `notes` en schemas.
- **Resultado observado:** notas descartadas en el camino del Catálogo de Ventas (el POS normal sí soporta notas por otros medios según módulos existentes).
- **Impacto de mantenerla pendiente:** pérdida silenciosa de información de negocio; el usuario cree que la nota quedó registrada.
- **Causa raíz confirmada o hipótesis:** el segundo camino de checkout (catálogo) se implementó sin propagar notes al schema V2.
- **Dependencias y riesgos:** ninguna; cambio local en hook + schema.
- **Trabajo que faltaría realizar:** añadir `notes` al body y al schema/route; verificar que `create_sale_v2` lo persista (ya acepta p_notes en familia V2).
- **Criterios de aceptación propuestos:** una venta desde Catálogo con nota la muestra en el detalle/reporte.
- **Método recomendado para verificar la corrección:** venta E2E con nota + inspección de transacción.
- **Limitaciones de la auditoría:** no se verificó si algún otro camino (usePOSCheckout) tiene el mismo problema para notas equivalentes.
- **REMEDIACIÓN MISIÓN 2 (2026-10-17):**
  - **Estado anterior:** PENDIENTE CONFIRMADA → **nuevo estado:** PENDIENTE DE VERIFICACIÓN.
  - **Cambio aplicado (4 puntos del camino de venta del catálogo):**
    1. `useSalesCatalog.ts` (online): `sale_notes: notes?.trim() ? notes.trim().slice(0,1000) : null` en el body de `/api/pos/checkout` (el endpoint ya aceptaba `sale_notes` → `p_notes`).
    2. `useSalesCatalog.ts` (offline): `p_notes` en el enqueue a `createSale`.
    3. `src/validation/schemas.ts`: `p_notes: z.string().max(1000).nullable().optional()` declarado en `createSaleParamsSchema` (sin esto, zod `.parse()` eliminaba la clave del payload encolado).
    4. `src/app/api/sync/batch/route.ts`: `p_notes: op.payload.p_notes || null` propagado al `v2Payload` del replay a `create_sale_v2` (que une la nota manual con la automática de incidencias SIN sobrescribir, `v_notes_final`, migración 20261017000000).
  - **Pruebas de regresión:** `src/__tests__/hooks/useSalesCatalog-notes.test.tsx` — 5/5 ✓ (nota online en body, null sin nota, truncado 1000, p_notes offline, schema no elimina p_notes) + `src/__tests__/integration/sync-batch-pnotes.test.ts` — 3/3 ✓ (contrato de fuente del replay + contrato RPC). Habrían FALLADO con el código anterior.
  - **Verificación adicional:** suite completa vitest 3170/3170 ✓; `tsc --noEmit` EXIT 0 ✓.
  - **Evidencia pendiente para cierre:** venta E2E desde Catálogo con nota y confirmación de la nota visible en detalle/historial de la transacción en entorno desplegado.
  - **Rama/PR:** `fix/mision-2-hotfixes-operativos` (MISIÓN 2).

#### CP-POS-008 — Tasa USD 680 hardcodeada como fallback en el cliente POS/catálogo
- **ID estable:** CP-POS-008 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** 8+ puntos del cliente usan `|| 680` / `DEFAULT_USD_RATE = 680` como tasa por defecto (documentado por el agente de código: `usePOSCheckout.ts:184`, `useSalesCatalog.ts:416,464,177,207,261`, `salesCatalogImport.ts:102`, `salesCatalogHelpers.ts:52`).
- **Comportamiento esperado:** sin tasa confirmada del día, el flujo se bloquea o exige confirmación de tasa (flujo de confirmación diaria), nunca un default silencioso.
- **Origen documental:** verificación directa de esta auditoría (código); sin informe previo específico.
- **Fecha del registro original:** 2026-10-16 (esta auditoría).
- **Evidencia en el código actual [VERIFICADO HOY]:** greps citados; el servidor recalcula y valida (`ERR_TOTAL_MISMATCH`, `ERR_RATE_STALE`), pero el cliente puede mostrar totales con tasa inventada.
- **Pruebas realizadas:** lectura de hooks del POS/catálogo.
- **Resultado observado:** default presente; mitigado por validación server-side (no se producen ventas a tasa falsa, pero sí UX engañosa).
- **Impacto de mantenerla pendiente:** discrepancias de cobro visibles al usuario; fricción en cajón.
- **Causa raíz confirmada o hipótesis:** defaults de la era pre-hardening sin limpieza.
- **Dependencias y riesgos:** flujo de confirmación diaria de tasas (área A).
- **Trabajo que faltaría realizar:** eliminar defaults; bloquear checkout sin tasa válida del día.
- **Criterios de aceptación propuestos:** con tasa ausente/inválida, el checkout exige tasa confirmada.
- **Método recomendado para verificar la corrección:** test con tasa no confirmada.
- **Limitaciones de la auditoría:** censo de 680 hecho por grep; puede haber más puntos.

#### CP-POS-009 — Selector de fecha date-only (medianoche) y Vales de Salida sin selector de fecha
- **ID estable:** CP-POS-009 · **Área:** POS · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el checkout usa selector date-only (medianoche): registrar una venta del mismo día con hora ≥ 12:00 choca con `validate_operation_date` (forward-only). El modal de Vales de Salida no expone selector de fecha aunque la API lo soporta (`p_operation_date`).
- **Comportamiento esperado:** la UI permite operar durante todo el día hábil y registrar vales con fecha económica.
- **Origen documental:** `agent-ctx/informe-final-mision-multitienda.md` (limitaciones UI, 2026-10-12).
- **Fecha del registro original:** 2026-10-12.
- **Evidencia en el código actual:** `useSalesCatalog.ts` confirma con `operationDate?: string`; el modal de vales no lo expone (informe + ausencia detectada por exploración).
- **Pruebas realizadas:** evidencia documental de misión con flujo real.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** operaciones vespertinas retrasadas o registradas al día siguiente (afecta reportes por día).
- **Causa raíz confirmada o hipótesis:** validación forward-only + UI date-only sin hora.
- **Dependencias y riesgos:** CP-POS-010 (fechas del Reporte Entrega).
- **Trabajo que faltaría realizar:** selector datetime o criterio de ventana de negocio; exponer fecha en modal de vales.
- **Criterios de aceptación propuestos:** venta a las 14:00 se registra en su día sin bloqueo.
- **Método recomendado para verificar la corrección:** reproducir venta vespertina en entorno de pruebas.
- **Limitaciones de la auditoría:** no se reprodujo hoy en vivo.

#### CP-POS-010 — Reporte Entrega: discrepancias contables D1-D7 y migración `ref_type` sin aplicar
- **ID estable:** CP-POS-010 · **Área:** POS · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P1
- **Descripción del problema:** la auditoría contable del Reporte Entrega documentó 7 discrepancias (D1 ventas sin ×quantity, D2 reparto proporcional sobre base rota, D3 comisión 1% plano inventada, D4 cash_balance_cup excluye tramo mixed, D5 servicios recibidos sin línea, D6 comisiones no gestionables, D7 sin ajustes extraordinarios). La verificación en vivo validó las fórmulas corregidas, pero quedó BLOQUEADO: la confirmación viva de comisiones/ajustes requiere tienda de pruebas con membresía (revocada) y la migración `ref_type='adjustment'` (20261012000001) NO se aplicó a la base compartida (el endpoint responde 409 informativo hasta deploy).
- **Comportamiento esperado:** reporte contablemente exacto en despliegue, con ajustes y comisiones confirmables en vivo.
- **Origen documental:** `docs/auditoria-reporte-entrega.md`.
- **Fecha del registro original:** ~2026-10 (rama feat/reporte-entrega-auditoria-contable).
- **Evidencia en el código actual:** migración `20261012000001_cash_report_adjustments.sql` existe en repo; estado de aplicación a la BD compartida: NO VERIFICABLE desde aquí (solo lectura).
- **Pruebas realizadas:** evidencia documental de la verificación en vivo de esa misión.
- **Resultado observado:** D6 resuelto en cascada (CP-RES-010: modal gestionable); D5/D7 y el despliegue del resto quedan condicionados.
- **Impacto de mantenerla pendiente:** el reporte puede mostrar cifras contables incompletas en producción hasta aplicar la migración.
- **Causa raíz confirmada o hipótesis:** bloqueo de entorno (membresía revocada) y política de no-aplicar migraciones sin autorización.
- **Dependencias y riesgos:** CP-INFRA-009 (deploy); autorización de migración sobre BD compartida.
- **Trabajo que faltaría realizar:** aplicar migración autorizada + confirmación viva con tienda de pruebas.
- **Criterios de aceptación propuestos:** cash report incluye ajustes (ref_type) y cuadra contra el kardex en un período de prueba.
- **Método recomendado para verificar la corrección:** probar /api/reports/cash-report en preview con migración aplicada.
- **Limitaciones de la auditoría:** el estado real de la BD compartida no pudo consultarse (regla de solo lectura).

### 3.2 Área INV — Inventario y movimientos

#### CP-INV-001 — 4 productos Puerto Padre: inventory ≠ Σ movimientos (remediación post-BR-2)
- **ID estable:** CP-INV-001 · **Área:** INV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** PROD-022 (+999), PROD-021 (+1998), PROD-025 (+103), PROD-016 (+999) tienen `inventory.quantity` ≠ `SUM(stock_movements)` por seed legacy con cantidades simbólicas. El documento declara explícitamente que BR-2 NO remedió estos productos ni generó kardex faltante (proyecto aparte post-BR-2).
- **Comportamiento esperado:** inventario, submayor y kardex coherentes para todos los productos.
- **Origen documental:** `docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** sin migración de remediación posterior localizada para esos 4 productos.
- **Pruebas realizadas:** evidencia documental de la misión Backup/Restore.
- **Resultado observado:** pendiente como proyecto separado.
- **Impacto de mantenerla pendiente:** divergencias permanentes entre inventario y kardex en Puerto Padre; IPV puede marcar RECONCILIATION para esos SKUs.
- **Causa raíz confirmada o hipótesis:** seeds antiguos crearon inventory sin movimientos; decisión Modelo A (inventory=primary) tomada, remediation aplazada.
- **Dependencias y riesgos:** requiere operación gobernada de ajuste con autorización (no puede hacerse en misión read-only).
- **Trabajo que faltaría realizar:** generar movimientos de ajuste inicial + kardex para los 4 productos, con autorización.
- **Criterios de aceptación propuestos:** `inventory.quantity == SUM(stock_movements)` para los 4 productos.
- **Método recomendado para verificar la corrección:** consulta de conciliación post-ajuste (solo lectura).
- **Limitaciones de la auditoría:** no se pudo consultar la BD real para confirmar que siguen divergentes hoy.

#### CP-INV-002 — Productos 160-177 sin precio/costo y nombre provisional
- **ID estable:** CP-INV-002 · **Área:** INV/CAT · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** los productos dados de alta por el negocio (SKUs 160-173) y los nuevos 174-177 están con `price=0/cost=0` y nombres provisionales pendientes del dato comercial.
- **Comportamiento esperado:** todo producto vendible tiene precio y costo; nombre final.
- **Origen documental:** `docs/audits/REGISTRO_MOVIMIENTOS_2026-10-14_15_CONCILIACION_EXISTENCIAS.md` D-5.
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual:** registros `products` citados (9b6a55d5…, f2601c6c…, 8d8df1be…, d04e927a…).
- **Pruebas realizadas:** evidencia documental de la conciliación.
- **Resultado observado:** pendiente del negocio.
- **Impacto de mantenerla pendiente:** ventas con precio 0 o mal calculadas si se venden; márgenes distorsionados; productos «Incompleto» visibles (el detector de completitud existe y los marca).
- **Causa raíz confirmada o hipótesis:** alta acelerada por instrucción del negocio antes de tener la data comercial.
- **Dependencias y riesgos:** dato de negocio (precios/costos oficiales).
- **Trabajo que faltaría realizar:** completar precio/costo/nombre por flujo oficial cuando el negocio informe.
- **Criterios de aceptación propuestos:** 0 productos vendibles con price=0 sin justificación.
- **Método recomendado para verificar la corrección:** query de completitud (product-completeness) sobre el catálogo.
- **Limitaciones de la auditoría:** no se consultó la BD en vivo.
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DE DATOS` — el mecanismo está probado (precedente verificado 2026-10-17, PR #1418: creaciones SKU 178–181, nombres 158/162/176, precio SKU 108→12.000 CUP por flujos oficiales); falta el dato comercial oficial.
  - **Qué debe aportarse:** lista oficial (papel/Excel) con nombre final, `price`, `price_currency`, `cost_price` por SKU con precio/costo 0 (160–177 y otros «Incompleto»). Actualizar sin valores oficiales sería inventar datos (prohibido).
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.5/§6 + `docs/decisions/2026-10-21-propuestas-pendientes.md` PD-3.

#### CP-INV-003 — unit_cost=1 CUP placeholder en 13 recepciones
- **ID estable:** CP-INV-003 · **Área:** INV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** 13 recepciones se registraron con `receipt_items.unit_cost=1` (costo no informado al momento), distorsionando WAC y márgenes de esos productos.
- **Comportamiento esperado:** costo real o costo provisional claramente marcado y corregible.
- **Origen documental:** `docs/audits/REGISTRO_MOVIMIENTOS_2026-10-14_15_CONCILIACION_EXISTENCIAS.md` D-6.
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual:** datos citados en el informe de conciliación.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente de regularización.
- **Impacto de mantenerla pendiente:** COGS/márgenes falsos en reportes de esos productos.
- **Causa raíz confirmada o hipótesis:** registro operativo con dato faltante; flujo sin bloqueo de costo nulo.
- **Dependencias y riesgos:** dato de negocio; corrección gobernada (recalcular WAC).
- **Trabajo que faltaría realizar:** actualizar costos reales + recalcular WAC con protocolo gobernado.
- **Criterios de aceptación propuestos:** 0 recepciones con unit_cost placeholder sin marcar.
- **Método recomendado para verificar la corrección:** query de unit_cost=1 en recepciones.
- **Limitaciones de la auditoría:** no verificable contra BD en vivo.
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DE DATOS` — sin factura o costo declarado por recepción no es posible corregir sin inventar valores; bloqueo registrado.
  - **Qué debe aportarse:** costo real unitario + moneda por cada una de las 13 recepciones. Con datos: corrección gobernada (UPDATE auditado + recálculo WAC con `wac_change_log` + delta 0) o marcado como provisional en columna derivada sin mutar el original.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.6/§6 + PD-4.

#### CP-INV-004 — Precios de catálogo obsoletos (SKU 92, 134, 111)
- **ID estable:** CP-INV-004 · **Área:** INV/CAT · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** catálogo desalineado de la venta real: SKU 92 (catálogo 30 vs ventas 23.700), SKU 134 (catálogo 5 vs 3.950), SKU 111 (catálogo 2.500 vs venta 2.000, −20%). El gate de supervisor no opera porque el precio de catálogo es el viejo.
- **Comportamiento esperado:** precio de catálogo = precio vigente de venta; desvíos disparam autorización de supervisor.
- **Origen documental:** `docs/audits/REGISTRO_MOVIMIENTOS_2026-10-14_15_CONCILIACION_EXISTENCIAS.md` D-3/D-4.
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual:** `products.price` vs ventas citadas en el informe.
- **Pruebas realizadas:** evidencia documental de conciliación.
- **Resultado observado:** acción recomendada NO aplicada.
- **Impacto de mantenerla pendiente:** ventas con autorización eludida; márgenes erróneos; control de precios especiales inoperativo.
- **Causa raíz confirmada o hipótesis:** cambio de precios del negocio sin actualizar catálogo por flujo oficial.
- **Dependencias y riesgos:** dato de negocio + flujo oficial de actualización.
- **Trabajo que faltaría realizar:** actualizar precios (flujo oficial) y auditar el resto del catálogo con la misma comparación.
- **Criterios de aceptación propuestos:** 0 SKUs con desvío catálogo/venta > 5% sin autorización documentada.
- **Método recomendado para verificar la corrección:** comparar products.price vs últimas ventas por SKU.
- **Limitaciones de la auditoría:** listado de la misión limitado a esos 3 SKUs detectados; puede haber más.
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DE DATOS` — desvíos documentados (SKU 92: 30 vs 23.700; SKU 134: 5 vs 3.950; SKU 111: 2.500 vs 2.000) siguen sin corregir por falta del precio oficial vigente; el gate de supervisor sigue inoperante.
  - **Qué debe aportarse:** precios vigentes oficiales de los 3 SKUs (+ decisión sobre auditoría extendida de catálogo con criterio desvío >5%). Precedente de actualización oficial: SKU 108 (PR #1418). Solapa con la resolución en origen de las 26 PRICE_ANOMALY de CP-IPV-001.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.7/§6 + PD-5.

#### CP-INV-005 — 4 divergencias de conciliación 161 SKU + política de stock negativo sin decidir
- **ID estable:** CP-INV-005 · **Área:** INV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** en la conciliación de 161 SKU quedaron 4 divergencias: SKU 113 (+6 preexistente, ajuste «+85 Cuadre importación» 18/08), SKU 127 (+10 — VS rechazada por prohibición de stock negativo), SKU 135 (+27.5 sin explicación), SKU 141 (+10 preexistente). La política operativa para el caso SKU 127 (permitir stock negativo o no) sigue sin decisión.
- **Comportamiento esperado:** divergencias explicadas/regularizadas; política de stock negativo documentada y aplicada.
- **Origen documental:** `agent-ctx/informe-final-mision-multitienda.md` (2026-10-12).
- **Fecha del registro original:** 2026-10-12.
- **Evidencia en el código actual:** constraints `products_stock_current_non_negative` / `inventory_quantity_non_negative` (`20260627000003`); CHECK activo que rechazó la VS del SKU 127.
- **Pruebas realizadas:** evidencia documental (misión con RPC reales).
- **Resultado observado:** «cuadrar referencias del usuario contra el Kardex» quedó como recomendación sin dueño.
- **Impacto de mantenerla pendiente:** diferencias entre inventario y realidad física sin resolver; decisiones de registro bloqueadas (SKU 127).
- **Causa raíz confirmada o hipótesis:** datos pre-IMPORTACIÓN no trazables + política ausente.
- **Dependencias y riesgos:** decisión de negocio; posible ajuste gobernado.
- **Trabajo que faltaría realizar:** decidir política; ajustes gobernados con autorización; actualizar conciliación.
- **Criterios de aceptación propuestos:** 0 divergencias sin clasificar en la próxima conciliación.
- **Método recomendado para verificar la corrección:** re-ejecutar conciliación (read-only) y comparar.
- **Limitaciones de la auditoría:** estado post-14/10 de esos SKUs no verificado en vivo.
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `DECISIÓN RATIFICADA` — política «nunca negativo» ratificada por el propietario el 2026-10-20 (`DECISION_A_STOCK_NEGATIVO_2026-10-20.md`; PR #1431, merge `cc4ce985f`). Las 4 divergencias históricas YA NO EXISTEN (`evidence/20261018-reconciliacion-stock/`: SKU 113: 121=121; SKU 127: 0=0).
  - **Política vs. mecanismo:** política de negocio ratificada (nunca negativo; flujos que «necesiten» negativo se rediseñan como ajuste gobernado + reposición); mecanismo técnico ya vigente (CHECKs BD + `process_inventory_adjustment` + lock DF-06 + tests de regresión). Nada nuevo fue implementado en esta misión.
  - **Efecto pendiente:** regularización de artefactos QA restantes (~10 productos de prueba en TIENDA CENTRAL; 41 divergencias actuales, todas de pruebas/QA) — tarea de higiene separada con autorización por lote del propietario.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.1 + `docs/decisions/2026-10-20-decision-A-stock-negativo.md`.

#### CP-INV-006 — Desfase de 1 día en 54 recepciones importadas
- **ID estable:** CP-INV-006 · **Área:** INV/DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** 54 recepciones importadas el 04/10 quedaron con `reception_date` 16:00 UTC del día anterior (artefacto de importación). El informe dejó un UPDATE opcional NO ejecutado por prudencia.
- **Comportamiento esperado:** fecha de recepción = fecha de negocio.
- **Origen documental:** `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` §3.2.
- **Fecha del registro original:** 2026-10-14/16.
- **Evidencia en el código actual:** datos citados (`recon_discrepancias.csv`).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** convención documentada; corrección opcional sin ejecutar.
- **Impacto de mantenerla pendiente:** reportes agrupados por día desplazan entradas entre días contiguos.
- **Causa raíz confirmada o hipótesis:** TZ/UTC en la importación.
- **Dependencias y riesgos:** UPDATE gobernado sobre datos históricos.
- **Trabajo que faltaría realizar:** decidir si se corrige; UPDATE autorizado si procede.
- **Criterios de aceptación propuestos:** 0 recepciones con desfase documentado si se decide corregir.
- **Método recomendado para verificar la corrección:** query por rango horario.
- **Limitaciones de la auditoría:** no verificable en vivo.

#### CP-INV-007 — SKU 81: ledger «inconsistente» (aclarado como historial real)
- **ID estable:** CP-INV-007 · **Área:** INV · **Estado verificado:** OBSOLETA O REEMPLAZADA · **Prioridad:** P3
- **Descripción del problema:** el registro de movimientos 14-15/10 documentó D-1 (ledger del SKU 81 inconsistente: apertura reconstruida −100). El incidente IPV posterior (§A.6) lo explicó: venta de 100 u revertida el 14/10 + recepción +100 — historial real, no defecto.
- **Comportamiento esperado:** N/A (no es defecto).
- **Origen documental:** `docs/audits/REGISTRO_MOVIMIENTOS…` D-1 + `INCIDENTE_IPV…` §A.6.
- **Fecha del registro original:** 2026-10-16 (aclarado el mismo día por informe posterior).
- **Evidencia en el código actual:** `stock_movements` SKU 81 citado; explicación documental completa.
- **Pruebas realizadas:** contraste de ambos informes.
- **Resultado observado:** tarea reemplazada por la explicación del incidente IPV; lo pendiente real (reconstrucción histórica completa) vive en CP-IPV-001.
- **Impacto de mantenerla pendiente:** ninguno como defecto; solo documentación.
- **Causa raíz confirmada o hipótesis:** lectura inicial sin el contexto de la reversión.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** nada (cierre documental ya hecho).
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

#### CP-INV-008 — transfer-service.ts con comentario «stubs pendientes» ambiguo
- **ID estable:** CP-INV-008 · **Área:** INV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `src/services/transfer-service.ts:142-143` dice «Stubs: funcionalidades pendientes de cablear con Supabase…» e inmediatamente `cancelTransfer` YA llama a la RPC `cancel_transfer`: el comentario está obsoleto o hay stubs reales residual — estado ambiguo del contrato de transferencias.
- **Comportamiento esperado:** sin comentarios engañosos; contrato claro de qué está cableado.
- **Origen documental:** verificación directa (agente de código, 2026-10-16).
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual [VERIFICADO HOY]:** líneas citadas.
- **Pruebas realizadas:** lectura del servicio.
- **Resultado observado:** higiene de código pendiente.
- **Impacto de mantenerla pendiente:** riesgo de confusión en futuras misiones; posible stub real sin cablear.
- **Causa raíz confirmada o hipótesis:** refactor parcial del servicio de transferencias.
- **Dependencias y riesgos:** ninguna.
- **Trabajo que faltaría realizar:** auditar el servicio completo, eliminar comentario o cablear lo que falte.
- **Criterios de aceptación propuestos:** servicio sin comentarios de stubs; funciones todas operativas.
- **Método recomendado para verificar la corrección:** revisión de código + test de cancelación de transferencia.
- **Limitaciones de la auditoría:** no se verificó si la RPC `cancel_transfer` existe en migraciones (el agente no lo confirmó).

#### CP-INV-009 — Vales de Salida sin superficie UI de reversión
- **ID estable:** CP-INV-009 · **Área:** INV/UI · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** el backend `reverse_vale_salida` existe (migración 20260817000001:538-660) pero `ReversibleDocType` de la UI no incluía vale_salida y no había historial de vales en pantalla. El help fue corregido; el gap de presentación permanecía según el flow-discovery.
- **Comportamiento esperado:** reversión de vales operable desde la UI con trazabilidad.
- **Origen documental:** `docs/audits/ENERVIDA-2026-10-05-FLOW-DISCOVERY.md` §2/§8.A.
- **Fecha del registro original:** 2026-10-05/06.
- **Evidencia en el código actual:** `useReverseDocument.ts`; `ValeSalidaReverseModal.tsx` existe (componentes de vales presentes en el árbol); sin constancia de integración del tipo vale_salida en el selector de reversión.
- **Pruebas realizadas:** exploración de componentes; sin pase funcional.
- **Resultado observado:** parcial: modal existe, integración no confirmada.
- **Impacto de mantenerla pendiente:** el operador debe pedir reversiones por vías externas; trazabilidad dispersa.
- **Causa raíz confirmada o hipótesis:** backend-first sin terminar la capa UI.
- **Dependencias y riesgos:** ninguna.
- **Trabajo que faltaría realizar:** integrar vale_salida en ReversibleDocType + historial de vales en la vista.
- **Criterios de aceptación propuestos:** revertir un vale desde la UI y verlo reflejado en kardex.
- **Método recomendado para verificar la corrección:** E2E de reversión de vale.
- **Limitaciones de la auditoría:** el DIAGNOSTICO_VALES_SALIDA (CP-UI-005) solapa parcialmente con esta tarea.

### 3.3 Área IPV — Ingresos por Ventas

#### CP-IPV-001 — PRE_LEDGER/RECONCILIATION permanentes + 26 PRICE_ANOMALY
- **ID estable:** CP-IPV-001 · **Área:** IPV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** TIENDA CENTRAL y ENERVIDA muestran incidencias permanentes PRE_LEDGER / RECONCILIATION / DEVOLUTION_WITHOUT_LEDGER (cargas iniciales sin movimiento de ledger; devoluciones de agosto sin `return` tras reinicio de ledger en sept). ENERVIDA además tiene 26 PRICE_ANOMALY reales sin resolver en origen. El diseño del informe declara que «las diferencias se reportan — NUNCA se ocultan»; el backfill del ledger requiere autorización explícita.
- **Comportamiento esperado:** incidencias explicadas y, si el negocio lo autoriza, ledger reconstruido para eliminar el ruido permanente.
- **Origen documental:** `docs/audits/AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` §5/§15 + `INCIDENTE_IPV…` §D.
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual:** `src/lib/ipv-ventas/compute.ts:70-76` (tipos de incidencia) y §5.6 del informe (51 RECONCILIATION honestas en ENERVIDA).
- **Pruebas realizadas:** evidencia documental de la misión IPV con verificación en vivo.
- **Resultado observado:** visibilidad correcta y deseada; eliminación en origen pendiente de autorización.
- **Impacto de mantenerla pendiente:** alertas permanentes normalizan el ruido y pueden tapar incidencias nuevas reales.
- **Causa raíz confirmada o hipótesis:** datos pre-ledger y resets de ledger históricos.
- **Dependencias y riesgos:** backfill = escritura histórica gobernada (requiere autorización del propietario).
- **Trabajo que faltaría realizar:** política de backfill + ejecución gobernada + resolver PRICE_ANOMALY en origen (precios, no IPV).
- **Criterios de aceptación propuestos:** incidencias históricas clasificadas como «históricas» o eliminadas tras backfill autorizado.
- **Método recomendado para verificar la corrección:** correr verificar_ipv_en_vivo.ts (solo lectura) y comparar conteo de incidencias.
- **Limitaciones de la auditoría:** conteos actuales de incidencias no recalcados hoy (BD solo lectura).
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` — no existe decisión ratificada sobre el backfill del ledger; la auditoría IPv lo dejó expresamente fuera de alcance («requeriría escritura en datos de producción»); el diseño declara que las diferencias «se reportan — NUNCA se ocultan». NADA fue ejecutado.
  - **Delimitación crítica:** este backfill de LEDGER es distinto del backfill de COGS (paquete C `20261020000004` → CP-IPV-002, autorizaciones A5/A6 del expediente CP-SEC-027 v5). A5/A6 NO autorizan este backfill. Las 26 PRICE_ANOMALY se resuelven en origen (precios — solapa CP-INV-004).
  - **Precondiciones propuestas (ninguna ejecutada):** inventario de incidencias por tienda/tipo (baseline antes); evidencia contable de apertura por tienda (papel/Excel de carga inicial); escritura aditiva marcada `backfill` (sin UPDATE de movimientos existentes); reversibilidad; verificación con `verificar_ipv_en_vivo.ts` antes/después; autorización específica por tienda/lote.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.8/§6 + PD-6.

#### CP-IPV-002 — TAREA 3: re-costeo de COGS histórico no iniciado
- **ID estable:** CP-IPV-002 · **Área:** IPV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el re-costeo del COGS histórico (definido en COST-PROVENANCE §10) no se ha iniciado; requiere política por clase de costo (C3/C4/C6) y facturas externas del usuario.
- **Comportamiento esperado:** COGS histórico recalculado bajo política aprobada o decisión explícita de no hacerlo.
- **Origen documental:** `docs/audits/ENERVIDA-WAC-ZERO-COST-CIERRE.md` + `ENERVIDA-COST-PROVENANCE-AUDIT.md` §10.
- **Fecha del registro original:** 2026-10-07.
- **Evidencia en el código actual:** sin migraciones/scripts de re-costeo histórico posteriores.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** márgenes históricos distorsionados en reportes financieros.
- **Causa raíz confirmada o hipótesis:** dependencia de política contable y facturas externas.
- **Dependencias y riesgos:** CP-IPV-003 (WAC inflados) y CP-IPV-004 (procedencia).
- **Trabajo que faltaría realizar:** definir política por clase; protocolo de re-costeo con autorización.
- **Criterios de aceptación propuestos:** COGS recalculado con log auditable por producto.
- **Método recomendado para verificar la corrección:** comparar COGS antes/después en período de prueba.
- **Limitaciones de la auditoría:** —

#### CP-IPV-003 — 4 WAC vigentes inflados 680x + diluciones anómalas
- **ID estable:** CP-IPV-003 · **Área:** IPV/CAT · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** SKU 67, 68, 107 y 121 tienen WAC vigente inflado 680x (USD×680 en era pre-log); SKU 90 y 999 con diluciones anómalas. No corregidos; el COGS histórico de sus ventas ya quedó inflado.
- **Comportamiento esperado:** WAC realista con log de cambio gobernado.
- **Origen documental:** `docs/audits/ENERVIDA-COST-PROVENANCE-AUDIT.md` §8-bis.
- **Fecha del registro original:** 2026-10-07.
- **Evidencia en el código actual:** datos citados; sin corrección posterior localizada.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente (decisión contable posterior).
- **Impacto de mantenerla pendiente:** márgenes absurdos en reportes de esos SKUs; riesgo de decisiones de precio basadas en costos falsos.
- **Causa raíz confirmada o hipótesis:** conversión USD×680 aplicada como costo en era sin wac_change_log.
- **Dependencias y riesgos:** corrección gobernada (mismo tratamiento que los 13 del TAREA 2B).
- **Trabajo que faltaría realizar:** corrección gobernada con wac_change_log + decisión sobre COGS histórico.
- **Criterios de aceptación propuestos:** WAC de los 4 SKUs dentro de rango plausible; cambio auditado.
- **Método recomendado para verificar la corrección:** query de wac_change_log y valores vigentes.
- **Limitaciones de la auditoría:** valores actuales no consultados en vivo.

#### CP-IPV-004 — Procedencia de costos ENERVIDA: 0% con evidencia documental
- **ID estable:** CP-IPV-004 · **Área:** IPV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** la auditoría de procedencia clasificó los costos: 0% con evidencia documental (C1=0); 51% C6 (costo=precio de venta, ratio 1.00x en 32/32); 38,6% C3 (1 CUP nominal); 3,9% C4 (USD×680). Ningún costo es hoy «costo real documentado».
- **Comportamiento esperado:** costos con respaldo documental razonable.
- **Origen documental:** `docs/audits/ENERVIDA-COST-PROVENANCE-AUDIT.md` (reporte-solo, 0 escrituras).
- **Fecha del registro original:** 2026-10-07.
- **Evidencia en el código actual:** artefactos `enervida-cost-provenance.json/csv`.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** condición estructural documentada; condiciona CP-IPV-002.
- **Impacto de mantenerla pendiente:** imposibilidad de defender márgenes ante auditoría externa.
- **Causa raíz confirmada o hipótesis:** era pre-log irreconstruible (90/101 productos).
- **Dependencias y riesgos:** CP-IPV-002.
- **Trabajo que faltaría realizar:** recopilar facturas/soportes del negocio y clasificar de nuevo.
- **Criterios de aceptación propuestos:** % C1 > 0 con soportes archivados.
- **Método recomendado para verificar la corrección:** re-corrida del análisis de procedencia.
- **Limitaciones de la auditoría:** —

#### CP-IPV-005 — Deuda técnica del módulo IPV clásico
- **ID estable:** CP-IPV-005 · **Área:** IPV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** MatchingEngine acoplado a Dexie (difícil de testear), IPVView/TransactionTable sobredimensionados con exceso de estado local, preparación de datos síncrona pesada >500 transacciones. Estrategia de micro-refactor en 4 fases propuesta sin ejecutar. También el scoring de identidad queda «not implemented in metadata yet» (`src/lib/ipv/identity/metrics.ts:8`).
- **Comportamiento esperado:** lógica pura testeable, componentes divididos, DTOs compartidos.
- **Origen documental:** `docs/EVALUACION_IPV.md`.
- **Fecha del registro original:** s/f (análisis estructural).
- **Evidencia en el código actual:** `src/lib/ipv/engine.ts`, `matching.worker.ts`, `TransactionTable.tsx` (exploración del agente).
- **Pruebas realizadas:** exploración de código.
- **Resultado observado:** propuesta sin fechas ni commits.
- **Impacto de mantenerla pendiente:** módulo experimental difícil de mantener; sin riesgo de negocio inmediato.
- **Causa raíz confirmada o hipótesis:** evolución orgánica del módulo MVP.
- **Dependencias y riesgos:** módulo marcado «En desarrollo» (CP-UI-004).
- **Trabajo que faltaría realizar:** refactor en 4 fases + shadow testing.
- **Criterios de aceptación propuestos:** engine testeado sin Dexie; componentes < N líneas.
- **Método recomendado para verificar la corrección:** suite del módulo.
- **Limitaciones de la auditoría:** —

### 3.4 Área CAT — Catálogo y precios

#### CP-CAT-001 — Categorías como texto libre
- **ID estable:** CP-CAT-001 · **Área:** CAT · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `products.category` es texto libre sin tabla de categorías ni integridad referencial; duplicados por tildes.
- **Comportamiento esperado:** tabla `categories` + FK + backfill.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §1.
- **Fecha del registro original:** previa al 2026-10-12.
- **Evidencia en el código actual:** `InventoryView.tsx:295` (input libre) y migración 20260226 (columna texto).
- **Pruebas realizadas:** evidencia del informe; sin migración posterior localizada.
- **Resultado observado:** pendiente (LOW según informe).
- **Impacto de mantenerla pendiente:** filtros/categorías inconsistentes para el consumidor.
- **Causa raíz confirmada o hipótesis:** diseño MVP.
- **Dependencias y riesgos:** backfill de categorías existentes.
- **Trabajo que faltaría realizar:** migración + UI de categorías + backfill.
- **Criterios de aceptación propuestos:** 0 categorías duplicadas por ortografía.
- **Método recomendado para verificar la corrección:** query distinct categories.
- **Limitaciones de la auditoría:** —

#### CP-CAT-002 — confirm_transfer casa producto destino solo por SKU
- **ID estable:** CP-CAT-002 · **Área:** CAT/INV · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `confirm_transfer` (`20260626000005:194`) casa el producto en la tienda destino únicamente por SKU, sin validar unidad de medida ni tenant: frágil ante SKUs reutilizados.
- **Comportamiento esperado:** match por (tenant, sku) + sanity-check de unidad.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §6.
- **Fecha del registro original:** previa al 2026-10-12.
- **Evidencia en el código actual:** migración citada; sin fix posterior localizado.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente (LOW).
- **Impacto de mantenerla pendiente:** transferencias cruzadas incorrectas si hay colisión de SKU entre tiendas.
- **Causa raíz confirmada o hipótesis:** supuesto de unicidad global de SKU.
- **Dependencias y riesgos:** ninguno grave con SKU único por tienda (`20260124_enforce_store_sku_uniqueness.sql`), pero el match sigue sin tenant explícito.
- **Trabajo que faltaría realizar:** endurecer match y validaciones.
- **Criterios de aceptación propuestos:** transferencia con SKU colisionado falla de forma controlada.
- **Método recomendado para verificar la corrección:** test de RPC con escenario de colisión.
- **Limitaciones de la auditoría:** —

#### CP-CAT-003 — catalog_selectedCategories persiste entre sesiones
- **ID estable:** CP-CAT-003 · **Área:** CAT/UI · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** misma clase de defecto que la regresión #1379 resuelta para `catalog_searchTerm`: las categorías seleccionadas también persisten entre sesiones (CM-3.8) y no recibieron el mismo tratamiento.
- **Comportamiento esperado:** filtros de catálogo efímeros o scoped con consentimiento.
- **Origen documental:** `docs/audits/INVENTORY-CATALOG-REGRESSION-1379.md` §9.1.
- **Fecha del registro original:** 2026-10-08.
- **Evidencia en el código actual:** sin refactor posterior localizado de esa clave.
- **Pruebas realizadas:** evidencia documental de la misión de regresión.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** catálogo «oculta» productos por filtros heredados (confusión operativa).
- **Causa raíz confirmada o hipótesis:** persistencia ampla de estado de UI en localStorage.
- **Dependencias y riesgos:** ninguna.
- **Trabajo que faltaría realizar:** tratar como searchTerm (purga + efímero) + test de regresión.
- **Criterios de aceptación propuestos:** nueva sesión = filtros por defecto.
- **Método recomendado para verificar la corrección:** test de regresión del catálogo.
- **Limitaciones de la auditoría:** —

#### CP-CAT-004 — Alta de producto en recepción sin tenant_id → 403
- **ID estable:** CP-CAT-004 · **Área:** CAT · **Estado verificado:** PENDIENTE DE VERIFICACIÓN (M2, 2026-10-17) · **Prioridad:** P1
- **Descripción del problema:** el alta manual de producto desde la recepción (`useReceptionState.executeSubmit`) inserta en `products` sin `tenant_id`; la policy RLS `products_tenant_insert` (v2.21) lo rechaza con 403. En la misión del 12/10 el producto solo se pudo crear vía JWT con tenant_id.
- **Comportamiento esperado:** el alta desde recepción funciona con el tenant de la sesión.
- **Origen documental:** `agent-ctx/informe-final-mision-multitienda.md` (2026-10-12).
- **Fecha del registro original:** 2026-10-12.
- **Evidencia en el código actual [VERIFICADO HOY]:** `src/hooks/api/useReceptions.ts` — `productsData` (~:250-266) construye sku/name/cost_price/price y el `.from('products').insert(productsData)` (~:267-270) sin campo `tenant_id`.
- **Pruebas realizadas:** lectura del hook hoy; repro documentado en la misión.
- **Resultado observado:** el código sigue sin tenant_id.
- **Impacto de mantenerla pendiente:** el operador no puede dar de alta productos nuevos desde recepción (bloqueo operativo diario en tienda).
- **Causa raíz confirmada o hipótesis:** v2.21 endureció RLS por tenant sin actualizar este camino de cliente.
- **Dependencias y riesgos:** ninguna; fix local + posible columna default en policy.
- **Trabajo que faltaría realizar:** incluir tenant_id (de la sesión/tienda activa) o ajustar policy con WITH CHECK controlado; test.
- **Criterios de aceptación propuestos:** alta de producto desde recepción OK con usuario de tienda.
- **Método recomendado para verificar la corrección:** E2E de recepción con producto nuevo.
- **Limitaciones de la auditoría:** no se ejecutó el flujo en vivo hoy.
- **REMEDIACIÓN MISIÓN 2 (2026-10-17):**
  - **Estado anterior:** PENDIENTE CONFIRMADA → **nuevo estado:** PENDIENTE DE VERIFICACIÓN.
  - **Nota de alcance:** la vista nueva (`useReceptionState`, inventario) ya tenía el RLS-FIX propio (verificado en código y protegido por `useReceptionState-tenant-rls.test.tsx`); el insert SIN tenant_id sobrevivía en el camino de fallback `useSavePendingReception` (`useReceptions.ts`) — cualquier caller con items `is_new` sin `product_id` caía ahí. Este fix cubre ese hueco.
  - **Cambio aplicado:** `useSavePendingReception` ahora resuelve `tenant_id` leyendo `stores.tenant_id` con el JWT del usuario (patrón RLS-FIX canónico: `stores_tenant_select` valida la identidad; el valor no es dato arbitrario del cliente), fail-closed si la tienda no es legible o `tenant_id` es NULL, e incluye `tenant_id: verifiedTenantId` en el insert de products.
  - **Pruebas de regresión:** `src/__tests__/hooks/useSavePendingReception-tenant-rls.test.tsx` — 5/5 ✓ (insert con tenant verificado, fail-closed NULL, fail-closed error BD, camino sin is_new intacto, consulta de stores por tienda del parámetro). Habrían FALLADO con el código anterior (insert sin tenant_id).
  - **Verificación adicional:** suite completa vitest 3170/3170 ✓; `tsc --noEmit` EXIT 0 ✓.
  - **Evidencia pendiente para cierre:** recepción E2E con producto nuevo por usuario de tienda en entorno desplegado (200 + producto creado con tenant correcto).
  - **Rama/PR:** `fix/mision-2-hotfixes-operativos` (MISIÓN 2).

#### CP-CAT-005 — /api/catalog/bulk-import sin Zod por fila y store_id del body
- **ID estable:** CP-CAT-005 · **Área:** CAT/SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** el endpoint de importación masiva de catálogo valida filas con checks manuales (`products: any[]`, sin Zod por elemento) y toma `store_id` del body sin revalidar tenant del store para admins; el resto del repo usa Zod fail-closed. Punto más débil de la superficie de importación; además figura en el backlog del Security CI Gate como prioridad Alta (R1).
- **Comportamiento esperado:** Zod por fila + membership/tenant revalidado server-side.
- **Origen documental:** verificación directa (agente de código) + `docs/SECURITY_CI_GATE_FINDINGS_BACKLOG.md`.
- **Fecha del registro original:** 2026-10-16 (código) / 2026-08-02 (backlog).
- **Evidencia en el código actual [VERIFICADO HOY]:** `src/app/api/catalog/bulk-import/route.ts:34,46,75`.
- **Pruebas realizadas:** lectura del route.
- **Resultado observado:** validación débil confirmada.
- **Impacto de mantenerla pendiente:** importaciones corruptas o escrituras en tienda no autorizada si RLS/service_role falla.
- **Causa raíz confirmada o hipótesis:** endpoint pre-gate sin refactors posteriores.
- **Dependencias y riesgos:** CP-SEC-006 (campaña general de endpoints).
- **Trabajo que faltaría realizar:** schema Zod + validación de membresía + tests.
- **Criterios de aceptación propuestos:** payload inválido → 400 con detalle por fila; store no autorizado → 403.
- **Método recomendado para verificar la corrección:** test de contrato del endpoint.
- **Limitaciones de la auditoría:** —

#### CP-CAT-006 — received_services históricos con service_type_id NULL
- **ID estable:** CP-CAT-006 · **Área:** CAT/DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** servicios históricos con `service_type_id=NULL` subestiman el contador de uso de tipos; el backfill por nombre no se ejecutó (no alterar históricos).
- **Comportamiento esperado:** backfill autorizado o decisión de dejar históricos intactos.
- **Origen documental:** `docs/audits/AUDITORIA_SERVICIOS_RECIBIDOS_TIPOS_Y_AJUSTES_VISUALES_2026-10-15.md` §13.1.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** sin migración de backfill posterior.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** métricas de uso de tipos de servicio subestimadas.
- **Causa raíz confirmada o hipótesis:** migración de tipos posterior al histórico.
- **Dependencias y riesgos:** escritura histórica gobernada.
- **Trabajo que faltaría realizar:** backfill por nombre con autorización.
- **Criterios de aceptación propuestos:** 0 received_services con NULL si se autoriza el backfill.
- **Método recomendado para verificar la corrección:** query post-backfill.
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` — no existe decisión sobre el backfill por nombre. Opciones: (1) backfill gobernado autorizado (escritura histórica auditada, verificación 0 NULL) o (2) decisión formal de mantener históricos intactos (subestimación permanente documentada).
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.11 + PD-9.

#### CP-CAT-007 — Gestión de tipos de servicio por tienda sin UI
- **ID estable:** CP-CAT-007 · **Área:** CAT/UI · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** la gestión de tipos de servicio por tienda (schema-level soportado en `service_types.store_id`) no tiene UI: solo el admin global puede crear tipos; el manager de tienda debe solicitarlo.
- **Comportamiento esperado:** decisión de diseño: UI por tienda o política documentada de solicitud.
- **Origen documental:** `docs/audits/AUDITORIA_SERVICIOS_RECIBIDOS_TIPOS_Y_AJUSTES_VISUALES_2026-10-15.md` §13.2.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** manager global existe (`ServiceTypesManagerModal.tsx` — fix CP-RES-008); sin manager por tienda.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente de decisión.
- **Impacto de mantenerla pendiente:** fricción operativa menor (dependencia del admin global).
- **Causa raíz confirmada o hipótesis:** alcance de misión limitado al fix global.
- **Dependencias y riesgos:** CP-RES-008.
- **Trabajo que faltaría realizar:** extender manager por tienda si el negocio lo quiere.
- **Criterios de aceptación propuestos:** manager de tienda puede gestionar sus tipos si se decide.
- **Método recomendado para verificar la corrección:** E2E con usuario manager.
- **Limitaciones de la auditoría:** —

#### CP-CAT-008 — Formulario/modal de servicios sin pase manual con sesión real
- **ID estable:** CP-CAT-008 · **Área:** CAT · **Estado verificado:** NO VERIFICABLE · **Prioridad:** P3
- **Descripción del problema:** la misión de servicios (SR-01/02/13) no pudo verificar formulario y modal en navegador con sesión real (sin credenciales); quedaron cubiertos por 23 tests jsdom.
- **Comportamiento esperado:** pase manual/E2E al desplegar.
- **Origen documental:** `docs/audits/AUDITORIA_SERVICIOS_RECIBIDOS_TIPOS_Y_AJUSTES_VISUALES_2026-10-15.md` SR-01/02/13.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual:** tests jsdom presentes; sin E2E específico localizado.
- **Pruebas realizadas:** esta auditoría tampoco ejecutó sesión real (limitación de credenciales).
- **Resultado observado:** no verificable en ambas misiones.
- **Impacto de mantenerla pendiente:** riesgo de regresión visual/funcional no detectada en ese formulario.
- **Causa raíz confirmada o hipótesis:** falta de credenciales E2E (relacionado CP-INFRA-011).
- **Dependencias y riesgos:** CP-INFRA-011.
- **Trabajo que faltaría realizar:** pase manual con sesión real o spec E2E.
- **Criterios de aceptación propuestos:** E2E verde del formulario de servicios.
- **Método recomendado para verificar la corrección:** correr E2E con credenciales del runner.
- **Limitaciones de la auditoría:** sin acceso a credenciales reales de usuario final.

### 3.5 Área SEC — Usuarios, roles y seguridad

#### CP-SEC-001 — RLS «Productos públicos - lectura» cross-tenant — RESUELTA
- **ID estable:** CP-SEC-001 · **Área:** SEC · **Estado verificado:** RESUELTA VERIFICADA
- **Descripción original:** la policy «Productos públicos - lectura» (`20260619000006:135-136`) permitía a CUALQUIER usuario `authenticated` leer productos `visible_en_tienda=true` de TODAS las tiendas (P0 del audit_v3).
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §2.3.
- **Evidencia de resolución [VERIFICADO HOY]:** la policy fue **DROPpeada** en `supabase/migrations/20260726000032_v2_12_critical_fixes.sql:168` y reemplazada por una policy **anon** que filtra por `store_id` para la tienda pública; el acceso `authenticated` queda gobernado por `products_select_store_access`. Sin migración posterior que la reintroduzca.
- **Justificación de «resuelta»:** evidencia de migraciones en el repo (la cadena de migraciones es la fuente de verdad del esquema). Verificación funcional en producción pendiente (solo lectura).
- **Limitaciones:** no se consultó el catálogo LIVE de policies de la BD compartida.

#### CP-SEC-002 — Lectura de ventas por ex-vendedores (policy seller_id) — RESUELTA
- **ID estable:** CP-SEC-002 · **Área:** SEC · **Estado verificado:** RESUELTA VERIFICADA
- **Descripción original:** «Transactions select» permitía `seller_id = auth.uid()`: ex-miembros conservaban lectura de todas sus ventas históricas (HIGH).
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §2.4.
- **Evidencia de resolución [VERIFICADO HOY]:** la policy antigua fue DROPpeada en `20260807000012_v2_21_5_rls_drop_old_policies.sql:20` y reemplazada por `transactions_tenant_select` (`20260807000005_v2_21_0_rls_tenant_policies.sql:84-94`), cuyo USING NO incluye `seller_id`: usa `is_admin()` / `has_store_access(store_id)` / tenant.
- **Justificación:** cadena de migraciones confirma el reemplazo. Nota: `Transactions update status` con término seller_id también fue dropeada en el mismo archivo.
- **Limitaciones:** verificación funcional no ejecutada contra BD real.

#### CP-SEC-003 — deny_client_writes de products anulado por policies OR
- **ID estable:** CP-SEC-003 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** la policy DENY `20260113_strengthen_rls.sql:33-38` es anulada por policies OR de update posteriores (patrón PostgreSQL: OR entre policies permisivas).
- **Comportamiento esperado:** consolidación de policies que garantice el deny efectivo.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §2.5 (LOW).
- **Fecha del registro original:** previa al 2026-10-12.
- **Evidencia en el código actual:** sin consolidación posterior localizada de esas policies de products (v2.21 creó policies nuevas de tenant; revisar solape).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** escrituras de cliente que deberían estar denegadas pueden pasar por otra policy OR.
- **Causa raíz confirmada o hipótesis:** acumulación histórica de policies sin consolidación.
- **Dependencias y riesgos:** auditar con el patrón de v2.21 (posible que ya esté mitigado por el reordenamiento).
- **Trabajo que faltaría realizar:** re-auditar policies de products y consolidar.
- **Criterios de aceptación propuestos:** matriz de policies de products sin conflictos OR con el DENY.
- **Método recomendado para verificar la corrección:** test RLS (existe infra en supabase/tests).
- **Limitaciones de la auditoría:** estado LIVE de policies no consultado.

#### CP-SEC-004 — Sin audit_logs en transfers directos y updates de recepciones
- **ID estable:** CP-SEC-004 · **Área:** SEC · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P1
- **Descripción del problema:** el audit_v3 documentó ausencia de auditoría en ventas V2.1+, `void_transaction`, `POST /api/transfers` (INSERT directo que bypassa el RPC, sin BOLA ni audit) y updates/voids de recepciones.
- **Comportamiento esperado:** toda operación sensible deja rastro en `audit_logs`.
- **Origen documental:** `docs/audits/audit_v3_multi_store.md` §7 (HIGH, compliance).
- **Fecha del registro original:** previa al 2026-10-12.
- **Evidencia en el código actual:** create_sale_v2 y void_transaction YA auditan/registran [VERIFICADO HOY — ver CP-RES-012]; `src/app/api/transfers/route.ts:114-133` mantiene INSERT directo sin audit; `useReceptions.ts:88-192` updates sin audit (exploración).
- **Pruebas realizadas:** lectura de route/migraciones.
- **Resultado observado:** parcial: el núcleo de ventas audita; transfers y recepciones no.
- **Impacto de mantenerla pendiente:** operaciones de transferencia y recepción sin rastro de quién hizo qué (impedimento de investigación post-incidente).
- **Causa raíz confirmada o hipótesis:** el fix se centró en el camino de ventas.
- **Dependencias y riesgos:** refactor de transfers hacia RPC con audit (recomendación P1 del audit_v3).
- **Trabajo que faltaría realizar:** RPC de transferencias con audit + auditoría en recepciones.
- **Criterios de aceptación propuestos:** toda transferencia/recepción genera audit_logs con actor.
- **Método recomendado para verificar la corrección:** reproducir operación y consultar audit_logs.
- **Limitaciones de la auditoría:** no se probó en vivo.

#### CP-SEC-005 — Debilidades residuales del anti-spoofing
- **ID estable:** CP-SEC-005 · **Área:** SEC · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P1
- **Descripción del problema:** el fix V2.12.9-11 resolvió el spoofing principal (CP-RES-001), pero el self-evaluation documentó 9 debilidades: patrón residual `IS NOT NULL AND NOT` en funciones, 0 GRANTs explícitos, 0 COMMENTs, `anon=X` en ACLs, `storeApiClient` sin paginación, sin tests de regresión, migración monolítica 84 KB, escape hatch `?all=true`.
- **Comportamiento esperado:** plan V2.12.12/13/14 aplicado (propuesto ~2 h en el informe).
- **Origen documental:** `docs/audits/audit_self_evaluation_v2_12_9_10_11.md`.
- **Fecha del registro original:** 2026-07-28.
- **Evidencia en el código actual [VERIFICADO HOY]:** grep de `IS NOT NULL AND NOT` encuentra **30 archivos** de migraciones con el patrón (fixes LIVE out-of-band certificados 134/134 según allowlist, pero el replay del histórico reintroduciría el SQL vulnerable).
- **Pruebas realizadas:** grep sobre supabase/migrations/.
- **Resultado observado:** deuda estructural confirmada; el plan propuesto nunca se ejecutó.
- **Impacto de mantenerla pendiente:** si se restaura la BD desde migraciones (DR, entorno nuevo), las defensas anti-spoofing quedan débiles.
- **Causa raíz confirmada o hipótesis:** fixes aplicados directamente en LIVE sin migración de saneamiento.
- **Dependencias y riesgos:** CP-INFRA-004 (allowlist y su vencimiento).
- **Trabajo que faltaría realizar:** migración de saneamiento del histórico SQL + GRANTs/COMMENTs + tests de regresión.
- **Criterios de aceptación propuestos:** replay limpio de migraciones = superficie segura sin allowlist.
- **Método recomendado para verificar la corrección:** `supabase db reset` + correr security-contract tests.
- **Limitaciones de la auditoría:** el patrón residual puede estar inactivo (definiciones históricas) — no se evaluó función por función.

#### CP-SEC-006 — 52 endpoints sin Zod/validación de auth (backlog Security CI Gate)
- **ID estable:** CP-SEC-006 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** el backlog del 2026-08-02 lista 52 endpoints con issues (48 sin Zod, 18 sin auth middleware): 5 prioridad Alta (`stores/[id]/backup/restore`, `stores/[id]/archive`, `stores/[id]/restore`, `catalog/bulk-import`, `exchange-rates/bulk-upload`), 21 Media, 26 Baja. La regla del backlog («al corregir, remover del backlog») nunca muestra commits de remoción.
- **Comportamiento esperado:** todos los endpoints con Zod + auth middleware; backlog vacío.
- **Origen documental:** `docs/SECURITY_CI_GATE_FINDINGS_BACKLOG.md` (baseline v2.12.50).
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** sin evidencia de campaña de corrección posterior; `catalog/bulk-import` verificado hoy sin Zod (CP-CAT-005).
- **Pruebas realizadas:** contraste del backlog con el estado de un endpoint de la lista Alta.
- **Resultado observado:** backlog vigente.
- **Impacto de mantenerla pendiente:** superficie de ataque amplia (restore de tiendas, bulk ops); inconsistencia de validación en todo el API.
- **Causa raíz confirmada o hipótesis:** deuda previa al gate; corrección gradual nunca planificada con fechas.
- **Dependencias y riesgos:** CP-INFRA-004 (allowlist); CP-CAT-005.
- **Trabajo que faltaría realizar:** campaña por prioridades (5 Alta primero) con remoción del backlog por endpoint.
- **Criterios de aceptación propuestos:** 5 endpoints Alta corregidos y removidos del backlog.
- **Método recomendado para verificar la corrección:** re-corrida de ci-gate-ts-checks.js.
- **Limitaciones de la auditoría:** no se re-corrió el gate (requiere setup).

#### CP-SEC-007 — Security CI Gate: skip silencioso de checks SQL y doc desactualizado
- **ID estable:** CP-SEC-007 · **Área:** SEC/INFRA · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** el workflow `security-gate.yml` se salta los checks SQL con exit 0 si `DATABASE_URL` no está configurado (gate que no falla = no gate). Además `docs/SECURITY_CI_GATE_DESIGN.md` §9 sigue diciendo «Scripts ⏳ Pendiente / Workflow ⏳ Pendiente / Allowlist ⏳ Pendiente» aunque ya está implementado.
- **Comportamiento esperado:** el gate falla explícitamente si no puede ejecutarse; documentación al día.
- **Origen documental:** `docs/SECURITY_CI_GATE_DESIGN.md` + verificación del workflow (agente CI).
- **Fecha del registro original:** 2026-08-02 (doc) / estado actual del workflow.
- **Evidencia en el código actual:** `.github/workflows/security-gate.yml` (skip silencioso); allowlist-review con expiración SÍ activa.
- **Pruebas realizadas:** lectura del workflow.
- **Resultado observado:** parcial: gate TS bloqueante OK; gate SQL condicional.
- **Impacto de mantenerla pendiente:** falsa sensación de protección en PRs de migraciones cuando DATABASE_URL falta.
- **Causa raíz confirmada o hipótesis:** decisión pragmática para evitar fallos en forks/sandboxes.
- **Dependencias y riesgos:** CP-INFRA-004.
- **Trabajo que faltaría realizar:** fail-closed del gate SQL + actualizar doc §9.
- **Criterios de aceptación propuestos:** PR con migración y sin DATABASE_URL NO pasa el gate en verde.
- **Método recomendado para verificar la corrección:** abrir PR de prueba sin secretos.
- **Limitaciones de la auditoría:** —

#### CP-SEC-008 — Backlog formal DT-01..DT-18 sin cierre por ítem
- **ID estable:** CP-SEC-008 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el acta de cierre v2.12.50 (`AUDIT_CLOSURE_REPORT_v1.md`) y el snapshot de superficie (`SECURITY_BASELINE_SNAPSHOT_v1.md`) registran deuda técnica formal DT-01…DT-18: DT-01 is_admin≡is_global_admin (57 policies), DT-02 manage_user_memberships sin auth.uid explícito, DT-03 tenant_id, DT-05 plan enum, DT-08/09 cleanup jobs (bulk_ops_log, tokens), DT-12 store laboratorio, DT-13 snapshot externo >100MB, etc. Control de regresión declarado «⚠️ Parcial — CI Gate pendiente».
- **Comportamiento esperado:** cada DT con estado, dueño y cierre.
- **Origen documental:** `docs/AUDIT_CLOSURE_REPORT_v1.md` + `docs/SECURITY_BASELINE_SNAPSHOT_v1.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** sin commits de cierre por ítem localizados (salvo los resueltos en la propia iteración 9).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** backlog vivo.
- **Impacto de mantenerla pendiente:** deuda de seguridad visible pero difusa; riesgo de perderla en cada reinicio de contexto.
- **Causa raíz confirmada o hipótesis:** backlog bien diseñado sin plan de ejecución asignado.
- **Dependencias y riesgos:** DT-03/DT-06 tienen tareas propias (CP-SEC-010/011); DT-02 solapa CP-SEC-020.
- **Trabajo que faltaría realizar:** triage de los 18 ítems: cerrar/programar/descartar con evidencia.
- **Criterios de aceptación propuestos:** cada DT con estado actualizado en el backlog.
- **Método recomendado para verificar la corrección:** revisar el backlog actualizado.
- **Limitaciones de la auditoría:** —

#### CP-SEC-009 — Modelo de autorización: H-09-AUTH-01..04
- **ID estable:** CP-SEC-009 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** 4 deudas de modelo: is_admin()==is_global_admin() idénticas usadas en 57 RLS policies; sincronización role↔role_id unidireccional; `manager` como rol global inconsistente; frontend mezcla rol global y membership en paralelo.
- **Comportamiento esperado:** modelo de roles unificado (Opción A alias recomendada y marcada «NO implementar ahora» en su día).
- **Origen documental:** `docs/ITERATION_9_AUTH_MODEL_AUDIT.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** sin migración de unificación posterior; conviven convenciones (ver CP-SEC-015).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** «deuda técnica a resolver en iteración posterior» — sin iteración posterior documentada.
- **Impacto de mantenerla pendiente:** cambios de roles con efectos no obvios en 57 policies; riesgo de escalada por inconsistencia.
- **Causa raíz confirmada o hipótesis:** evolución histórica de dos sistemas de roles.
- **Dependencias y riesgos:** CP-SEC-008 (DT-01), CP-SEC-015.
- **Trabajo que faltaría realizar:** alias/migración de funciones + tests RLS.
- **Criterios de aceptación propuestos:** una sola fuente de verdad de roles; tests RLS verdes.
- **Método recomendado para verificar la corrección:** supabase/tests + review de policies.
- **Limitaciones de la auditoría:** —

#### CP-SEC-010 — DT-03: decisión single vs multi-tenant sin aprobar
- **ID estable:** CP-SEC-010 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `tenant_id` está «activo pero no utilizado» (17/18 profiles y 16/16 stores NULL → single-tenant de facto); la decisión de producto (single vs multi vs status quo) está documentada con recomendación «status quo» pero sin aprobación.
- **Comportamiento esperado:** decisión aprobada y registrada; políticas consistentes con ella.
- **Origen documental:** `docs/TENANT_ARCHITECTURE_DECISION.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** 6 RLS policies dependen de `has_store_access()`/tenant (v2.21) — consistentes con ambas decisiones, pero el estado NULL general hace el multi-tenant teórico.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente de aprobación del producto.
- **Impacto de mantenerla pendiente:** esfuerzo de mantenimiento de lógica tenant no usada; ambigüedad de aislamiento real.
- **Causa raíz confirmada o hipótesis:** arquitectura preparada para multi-tenant con un solo tenant real.
- **Dependencias y riesgos:** bloquea DT-03 y decisiones de aislamiento por tienda.
- **Trabajo que faltaría realizar:** decisión + (si multi) backfill de tenant_id gobernado.
- **Criterios de aceptación propuestos:** decisión firmada en docs/decisions.
- **Método recomendado para verificar la corrección:** registro de decisión.
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `DECISIÓN RATIFICADA — EFECTO PARCIAL` — el propietario CONFIRMÓ el 2026-10-19 conservar la arquitectura multi-tenant; single-tenant únicamente como descripción de la situación operativa actual (`DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B; protocolo de 6 pasos con evidencia viva en `evidence/20261019-dt03-matriz-acceso/`). Sin contradicción concreta que obligue a reabrir. `TENANT_ARCHITECTURE_DECISION.md` (2026-08-02, «pendiente») quedó sustituido — requiere solo anotación de cierre.
  - **Perfiles pendientes — NO asignados automáticamente:** david9999 = backfill EJECUTADO (2026-10-19 18:29:50Z, transaccional + auditado; autorización original D-3 conversacional) → **ratificación a posteriori pendiente (A7 del expediente CP-SEC-027 v5)**; 10 perfiles restantes clasificados SIN EVIDENCIA → validación individual exigida por la propia decisión DT-03.
  - **Registros:** `docs/decisions/2026-10-19-decision-B-dt03-multi-tenant.md` + `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.3/§4.

#### CP-SEC-011 — DT-06: reconciliación de auth.users huérfanos sin implementar
- **ID estable:** CP-SEC-011 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el diseño de detección/reconciliación de auth.users huérfanos (tabla orphaned_users_log, cron horario, auto-delete >1h con audit log) está listo pero «Implementación ⏳ Pendiente aprobación». La FK `profiles_id_fkey` NO ACTION permite huérfanos.
- **Comportamiento esperado:** detección y limpieza automática de huérfanos aprobada e implementada.
- **Origen documental:** `docs/USER_RECONCILIATION_DESIGN.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** sin migración de implementación posterior; existe panel de orphans (`OrphanUsersPanel.tsx`) para gestión manual.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** usuarios residuales (ya hubo 364 limpiados a mano) pueden acumularse otra vez.
- **Causa raíz confirmada o hipótesis:** dependencia de aprobación.
- **Dependencias y riesgos:** borrado automático requiere salvaguardas (ban list de pilotos A/B).
- **Trabajo que faltaría realizar:** implementar cron + tabla + audit.
- **Criterios de aceptación propuestos:** 0 huérfanos > 24 h en producción.
- **Método recomendado para verificar la corrección:** query de huérfanos semanal.
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` — el diseño (`USER_RECONCILIATION_DESIGN.md`, 2026-08-02, «pendiente aprobación») sigue sin aprobación; DT-06 NO figuró en ninguna de las decisiones ratificadas de octubre (A/B/B.1/C/D/E). No hay decisión previa que respetar ni reabrir.
  - **Opciones preparadas:** (1) implementación completa (tabla `orphaned_users_log` + cron + auto-delete con ban list de pilotos A/B); (2) detección automática + borrado humano (`OrphanUsersPanel.tsx` existe); (3) diferir. Antecedente: 364 huérfanos ya limpiados a mano.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.4 + PD-2.

#### CP-SEC-012 — Bugs de seguridad ACTIVOS documentados como test.fail (BUG-013/017/022/024)
- **ID estable:** CP-SEC-012 · **Área:** SEC · **Estado verificado:** RESUELTA EN CÓDIGO — VERIFICADA (MISIÓN B, 2026-10-21); cierre formal pendiente de sonda de despliegue + índice A4 + actualización de specs · **Prioridad:** **P0**
- **Descripción del problema:** cuatro bugs con tests invertidos (`test.fail` = el test «pasa» mientras el bug vive): **BUG-017** `/api/legal/incidents` acepta requests sin autenticación (`e2e/auth.spec.ts:46`); **BUG-022** URL de reportes accesible sin autenticación (`e2e/reports.spec.ts:51`, «bug ACTIVO documentado»); **BUG-013** XSS almacenado en filename de academy (`e2e/academy.spec.ts:71`); **BUG-024** incidents.json efímero en serverless (skip permanente, deuda de arquitectura, `e2e/legal.spec.ts:81`).
- **Comportamiento esperado:** endpoints con auth; XSS sanitizado; persistencia correcta de incidentes.
- **Origen documental:** `E2E-COVERAGE-REPORT.md` + specs E2E citadas.
- **Fecha del registro original:** 2026-09-27 (report E2E-80).
- **Evidencia en el código actual:** specs con test.fail/ skip activos en el árbol.
- **Pruebas realizadas:** lectura de specs (agente CI); sin reproducción activa de los bugs.
- **Resultado observado:** sin tickets de cierre ni fixes localizados posteriores al report.
- **Impacto de mantenerla pendiente:** BUG-022 = acceso no autorizado a reportes (riesgo P0 de fuga de datos de negocio); BUG-013 = XSS; BUG-017 = fuga de incidentes; patrón test.fail puede enmascararlos para siempre.
- **Causa raíz confirmada o hipótesis:** endpoints legales/reportes fuera del hardening principal; decisión de documentar en vez de corregir en la fase E2E-80.
- **Dependencias y riesgos:** ninguno para empezar; BUG-024 requiere decisión de persistencia.
- **Trabajo que faltaría realizar:** auth en ambos endpoints + sanitización + persistencia de incidents.json; invertir los tests a `test.pass` al corregir.
- **Criterios de aceptación propuestos:** 401 sin token en legal/incidents y reports; XSS neutralizado; specs sin test.fail.
- **Método recomendado para verificar la corrección:** curl sin token (debe dar 401) + suite E2E.
- **Limitaciones de la auditoría:** no se ejecutaron los endpoints contra producción (solo lectura); la vigencia real de BUG-017/022 en el deploy actual NO VERIFICABLE funcionalmente.
- **VERIFICACIÓN PASIVA MISIÓN 2 (2026-10-17, Misión B del plan):**
  - **Estado anterior:** PENDIENTE CONFIRMADA → **nuevo estado:** PARCIALMENTE RESUELTA.
  - **BUG-017 CORREGIDO:** POST `/api/legal/incidents` sin token → **401** (verificado con curl contra servidor local dev el 2026-10-17; código: `getServerSession` + 401 en `route.ts:79-84`). Sin escritura residual (`data/incidents.json` permanece vacío y trackeado).
  - **BUG-022 CORREGIDO:** GET `/api/reports/download/[runId]` sin token → **401** (verificado local; código: `withAuth` + ownership del run en `download/[runId]/route.ts`).
  - **BUG-013 CORREGIDO:** POST `/api/academy/generate` sin token → **401** (verificado local; código: `getServerSession` en `route.ts:27-28` + sanitización `FIX-SEC-009` de filename con `path.basename` + whitelist `[^a-zA-Z0-9_\-]`). El spec E2E ya está convertido a verificación de neutralización (acepta 400/200/502/404, alerta solo si 200).
  - **BUG-024 SIGUE ABIERTO:** `/api/legal/incidents` persiste en `data/incidents.json` (sistema de archivos local) → efímero en serverless. Requiere decisión arquitectural (migrar incidents a tabla Supabase). Los tests E2E lo saltan explícitamente por diseño.
  - **Nota sobre los tests invertidos:** los specs con `test.fail` condicional (`if status===200 → test.fail`) quedan auto-correctos: con el bug corregido, la rama `test.fail` no se ejecuta y el `expect(401)` pasa en verde. No requieren cambios.
  - **Evidencia pendiente para cierre:** repetir la verificación pasiva contra el DESPLIEGO de producción (Vercel) — aquí solo se verificó el código actual + servidor local — y resolver BUG-024 (migración a BD).
  - **Rama/PR:** evidencia registrada en `MISION_2_HOTFIXES_OPERATIVOS_SEGURIDAD_2026-10-17.md` (sin cambios de código para esta ficha: los fixes ya existían; la novedad es la EVIDENCIA de que están vigentes).
- **VERIFICACIÓN MISIÓN B (2026-10-21, triage P0 — SHA e6d885):**
  - **Estado anterior:** PARCIALMENTE RESUELTA (M2, 2026-10-17) → **nuevo estado:** RESUELTA EN CÓDIGO — VERIFICADA; cierre formal pendiente de sonda de despliegue + índice A4 + actualización de specs.
  - **BUG-017 CORREGIDO VERIFICADO:** contrato vitest ejecutado hoy (8/8, `withRole` REAL): POST sin sesión → 401 con CERO escrituras; GET sin sesión → 401; rol clerk → 403; admin → 200 paginado. Código: `incidents/route.ts:54-58,222-223`. CI «Unit & Integration Tests» success en e6d885.
  - **BUG-022 CORREGIDO VERIFICADO:** regresión ejecutada hoy (16/16): generate sin signed/public URLs (devuelve `/api/reports/download/<runId>`), download con `withAuth` + ownership + UUID estricto, migración de bucket privado `20261005120001`, frontend Bearer+blob. Código: `download/[runId]/route.ts:23-47,76-79`; `generate/route.ts:160-179,188-191`; `useReportState.ts:304-315`.
  - **BUG-013 CORREGIDO VERIFICADO:** sanitización FIX-SEC-009 (`academy/generate/route.ts:43-44`: `path.basename` + whitelist `[^a-zA-Z0-9_\-]`) + solo se persiste `safeName` (`:172`) + endpoint admin-only (`:191`). Demo aislada hoy: 9/9 vectores XSS/traversal neutralizados (`<script>alert(1)</script>.pdf` → `script_`). DEUDA registrada: sin test unitario propio del endpoint; spec E2E débil (solo `console.warn` si 200) y desalineado con el admin-only (403 no contemplado en `[400,200,502,404]`).
  - **BUG-024 CORREGIDO VERIFICADO EN CÓDIGO — Decisión D YA RATIFICADA por el propietario (2026-10-20, Misión C):** persistencia en `audit_logs` (`action='legal_incident'`), `data/incidents.json` DEPRECADO (vacío, verificado hoy). Implementado en PR #1431, fusionado por el propietario (2026-10-19T19:01:52Z, verificado vía API). Contrato hoy 8/8: 201 → exactamente 1 fila audit_logs. PENDIENTES: índice `20261020000005` (autorización A4 — rendimiento del GET admin) y skip E2E obsoleto (`legal.spec.ts:80-82`).
  - **Evidencia de esta misión:** `MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md` + `evidence/20261021-mision-b/` (salidas vitest, demo de sanitización, check-runs de CI en e6d885, estado del PR #1431). Ediciones sin commit/push (pendiente de decisión del propietario).
  - **Limitaciones:** sonda HTTP contra el despliegue vivo NO ejecutada (URL de producción ausente en el expediente; POST de prueba prohibido por protocolo). Suite E2E Playwright no ejecutada (requiere servidor + `E2E_TEST_USER_TOKEN`; en CI corre skipped). Cero escrituras a producción/BD.

#### CP-SEC-013 — Rate limit in-memory; Upstash obligatorio en prod no configurado
- **ID estable:** CP-SEC-013 · **Área:** SEC/INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** el limiter es in-memory por instancia (`rate-limit.ts:77` reconoce «for production use Upstash Redis»); en serverless (Vercel) cada instancia tiene su contador. `.env.example` marca `UPSTASH_REDIS_REST_URL/TOKEN` como OBLIGATORIO en producción serverless.
- **Comportamiento esperado:** rate limit distribuido (Upstash) en producción.
- **Origen documental:** verificación directa + `.env.example`.
- **Fecha del registro original:** 2026-10-16 (código); FIX-SEC-016 documentado antes.
- **Evidencia en el código actual [VERIFICADO HOY]:** líneas citadas.
- **Pruebas realizadas:** lectura del limiter.
- **Resultado observado:** degradación conocida sin remedio configurado.
- **Impacto de mantenerla pendiente:** límites eludibles distribuyendo requests entre instancias (bruteforce de auth/supervisor).
- **Causa raíz confirmada o hipótesis:** dependencia externa no contratada/configurada.
- **Dependencias y riesgos:** requiere credenciales Upstash.
- **Trabajo que faltaría realizar:** integrar Upstash con fallback local + CI.
- **Criterios de aceptación propuestos:** límites efectivos cross-instancia en preview/prod.
- **Método recomendado para verificar la corrección:** test de límite desde 2 paths distintos.
- **Limitaciones de la auditoría:** —

#### CP-SEC-014 — CSP con unsafe-inline permanente en producción
- **ID estable:** CP-SEC-014 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `src/proxy.ts:39-48` mantiene `'unsafe-inline'` también en producción «por compatibilidad con el entorno preview de Space-Z» (excepción permanente documentada en código).
- **Comportamiento esperado:** CSP estricta con nonces en producción; excepción solo dev/preview.
- **Origen documental:** verificación directa (agente de código).
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual [VERIFICADO HOY]:** líneas citadas.
- **Pruebas realizadas:** lectura del proxy.
- **Resultado observado:** excepción permanente activa.
- **Impacto de mantenerla pendiente:** reduce la protección XSS (se suma al BUG-013 activo).
- **Causa raíz confirmada o hipótesis:** compatibilidad con plataforma de preview.
- **Dependencias y riesgos:** revisar si la plataforma actual aún lo exige.
- **Trabajo que faltaría aplicar:** CSP estricta en prod real (Vercel) con excepción solo en preview.
- **Criterios de aceptación propuestos:** producción sin unsafe-inline.
- **Método recomendado para verificar la corrección:** curl -I a la app desplegada.
- **Limitaciones de la auditoría:** —

#### CP-SEC-015 — Enumeración de roles inconsistente
- **ID estable:** CP-SEC-015 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `users/route.ts:31` acepta `admin|superadmin|manager|clerk|warehouse|encargado|usuario|costo` mientras `pick3/advisor/route.ts:273` compara contra `super_admin` (dos convenciones); el informe ITERATION_9 también documentó `manager` global inconsistente.
- **Comportamiento esperado:** un único enum de roles validado en un módulo compartido.
- **Origen documental:** verificación directa + `ITERATION_9_DEEP_AUDIT.md`.
- **Fecha del registro original:** 2026-10-16 (código) / 2026-08-02 (doc).
- **Evidencia en el código actual [VERIFICADO HOY]:** líneas citadas.
- **Pruebas realizadas:** lectura de ambos routes.
- **Resultado observado:** inconsistencia activa.
- **Impacto de mantenerla pendiente:** checks de rol que fallan silenciosamente para ciertos valores (fail-open o fail-closed según el caso).
- **Causa raíz confirmada o hipótesis:** evolución del modelo de roles sin contrato único.
- **Dependencias y riesgos:** CP-SEC-009.
- **Trabajo que faltaría realizar:** enum compartido + refactor de routes + tests.
- **Criterios de aceptación propuestos:** cero literales de rol sueltos fuera del enum.
- **Método recomendado para verificar la corrección:** grep de literales + suite.
- **Limitaciones de la auditoría:** censo parcial de literales.

#### CP-SEC-016 — Webhook Telegram: IP allowlist cosmética sin reverse proxy
- **ID estable:** CP-SEC-016 · **Área:** SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `getRealClientIp()` prioriza `X-Forwarded-For`: sin reverse proxy que normalice, la IP allowlist del webhook de Telegram es spoofable. El documento-guía tiene un checklist de producción de 8 ítems todos sin marcar.
- **Comportamiento esperado:** proxy configurado (Caddyfile existe como guía) o validación por secret token en su lugar.
- **Origen documental:** `docs/reverse-proxy-trusting-x-forwarded-for.md`.
- **Fecha del registro original:** s/f.
- **Evidencia en el código actual:** `src/lib/telegram/security.ts` (lógica citada); sin constancia de ejecución del checklist.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** webhook spoofable (mensajes falsos al bot).
- **Causa raíz confirmada o hipótesis:** despliegue sin proxy en el entorno actual.
- **Dependencias y riesgos:** infraestructura de despliegue.
- **Trabajo que faltaría realizar:** ejecutar checklist o migrar a validación por secret.
- **Criterios de aceptación propuestos:** webhook rechaza requests no legítimos.
- **Método recomendado para verificar la corrección:** curl con XFF falsificado.
- **Limitaciones de la auditoría:** —

#### CP-SEC-017 — Supabase Admin API /auth/v1/admin/users devuelve 500 — NO VERIFICABLE
- **ID estable:** CP-SEC-017 · **Área:** SEC · **Estado verificado:** NO VERIFICABLE · **Prioridad:** P2
- **Descripción del problema:** la FIX_SUPERADMIN documentó que la Admin API devuelve 500 en este proyecto; la identidad se verificó por `profiles` + login real.
- **Comportamiento esperado:** Admin API operativa o limitación confirmada con soporte.
- **Origen documental:** `docs/audits/FIX_SUPERADMIN_TIPOS_SERVICIO_2026-10-17.md` §9.3.
- **Fecha del registro original:** 2026-10-17 (documento; misión del 16).
- **Evidencia en el código actual:** la app ya tiene fallback por profiles (diseño del fix).
- **Pruebas realizadas:** esta auditoría no invocó la API (servicio externo, evitado).
- **Resultado observado:** bloqueo conocido, causa externa al repo.
- **Impacto de mantenerla pendiente:** automatizaciones de gestión de usuarios limitadas.
- **Causa raíz confirmada o hipótesis:** No determinado — requiere soporte Supabase.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** ticket a Supabase / diagnóstico con service_role autorizado.
- **Criterios de aceptación propuestos:** API responde 200/403 (no 500) para admin legítimo.
- **Método recomendado para verificar la corrección:** llamada de prueba autorizada.
- **Limitaciones de la auditoría:** sin acceso autorizado al Admin API en esta misión.

#### CP-SEC-018 — managed-create responde 400 ERR_EMAIL_ALREADY_EXISTS tras crear bien
- **ID estable:** CP-SEC-018 · **Área:** SEC/DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `POST /api/users/managed-create` crea el usuario correctamente pero responde 400 `ERR_EMAIL_ALREADY_EXISTS` (DEFECT-003, RBAC-008) — el cliente cree que falló y puede reintentar.
- **Comportamiento esperado:** 201 con el usuario creado o 409 con semántica clara.
- **Origen documental:** `docs/audits/E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §9.3.
- **Fecha del registro original:** 2026-10-09.
- **Evidencia en el código actual:** sin fix posterior localizado en `managed-create/route.ts` (el documento de ITERATION_9 ya listaba pre-check email como hallazgo H-09-11).
- **Pruebas realizadas:** evidencia documental de la misión E2E.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** UX confusa; reintentos crean estados ambiguos.
- **Causa raíz confirmada o hipótesis:** doble verificación de email (pre-check + error de unique) con mapeo incorrecto del resultado.
- **Dependencias y riesgos:** H-09-11 (pre-check email) del backlog ITERATION_9.
- **Trabajo que faltaría realizar:** unificar la lógica de email y mapear correctamente el resultado.
- **Criterios de aceptación propuestos:** crear un email nuevo devuelve 2xx; crear duplicado devuelve 409 sin crear.
- **Método recomendado para verificar la corrección:** test de contrato del endpoint.
- **Limitaciones de la auditoría:** —

#### CP-SEC-019 — 35 rutas API con z.string().uuid() estricto
- **ID estable:** CP-SEC-019 · **Área:** SEC/CAT · **Estado verificado:** PENDIENTE DE VERIFICACIÓN (M2: 52→0, 2026-10-17) · **Prioridad:** P1
- **Descripción del problema:** el incidente UUID documentó 8+ endpoints latentes que fallarían con el UUID sintético de TIENDA CENTRAL (`supervisor-check`, `analytics-views`, `product-cost-sheets/invalidate`, `stores/bulk/*`, `costeo-dinamico/*`, `receptions/backfill-tasas`, `whatsapp/*`); el PR de seguimiento recomendado nunca se hizo.
- **Comportamiento esperado:** validación canónica de UUID (regex) igual que `useCatalogProducts.ts` (fix F24) en toda la superficie API.
- **Origen documental:** `docs/audits/INCIDENTE_UUID_INVENTARIO_CATALOGO_CENTRAL_COSTPRO.md` §8.1.
- **Fecha del registro original:** 2026-10-15.
- **Evidencia en el código actual [VERIFICADO HOY]:** grep `z.string().uuid()` = **35 archivos** route bajo `src/app/api/` (más de los 8+ documentados).
- **Pruebas realizadas:** conteo directo hoy.
- **Resultado observado:** el patrón sigue extendido.
- **Impacto de mantenerla pendiente:** módulos completos «Ha ocurrido un error» al usarlos contra Central (el mismo fallo que dejó el catálogo de Central inutilizable).
- **Causa raíz confirmada o hipótesis:** Zod 4 `z.string().uuid()` es más estricto que el formato UUID aceptado por Postgres.
- **Dependencias y riesgos:** ninguna; refactor mecánico con test.
- **Trabajo que faltaría realizar:** reemplazar por uuidRegex canónico (helper compartido) + tests de contrato con UUID sintético.
- **Criterios de aceptación propuestos:** 0 rutas con z.string().uuid(); smoke test de Central en los módulos afectados.
- **Método recomendado para verificar la corrección:** grep + suite de contratos.
- **Limitaciones de la auditoría:** no se probó cada ruta individualmente.
- **REMEDIACIÓN MISIÓN 2 (2026-10-17):**
  - **Estado anterior:** PENDIENTE CONFIRMADA → **nuevo estado:** PENDIENTE DE VERIFICACIÓN.
  - **Censo actualizado:** el defecto CRECIÓ desde la auditoría: 35 → **36 archivos con 52 ocurrencias** (51 simples + 1 con mensaje custom) bajo `src/app/api/`.
  - **Cambio aplicado:** codemod idempotente (`scripts` externo + revisión manual de diffs) sobre 36 archivos: `z.string().uuid()` → `uuidLoose` (fuente única declarada en `@/validation/api-schemas`, patrón ya dominante en 45 archivos); el caso con mensaje custom (`service-types/route.ts`: `'Identificador de tipo inválido'`) → `z.string().regex(uuidRegex, …)` para conservar el mensaje. Verificación post-codemod: grep `z.string().uuid()` en `src/app/api` = **0**.
  - **Compatibilidad verificada:** `tsc --noEmit` EXIT 0 (uuidLoose es ZodString → type-equivalente en todas las cadenas `.optional()/.nullable()/z.array()`).
  - **Pruebas de regresión:** `src/__tests__/api/uuid-loose-central-contract.test.ts` — 5/5 ✓: acepta los UUID sintéticos de Central (incluido nil-uuid y mayúsculas), sigue RECHAZANDO basura (no se amplió superficie), uuidRegex consistente, grep-vivo anti-reintroducción (falla si alguien re-añade `z.string().uuid()`), contratos representativos (users/delete + service-types con mensaje). Habrían FALLADO con el código anterior.
  - **Ajuste de prueba existente:** `iteration-rls.test.ts` PT-RLS.4.1 actualizado de la aserción literal `activeStoreId: z.string().uuid().optional()` al patrón vigente `activeStoreId: uuidLoose.optional()` (el contrato B4 —validar activeStoreId como UUID— se conserva).
  - **Verificación adicional:** suite completa vitest 3170/3170 ✓.
  - **Evidencia pendiente para cierre:** smoke test funcional contra TIENDA CENTRAL en los módulos antes afectados (supervisor-check, analytics-views, stores/bulk, whatsapp, etc.) en entorno desplegado.
  - **Rama/PR:** `fix/mision-2-hotfixes-operativos` (MISIÓN 2).

#### CP-SEC-020 — RPCs legacy con anon/PUBLIC: parcial (manage_user_memberships)
- **ID estable:** CP-SEC-020 · **Área:** SEC · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** PT_9_5 encontró 6 RPCs legacy con anon+PUBLIC y sin auth check (incluida `admin_reset_user_password` crítica). El cierre v2.12.50 resolvió: delete legacy → 410, 5 admin_* dropeadas. Queda `manage_user_memberships` (DT-02) con patrón sin auth.uid explícito.
- **Comportamiento esperado:** 0 RPCs mutables ejecutables por anon/PUBLIC.
- **Origen documental:** `docs/PT_9_5_FINAL_SECURITY_VERIFICATION.md` + `docs/AUDIT_CLOSURE_REPORT_v1.md`.
- **Fecha del registro original:** 2026-08-02.
- **Evidencia en el código actual:** migraciones de cierre citadas; DT-02 viva en el backlog.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** parcial con 1 RPC restante.
- **Impacto de mantenerla pendiente:** superficie privilegiada residual.
- **Causa raíz confirmada o hipótesis:** función usada por flujos activos (no se puede dropear sin refactor).
- **Dependencias y riesgos:** CP-SEC-008 (DT-02).
- **Trabajo que faltaría realizar:** endurecer auth interno de manage_user_memberships + REVOKE.
- **Criterios de aceptación propuestos:** llamada anon falla 403.
- **Método recomendado para verificar la corrección:** test SQL de aislamiento.
- **Limitaciones de la auditoría:** —

### 3.6 Área UI — Interfaz y experiencia de usuario

#### CP-UI-001 — CRUD de reglas de comisión desde UI + sub-ítems contables
- **ID estable:** CP-UI-001 · **Área:** UI/POS · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** `decisions-complejas-audit-multi-tienda.md` documentó 5 pendientes: (1) RuleFormModal inexistente — CRUD de reglas de comisión ROTO desde UI (CRÍTICO), (2) exclusion constraint para periodos solapados de commission_payments (CRÍTICO contable), (3) pro-rateo a mitad de periodo sin documentar, (4) HistoryTab con `<a href>` a JSON crudo, (5) tabla de 9 columnas sin colapsar en móvil.
- **Comportamiento esperado:** CRUD completo + constraint de solapes + UX móvil correcta.
- **Origen documental:** `docs/decisions-complejas-audit-multi-tienda.md`.
- **Fecha del registro original:** s/f (pre-14/10).
- **Evidencia en el código actual [VERIFICADO HOY]:** `RuleFormModal` **EXISTS** en `WorkersView.tsx:2770` y se usa en `:768` → ítem (1) RESUELTO. Ítems (2)-(5) sin evidencia de corrección.
- **Pruebas realizadas:** grep + lectura del componente.
- **Resultado observado:** parcial.
- **Impacto de mantenerla pendiente:** (2) riesgo contable de comisiones con solapes; (4)/(5) UX menor.
- **Causa raíz confirmada o hipótesis:** (1) resuelto en la cadena de fixes de comisiones del 14-16/10; (2) requiere query previa de solapes según el propio doc.
- **Dependencias y riesgos:** (2) requiere autorización de migración.
- **Trabajo que faltaría realizar:** constraint de exclusión + documentar pro-rateo + HistoryTab + responsive.
- **Criterios de aceptación propuestos:** imposibilidad de crear 2 pagos solapados para el mismo worker/periodo.
- **Método recomendado para verificar la corrección:** intento de insert solapado en BD de pruebas.
- **Limitaciones de la auditoría:** —

#### CP-UI-002 — Fases C/D/E del refinamiento Inventario/Vitrina sin ejecutar
- **ID estable:** CP-UI-002 · **Área:** UI · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** Fases A (tarjetas+⋮+chips) y B (Catálogo en Gestión) implementadas (PR #1373) e Iteración 2 de paridad móvil completada; FASES C (filtros inteligentes, operaciones en lote, vista previa de Vitrina), D (sincronía/persistencia con rollback visual) y E (consistencia) quedan con checklists sin marcar.
- **Comportamiento esperado:** plan completo o cierre formal del alcance.
- **Origen documental:** `docs/ux-refinamiento-inventario-vitrina.md` + `docs/ux/auditoria-inventario-vitrina.md`.
- **Fecha del registro original:** 2026-10-06/08.
- **Evidencia en el código actual:** componentes de las fases A/B presentes; C/D/E sin commits identificados.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** parcial por diseño del plan.
- **Impacto de mantenerla pendiente:** experiencia de gestión de inventario por debajo del diseño aprobado.
- **Causa raíz confirmada o hipótesis:** prioridades de misiones posteriores.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** ejecutar C/D/E o cerrar el plan.
- **Criterios de aceptación propuestos:** checklists marcados con PRs.
- **Método recomendado para verificar la corrección:** revisión del documento.
- **Limitaciones de la auditoría:** —

#### CP-UI-003 — UX-002..UX-014 del plan estratégico UX/IA
- **ID estable:** CP-UI-003 · **Área:** UI · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** del contrato de alcance UX/IA quedan: UX-002 parcial (breadcrumbs falsos «Módulo No Disponible» en storefront-config/customers/bank-reconciliation/ofertas), UX-004/005/006/007/009/010/013/014 parciales (labels de dashboards, tablón default, vitrina doble entrada, móvil drawer autoabierto, storeId legacy vs activeStoreId, módulos sin dominio, sesión envejecida sin gate, fichas sin listado en terminal). Fases B–F completas; solo Fichas de Costo RESUELTO/CERTIFIED.
- **Comportamiento esperado:** contrato cerrado o re-negociado con 4 decisiones de producto requeridas.
- **Origen documental:** `docs/plan-estrategico-ux-ia.md`.
- **Fecha del registro original:** 2026-09-22.
- **Evidencia en el código actual:** commits 63918468 + a603d7cc para lo resuelto; resto sin constancia.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** parcial.
- **Impacto de mantenerla pendiente:** navegación confusa en módulos sin dominio; UX móvil degradada.
- **Causa raíz confirmada o hipótesis:** decisiones de producto pendientes (el doc las enumera).
- **Dependencias y riesgos:** decisiones del propietario.
- **Trabajo que faltaría realizar:** decidir y ejecutar por módulo.
- **Criterios de aceptación propuestos:** 0 breadcrumbs falsos; móvil sin drawer autoabierto.
- **Método recomendado para verificar la corrección:** pase visual por los módulos citados.
- **Limitaciones de la auditoría:** —

#### CP-UI-004 — Módulos oficiales «En desarrollo»
- **ID estable:** CP-UI-004 · **Área:** UI · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** documentación oficial del Help Center lista como «EN DESARROLLO»: IPV, Pick3, Billetera (experimentales, solo admin); Wiki, Academia, Marco Legal (en integración); Conciliación Bancaria en beta — solo lectura, sin importación ni matching automático.
- **Comportamiento esperado:** parcialidad visible al usuario (ya documentada) y promoción al madurar.
- **Origen documental:** `knowledge/help/04-explicacion/08-seccion-en-desarrollo.md`.
- **Fecha del registro original:** s/f (vivo).
- **Evidencia en el código actual:** vistas existentes con estados parciales (conciliación solo lectura, etc.).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** estado por diseño; compromiso de mover al madurar.
- **Impacto de mantenerla pendiente:** expectativas de usuario; módulos experimentales accesibles solo a admin (correcto).
- **Causa raíz confirmada o hipótesis:** roadmap abierto.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** por módulo, según roadmap.
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

#### CP-UI-005 — Diagnóstico Vales de Salida P1-P10
- **ID estable:** CP-UI-005 · **Área:** UI/INV · **Estado verificado:** PARCIALMENTE RESUELTA · **Prioridad:** P2
- **Descripción del problema:** `DIAGNOSTICO_VALES_SALIDA.md` documentó 10 problemas (P1 «Crear» abandona el módulo hacia Vender; P2 «Ver» no muestra el documento real; P3 sin modo tabla; P5 `limit(100)` silencioso sin paginación; P7 sin movimientos generados en el detalle; etc.) con plan de 7 commits; el archivo no cita commits de cierre.
- **Comportamiento esperado:** los 10 puntos resueltos o el diagnóstico cerrado formalmente.
- **Origen documental:** `DIAGNOSTICO_VALES_SALIDA.md` (raíz).
- **Fecha del registro original:** fase 1-2 pre-implementación.
- **Evidencia en el código actual:** `ValeSalidaDetalleModal.tsx` existe y cubre P2/P7 según la exploración del agente de código («El detalle del vale P7 del diagnóstico ya está cubierto»); el resto sin constancia.
- **Pruebas realizadas:** exploración de componentes.
- **Resultado observado:** parcial.
- **Impacto de mantenerla pendiente:** UX del módulo de vales degradada (flujo diario de salidas de mercancía).
- **Causa raíz confirmada o hipótesis:** plan declarado sin seguimiento en el propio archivo.
- **Dependencias y riesgos:** solapa con CP-INV-009.
- **Trabajo que faltaría realizar:** auditar P1/P3/P5/P6/P8-P9 hoy y cerrar el diagnóstico.
- **Criterios de aceptación propuestos:** cada P con estado verificable.
- **Método recomendado para verificar la corrección:** pase E2E del módulo de vales.
- **Limitaciones de la auditoría:** no se verificó cada P individualmente.

#### CP-UI-006 — MVP FC: bug de sesión, cuentas hardcodeadas, sync manual
- **ID estable:** CP-UI-006 · **Área:** UI/INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** pendientes heredados del MVP FC (fichas de costo): (1) bug de sesión en `useSessionManager.ts` (logout por fallo de red, signOut si perfil falla, reload duro — «fix propuesto como ciclo separado» NO corregido), (2) procedimiento manual de sincronización de la copia `/fc/` con releases de fichascosto, (3) hardening de cuentas locales hardcodeadas `usuario`/`admin` en FC.html (PBKDF2), (4) freeEnforce=false (gate comercial dormante), (5) residuo: 1 usuario de prueba baneado.
- **Comportamiento esperado:** sesión estable; hardening de cuentas; sync automatizada.
- **Origen documental:** `docs/fc-mvp-integration.md` + `docs/fc-access-flow-fix.md`.
- **Fecha del registro original:** 2026-09-16.
- **Evidencia en el código actual:** `useSessionManager.ts:69-146`, `public/fc/FC.html:3828` (según docs); sin fix posterior localizado.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendientes declarados «de ciclo posterior, no bloquean MVP».
- **Impacto de mantenerla pendiente:** cierres de sesión espurios en /fc/ (producto público); cuentas débiles.
- **Causa raíz confirmada o hipótesis:** MVP con deuda aceptada.
- **Dependencias y riesgos:** CP-INFRA-002 (OOM para builds).
- **Trabajo que faltaría realizar:** fix de sesión + hardening + pipeline de sync.
- **Criterios de aceptación propuestos:** sin logout espurio en 30 min de uso.
- **Método recomendado para verificar la corrección:** prueba de red interrumpida en /fc/.
- **Limitaciones de la auditoría:** —

### 3.7 Área DATA — Importación y datos

#### CP-DATA-001 — Decisiones humanas de limpieza de datos E2E/QA
- **ID estable:** CP-DATA-001 · **Área:** DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** 4 lotes esperan confirmación humana para borrar o conservar: 6 tiendas D-indeterminadas (Tienda Auditor, No Address, blank, Store Tenant 2, QA-H1-A, QA-H1-B); 16 usuarios D-indeterminados (`auditor@costpro.test`, 8×`@uberip.com`, 4×`qa.h1.*`, etc.); residuos del 9-oct (8 tiendas + 4 usuarios + 3 tenants, RUN IDs `D0978E`, `8DEF57`, `7DAE03`); 3 vales manuales del propietario (VS-000001/000023/000002) excluidos por regla de oro.
- **Comportamiento esperado:** decisión por lote + limpieza autorizada vía `reconcile-orphan-runs.ts --run-id …`.
- **Origen documental:** `docs/audits/E2E-DATA-CLEANUP-INVENTORY.md` §D + `E2E-FIXTURE-REUSE…` §6 + `e2e-contamination-cleanup-20261009.md` §5.
- **Fecha del registro original:** 2026-10-05 y 2026-10-09.
- **Evidencia en el código actual:** tablas de los documentos; guard AFTER del fixture fallará hasta la limpieza (doc).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente de decisión del propietario.
- **Impacto de mantenerla pendiente:** BD compartida con residuos; guard de fixtures bloqueado; cuota de tiendas del tenant consumida.
- **Causa raíz confirmada o hipótesis:** regla de oro correcta: no borrar sin confirmación.
- **Dependencias y riesgos:** CP-DATA-003 (histórico en pilotos).
- **Trabajo que faltaría realizar:** decisión + ejecución de limpieza autorizada.
- **Criterios de aceptación propuestos:** guard AFTER del fixture en verde.
- **Método recomendado para verificar la corrección:** correr data-hygiene-guard.
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` — sin decisión sobre los lotes; regla de oro vigente respetada (nada fue borrado ni alterado en esta misión).
  - **Lotes delimitados:** L1 = 6 tiendas D-indeterminadas; L2 = 16 usuarios D-indeterminados; L3 = residuos 9-oct (8 tiendas + 4 usuarios + 3 tenants; RUN IDs `D0978E`/`8DEF57`/`7DAE03`); L4 = 3 vales manuales del propietario (VS-000001/000023/000002) — solo requieren confirmación de titularidad. Salvaguardas: listas A/B intocables, borrado solo por RUN ID con dry-run + evidencia, cero CASCADE.
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.2 + PD-1.

#### CP-DATA-002 — security.spec desactualizado — RESUELTA
- **ID estable:** CP-DATA-002 · **Área:** DATA/TEST · **Estado verificado:** RESUELTA VERIFICADA
- **Descripción original:** `security.spec` V2.12.9/V2.12.13 fallaba porque buscaba el error de `create_sale` pero el esquema usa `create_sale_v2` (PGRST202) — test bug preexistente (run #2: 2 failed).
- **Origen documental:** `docs/audits/E2E-DATA-HYGIENE.md` §6.
- **Evidencia de resolución [VERIFICADO HOY]:** `e2e/security.spec.ts:169-212` hoy prueba spoofing contra `create_sale_v2` (único camino) y añade aserción ANTI-RESURRECTION de que `create_sale` responde gone (404/PGRST202), según el diseño FINALIZE-V2 (`20261005140000`).
- **Justificación:** el spec fue re-orientado y convertido en aserción de regresión.
- **Limitaciones:** no se ejecutó la suite E2E en esta auditoría.

#### CP-DATA-003 — Transacciones históricas de prueba en pilotos A/B
- **ID estable:** CP-DATA-003 · **Área:** DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** dentro de los pilotos persistentes A/B hay transacciones históricas de pruebas; el cleanup extendido cubre productos, no el histórico (net-zero histórico requeriría operación específica autorizada).
- **Comportamiento esperado:** decisión: limpiar histórico o aceptarlo como parte del piloto.
- **Origen documental:** `docs/audits/E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §9.2.
- **Fecha del registro original:** 2026-10-09.
- **Evidencia en el código actual:** —
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** reportes que incluyan pilotos mostrarán transacciones de prueba.
- **Causa raíz confirmada o hipótesis:** alcance del cleanup deliberadamente limitado.
- **Dependencias y riesgos:** CP-DATA-001.
- **Trabajo que faltaría realizar:** operación de limpieza autorizada si se decide.
- **Criterios de aceptación propuestos:** pilotos con solo datos de fixture o decisión documentada.
- **Método recomendado para verificar la corrección:** query en pilotos.
- **Limitaciones de la auditoría:** —

#### CP-DATA-004 — review_queue: componentes sin documentar, webhook, cuarentena
- **ID estable:** CP-DATA-004 · **Área:** DATA/INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** la cola de revisión de arquitectura mantiene: hallazgo «23 orphan views + 29 undocumented components» (high, Phase 15/16; las orphan views quedaron resueltas 23→0 con VIEW_REGISTRY 2026-06-30, los 29 componentes sin documentar sin cierre declarado), artefacto `test-artifact-1.0.0` en cuarentena sin revisar (2026-03-16), y checklist «Configurar Webhook para notificar review_queue.json» sin completar (webhookUrl placeholder).
- **Comportamiento esperado:** cola vacía o triageado.
- **Origen documental:** `docs/automation/review_queue.json` + `ARCHITECTURE_MAINTENANCE_PIPELINE.md` + `review_integration.json`.
- **Fecha del registro original:** 2026-03-16/28.
- **Evidencia en el código actual:** JSONs citados con status open.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente (elementos antiguos, posiblemente obsoletos — requiere triage).
- **Impacto de mantenerla pendiente:** ruido de arquitectura; posibilidad de obsoletos que nunca se descartan.
- **Causa raíz confirmada o hipótesis:** pipeline sin ciclo de cierre.
- **Dependencias y riesgos:** CP-OBS-002.
- **Trabajo que faltaría realizar:** triage y cierre de la cola.
- **Criterios de aceptación propuestos:** 0 ítems open > 30 días.
- **Método recomendado para verificar la corrección:** leer review_queue.json.
- **Limitaciones de la auditoría:** —

#### CP-DATA-005 — Pares neto-cero no representables
- **ID estable:** CP-DATA-005 · **Área:** DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** pares con neto 0 del papel/Excel no representables como documento individual sin fecha real: filas 569+570 (anticipo OT +700/−700 USD), f536/f537 (venta+DV), f790/f791. Dejados documentados deliberadamente (registrarlos con fecha actual tiene valor dudoso).
- **Comportamiento esperado:** decisión formal: registrar con nota, o cerrar como «no representable».
- **Origen documental:** `docs/audits/ENERVIDA-EXCEL-IMPORT.md` §7.3 + `AUDITORIA_CONCILIACION…` §6.2.
- **Fecha del registro original:** 2026-10-04/14.
- **Evidencia en el código actual:** —
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** sin impacto económico; decisión abierta.
- **Impacto de mantenerla pendiente:** referencia del papel vs COSTPRO con 2-3 líneas sin espejo.
- **Causa raíz confirmada o hipótesis:** —
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** decisión del negocio.
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` — existe decisión TÉCNICA previa documentada (mantener sin registro por valor dudoso del registro a fecha actual; sistema forward-only), pero no cierre formal de negocio. Opciones: (1) cerrar como «no representable» (formalizar criterio actual, cero escrituras) o (2) registrar con nota a fecha actual (documentos artificiales sin corrección de saldo). Sin impacto económico (neto 0).
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.9 + PD-7.

#### CP-DATA-006 — 20 filas de comisiones de julio con tarifa antigua
- **ID estable:** CP-DATA-006 · **Área:** DATA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** 20 filas de comisiones de julio usan tarifa unitaria antigua: no se reconstruyeron tarifas históricas (ConfComisiones importada como config vigente); fuera del alcance de la misión de conciliación.
- **Comportamiento esperado:** reconstrucción de tarifas históricas o aceptación documentada.
- **Origen documental:** `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` §8/§11.9.5.
- **Fecha del registro original:** 2026-10-14/16.
- **Evidencia en el código actual:** —
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** decisión documentada como fuera de alcance.
- **Impacto de mantenerla pendiente:** comparativas de comisiones históricas ligeramente distorsionadas.
- **Causa raíz confirmada o hipótesis:** importación como config vigente.
- **Dependencias y riesgos:** escritura histórica gobernada.
- **Trabajo que faltaría realizar:** decisión + backfill autorizado si procede.
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —
- **CONCILIACIÓN MISIÓN C (2026-10-21):**
  - **Estado de la decisión:** `PENDIENTE DEL PROPIETARIO` (+ de datos si se reconstruye) — ConfComisiones importada como configuración VIGENTE; reconstrucción histórica documentada como fuera de alcance (§6.5/§11.9.5). Opciones: (1) aceptar como documentado o (2) reconstruir con la escala de tarifas de julio de 2026 aportada por el negocio (backfill autorizado por lote sobre las 20 filas).
  - **Referencias:** `MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` §3.10 + PD-8.

### 3.8 Área INFRA — Infraestructura y calidad

#### CP-INFRA-001 — E2E de CI deshabilitado + continue-on-error heredado
- **ID estable:** CP-INFRA-001 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** los jobs E2E de `ci.yml` y `test-coverage.yml` tienen `if: false` por decisión del propietario (2026-10-09) tras la contaminación en vivo de Supabase compartido (48 tiendas + 26 usuarios + 6 tenants). Además conserva `continue-on-error: true` heredado y la recomendación de endurecerlo nunca se aplicó. La suite de 128 escenarios (88.3% cubierta) solo corre local/manual.
- **Comportamiento esperado:** E2E en CI contra entorno aislado dedicado; gate bloqueante.
- **Origen documental:** workflows + `docs/audits/e2e-contamination-cleanup-20261009.md` + banner en workflows.
- **Fecha del registro original:** 2026-10-09.
- **Evidencia en el código actual:** `if: false` con banner explicativo en ambos workflows.
- **Pruebas realizadas:** lectura de workflows.
- **Resultado observado:** mitigación activa; solución raíz pendiente.
- **Impacto de mantenerla pendiente:** regresiones E2E llegan a main sin detección (ya produjo 2 cortes de deploy — ver CP-INFRA-009); red de seguridad nula.
- **Causa raíz confirmada o hipótesis:** sin Supabase aislado (CP-INFRA-011) la única opción segura era apagar.
- **Dependencias y riesgos:** CP-INFRA-011 (prerequisito).
- **Trabajo que faltaría realizar:** provisionar entorno aislado, re-activar jobs con guard fail-closed, retirar continue-on-error.
- **Criterios de aceptación propuestos:** E2E verde/bloqueante en cada PR con isolation=1.
- **Método recomendado para verificar la corrección:** PR de prueba con fallo E2E que bloquee merge.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-002 — OOM estructural (4 GB): CI única autoridad de build
- **ID estable:** CP-INFRA-002 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** `next build`/`tsc --noEmit` completos mueren por OOM en el entorno local (4 GB sin swap; exit 137 verificado al menos 6 veces en misiones distintas; dev server 2.8 GB con telemetría; crash-loop en E2E con 10 reinicios de pm2). La CI (7 GB) es la única autoridad de build; `turbopack.memoryLimit` no es reconocida en Next 16.3.3.
- **Comportamiento esperado:** entorno de desarrollo capaz de validar builds, o política formal documentada de CI-autoridad con caché rápida.
- **Origen documental:** 7+ informes (COSTPRO-PERFORMANCE §4.2/§10, AUDITORIA_TRABAJADORES §11.2, FIX_REPORTE §6, INCIDENTE_IPV A.5, INVENTORY-CATALOG 7.4, AUDITORIA_IPV §11, FIX_SUPERADMIN §9.2) + runbook OPERACION_ENTORNO_LOCAL.
- **Fecha del registro original:** 2026-10-06 → 2026-10-17 (recurrente).
- **Evidencia en el código actual:** `next.config.ts` (PERF_AUDIT_BUILD, comentarios), `vitest.config.ts` (testTimeout 120 s por CI lenta), `playwright.config.ts` (comentarios de OOM-killer), audit-evidence F5/F6/DARK-PERF/FASE-F3.
- **Pruebas realizadas:** evidencia documental consolidada.
- **Resultado observado:** limitación estructural persistente.
- **Impacto de mantenerla pendiente:** cada misión pierde tiempo; verificación completa solo post-push; riesgo de subtipeado local.
- **Causa raíz confirmada o hipótesis:** contenedor 4 GB sin swap; app creciendo.
- **Dependencias y riesgos:** CP-INFRA-017.
- **Trabajo que faltaría realizar:** box mayor o build remoto/caché; o aceptación formal de CI-autoridad.
- **Criterios de aceptación propuestos:** tsc completo ejecutable localmente O política documentada.
- **Método recomendado para verificar la corrección:** correr next build en la caja.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-003 — bun audit no bloqueante + dual lockfile
- **ID estable:** CP-INFRA-003 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el job security ejecuta `bun audit … || echo` con `continue-on-error: true`: una auditoría con vulnerabilidades jamás falla el build. Existe `npm run audit` sin cablear a ningún gate. Además dual lockfile (`bun.lock` en CI/Docker + `package-lock.json` presente) con riesgo de drift, y `.npmrc` `legacy-peer-deps` con comentario desfasado (^0.22.0 vs ^0.23.0 real).
- **Comportamiento esperado:** gate de vulnerabilidades con umbral; lockfile único.
- **Origen documental:** lectura de `ci.yml` + `.npmrc` (agente CI).
- **Fecha del registro original:** 2026-10-16 (estado actual).
- **Evidencia en el código actual [VERIFICADO HOY]:** citado arriba.
- **Pruebas realizadas:** lectura de workflows y configs.
- **Resultado observado:** auditoría decorativa.
- **Impacto de mantenerla pendiente:** CVEs sin puerta de entrada bloqueada; dependencias divergentes entre entornos.
- **Causa raíz confirmada o hipótesis:** evitación de falsos positivos bloqueantes sin umbral definido.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** gate con severidad umbral + consolidar lockfile.
- **Criterios de aceptación propuestos:** CI falla con vuln high/critical.
- **Método recomendado para verificar la corrección:** introducir vuln de prueba.
- **Limitaciones de la auditoría:** no se ejecutó audit real (fuera de alcance y costoso).

#### CP-INFRA-004 — Allowlist expira 2026-12-31; replay reintroduce SQL vulnerable
- **ID estable:** CP-INFRA-004 · **Área:** INFRA/SEC · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** `ci-gate-allowlist.json` tiene 27 supresiones activas (6 SECURITY DEFINER sin auth check justificadas como STABLE read-only; 21 en `security_contract_static_baseline` por definiciones históricas vulnerables cuyo fix LIVE está «out-of-band» certificado 134/134). Todas expiran 2026-12-31. Al vencer, el gate fallará masivamente; y si se restaura la BD desde migraciones, el SQL vulnerable se reintroduce.
- **Comportamiento esperado:** migración de saneamiento del histórico SQL antes del vencimiento; allowlist reducida a lo justificado.
- **Origen documental:** `ci-gate-allowlist.json` (motivos repetidos en los 21 ítems).
- **Fecha del registro original:** vencimiento 2026-12-31.
- **Evidencia en el código actual [VERIFICADO HOY]:** JSON leído; patrón residual confirmado en 30 archivos de migraciones (CP-SEC-005).
- **Pruebas realizadas:** lectura del JSON + grep.
- **Resultado observado:** reloj corriendo sin plan de saneamiento localizado.
- **Impacto de mantenerla pendiente:** el 2027 el gate es rojo total o se renueva la allowlist sin sustancia; riesgo DR real.
- **Causa raíz confirmada o hipótesis:** fixes out-of-band en LIVE sin backport a migraciones.
- **Dependencias y riesgos:** CP-SEC-005/006/007.
- **Trabajo que faltaría realizar:** campaña de saneamiento de migraciones (migración «fixup» final) + renovación justificada por ítem.
- **Criterios de aceptación propuestos:** allowlist < 10 ítems con motivo vigente.
- **Método recomendado para verificar la corrección:** allowlist-review en verde sin extensiones masivas.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-005 — Skips masivos de tests y cobertura excluida
- **ID estable:** CP-INFRA-005 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** ~100+ `test.skip()` condicionales E2E en ~25 specs (causa raíz documentada en `e2e/global-setup.ts:4-10`: tokens no configurados → ~150 tests saltados = cobertura real ~20% en la era pre-E2E-80); ~12 unit tests omitidos sin plan (stores-management ×3, multi-tienda-views ×2, useStoreInactivityMonitor, contratos SQL condicionales); skips por datos no deterministas (reverse-duplicate-ui ×7, store-switching ×7, fc-automation ×8); umbrales de cobertura: `src/services/**` rebajado 40%→30%, y `src/components/**`, `src/store/**`, `pick3`, `academy` excluidos del cómputo.
- **Comportamiento esperado:** skips justificados con issue; cobertura sin exclusiones amplias.
- **Origen documental:** specs E2E + vitest.config.ts:50-61 + E2E-COVERAGE-REPORT.
- **Fecha del registro original:** 2026-09/10.
- **Evidencia en el código actual:** skips activos y exclusiones vigentes.
- **Pruebas realizadas:** censo del agente CI.
- **Resultado observado:** deuda de pruebas estructural.
- **Impacto de mantenerla pendiente:** falsa confianza en suites verdes con cobertura sesgada.
- **Causa raíz confirmada o hipótesis:** entorno sin credenciales/aislamiento (CP-INFRA-011) + coste de estabilización.
- **Dependencias y riesgos:** CP-INFRA-011.
- **Trabajo que faltaría realizar:** campaña de activación de skips + revisar umbrales.
- **Criterios de aceptación propuestos:** 0 skips sin issue de referencia; exclusiones documentadas.
- **Método recomendado para verificar la corrección:** correr suites con tokens completos.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-006 — 15 escenarios E2E sin cobertura (2 P0)
- **ID estable:** CP-INFRA-006 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** el report E2E-80 lista 15 escenarios sin automatizar con motivo explícito; destacan 2 P0: E2E-INV-010 (recepción de mercancía → stock) y E2E-PO-005 (recepción contra OC → stock), «requieren fixtures multi-paso dedicados, estimación 2 días». También E2E-CAT-005/006/007 (alta/edición/baja de producto), E2E-POS-010 (descuento con token supervisor), E2E-RBAC-010 (sin usuario rol `costo`), etc.
- **Comportamiento esperado:** 128/128 escenarios automatizados o justificados.
- **Origen documental:** `E2E-COVERAGE-REPORT.md` §escenarios sin cobertura.
- **Fecha del registro original:** 2026-09-27.
- **Evidencia en el código actual:** sin specs nuevas para esos IDs localizadas.
- **Pruebas realizadas:** contraste documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** el flujo más crítico del negocio (recepción → stock) sin red E2E.
- **Causa raíz confirmada o hipótesis:** complejidad de fixtures multi-paso.
- **Dependencias y riesgos:** CP-INFRA-011.
- **Trabajo que faltaría realizar:** 2 fixtures P0 (~2 días según el propio report) + resto por prioridad.
- **Criterios de aceptación propuestos:** E2E-INV-010 y E2E-PO-005 en verde en CI aislado.
- **Método recomendado para verificar la corrección:** correr playwright project core.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-007 — Cementerio de scripts one-off (45 MB)
- **ID estable:** CP-INFRA-007 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `scripts/` acumula ~60+ one-offs de misión (test_live_e2e_round2-5, apply/verify_migration_*, f2bug-*, rem-inv-6r-*, r2-exec-*, captura_*), ~50 PNG en `scripts/tmp-images/`, y `apply-rpc-fix.sh` con project-ref de Supabase y ruta absoluta hardcodeadas. Alto ruido operacional y riesgo de re-ejecución accidental.
- **Comportamiento esperado:** archivos vivos vs históricos separados; sin secretos/rutas hardcodeadas.
- **Origen documental:** censo del agente CI + lectura de 10 scripts.
- **Fecha del registro original:** 2026-10-16 (censo).
- **Evidencia en el código actual [VERIFICADO HOY]:** citado.
- **Pruebas realizadas:** censo.
- **Resultado observado:** acumulación sin política.
- **Impacto de mantenerla pendiente:** confusión, riesgo de ejecutar scripts destructivos antiguos.
- **Causa raíz confirmada o hipótesis:** cada misión añadió tooling sin limpieza.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** archivar a scripts/archive/ o eliminar tras validación; externalizar refs.
- **Criterios de aceptación propuestos:** scripts raíz solo vivos; archive con README.
- **Método recomendado para verificar la corrección:** censo post-limpieza.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-008 — Inconsistencias de infraestructura y comentarios desfasados
- **ID estable:** CP-INFRA-008 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** PM2 sirve la app residente en **modo dev** (`next dev` + Socket.io); crons de `vercel.json` diarios (8:00/9:00) vs pollers PM2 cada 5 min con comentario «matches vercel.json» ya falso; docker-compose 512M + `NODE_ENV` comentado (incoherente con perfil 2.8 GB); 3 superficies de despliegue (PM2/Vercel/Docker-Render) con flags condicionales; `restore_local_env.sh` aún garantiza `db/custom.db` de Prisma (legado); `server.ts` copia manual de socket.io en el Dockerfile (frágil).
- **Comportamiento esperado:** una fuente de verdad operativa por entorno; comentarios sincronizados.
- **Origen documental:** lectura de configs (agente CI).
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual [VERIFICADO HOY]:** citado.
- **Pruebas realizadas:** lectura.
- **Resultado observado:** inconsistencias activas.
- **Impacto de mantenerla pendiente:** comportamientos distintos según entorno; crons que no disparan como se cree.
- **Causa raíz confirmada o hipótesis:** evolución rápida sin consolidación operativa.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** alinear crons/perfiles, decidir superficies, limpiar legados.
- **Criterios de aceptación propuestos:** doc operativa única coherente con configs.
- **Método recomendado para verificar la corrección:** revisión de configs.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-009 — Gate de proceso: merges con previews en ERROR/advisory
- **ID estable:** CP-INFRA-009 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** dos cortes de deploy de producción (TS2739 por PR #1373 el 2026-10-06; TS18048 por PR #1381 el 2026-10-09) entraron por PRs mergeados con previews en ERROR o con job E2E advisory (`continue-on-error`). El propio informe recomienda «no mergear con preview ERROR o tsc fallando» y la política nunca se formalizó.
- **Comportamiento esperado:** regla de proceso + protección de rama que impida merge con checks críticos fallidos.
- **Origen documental:** `docs/audits/VERCEL-PREVIEW-FAILURE.md` §8.3 + `vercel-deploy-outage-1381-e2e-sync.md`.
- **Fecha del registro original:** 2026-10-06/09.
- **Evidencia en el código actual:** fixes aplicados (CP-RES-013); política/protección no verificable desde el repo (CP-INFRA-014).
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** riesgo de proceso vivo.
- **Impacto de mantenerla pendiente:** tercer corte de producción esperable con el ritmo actual (~12 PRs/día).
- **Causa raíz confirmada o hipótesis:** presión de velocidad sin gate de proceso.
- **Dependencias y riesgos:** CP-INFRA-014 (branch protection).
- **Trabajo que faltaría realizar:** regla documentada + enforcement (settings de GitHub).
- **Criterios de aceptación propuestos:** 0 merges con preview ERROR registrados.
- **Método recomendado para verificar la corrección:** auditoría de merges vs estados de preview.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-010 — Presupuesto de bundles + CB5 + CB3
- **ID estable:** CP-INFRA-010 · **Área:** INFRA/UI · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P2
- **Descripción del problema:** del audit de performance quedan: sin presupuesto de bundles en CI (riesgo de reintroducción silenciosa de los chunks pesados ya resueltos — CB1), carrito persiste objetos `Product` completos en localStorage (CB5, P2, requiere migración versionada del storage), landing 100% cliente ~500 KB JS (CB3, P3, requiere RSC estructural).
- **Comportamiento esperado:** size-limit en CI; storage del carrito mínimo; landing en RSC.
- **Origen documental:** `docs/audits/COSTPRO-PERFORMANCE-AUDIT.md` §11.3 + CB5/CB3.
- **Fecha del registro original:** 2026-10-11/12.
- **Evidencia en el código actual:** existe `scripts/bundle-gate/check-bundle-gate.mjs` y el job quality lo llama (parcial: gate de bundle ya cableado — verificar cobertura); CB5/CB3 sin commits.
- **Pruebas realizadas:** evidencia documental + presencia del script del gate.
- **Resultado observado:** parcial en bundle-gate; CB5/CB3 pendientes.
- **Impacto de mantenerla pendiente:** regresiones de rendimiento posibles; storage creciente en dispositivos de tienda.
- **Causa raíz confirmada o hipótesis:** —
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** verificar cobertura del bundle-gate; CB5/CB3.
- **Criterios de aceptación propuestos:** CI falla si el chunk del POS supera presupuesto.
- **Método recomendado para verificar la corrección:** gate en PR con import pesado de prueba.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-011 — Sin proyecto Supabase aislado para E2E/perf
- **ID estable:** CP-INFRA-011 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P1
- **Descripción del problema:** no existe proyecto Supabase de pruebas aislado: el único fixture es admin contra la BD compartida de negocio (`wthkddeleylijmonclxg`); la medición autenticada del POS quedó detenida («el aislamiento no puede demostrarse»); fue causa raíz de los 2 incidentes de contaminación y justifica el E2E de CI apagado (CP-INFRA-001).
- **Comportamiento esperado:** proyecto/branch de Supabase de pruebas + credenciales E2E en secrets + cuota gestionada.
- **Origen documental:** `docs/audits/COSTPRO-PERFORMANCE-AUDIT.md` §10/§11.4 + incidentes de contaminación.
- **Fecha del registro original:** 2026-10-11/12.
- **Evidencia en el código actual:** `e2e/fixtures.ts` admin-only; `E2E_ISOLATION`/`E2E_ALLOW_CREATION` como mitigación parcial.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** bloqueo estructural principal de la calidad automatizable.
- **Impacto de mantenerla pendiente:** sin él no se puede re-activar CI E2E, ni medir perf autenticada, ni cerrar CP-INFRA-005/006.
- **Causa raíz confirmada o hipótesis:** coste/gestión de un segundo proyecto.
- **Dependencias y riesgos:** habilita 4+ tareas.
- **Trabajo que faltaría realizar:** provisionar proyecto, seed de fixtures, secrets, workflows.
- **Criterios de aceptación propuestos:** E2E creation corre aislado sin tocar negocio.
- **Método recomendado para verificar la corrección:** correr test:e2e:creation contra el proyecto de pruebas.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-012 — Sin métricas de campo + awaits secuenciales restantes
- **ID estable:** CP-INFRA-012 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** sin web-vitals p75 (métricas de campo) instaladas; endpoints con awaits secuenciales restantes documentados (`received-services`, `usage-sync`, `import-trm`, `bulk-pay`) que requieren análisis de dependencias previo.
- **Comportamiento esperado:** RUM p75 monitorizado; paralelizaciones seguras aplicadas.
- **Origen documental:** `docs/audits/COSTPRO-PERFORMANCE-AUDIT.md` §11.5/§11.6/§3.3.
- **Fecha del registro original:** 2026-10-11/12.
- **Evidencia en el código actual:** sin instrumentación RUM localizada.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** decisiones de performance a ciegas en dispositivos reales de tienda.
- **Causa raíz confirmada o hipótesis:** —
- **Dependencias y riesgos:** CP-INFRA-011.
- **Trabajo que faltaría realizar:** instalar web-vitals + analítica; paralelizar tras análisis.
- **Criterios de aceptación propuestos:** dashboard p75 por ruta.
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

#### CP-INFRA-013 — Reevaluación Vercel AI SDK postergada sin tracking
- **ID estable:** CP-INFRA-013 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** la IA del chatbot alucina nombres de tools (parsing de texto, no tool-calling nativo); la decisión documentada fue NO migrar a Vercel AI SDK y reevaluar en Q3 2026 si ocurren: 3+ bugs, 5+ tools nuevas, multi-step complejo, ai@5. Sin tracking del trigger.
- **Comportamiento esperado:** revisión trimestral registrada o migración.
- **Origen documental:** `docs/vercel-ai-sdk-migration-eval.md`.
- **Fecha del registro original:** 2026-06-28.
- **Evidencia en el código actual:** sin registro de reevaluación posterior.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** compromiso sin dueño.
- **Impacto de mantenerla pendiente:** bugs de tools conocidos persisten.
- **Causa raíz confirmada o hipótesis:** postergación deliberada.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** decidir en Q3-2026 (vencido o próximo según calendario).
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

#### CP-INFRA-014 — Branch protection no verificable — NO VERIFICABLE
- **ID estable:** CP-INFRA-014 · **Área:** INFRA · **Estado verificado:** NO VERIFICABLE · **Prioridad:** P3
- **Descripción del problema:** `docs/branch-protection.md` documenta la configuración requerida (status checks, secrets requeridos) pero no hay constancia de que esté aplicada en GitHub; esta auditoría no consultó settings del repo (requiere API admin).
- **Comportamiento esperado:** protección activa según doc.
- **Origen documental:** `docs/branch-protection.md`.
- **Fecha del registro original:** s/f.
- **Evidencia en el código actual:** —
- **Pruebas realizadas:** ninguna (fuera de alcance read-only del API admin).
- **Resultado observado:** no verificable.
- **Impacto de mantenerla pendiente:** si no está aplicada, main acepta pushes directos (relacionado con CP-INFRA-009/016).
- **Causa raíz confirmada o hipótesis:** No determinado.
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** verificar y aplicar settings.
- **Criterios de aceptación propuestos:** main protegida con checks requeridos.
- **Método recomendado para verificar la corrección:** API admin de GitHub / settings UI.
- **Limitaciones de la auditoría:** sin permisos admin declarados para esta misión.

#### CP-INFRA-015 — Warnings de deploy Vercel (stripe + tracing)
- **ID estable:** CP-INFRA-015 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** warning de `stripe` (módulo opcional no instalado, `stripe.ts:120`) + 16 warnings de tracing de filesystem (11.120 archivos `/ROOT/`) en cada deploy; backlog no bloqueante.
- **Comportamiento esperado:** silenciar o scoping de paths.
- **Origen documental:** `docs/audits/VERCEL-PREVIEW-FAILURE.md` §8.
- **Fecha del registro original:** 2026-10-06.
- **Evidencia en el código actual:** sin cambios localizados.
- **Pruebas realizadas:** evidencia documental.
- **Resultado observado:** pendiente.
- **Impacto de mantenerla pendiente:** ruido en logs de deploy; posibles falsos negativos de warnings reales.
- **Causa raíz confirmada o hipótesis:** —
- **Dependencias y riesgos:** —
- **Trabajo que faltaría realizar:** limpiar imports y outputFileTracingIncludes.
- **Criterios de aceptación propuestos:** 0 warnings de tracing.
- **Método recomendado para verificar la corrección:** logs de deploy.
- **Limitaciones de la auditoría:** —

#### CP-INFRA-016 — Auto-commits diarios del agente auditor a main
- **ID estable:** CP-INFRA-016 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `daily-audit.yml` (cron diario) ejecuta `scripts/audit-agent.py` y auto-commitea `docs/mapa_vistas.md`, `public/system_architecture.json`, `logs/audit_log.json` como «AI Auditor Agent» directamente a la rama default.
- **Comportamiento esperado:** si main está protegida, estos pushes fallarán; si no, bypass del proceso de PR.
- **Origen documental:** lectura del workflow (agente CI).
- **Fecha del registro original:** 2026-10-16.
- **Evidencia en el código actual:** workflow activo.
- **Pruebas realizadas:** lectura.
- **Resultado observado:** riesgo de proceso.
- **Impacto de mantenerla pendiente:** inconsistencia con la política de PRs; conflicto con branch protection futura.
- **Causa raíz confirmada o hipótesis:** automatización previa a la protección de rama.
- **Dependencias y riesgos:** CP-INFRA-014.
- **Trabajo que faltaría realizar:** decidir: PR automatizado o desactivar.
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

#### CP-INFRA-017 — Limitaciones de memoria declaradas en next.config
- **ID estable:** CP-INFRA-017 · **Área:** INFRA · **Estado verificado:** PENDIENTE CONFIRMADA · **Prioridad:** P3
- **Descripción del problema:** `turbopack.memoryLimit` NO es reconocida en Next 16.3.3 (opción omitida silenciosamente); Sentry `automaticVercelMonitors` omitido con Turbopack; type-check omitido solo en PERF_AUDIT_BUILD. Sin forma declarada de limitar la memoria de build.
- **Comportamiento esperado:** configuración de memoria efectiva o alternativa documentada.
- **Origen documental:** comentarios de `next.config.ts` (verificados por agente CI).
- **Fecha del registro original:** 2026-10-11.
- **Evidencia en el código actual [VERIFICADO HOY]:** comentarios del config.
- **Pruebas realizadas:** lectura.
- **Resultado observado:** limitaciones de versión documentadas en código.
- **Impacto de mantenerla pendiente:** alimenta CP-INFRA-002.
- **Causa raíz confirmada o hipótesis:** versión de Next/Turbopack.
- **Dependencias y riesgos:** CP-INFRA-002.
- **Trabajo que faltaría realizar:** revisar en próximas versiones de Next.
- **Criterios de aceptación propuestos:** —
- **Método recomendado para verificar la corrección:** —
- **Limitaciones de la auditoría:** —

### 3.9 RESUELTAS VERIFICADAS (consolidadas — para no reabrirlas)

Las fichas de esta sección son compactas por diseño: consolidan 1-N hallazgos documentales ya corregidos con evidencia citada en el propio repo. Los IDs de origen remiten a los informes fuentes.

#### CP-RES-001 — Spoofing de p_user_id en 31 RPCs + BOLA + H7/H4 — RESUELTA
- **Origen:** `audit_h1_h7_spoofing_validation.md` (2026-07-28).
- **Resolución:** V2.12.9 (`20260727000006`), V2.12.10 (`20260727000007`), V2.12.11 (`stores/route.ts`); hot test runtime: spoofing bloqueado; score 62→78. Residuales en CP-SEC-005.
- **Verificación:** migraciones presentes en repo + informe de hot test. Nota: restan −12 puntos documentados (rate limiting, CSRF no verificado en todos, sin E2E de los fixes) → vive en CP-SEC-005/013.

#### CP-RES-002 — Seteo de contraseña por Super Admin — RESUELTA
- **Origen:** `USERS-MULTISTORE-PASSWORD-ADMIN.md` (2026-10-04).
- **Resolución:** `SetPasswordModal.tsx` + `/api/users/reset-password` (`withRole('admin')`, server-side `auth.admin.updateUserById`, anti-spoof por email, auditoría sin secretos, `user_audit_log`); 30 tests; suite 2.502/0; CERTIFIED; sesiones revocadas por Supabase.

#### CP-RES-003 — Aislamiento del landing del tema — RESUELTA
- **Origen:** `landing-isolation-audit.md` + `landing-isolation-evidence.md` (2026-10-06).
- **Resolución:** `landing-shield.css` + `:has(#landing-root)`; eliminado forzado de clases en `<html>`; 211/211 checks; píxel-idéntico. Degradación sin `:has()` documentada.

#### CP-RES-004 — Performance CB1/CB2/CB4 — RESUELTA
- **Origen:** `COSTPRO-PERFORMANCE-AUDIT.md` (2026-10-11/12).
- **Resolución:** dynamic imports de jspdf/html2canvas/xlsx (commits `a49fc7045`, `b1bfc94a6`, `7075dab71`, PR #1392); splash 1,8 s → 0,65 s (LCP −40%); sync/batch −55% (subset seguro). CB5/CB3 y size-limit siguen en CP-INFRA-010.

#### CP-RES-005 — Higiene de datos E2E + gobernanza — RESUELTA
- **Origen:** `E2E-DATA-HYGIENE.md` + `E2E-RESOURCE-LIFECYCLE-REMEDIATION.md` (2026-10-05/09).
- **Resolución:** limpieza de 2.638 tiendas + 364 usuarios + 38 tenants; RPCs `e2e_hard_delete_*` (migraciones 20261005120000/1); guardrail net-zero; gobernanza por UUID + `protected-resources.json` + reconciliación por RUN ID (6/6 limpiados). CI E2E desactivado como mitigación → CP-INFRA-001.

#### CP-RES-006 — Importación ENERVIDA + conciliación 179/179 — RESUELTA
- **Origen:** `ENERVIDA-EXCEL-IMPORT.md`, `AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md`, `REGISTRO_MOVIMIENTOS…` (2026-10-04→16).
- **Resolución:** 480 operaciones importadas (migraciones 20261004120000/1/2, PR #1355); f873 registrada (VS-000179-2026, PR #1403); f854 registrada (TX e794db77, PR #1404); alta oficial SKUs 160-173 (adenda G); nomenclatura D-9 normalizada (32 SKUs); conciliación final 179/179 con 0 diferencias. 26 operaciones del papel resueltas (GATE 16 adenda).

#### CP-RES-007 — WAC cero TAREA 2/2B — RESUELTA
- **Origen:** `ENERVIDA-WAC-ZERO-COST.md` + `-CIERRE.md` (2026-10-06/07).
- **Resolución:** 44 reconstruidos con `fn_recalc_wac` + `wac_change_log` (PR #1370, stock 71/71 intacto); 13 restantes → 1 CUP por decisión contable explícita (CLOSED-CERTIFIED, 157/157 delta 0); COGS histórico 100% intacto. TAREA 3 sigue abierta → CP-IPV-002.

#### CP-RES-008 — Catálogo/regresiones/UUID/tipos servicio/super admin — RESUELTA
- **Origen:** `INVENTORY-CATALOG-REGRESSION-1379.md` (2026-10-08), `INCIDENTE_UUID…` (2026-10-15), `AUDITORIA_SERVICIOS…` (2026-10-15), `FIX_SUPERADMIN_TIPOS_SERVICIO_2026-10-17.md`.
- **Resolución:** searchTerm de catálogo efímero + purga + test de regresión; `useCatalogProducts.ts` con uuidRegex canónico + 17 tests (suite 2.947/0); migración `20261015000001_service_types_global_acceptance.sql` + API `/api/service-types` (PR #1409, E2E real SRV-20261015-00053); super-admin tipos con `useServiceTypes.ts` Bearer + loadError (PR #1413, suite 2.964/0). Residuales: CP-CAT-003 (selectedCategories), CP-SEC-019 (UUID en más rutas).

#### CP-RES-009 — IPV Ventas + truncado PostgREST — RESUELTA
- **Origen:** `INCIDENTE_IPV_CANTIDADES_VENTAS_Y_RECONSTRUCCION_HISTORICA_2026-10-16.md` + `AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` (2026-10-16).
- **Resolución:** vista/API/PDF/Excel de IPV Ventas (PR #1411, commits `c23904c`..`9019683`, CI 6/6); `src/lib/supabase-fetch-all.ts` con paginación obligatoria de las 5 fuentes (fix del truncado a 1000 filas que ocultaba ventas — 22 tests, verificación en vivo 12/12); texto «2 Kgcalc» corregido; precisión 4 decimales. Limitaciones informadas → CP-IPV-001.

#### CP-RES-010 — Comisiones Reporte Entrega — RESUELTA
- **Origen:** `AUDITORIA_TRABAJADORES…` (2026-10-14) + `FIX_REPORTE_ENTREGA_COMISIONES_1510_2026-10-16.md`.
- **Resolución:** «Gestionar comisiones» operativo (`CommissionsManageModal.tsx`, validación UUID fail-closed, navegación, PR #1406, 2.930 tests); criterio canónico FECHA DEL PAGO + date picker + rectificación `paid_at` por orden del negocio (PR #1412, 16 unit + 8 E2E); validador de fecha operativa corregido (+5 tests). Residual: gate TS completo solo en CI (CP-INFRA-002).

#### CP-RES-011 — Endurecimiento RLS histórico — RESUELTA
- **Origen:** `audit_v3_multi_store.md` §2.3-2.4 (hallazgos F54/F55).
- **Resolución [VERIFICADO HOY]:** DROP de «Productos públicos» + policy anon por tienda (`20260726000032:168`); DROP de «Transactions select/update» con seller_id + reemplazo `transactions_tenant_select` sin seller_id (`20260807000005:84`, `20260807000012:20-22`). Verificación funcional en producción pendiente (solo lectura).

#### CP-RES-012 — Eliminación de caminos V1 + create_sale_v2 endurecido — RESUELTA
- **Origen:** `audit_v3_multi_store.md` §4-§5 (F1/F2/F57 parcial) + FINALIZE-V2.
- **Resolución [VERIFICADO HOY]:** `20261005140000_drop_v1_sale_devolution.sql` elimina físicamente create_sale (20 firmas), create_devolution (×2), fn_process_sale/receipt, reverse_adjustment; callers repo eliminados; `create_sale_v2` H0-R con advisory lock + FOR UPDATE + register_stock_movement + audit_logs (`:686`); void_transaction w9_b8 registra movimientos (`:170,248`); anti-resurrección en security.spec. Residuales: CP-POS-001 (reconciliación programada), CP-SEC-004 (transfers/recepciones).

#### CP-RES-013 — Cortes de deploy TS2739/TS18048 (fixes) — RESUELTA
- **Origen:** `VERCEL-PREVIEW-FAILURE.md` + `vercel-deploy-outage-1381-e2e-sync.md` (2026-10-06/09).
- **Resolución:** props requeridas añadidas (`confirmName="BULK"`, `warningText`) y undefined corregido (fix `107cb3ba`); spec E2E desincronizado re-alineado 8/8; Vercel READY; Vitest 2.721/0. Riesgo de proceso → CP-INFRA-009.

#### CP-RES-014 — /api/inventory/adjust 500 (DEFECT-001) — RESUELTA
- **Origen:** `E2E-COVERAGE-REPORT.md` DEFECT-001 (2026-09-27).
- **Resolución [VERIFICADO HOY]:** `src/app/api/inventory/adjust/route.ts:41-60` mapea `movementType` 'add'/'subtract'/'set' → delta + `p_movement_type: 'adjustment'` con comentario DEFECT-001 explícito.

#### CP-RES-015 — Trazabilidad/Kardex (iteración 11) — RESUELTA
- **Origen:** `docs/trazabilidad-kardex-auditoria.md`.
- **Resolución:** P1-P5 implementados (`StockHistoryView.tsx`, `movementPresentation.ts`, `kardexPeriod.ts`, `get_product_stock_ledger_paginated`, balance_after server-side); 2.700 tests 0 fallos; regresión 217/217. Residual: 12 warnings lint preexistentes en `atomic/index.tsx`.

#### CP-RES-016 — Backup/Restore BR-2 — RESUELTA
- **Origen:** `docs/BR2_DESIGN_FINAL.md` + `BACKUP_RESTORE_FINAL.md` (2026-08-02).
- **Resolución:** migraciones `20260802000007/8` + ejecutor PT-4..PT-8; iteración 7 certificada; 4 preguntas del diseño respondidas por la implementación. Mejoras no bloqueantes → CP-SEC-008 (DT-12/13).

#### CP-RES-017 — Suite E2E 382/382 certificada + net-zero — RESUELTA
- **Origen:** `docs/audits/E2E-INCREMENTAL-STABILIZATION.md` (2026-10-05, PR #1366).
- **Resolución:** 357 passed / 25 skipped / 0 failed; fallos clasificados 100%; 2 fixes de producto legítimos (touch targets 44 px; RPC e2e_hard_delete_user); guardrail net-zero en 13 chunks. Nota: los jobs E2E de CI se desactivaron después (CP-INFRA-001) — la suite existe, la ejecución automática no.

#### CP-RES-018 — Certificaciones UI/PDF/módulos — RESUELTA
- **Origen:** `docs/evaluations/ArenaFC_Evaluation.md` (9.3/10), `docs/quality/evaluacion_pdf_export.md` (7 plantillas), `ipv_audit_report.md` (96/100), `audit_costo_roi.md` (94/100), `sidebar_ux_redesign.md` (7/7).
- **Resolución:** certificaciones con evidencia en cada doc; parametrización de tasas impositivas del cost-engine queda como mejora menor (hallazgo del propio certificado).

### 3.10 OBSOLETAS O REEMPLAZADAS

#### CP-OBS-001 — Documentos con cifras obsoletas — OBSOLETA
- **Incluye:** `SUPABASE_AUDIT.md` (103 tablas/165 RPCs → superado por baseline 127 tablas/353 policies v2.12.50), `docs/mapa_vistas.md` (pre-reorganización v9, 52 vistas en Advertencia, auto-generado), `E2E_TEST_PLAN.md` (superado por Playwright E2E-80; además contiene credencial demo en claro — considerar purgar).
- **Justificación:** los documentos fuentes originales NO se reescriben (regla de la misión); se conserva este registro para que nadie actúe sobre cifras desactualizadas.

#### CP-OBS-002 — Pipeline de mantenimiento automatizado (ciclos 2/3) — OBSOLETA
- **Incluye:** `PIPELINE_IMPROVEMENTS.md` (objetivos del Ciclo 2 sin verificación), `REORGANIZATION_CHECKPOINT_v9.md` (pendientes del Ciclo 3: embeddings RAG, Fase 6, manual how-to).
- **Justificación:** texto dirigido a agente externo sin evidencia de ejecución; el pipeline v9 sigue auto-generando vistas, pero estos objetivos específicos no tienen dueño ni vigencia confirmada. Requieren triage para descartarlos formalmente o reactivarlos.

---

## 4. COBERTURA Y LIMITACIONES GENERALES DE LA AUDITORÍA

1. **No se consultó la BD de producción** (regla read-only): los estados «RESUELTA» de RLS/migraciones se basan en la cadena de migraciones del repo, no en el catálogo LIVE. Se recomienda una verificación con `scripts/ci-fix/isolation_check.py` + consultas de solo lectura autorizadas en la MISIÓN 2.
2. **No se ejecutaron suites de pruebas** (vitest/playwright) ni builds: coste y riesgo de OOM; los estados de tests provienen de informes + lectura de specs.
3. **audit-evidence/** (~200 documentos de evidencia de misiones, 100 MB) NO se recorrió íntegro: es evidencia cruda de fases ya cerradas; los informes consolidados que lo resumen sí se leyeron. Si un hallazgo vivo solo existiera allí, quedaría fuera de este inventario.
4. **scripts/ (45 MB)** se censó y se leyó por muestreo (10 scripts + tooling ci-fix/local-env), no en su totalidad.
5. **Ramas remotas (cientos)**: solo `main` fue auditada a fondo; los informes citan PRs mergeados que ya están en main.
6. **Settings de GitHub** (branch protection, secrets): no verificables sin API admin (CP-INFRA-014).
7. **Supabase Admin API / producción Vercel**: no se invocaron servicios externos.


---

## 5. ACTUALIZACIÓN MISIÓN CONTINUA DE RESOLUCIÓN — CICLO 1 (2026-10-22)

**Inventario de trabajo del ciclo:** `scripts/extracted/tareas.csv` (101 filas, generado por extracción fiel de la tabla maestra; actualizado fila a fila).
**Informe maestro del ciclo:** `MISION_CONTINUA_CICLO1_INFORME_MAESTRO_2026-10-22.md` (este directorio).

Resumen del ciclo (detalle y evidencia por tarea: CSV + informe maestro):

| Resultado | Filas | Detalle |
|---|---|---|
| RESUELTA_VERIFICADA (verificadas este ciclo; el inventario estaba desactualizado) | +5 | CP-POS-009 (PRs #1419/#1422/#1423), CP-UI-005 (plan 7 commits ejecutado), CP-SEC-007 (#1428/#1433), CP-SEC-020 (rem_inv_6), CP-SEC-018 (v2_16_0/v2_16_1) |
| CORREGIDA_POR_ESTE_CICLO — código en PRs sin fusionar | 8 | CP-CAT-005, CP-SEC-004, CP-INV-009 (PRs #1441/#1442), CP-CAT-003, CP-SEC-015, CP-INFRA-012, CP-INV-008 (PR #1443) |
| Migraciones PREPARADAS (no aplicadas; guards fail-closed) | 2 | CP-SEC-003 y CP-UI-001 ítem 2/5 (PR #1444) |
| Decisión del propietario registrada (vales, 2026-10-21) | 1 | CP-DATA-001 sub-ítem vales RESUELTO; resto de lotes sigue pendiente de autorización |
| Sin cambio (superada por diseño posterior / por diseño) | 2 | CP-POS-005 (INC-2026-10-19/#1432), CP-UI-004 |
| Clasificación del resto por bloqueo real | 41 | A2 (5), autorización (12), datos (3), despliegue (4), entorno/credenciales/dependencias/decisiones (17) — fila a fila en el CSV |

- Los PRs #1441–#1444 contienen las correcciones; NINGUNO fusionado por el agente.
- La fila CP-SEC-012 (Misión B) y los bloques de conciliación de la Misión C NO se sobrescriben; este bloque solo se añade.
