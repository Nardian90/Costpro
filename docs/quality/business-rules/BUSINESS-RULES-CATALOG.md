# CATÁLOGO MAESTRO DE REGLAS DE NEGOCIO — COSTPRO 4 Multitienda
**ID del estándar asociado:** CP-BRA-001 · **Versión del catálogo:** 1.0 · **Fecha:** 2026-11-26
**Commit examinado:** main `0e684d6c1` (post PR #1711) · **Misión origen:** CP-SAAS-BUSINESS-RULES-CERTIFICATION-001

---

## 1. PROPÓSITO Y ALCANCE

Este catálogo documenta las reglas empresariales reales de COSTPRO 4 tal y como están **implementadas hoy** en el código (frontend, API, RPC, triggers, restricciones, RLS), no como deberían ser. Es la referencia obligatoria para toda misión futura: ninguna misión puede declararse completa si altera una regla aquí catalogada sin actualizar su entrada y sus pruebas.

Método de construcción (resumen; detalle en STANDARD-CP-BRA-001.md §1):
1. Exploración forense del código real en 5 dominios paralelos (arquitectura/plataforma, finanzas, operaciones comerciales, inventario/datos maestros, infraestructura de calidad) sobre main `0e684d6c1`.
2. Cruce con: migraciones (`supabase/migrations/`, 627 archivos / 212 en replay), expedientes `docs/audits/`, workflows de CI, historial de incidentes documentados.
3. Toda regla lleva evidencia verificable (`archivo:línea`) y un estado de cumplimiento.

**Advertencia de método:** ninguna regla aquí es interpretación sin evidencia; las interpretaciones pendientes de decisión del negocio están marcadas `INFERIDA` o `AUSENTE`, y las contradicciones detectadas entre módulos están marcadas `CONTRADICTORIA`.

## 2. LEYENDA DE CLASIFICACIÓN

### 2.1 Naturaleza de la regla
| Clase | Significado |
|---|---|
| CONFIRMADA | Regla empresarial explícita con implementación verificada y evidencia directa (código + prueba o incidente documentado). |
| TÉCNICA | Regla que existe como mecanismo técnico cuya intención empresarial está documentada (p. ej. idempotencia, locks). |
| INFERIDA | Regla deducida del comportamiento del código; requiere validación del propietario antes de considerarla definitiva. |
| CONTRADICTORIA | Dos partes del sistema imponen comportamientos diferentes para la misma realidad. |
| AUSENTE | Regla empresarial necesaria que NO existe (ninguna capa la impone). |
| OBSOLETA | Regla que existió y quedó en superficie muerta o documento desactualizado. |

### 2.2 Severidad (según FASE 10 de la misión)
**CRÍTICA** (dinero/inventario/trazabilidad/aislamiento) · **ALTA** (documentos, saldos, relaciones, reportes; duplicados) · **MEDIA** (funcional sin impacto directo de integridad) · **BAJA** (usabilidad/documentación/mantenimiento).

### 2.3 Cumplimiento
**CUMPLE** (garantizada en backend/BD con prueba) · **PARCIAL** (impuesta en alguna capa pero eludible o sin prueba negativa) · **FALTA** (no impuesta) · **REQUIERE DECISIÓN** (ambigua; necesita decisión del propietario).

---

## 3. FAMILIA FIN — Finanzas y contabilidad

### FIN-001 · Solo el motor contable escribe el mayor de partida doble
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `fin_entries` y `fin_movements` (mayor de partida doble) solo pueden escribirse vía funciones del motor (`fin_post_document[_safe|_annulment]`); la escritura directa por `authenticated` está denegada.
- **Justificación:** una operación no debe alterar saldos contables sin asiento trazable; evita mayor divergente del riel operativo.
- **Módulos/entidades:** `fin_entries`, `fin_movements`, `fin_categories`, `fin_document_types`, `fin_rule_versions` (migración 20261113120000 §1-10).
- **Operaciones permitidas/prohibidas:** INSERT/UPDATE por el motor RPC y service_role; denegado a `authenticated`.
- **Controles:** GRANT/REVOKE en BD (20261113120000) + gate SQL CI (`secdef_public_grant`, allowlist).
- **Pruebas:** suites de migraciones `src/__tests__/migrations/` (53 suites); conciliación contable-operativa `fin_get_reconciliation` v3 (20261122130000).
- **Evidencia:** `supabase/migrations/20261113120000_cp_fin_engine.sql`; `scripts/ci-gate-sql-checks.js`.
- **Riesgos:** un REVOKE/GRANT erróneo en re-emisión futura reabriría la escritura — el gate de CI es la barrera; ver SYS-002.

### FIN-002 · Total = Pagado + Saldo, con reversiones neteadas (calculador único CxP)
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** para CxP (recepciones + servicios recibidos + comisiones), la única fuente de cálculo de Total−Pagado=Saldo es el calculador puro `src/lib/accounts-payable/calculator.ts`, que netea reversas (`direction='reversal'` RESTA).
- **Justificación:** corrige el incidente de KPI divergente ($68,665 vs tabla $0) del expediente CP-AP-FORENSIC-RECONCILIATION-001.
- **Controles:** API y export Excel consumen la MISMA fuente (route.ts:208; export).
- **Contradicción activa:** CxC usa otro camino (ver FIN-011) → ver CONTRADICTORIA.
- **Pruebas:** 34 pruebas del calculador + `e2e/accounts-payable.spec.ts` + forense reproducible `scripts/cxap-forensic-audit.mjs`.
- **Evidencia:** `src/lib/accounts-payable/calculator.ts:244-261`; `src/app/api/accounts-payable/route.ts:157-162,208`.
- **Riesgos:** cualquier writer nuevo de saldos que no pase por el calculador rompe la coherencia (ocurrió con CxC/OT — FIN-011/FIN-012).

### FIN-003 · Prohibido borrar pagos (PT007)
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** ningún pago de `payment_transactions` puede borrarse; la corrección siempre es contra-fila de reversión.
- **Controles:** trigger BD impide DELETE (excepción restore_mode) + endpoint devuelve 409 `ERR_PAYMENT_DELETE_FORBIDDEN`.
- **Evidencia:** `supabase/migrations/20260812000001:120-121`; `src/app/api/payments/[id]/route.ts:20-25`.

### FIN-004 · Reversión de pago solo con contra-fila estructuralmente única
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** `reverse_supplier_payment` inserta contra-fila con mismo importe/medio/moneda/tasa, idempotencia por índice único parcial `uq_payment_reversal_origin` + key `reversal:<id>`; audita `PAYMENT_REVERSED`.
- **Controles:** RPC service_role, valida actor `has_store_access_as`, fecha operativa forward-only.
- **Límite conocido (excepción deliberada):** NO comprueba estado del padre (permite revertir pagos de documentos anulados, para limpiar anomalías) → ver FIN-008. **R-14 RESUELTO (2026-11-25, CP-BRA-REMEDIATION-001):** la reversión ya bloquea pagos en períodos fiscales cerrados/locked (`ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD`, 20261126140000) salvo excepción administrativa auditada.
- **Restricción:** solo `ref_type` receipt|service; pagos de OT/CxC son irreversibles (ver FIN-013).
- **Evidencia:** `supabase/migrations/20261124120000:211-336,244-246,51-53,264-283`.

### FIN-005 · Anulación de documento dispara reversión contable completa
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** anular documento (venta/recepción/servicio) dispara triggers `fin_trg_*` → `fin_post_document_annulment` que cubre eventos `reconocimiento+pago` y marca asiento original `status='reversed'`.
- **Brecha activa:** `void_reception_with_reversal` NO revierte las filas de pago de recepciones anuladas (solo servicios lo hace desde 20261124120100) → R-04 CRÍTICO.
- **Evidencia:** `supabase/migrations/20261113120100:492-540,564-628`; `20260916000001:3670-3712`; `20261124120100:22-262`.

### FIN-006 · Sobrepago prohibido en CxP, neteando reversiones
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `register_supplier_payment[_batch|_multi]` rechaza pagos que excedan saldo del documento en su moneda, neteando reversas (`ERR_MULTI_OVERPAY`); lock `FOR UPDATE` del documento primero; idempotencia por clave.
- **Controles:** RPC + pre-check agrupado por documento en multi (anti dead-lock con orden determinista).
- **Evidencia:** `20261124120000:391-476`; `20261121190000:326-1166`; `20261124120300:127-220`.
- **No aplica a:** CxC/OT vía loop no atómico de `/api/payments` (FIN-013).

### FIN-007 · Tasa de cambio: jerarquía canónica fail-closed (ventas y caja)
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** la tasa server-side se resuelve store_exchange_rates → BCC seg3 → elToque → Diviza con staleness 45 días; fail-closed si no hay tasa (`ERR_RATE_STALE`).
- **CONTRADICTORIA:** en pagos a proveedores (CxP) la tasa del cliente SÍ tiene autoridad si `p_exchange_rate > 1` (solo fallback si ≤1) — contradice la doctrina «la tasa del cliente NO tiene autoridad financiera» (20261021000001:57-59).
- **Evidencia:** `20261021000001:57-59,449-455`; `20261125120000:525-556`; `20261124120000:429-445`; `20261121190000:414+`.

### FIN-008 · Los cierres históricos no se reabren; el dinero vuelve en el turno vigente
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE (con riesgo documentado)
- **Descripción:** `prevent_cash_closure_edit` y `prevent_fiscal_closing_edit` congelan cierres; reversiones de pagos ya liquidados registran su efecto en la ventana vigente.
- **Riesgo R-14 RESUELTO (2026-11-25, CP-BRA-REMEDIATION-001):** `reverse_supplier_payment` bloquea la reversión de pagos cuyo período fiscal está cerrado/locked (patrón v2_19_3) salvo excepción admin auditada (`PAYMENT_REVERSED_CLOSED_PERIOD`) — migración 20261126140000 aplicada en producción.
- **Evidencia:** triggers en `cash_closures`, `fiscal_closings` (20260213+); `20261124120000:264-283`.

### FIN-009 · Monedas distintas nunca se suman entre sí
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** los importes operan en moneda de origen + `amount_cup` GENERATED = amount × rate; reportes de caja/método separan por moneda (`src/lib/cash-report/summary.ts`, regla anti-duplicación #1479 «la equivalencia NUNCA entra en ventasTotales»).
- **Brecha:** CxC convierte con tasa fija 450 (FIN-011) y `fin_movements` usa `amount_cup` con tasa documental — mismo evento, distinto equivalente CUP según la vista.
- **Evidencia:** `src/__tests__` cash-report-selection «regla crítica anti-duplicación»; `20261122130000:419-420`.

### FIN-010 · Documentos Ingresos/Egresos con reversión documental
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `cash_flow_documents` (estados `confirmado|anulado`, sin borrador); anulación exige motivo ≥3, rol admin/manager/encargado, inserta fila contraria `payment_date=NOW()`, cierres históricos congelados.
- **Evidencia:** `20261021000001:119+`; `src/app/api/cash-flow/reverse/route.ts:37-67`; `reverse_cash_flow_document`.

### FIN-011 · CxC: saldo por columnas desnormalizadas `paid_amount` de production_orders
- **Estado:** CERTIFICADA (2026-11-27) · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE (R-01/R-02 remediados; E2E dedicado 16/16; R-25/R-26 del alcance remediados y desplegados)
- **Descripción:** la ruta CxC usa `production_orders.paid_amount` desactualizada (el trigger que la mantenía perdió la rama `production_order|work` al reemitirse `update_payment_status` en 20261124120000:67-141) y convierte con tasa fija 450 en vez de la tasa documental/canónica.
- **Remediación R-01 (2026-11-25, CP-BRA-REMEDIATION-001):** la migración 20261126140000 reemite `update_payment_status` con las TRES ramas (OT restaurada con neteo de contra-filas + guard voided + recomputo en DELETE) y añade gate/lock de OT en `register_supplier_payment` — aplicada en producción, 9/9 marcas, prueba funcional en aislada. El saldo `paid_amount` vuelve a mantenerse por el trigger para pagos nuevos. **R-02 REMEDIADO (2026-11-25, CP-BRA-REMEDIATION-001):** la ruta usa el helper canónico `src/lib/accounts-receivable/rates.ts` (tasa vigente de `store_exchange_rates`, CUP→1; sin tasa → saldo en moneda original y bloque `unrated` transparente — FIN-009 «monedas distintas nunca se suman»); la constante ×450 quedó eliminada (prueba de regresión).
- **Consecuencia:** importes distintos para la misma realidad contable (la clase exacta de defecto que motivó esta misión).
- **Evidencia:** `src/app/api/accounts-receivable/route.ts:88-96,114,123`; `20261113120800:127-145` (rama perdida); `20261124120000:67-141` (reemisión sin la rama).
- **Evidencia E2E dedicada (2026-11-26):** `e2e/fin011-financial-cycle.spec.ts` 16/16 PASS en CostproE2E (integrada al smoke set del workflow E2E Aislado) — el ciclo pagos↔reversiones×monedas×tasas×conciliación demuestra en vivo saldo motor = mayor neteado = saldo mostrado por la app con tasas canónicas y sin conversiones inventadas. **R-25 y R-26 (descubiertos por esta suite) REMEDIADOS y DESPLEGADOS (2026-11-27, CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001):** vía single de pagos OT con cliente administrativo tras gate canManageStore (PR #1728) y batch con el mismo CASE de neteo del motor single (migración 20261127120000, PR #1729, producción §11g body_hash 9ab5db94); pines N6/N7 convertidos a regresiones positivas; baterías dedicadas 16/16 y 11/11. **Elevación a CERTIFICADA ejecutada** (camino definido en CP-BRA-INV005-FIN011-CLOSURE-001/CERTIFICATION-UPDATE.md §1). Detalle: docs/audits/CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001/

### FIN-012 · Anulación de servicio con pagos: reversión completa obligatoria
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE (desde 20261124120100)
- **Descripción:** el incidente SRV-20261123-00146 (servicio anulado con pago liquidado sin revertir efectos) está corregido: `void_received_service_with_reversal` y `set_received_service_status` revierten TODOS los pagos con contra-filas + asiento compensatorio; `register_supplier_payment` exige servicio `active` (fail-closed).
- **Transiciones:** draft→active|cancelled; active→voided; terminal sin salida.
- **Evidencia:** `20261124120100:22-262,184-193,421-425`; expediente `docs/audits/SR-CREATE-BLOCK-20261125/`.

### FIN-013 · Pagos a órdenes de trabajo: atomicidad por orden y operación parcial
- **Estado:** CERTIFICADA POR DECISIÓN DEL PROPIETARIO (2026-11-27, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.1) · **Severidad:** ALTA · **Cumplimiento:** CUMPLE — DECISIÓN §0.1: los pagos múltiples de OT son una OPERACIÓN PARCIAL (independencia ENTRE órdenes, atomicidad DENTRO de cada orden). (a) El pago mixto multi-componente de UNA OT se confirma en UNA transacción o ninguno — `register_ot_payment_batch` (20261127140000), espejo del batch certificado (lock FOR UPDATE, gate ERR_ORDER_NOT_PAYABLE, aritmética CP-FIN-004, pre-check NETEADO con el CASE del motor single, replay por bloque `<key>:<i>` antes del overpay, inserción vía register_supplier_payment); `/api/payments` enruta el multi-componente OT por ese lote. (b) La operación MULTI-OT vive en `POST /api/payments/ot-batch` — una transacción independiente por orden, resultados por ítem (convención bulk-pay: status all_success|partial|all_failed, error_code + retryable), reintento de OT fallida sin duplicar las demás. (c) El asiento fin ORDEN_TRABAJO existe (20261121120000) y el trigger mantiene `paid_amount` con neteo (R-01). Reglas generales de pago de una OT intactas; la reversión de pagos OT sigue excluida (decisión vigente, riesgo residual documentado).
- **Evidencia:** `20261127140000_cpbra_r03_ot_payment_batch.sql` (guard R03 + VERIFY fail-closed, ACL service_role exclusiva); batería E2E 17/17 vía API real en aislada (operación parcial §3.2, atomicidad §3.3, idempotencia/concurrencia §3.5, conciliación §3.6.14); contrato estático 54/54 (pin R-25 convertido).
- **Riesgo residual:** bajo — sin reversión de pagos OT (FIN-003 nota); sin canal UI multi-OT aún (el canal API queda disponible para el flujo).

### FIN-014 · Comisiones: pago vía RPC con roles de tienda admin/manager/encargado
- **Estado:** CERTIFICADA POR DECISIÓN DEL PROPIETARIO (2026-11-27, §0.2) · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `pay_commission` es el canal canónico ÚNICO (fallback legacy a UPDATE directo ELIMINADO de bulk-pay — bypass del protocolo de cajón sin advisory ni guard físico). La barrera autoritativa es el gate del propio RPC (SECURITY DEFINER): `has_store_role_as(v_uid, tienda, ARRAY['admin','manager','encargado'])` — patrón R-05 (migración 20261127150000) — con compat de admin de plataforma preservada. Clerk/usuario/otra tienda → ERR_FORBIDDEN_ROLE. La ruta `/api/commissions/payments/[id]` autoriza action='pay' por membresía (canManageStore) en vez de rol global (el encargado ya no se rechaza antes de la barrera DB). Regla de actor intacta: p_user_id SOLO para service_role (anti-spoofing), paid_by = usuario real.
- **Evidencia:** `20261127150000_cpbra_pay_commission_encargado.sql` (PC-GUARD/PC-VERIFY 7/7); batería E2E 15/15 §5.4 vía API real (encargado OK, clerk/usuario 403, otra tienda, anti-spoofing, advisory concurrente, guard físico de caja, auditoría del actor) — expediente CP-BRA-FINAL-COMPLIANCE-CLOSURE-001/PAY-COMMISSION-AUTHORIZATION.md.

### FIN-015 · Reportes financieros leen solo del mayor de la generación activa
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `fin_get_balance_sheet`/`income_statement`/`dashboard` leen solo `fin_movements` de la generación activa (`fin_active_generation`), nunca tablas operativas; trazabilidad de origen con `amount_origin` y métricas `_origin`.
- **Generaciones:** building→candidate→active→superseded|rolled_back, una activa por tienda.
- **Evidencia:** `20261120120000:1388,1464`; `20261119150000:52`; `20261118130000`; `20261120120000:105-129`.

### FIN-016 · Conciliación contable-operativa permanente con detectores
- **Estado:** TÉCNICA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `fin_get_reconciliation` v3 compara fuentes operativas (WAC, kardex, OTs, nóminas, ventas) contra el mayor, con detectores (ventas fallback USD, vales sin asiento, kardex vs costo) y snapshots persistibles.
- **Evidencia:** `20261122130000:385+`; `/api/fin/reconciliation`; E2E `cpfin-reconciliation-tab.spec.ts`, `fin-statements-origin-traceability.spec.ts`.

### FIN-017 · Idempotencia de pagos por clave única
- **Estado:** TÉCNICA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `payment_transactions.idempotency_key` UNIQUE; batch hace replay por bloque `key:i`; multi con fast-path de replay; `ERR_IDEMPOTENCY_KEY_REUSE` fail-closed en ventas.
- **Evidencia:** `20260712000001:32-50`; `20261121190000:326+`; `20261124120300:97-125`; `20261125120000:182-226`.

---

## 4. FAMILIA INV — Inventario

### INV-001 · Tres capas con una fuente canónica
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** la existencia canónica es `inventory.quantity` (UNIQUE(store_id,product_id), CHECK ≥0); `products.stock_current` se sincroniza por trigger `trg_sync_products_stock_current`; `stock_movements` es ledger append-only (RLS deniega INSERT/UPDATE/DELETE a authenticated; escritura solo vía `register_stock_movement`).
- **Brecha:** `reconcile_stock p_fix` corrige saldo SIN generar movimiento (anti-spoofing 20260727000013; derivas reales documentadas: reset_store_data bypassó triggers → 67 productos desincronizados, corregido 20260820000004).
- **Evidencia:** `20260113_consolidate_stock_source.sql:9-23,27-70`; `20260304_harden_sale_stock_logic.sql:32-34`; `20260627000003_prevent_negative_stock.sql`; `20260803000005_v2_13_5_stock_movements_immutable.sql:35-67`; `20260726000034_v2_12_2_stock_reconciliation.sql:16-45`; `20260820000004`.

### INV-002 · La existencia debe reconstruirse desde movimientos legítimos
- **Estado:** CONFIRMADA (como objetivo) · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** Σ(movimientos) = existencia para el tramo post-ledger; cargas iniciales pre-ledger y retrodatación rompen la identidad (IPV §1); conteo físico marca `theoretical_source='ledger_drift'` sin inventar saldo.
- **Evidencia:** `docs/audits/AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` §1; `20261023000000_create_physical_inventory_module.sql` §3.

### INV-003 · Costo de venta siempre server-side (WAC)
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `create_sale_v2` calcula costo desde WAC del producto (DF-02, `ERR_` sin fallback); recepción actualiza WAC (`update_product_wac` en receipt_items); kardex valorado automático por movimiento.
- **Evidencia:** `20261125120000:353-361`; triggers 20260726000002:321,533-576; `20260809000004_v2_25_g4_wac_absorption.sql`.

### INV-004 · Reservas con expiración 24h
- **Estado:** TÉCNICA · **Severidad:** MEDIA · **Cumplimiento:** PARCIAL
- **Descripción:** `inventory_reservations` expiran a 24h (`release_expired_reservations`); riesgo: transferencia PENDIENTE cuya reserva expira → sobreventa y confirmación bloqueada por guard negativo (atasco operativo; cancelación manual).
- **Evidencia:** `20260802000002`, `20260803000006`, `20260802000004`; RISK-REGISTER R-24.

### INV-005 · Ajustes: confirmación requiere segundo control (remediación en PR, pendiente de aprobación)
- **Estado:** REMEDIACIÓN PREPARADA · **Severidad:** CRÍTICA · **Cumplimiento:** FALTA EN MAIN/PRODUCCIÓN — PR abierto sin fusionar
- **Descripción:** `confirm_inventory_adjustment` sobrescribe `stock_current` a valor arbitrario con autorización mínima `has_store_access_as` (cualquier miembro, sin rol ni supervisor). Remediación preparada (alternativa A, incremento 1 de DECISION-R05): guard `has_store_role_as(uid, store, {admin,manager,encargado})` fail-closed con `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED` + auditoría transaccional `ADJUSTMENT_CONFIRMED`; sin umbrales/motivo/doble autorización (decisiones reservadas al propietario).
- **Evidencia:** migración `20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql` (PR `fix/inventory-adjustment-role-guard-20261126`, NO fusionada); batería E2E aislada 16/16 PASS (`R05-TEST-EVIDENCE.md`); UI alineada (3 vistas gated).
- **Nota:** NO implementa umbral 15 %, motivo obligatorio ni doble autorización (incremento 2 de la opción C — decisión del propietario). La regla NO está garantizada en main ni producción hasta aprobación expresa, fusión y aplicación gobernada §11g.

### INV-006 · Transferencias entre sucursales: confirmación atómica doble movimiento
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** confirmar genera TRANSFER_OUT + TRANSFER_IN atómicos vía `register_stock_movement`; origen≠destino (CHECK), cantidad>0; aprobación por umbral (`transfer_approval_rules`) bloquea confirm sin approval; reversa gobernada.
- **Evidencia:** `20260211:150-193`; `20260726000021_h7`; `20260727000007`; `20260802000002_v2_12_42`.

### INV-007 · Unidades de medida sin catálogo ni CHECK de conversión
- **Estado:** AUSENTE · **Severidad:** MEDIA · **Cumplimiento:** FALTA
- **Descripción:** `unit_of_measure` TEXT libre sin tabla de unidades; `conversion_factor` de variantes sin CHECK>0 y con fallback silencioso `COALESCE(conv,1)` en ~8 RPCs — distorsiona cantidades en ventas/recepciones si el dato es inválido.
- **Evidencia:** `20260124:36-47`; `20261028110000:42`; `20260803000002_v2_13_2:158-227`; `20261116140000:780-820`; R-23.

### INV-008 · Kardex valorado con running balance por ventana
- **Estado:** TÉCNICA · **Severidad:** MEDIA · **Cumplimiento:** PARCIAL
- **Descripción:** `auto_kardex_on_stock_movement` + `get_product_stock_ledger_paginated` con balance por `(created_at,id)`; `balance_after` no confiable con retrodatación.
- **Evidencia:** `20240725_add_paginated_stock_ledger.sql`; `src/lib/inventory/kardexPeriod.ts`, `saldo-posterior.ts`.

### INV-009 · IPV: identidad de ingresos por ventas solo con ledger + ítems
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `Ef = Ei + EN + DV − V − VS + AJ + TR`; cantidades SOLO del ledger, importes SOLO `transaction_items`/`devolution_items`, cobros reconstruidos de `payment_transactions` (corrige duplicación CUP/USD PR #1697).
- **Evidencia:** `src/lib/ipv-ventas/compute.ts`; `/api/ipv-ventas`; `docs/audits/AUDITORIA_IPV_IMPUTACION_MONETARIA_2026-11-24.md` §2-3.

---

## 5. FAMILIA PUR — Compras y recepciones

### PUR-001 · Ciclo compra→recepción→inventario→obligación→pago con estados explícitos
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** PO `draft|sent|partial|received|cancelled`; `partial/received` SOLO vía `receive_against_po_final` (que crea receipt vía `register_reception` y obligación CxP); recepción `pending→active` por `confirm_pending_reception` con WAC primero y movimiento después, `ERR_RECEIPT_ALREADY_CONFIRMED`, enlace documental `notes=receipt_id` (CP-RECEP-001).
- **Brecha de autorización:** cualquier miembro de tienda confirma/void sin gate de rol ni segundo aprobador (R-06).
- **Evidencia:** `20260808000004_v2_24_g4`; `20260808000003_v2_24_g3:64-71,152-155`; `20261125120000_cp_recep001_confirm_notes_link.sql:50-101,109-213,218-243`.

### PUR-002 · Dedup de factura por concatenación de texto — vulnerable a grafías
- **Estado:** CONTRADICTORIA (frágil vs datos reales) · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** el dedup de facturas usa `'supplier | invoice'` como identidad; grafías/espacios generan duplicados (ya ocurrió: «Tienda Pueblo» vs «TiendaPueblo», CP-AP §4.2).
- **Evidencia:** `20260124:117-125`; `docs/audits/CP-AP-FORENSIC-RECONCILIATION-001/DIAGNOSTICO.md` §4.2; R-07.

### PUR-003 · Recepción anulada mantiene pagos sin reversión
- **Estado:** AUSENTE (regla faltante activa) · **Severidad:** CRÍTICA · **Cumplimiento:** FALTA
- **Descripción:** `void_reception_with_reversal` anula inventario/kardex y pone `status='voided'` pero NO revierte filas de pago — filas 'in' activas sobre documento voided (misma clase que el incidente SRV-20261123-00146, solo corregido para servicios).
- **Mitigación parcial:** elegibilidad del Reporte Entrega excluye pagos de docs anulados (20261124120200:65-111).
- **Evidencia:** `20260916000001:3670-3712`; R-04.

### PUR-004 · Guardas de catálogo maestro en recepciones (CP-CATMAESTRO-001)
- **Estado:** TÉCNICA · **Severidad:** MEDIA · **Cumplimiento:** PARCIAL
- **Descripción:** `add_reception_items` + `save_pending_reception_changes` terminaron revocadas a `authenticated` por ACL huérfana (20261125153000) — la API llama con service_role/admin; patrón vigente: cada `CREATE OR REPLACE` debe re-declarar ACLs.
- **Evidencia:** `20261125131000`, `20261125132000`, `20261125153000`; SYS-002.

---

## 6. FAMILIA POS — Ventas y punto de venta

### POS-001 · La venta es atómica, con lock de tienda y seller binding
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `create_sale_v2` (/35 args): advisory lock por tienda → `has_store_access_as` (`ERR_UNAUTHORIZED`) → seller binding `p_seller_id == auth.uid()` (`ERR_SELLER_MISMATCH`) → fecha operativa → idempotencia por `param_hash` exhaustivo (incluye payments y `p_customer_ci`) → whitelist de métodos con normalización `zelle→external_transfer` → lock FOR UPDATE producto por tienda → stock → precios → impuestos server-side → tasa canónica → `ERR_NEGATIVE_SALE` → `ERR_TOTAL_MISMATCH` ±0.01 → gate supervisor ≥15% con token single-use (jti + scope por línea).
- **Evidencia:** `supabase/migrations/20261125120000:35,153-171,182-226,63-65,278,334-350,353-361,435-459,486-515,525-556,566,593,605-667`; ACL `authenticated, service_role` (:1346-1347).

### POS-002 · Pagos por producto: distribución real por línea, reconciliación externa
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** `transaction_items.payment_distributions` jsonb guarda `[{method,currency,amount,reference?,discount_*}]` normalizado (≤8 filas, amount≥0, referencia obligatoria en transfer con monto>0 → `ERR_ITEM_PAYMENTS_INVALID`); históricos NULL; legacy mirror (cash_paid/transfer_paid/external_transfer_paid) intacto.
- **Brecha:** Σ(distribuciones por línea) NO se cruza server-side contra pools/componentes/total — los datos por línea falsos quedan sin detección automática (la conciliación es proceso externo: script `scripts/cert-pos-conciliacion.mjs` 44/44 de CP-POS-SMOKE-PRODUCTION-001).
- **Evidencia:** `20261125120000:27-28,1094-1117,435-459,787-793`; R-08.

### POS-003 · Referencia de transferencia y datos de cliente con transferencia: regla solo-frontend en componentes de pago
- **Estado:** CONTRADICTORIA · **Severidad:** ALTA · **Cumplimiento:** FALTA (server)
- **Descripción:** en `items[].payments` la referencia se valida server-side; en `p_payment_components` (filas del ledger) NO se exige; el nombre/CI del cliente con transferencia se exige solo en el cliente (route.ts lo documenta explícitamente).
- **Consecuencia:** un cliente no estándar registra transferencias sin número de operación en el ledger financiero.
- **Evidencia:** `20261125120000:453-457` vs `:1138,1159-1169`; `src/app/api/pos/checkout/route.ts:139-143,353,399`; `src/hooks/usePOSCheckout.ts:686-699`; `POSExpressMode.tsx:353-361`; R-09/R-10.

### POS-004 · Anti doble-clic en 3 capas + idempotencia por intención
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** UI disabled (`isProcessingSale`) + cerrojo síncrono `checkoutLockRef` antes del primer await + registro server (idempotencia `sale-<uuid>` estable por intención, outbox antes del fetch).
- **Evidencia:** `usePOSCheckout.ts:165,171-172,465-469`; E2E `pos-peritem-cert.spec.ts` (CERT-UI doble clic → 1 venta).

### POS-005 · Sobrepago sin liquidación de vuelto prohibido
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** identidad `recibido−vuelto = cash` ±0.01 con tasa servidor; sobrepago sin liquidación → `ERR_OVERPAYMENT_UNREGISTERED_CHANGE`.
- **Evidencia:** `20261125120000:879-943,942-945`.

### POS-006 · Incidencias de pago: la puerta MISIÓN-FLEX exige verificación server-side
- **Estado:** AUSENTE → REMEDIADA · **Política DECIDIDA por el propietario (§0.4, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001, 2026-11-27):** se MANTIENE la política vigente — validación server-side obligatoria, estructura tipada, coherencia aritmética, el descuadre debe estar explicado por una incidencia válida y compatibilidad MISIÓN-FLEX; **SIN tope monetario, SIN porcentaje máximo y SIN supervisor obligatorio por umbral** (decisión expresa: no se introducen esos controles). Los pins de regresión permanecen vigentes.
- **Descripción:** un payload con `payment_incidents[]` no vacío desactivaba PT011 (Σamount_cup = total) sin verificar la causa ni tope de monto/autorización → venta `completed` con Σcobros < total; el ledger subestima el cobro (evidencia producción: 3 ventas con difs −200/−12 000/+8 100).
- **Remediación (2026-11-25, CP-BRA-REMEDIATION-001):** 20261126150000 — cada incidencia debe ser objeto tipado (enum + importes no negativos + coherencia difference = received − expected) y el descuadre real (Σpagos − total) debe estar EXPLICADO por una incidencia con esa diferencia exacta (ERR_INCIDENT_INVALID_STRUCTURE / ERR_INCIDENT_ARITHMETIC_MISMATCH / ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE). Compatibilidad probada: las 3 ventas históricas y el payload del checkout cumplen el contrato (E2E aislado POS-015b PASS).
- **Evidencia:** `20261126150000` (reemisión verbatim de create_sale_v2 con §11.6/§18 validados); R-11 CRÍTICO RESUELTO.

### POS-007 · Undo de venta: 30 s, propia, con rol POS (Modelo C Nivel 1)
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `void_transaction` (w9_b8) — propia + ventana 30 s + rol; reversión administrativa por `reverse_transaction_v2` con matriz de roles `DOCUMENT_REVERSE_ROLES`; comisiones se revierten al anular venta (trigger `reverse_commissions_on_sale_void`).
- **Evidencia:** `src/lib/roles.ts:172-230,197-203`; `usePOSCheckout.ts:578-613`; trigger de comisiones.

### POS-008 · Caja no física: el dinero vive en payment_transactions
- **Estado:** TÉCNICA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE (decisión de diseño documentada)
- **Descripción:** confirmar venta no toca caja física; Reporte Entrega/Caja derivado de `payment_transactions` (`cash-report/summary.ts`); `cash_movements` legacy write-only (nadie la lee).
- **Evidencia:** `src/lib/cash-report/summary.ts:89-237,405`; `20261021000001:13-15`.

---

## 7. FAMILIA DOC — Ciclo de vida documental

### DOC-001 · Máquina de estados documental impuesta en BD, fail-closed
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** trigger global `fn_validate_document_transition` sobre `transactions, devolutions, receipts, transfers, inventory_adjustments, production_orders`; tabla/estado desconocido → RECHAZO (fail-closed).
- **Brecha:** `received_services` e `issue_slips` (vales) NO están en el trigger global — sus transiciones solo se imponen en RPC.
- **Evidencia:** `20260913000001:68-77,116-121`; R-12.

### DOC-002 · Numeración documental por tienda con consecutivos server-side
- **Estado:** CONFIRMADA · **Severidad:** MEDIA · **Cumplimiento:** CUMPLE
- **Descripción:** `document_sequences` (invoice/credit_note/quotation/z_report por tienda+año), VS para vales (20260817000001:775-790), ENT para recepciones activadas (20261108201000, forward-only), SRV-YYYYMMDD-NNNNN para servicios; maestro SKU `next_master_catalog_sku` forward-only con `pg_advisory_xact_lock` (elimina generador cliente `AUTO-*`).
- **Evidencia:** `20260810000001`; `20261124120100:355-357`; `20261125120100:45-102`.

### DOC-003 · Vale de salida: flujo revisado Y flujo directo coexisten
- **Estado:** CONTRADICTORIA · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** etapa revisión (pending→completed|voided, confirm relee costo servidor) convive con el flujo directo `create_vale_salida` que descuenta stock en un paso sin aprobación — salida de inventario sin venta ni segundo nivel.
- **Evidencia:** `20261031120100:15-17,42-44,110-112`; `/api/vale-salida` (unit_cost jamás del body, rate limit 10/min); R-13.

### DOC-004 · Trazabilidad histórica inmutable
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** `receipt_items` económicamente inmutables tras confirmación (20261114160000); `protect_transactions_total_amount`; SKU inmutable si hay movimientos (`ERR_SKU_LOCKED_BY_MOVEMENTS`); production_migration_ledger append-only; bloqueo global de TRUNCATE (`trg_cp_infra_020_block_truncate`).
- **Brecha:** referencias suaves `parent_deleted_at` tras abuso histórico de `session_replication_role` (DATA-INTEGRITY-REMEDIATION-001).
- **Evidencia:** `20261114160000`; `20261111120000`; `20261112120000`; `20261108140000`.

### DOC-005 · Auditoría central obligatoria en escrituras sensibles
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** `audit_logs` con triggers sobre stores/products/profiles/memberships/roles/cash_closures/payment_transactions/commission_payments/fiscal_closings/voiding/recepciones; constraint whitelist `audit_logs_store_id_check` para store_id NOT NULL.
- **Brechas:** lecturas no auditadas; whitelist puede romper en runtime (23523) para tablas nuevas auditadas sin registro → pérdida silenciosa de eventos (R-20); no se auditan quotations/ofertas/gaceta.
- **Evidencia:** `20260127_enhance_audit_logs.sql`; `20260318_harden_audit_logging.sql`; `20260726000001_v1_1_stabilization.sql:149`; `20261030143000`; `20261114180500`.

---

## 8. FAMILIA PRO — Clientes y proveedores

### PRO-001 · Proveedores duplicables: sin unicidad ni dedup en alta
- **Estado:** AUSENTE → REMEDIADA · **Política DECIDIDA por el propietario (§0.5, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001, 2026-11-27):** unicidad NO estricta — el sistema PUEDE permitir duplicaciones deliberadas; coincidencia EXACTA → reutilizar el proveedor existente; duplicado sospechoso → ADVERTENCIA; duplicación deliberada → confirmación EXPLÍCITA con motivo obligatorio y trazabilidad de auditoría (`SUPPLIER_DUPLICATE_CONFIRMED`). **NO se implanta UNIQUE estricto por nombre** y NO se eliminan ni combinan proveedores históricos por aproximación. El RPC `create_supplier_local` continúa aplicando la política (verificado).
- **Descripción:** `suppliers` sin UNIQUE (búsqueda exhaustiva = 0 resultados); INSERT RLS abierto a admin/manager/encargado; sin validación anti-duplicado en BD ni UI; dedup por texto ya produjo el incidente CP-AP («Tienda Pueblo» 25 docs vs «TiendaPueblo» 1 doc; 3 recepciones con `supplier='—'` por $19,435).
- **Mitigación parcial:** maestro de terceros `master_parties` con `UNIQUE(tenant,code)` y `UNIQUE(upper(btrim(tax_id)))` parcial; consolidación manual `consolidate_local_party` con guard `ERR_PARTY_HAS_HISTORY` (aplicada 2026-11-25).
- **Evidencia:** `20261101120000_suppliers_visibilidad_multiusuario.sql:148-163`; `20261105130000:65-71`; `20261124120400`; `docs/audits/CP-AP-FORENSIC-RECONCILIATION-001/DIAGNOSTICO.md` §4.2; R-15.
- **Remediación (2026-11-25, CP-BRA-REMEDIATION-001):** RPC `create_supplier_local` (20261126160000) — reuso exacto; sospechosos por nombre normalizado/NIT/teléfono → `ERR_SUPPLIER_DUPLICATE_SUSPECTED` salvo confirmación explícita con motivo, audita `SUPPLIER_DUPLICATE_CONFIRMED`. Hook migrado al RPC (la última barrera es la BD). Prueba funcional 6/6 en aislada + 30 pruebas de contrato/hook. Respeta la decisión §8.4 (unicidad NO estricta); UNIQUE parcial queda como opción documentada del propietario.

### PRO-002 · Clientes duplicables (mismo patrón)
- **Estado:** AUSENTE · **Severidad:** ALTA · **Cumplimiento:** FALTA
- **Descripción:** `customers` sin UNIQUE name/CI; `POST /api/customers` sin chequeo de duplicados; unicidad de tax_id solo en `master_parties`.
- **Evidencia:** `20260726000002:9-25,26-28` (índices no únicos); `src/app/api/customers/route.ts:57-75`; R-16.

### PRO-003 · No fusionar automáticamente entidades con historial
- **Estado:** CONFIRMADA (decisión documentada) · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** consolidación solo manual, sin borrar, con guard `ERR_PARTY_HAS_HISTORY`; decisión conservadora del propietario tras CP-AP de NO fusionar automáticamente.
- **Evidencia:** `20261124120400`; expediente SR-CREATE-BLOCK-20261125 (aplicación en producción).

### PRO-004 · Soft delete asimétrico en terceros
- **Estado:** CONTRADICTORIA · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** profiles/master_* protegidos con soft delete (managed_soft_delete_user, prevent_hard_delete_profile); `suppliers`/`customers` se BORRAN físicamente en resets (20260817000002:155) — pérdida de trazabilidad con documentos que referencian proveedor como TEXT snapshot.
- **Evidencia:** `20260805000002`; `20260805000011`; `20260817000002:155`; R-17.

---

## 9. FAMILIA CAT — Catálogo Maestro

### CAT-001 · El maestro es solo identidad; precio/costo/stock viven por tienda
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `master_products` guarda SKU/nombre/imagen/barcode por tenant, NUNCA precio/costo/stock; vínculo explícito por tienda (`catalog_store_links`, desconectar no borra); `products.master_product_id` con índice único parcial 1-fila-local-por-(maestro,tienda).
- **Controles:** escritura SOLO RPC gobernadas; GRANT de tabla solo SELECT; `master_change_log` (aplicados) vs `master_change_proposals` (pendientes); `catalog_governors` por organización (no auto-promovidos).
- **Evidencia:** `20261028110000:33-64,84-103`; `20261028112000`, `20261028112100`.

### CAT-002 · SKU consecutivo oficial con advisory lock
- **Estado:** CONFIRMADA · **Severidad:** MEDIA · **Cumplimiento:** CUMPLE
- **Descripción:** `next_master_catalog_sku` forward-only contiguo con advisory lock por tenant y salto defensivo; `assign_next_catalog_sku` para tiendas no conectadas; causa raíz del defecto (17 maestros `AUTO-<timestamp>`) documentada.
- **Evidencia:** `20261125120100:45-102`; expediente CP-CATMAESTRO-001.

### CAT-003 · Barcode/SKU únicos con guards
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `UNIQUE(store_id,sku)` (20260124:18), barcode único parcial, guards de productos (SKU immutable, master-link, barcode).
- **Evidencia:** `20260124_enforce_store_sku_uniqueness.sql:18`; triggers de productos.

### CAT-004 · Variantes mutables por el cliente sin RPC
- **Estado:** AUSENTE · **Severidad:** MEDIA · **Cumplimiento:** FALTA
- **Descripción:** upsert directo de variantes desde el cliente (`useProducts.ts:600-603`) — sin RPC ni auditoría server-side; `price_change_history` solo insert client-side (useProducts.ts:614) sin trigger que lo imponga.
- **Evidencia:** R-18.

### CAT-005 · Precios editables por cualquier rol de tienda
- **Estado:** AUSENTE (control de rol) · **Severidad:** ALTA · **Cumplimiento:** FALTA
- **Descripción:** `products_tenant_update` permite UPDATE a cualquier miembro (clerk incluido) — `is_admin() OR store ∈ current_user_store_ids()` sin filtro de rol; el control de desvío ≥15% en venta con supervisor es el único freno server-side en el punto de venta.
- **Evidencia:** `20260827000005_audit_f3p001_rls_write_isolation.sql:128-138`; `20260926000001_esec_price_integrity.sql:6-17`; R-19.

---

## 10. FAMILIA TEN — Multitienda y aislamiento

### TEN-001 · Acceso por tienda: `has_store_access` como columna vertebral
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** helper STABLE SECURITY DEFINER usado en ~247 archivos de migración (~280 call sites): `is_admin()` OR membership activa con coherencia tenant; `has_store_role(uuid,text[])` para roles por política.
- **Evidencia:** `20260627000001_versionar_has_store_access.sql`.

### TEN-002 · Tenants con coherencia forzada por triggers
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** `tenants` + `tenant_id` estampado en stores/profiles/products/inventory/transactions/receipts/stock_movements/transfers; triggers `enforce_membership_tenant_consistency`, `fn_catalog_link_tenant_coherence`, `fn_party_link_tenant_coherence`.
- **Evidencia:** `20260324_total_remediation.sql:10+`.

### TEN-003 · Tienda activa validada por trigger
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `profiles.active_store_id` validado por `validate_active_store` (roles operativos exigen membership activa; `costo` puede tener NULL).
- **Evidencia:** `20260306_fix_active_store_logic.sql:6-53`.

### TEN-004 · Escapes multitienda históricos: remediados pero con residuales
- **Estado:** TÉCNICA · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** OR de policies RLS anuló aislamiento de products hasta CP-SEC-003 (20261022000001); `payment_transactions.store_id` sin FK generó 33 huérfanos (remediado 20261026150000).
- **Lección permanente:** cada policy nueva debe auditarse por OR-scope antes de merge.

### TEN-005 · Catálogo maestro y datos maestros compartidos por tenant, datos comerciales por tienda
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** maestros por tenant (master_products/master_parties), vínculos 1:1 por tienda, datos comerciales (ventas/inventario/pagos) por tienda; ver CAT-001 y PRO-001.

---

## 11. FAMILIA SEC — Seguridad y permisos

### SEC-001 · La última barrera siempre es la base de datos
- **Estado:** CONFIRMADA (principio rector documentado en código) · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** «la UI es conveniencia; la última barrera SIEMPRE es la DB» — los roles.ts espejan RPCs (`can_pos_undo_transaction`/`can_admin_reverse_transaction`); RLS 154 tablas, 522 policies, 1003 REVOKE/1207 GRANT.
- **Evidencia:** `src/lib/roles.ts:151-157`; recuentos de migraciones (inventario 1-A).

### SEC-002 · Funciones SECURITY DEFINER: auth-check o ACL exclusiva + allowlist con expiración
- **Estado:** CONFIRMADA (control) / PARCIAL (superficie) · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** el SQL Security Gate detecta SD sin auth-check y SD con EXECUTE a anon/PUBLIC (hallazgo=fallo salvo allowlist v2 con reason/added_by/expires — vencidos fallan); baseline estático 126 ítems SD sin auth + 22 contract.
- **Superficie real:** ~63 funciones SD sin primitiva auth visible, entre ellas `reset_store_data`, `bulk_assign_memberships`, `process_inventory_adjustment`, `create_pre_restore_snapshot`, `soft_delete_store` — su única defensa es ACL; precedentes de drift real (20261125132000/20261125153000, 20260726000007_v2_3_1).
- **Evidencia:** `scripts/ci-gate-sql-checks.js`; `ci-gate-allowlist.json`; `scripts/security-contract-test-static.cjs` (3 capas); R-21.

### SEC-003 · Autenticación fail-closed server-side con wrappers únicos
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE (2026-11-27, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001)
- **Descripción:** `getServerSession` con verificación firmada (FIX-AUDIT-AUTH-1); wrappers `withAuth/withRole/withStoreAccess` + mecanismos propios verificados — **229/229 rutas clasificadas por `scripts/audit-route-auth.cjs`, integrado en CI (job Security Audit): una ruta nueva sin clase BLOQUEA el build («sin wrapper = no merge» automatizado)**. Allowlist PUBLIC documentada con expiración.
- **P−:** batería dedicada 22/22 vía HTTP real (sin token, token falsificado, cron sin/incorrecto secreto, webhooks sin firma, públicos OK) + baterías de dominio (rol/otra tienda/anti-spoofing).
- **Brechas (riesgo SEPARADO R-22, no criterio de SEC-003):** ~102 rutas sin zod; CSRF 88; rate-limit 107; dev bypass con doble guardia de env; `withAuth` degrada con warning si falta service_role (R-32).
- **Evidencia:** `scripts/audit-route-auth.cjs`; `scripts/e2e/cpbra-sec003-failclosed-battery-e2e.mjs`; expediente `docs/audits/CP-BRA-FINAL-COMPLIANCE-CLOSURE-001/SEC003-REMEDIATION.md`; `src/lib/auth.ts:19,37,46,82-91`; `src/lib/auth-middleware.ts:99,137,224,321`; R-22.

### SEC-004 · Preventivo de escalada de privilegios
- **Estado:** CONFIRMADA · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** triggers `prevent_self_privilege_escalation` + `profiles_block_privileged_update` sobre profiles; auditoría de cambios de rol/membership.
- **Evidencia:** triggers de profiles (inventario 1-A §6).

### SEC-005 · Autorización secundaria POS (supervisor) con token de un solo uso
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** supervisor-check + tokens en `supervisor_token_usages`; gate ≥15% con jti single-use y scope firmado por línea; verificado server-side en `/api/pos/checkout`.
- **Evidencia:** `src/app/api/pos/checkout/route.ts:262-285`; `20261125120000:605-667`.

### SEC-006 · Rate limit e idempotencia de operaciones peligrosas
- **Estado:** TÉCNICA · **Severidad:** ALTA · **Cumplimiento:** PARCIAL
- **Descripción:** rate-limit Upstash (fallback in-memory dev) en 107 rutas; idempotencia NX lock en archive/restore/reset/bulk; token usage tables.
- **Evidencia:** `src/lib/rate-limit.ts`; `src/lib/idempotency.ts`; `idempotency_keys`.

---

## 12. FAMILIA HR — Recursos humanos

### HR-001 · Nómina con retenciones y transversalidad superadmin
- **Estado:** INFERIDA · **Severidad:** MEDIA · **Cumplimiento:** PARCIAL
- **Descripción:** módulo payrolls (`/api/payrolls/*`) con retenciones «pendiente de liquidación» (20261121230000:89); migración cp_nomina_superadmin_transversal (2026-11-20); sin incidentes conocidos documentados en expedientes revisados; requiere estudio propio (fuera del alcance de esta auditoría inicial).
- **Pruebas:** `nomina_superadmin_rls` (SQL test) + suite nominas en expediente NOMINAS-SC406-20261112 (5,884 tests).

## 13. FAMILIA REP — Informes y reportes

### REP-001 · Un reporte = una fuente de verdad, nunca cálculo ad-hoc de vista
- **Estado:** CONFIRMADA (como objetivo) / CONTRADICTORIA (en vigencia) · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** existen 3 definiciones coexistentes de «pagado» (columnas desnormalizadas, calculador TS CxP, elegibilidad SQL del Reporte Entrega) y 2 conversiones CUP coexistentes (tasa documental vs 450 en CxC) — cualquier writer nuevo que no reemita todas las rutas rompe la coherencia (ya ocurrió: FIN-011).
- **Evidencia:** RISK-REGISTER R-01/R-02/R-25; `calculator.ts:244-261`; `20261124120200:65-111`.

### REP-002 · Reportes asíncronos con corridas registradas
- **Estado:** TÉCNICA · **Severidad:** BAJA · **Cumplimiento:** CUMPLE
- **Descripción:** `/api/reports/generate` + `download/[runId]` con tabla `report_runs` y bucket Storage.
- **Evidencia:** inventario 1-A §4; `20260221_create_reports_bucket.sql`.

## 14. FAMILIA SYS — Integridad general del sistema

### SYS-001 · Idempotencia como primera clase
- **Estado:** TÉCNICA · **Severidad:** CRÍTICA · **Cumplimiento:** PARCIAL
- **Descripción:** tabla `idempotency_keys` + `check/register_idempotency` + hash paramétrico en create_sale_v2 + claves de reversión + NX lock en operaciones peligrosas. Brecha: 4 tablas sin ENABLE RLS (`roles`, `tax_configurations`, `bulk_confirmation_tokens`, `idempotency_keys`) → R-26.
- **Evidencia:** migraciones citadas; inventario 1-A §3.

### SYS-002 · Toda escritura Supabase desde scripts está declarada (guard writers)
- **Estado:** CONFIRMADA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE
- **Descripción:** `writers.manifest.json` (97 guardProtected / 44 isolationProtected / 151 exceptions) + `check-writers.mjs` fail-closed; todo script nuevo con señal de escritor debe declararse.
- **Evidencia:** `scripts/lib/writers.manifest.json`; `scripts/lib/check-writers.mjs`.

### SYS-003 · Producción no es banco de pruebas
- **Estado:** CONFIRMADA (política) · **Severidad:** CRÍTICA · **Cumplimiento:** CUMPLE
- **Descripción:** guard `assert-not-production` (doble flag), BD aislada con centinela `e2e_is_isolated_db()`, higiene net-zero obligatoria; docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.
- **Evidencia:** `e2e/fixtures/assert-isolated-db.ts`; `e2e/scripts/data-hygiene-guard.cjs`; docs/OPERATIONS/.

### SYS-004 · Replay de migraciones determinista y congelado por contador
- **Estado:** TÉCNICA · **Severidad:** ALTA · **Cumplimiento:** CUMPLE (frágil por diseño congelado)
- **Descripción:** baseline 20260828 + migraciones post-baseline (212 incluidos / 415 cubiertos por baseline) con digest; test contador fija `total_incluidos=212`; `--check` en CI regenera y compara.
- **Evidencia:** `scripts/e2e/build-migrations-replay.mjs`; `audit-evidence/INFRA-011/e2e-migrations-manifest.json`; `src/__tests__/e2e/replay-unblock-create-sale-v2.test.ts:574-576`.

### SYS-005 · CRON fail-closed; scheduler parcial
- **Estado:** TÉCNICA · **Severidad:** MEDIA · **Cumplimiento:** PARCIAL
- **Descripción:** `verifyCronAuthorization` solo acepta JWT Vercel o CRON_SECRET (nunca autoriza sin secret); solo `purge-snapshots` tiene cron activo — auto-publish Telegram/WhatsApp sin scheduler (funcionalidad muerta en silencio).
- **Evidencia:** `src/lib/cron-auth.ts`; `vercel.json`; R-27.

### SYS-006 · Deriva de esquema base fuera de migraciones
- **Estado:** CONTRADICTORIA (modelo vs realidad) · **Severidad:** ALTA · **Cumplimiento:** FALTA
- **Descripción:** tablas base (products/stores/profiles/transactions/receipts/inventory/stock_movements/suppliers) no existen como CREATE TABLE en migraciones — solo ALTER; drift prod documentado (`audit-evidence/T0-DERIVA`); fresh deploy roto.
- **Evidencia:** R-28.

---

## 15. RESUMEN DE COBERTURA DEL CATÁLOGO v1.0

| Familia | Reglas | CUMPLE | PARCIAL | FALTA | CONTRADICTORIA/AUSENTE |
|---|---|---|---|---|---|
| FIN | 17 | 8 | 6 | 2 | 1 contrad. (FIN-011, FIN-013) |
| INV | 9 | 4 | 4 | 1 | — |
| PUR | 4 | 1 | 2 | 1 | 1 contrad. |
| POS | 8 | 5 | 1 | 1 | 1 contrad. |
| DOC | 5 | 3 | 2 | — | 1 contrad. (DOC-003) |
| PRO | 4 | 1 | 1 | 2 | — |
| CAT | 5 | 3 | — | 2 | — |
| TEN | 5 | 4 | 1 | — | — |
| SEC | 6 | 4 | 2 | — | — |
| HR | 1 | — | 1 | — | — |
| REP | 2 | 1 | 1 | — | — |
| SYS | 6 | 4 | 1 | 1 | 1 contrad. |
| **Total** | **72** | **38** | **22** | **10** | **4 contrad. / implícitas en PARCIAL** |

**Lectura ejecutiva:** 72 reglas catalogadas en esta versión inicial. Las 10 «FALTA» y las 4 «CONTRADICTORIA» son el núcleo del RISK-REGISTER; las 22 «PARCIAL» definen el trabajo de endurecimiento (prueba negativa + segunda capa). Ninguna regla de este catálogo debe considerarse certificada solo porque está descrita: su estado depende de la matriz de trazabilidad (TRACEABILITY-MATRIX.md).
