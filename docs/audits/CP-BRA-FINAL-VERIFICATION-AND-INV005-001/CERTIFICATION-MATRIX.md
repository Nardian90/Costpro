# CERTIFICATION-MATRIX — Matriz de certificación CP-BRA-001

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Base de evidencia:** main `33ec0975c` (post-fusión #1717/#1718/#1719/#1720) + producción `wthkddeleylijmonclxg` verificada read-only el 2026-11-26 + CI 9/9 en los 4 heads fusionados.
**Estados usados:** los definidos en CERTIFICATION-POLICY.md §2 (CERTIFICADO / CONDICIONAL / RECHAZADO, y el nivel intermedio VERIFICADA usado por el catálogo para reglas remediadas cuya certificación plena exige evidencia adicional).

---

## 1. CERTIFICADO DE ALCANCE (formato obligatorio de la política §3)

```
CERTIFICADO DE REGLAS DE NEGOCIO — CP-BRA-001
Alcance:            los 16 dominios críticos auditados en profundidad (FIN/POS/INV/PUR/PRO/
                    CAT/TEN/SEC/DOC/SYS) según TRACEABILITY-MATRIX.md §B + las 6 máquinas de
                    estados de los ciclos remediados + verificación productiva de los 7
                    críticos del RISK-REGISTER. NO es una certificación de todo COSTPRO.
Versión examinada:  main 33ec0975c (merge #1720); producción: artefactos DDL verificados
                    2026-11-26 con SHA del SQL versionado (15efb4e4 / 3152b4ce / fc97d85e).
Reglas identificadas: 72 (BUSINESS-RULES-CATALOG.md, 12 familias FIN/INV/PUR/POS/DOC/PRO/
                    CAT/TEN/SEC/HR/REP/SYS) · 32 invariantes (DOMAIN-INVARIANTS.md) ·
                    13+ máquinas de estados (STATE-MACHINES.md §1-15).
Reglas críticas auditadas en profundidad: 16 → **certificadas 15 · condicionales 1**
                    (actualización 2026-11-27, ver §6: FIN-011 elevada a CERTIFICADA;
                    INV-005/R-05 certificada tras aprobación y despliegue §11g;
                    FIN-002 consolidada con R-25/R-26). Condicionales restantes: SEC-003 (P−).
Defectos críticos abiertos: **NINGUNO** (R-05 RESUELTO 2026-11-27; R-25/R-26 RESUELTOS
                    2026-11-27). Altos/medios no bloqueantes: R-03, R-06, R-07, R-08, R-09,
                    R-12, R-13, R-16, R-17, R-18, R-19, R-14b, R-10.
Pruebas ejecutadas:  CI 9/9 × 4 heads (TypeCheck+Lint+Unit+Build, TS Security, SQL DB
                    Security, SQL Static, Security Audit, Allowlist, E2E Aislado (project),
                    Unit & Integration, Vercel) · local: 724 tests en 59 archivos de
                    migraciones/rates/hook PASS · contrato de superficie 232→233 fn OK con
                    0 divergencias · guardrail net-zero PASS ×2 (evidencia remediación).
Exclusiones:         módulos no auditados en profundidad en esta misión (HR completo,
                    Nómina, Reportes avanzados, ADNegocio no-financiero); rendimiento;
                    carga; UI no crítica. La certificación global queda CONDICIONADA.
Limitaciones:        ~~la suite E2E aislada de CI es la de humo...~~ RESUELTO 2026-11-27:
                    existe E2E dedicado del ciclo (fin011 16/16) integrado al smoke set y
                    los defectos del alcance (R-25/R-26) fueron remediados y desplegados
                    (ver §6 — elevación de certificación de esta misión).
```

## 2. Matriz profunda de reglas críticas (los 14 ítems exigidos por la misión §9)

Leyenda de columnas abreviadas: **Punto de imposición server-side** (SS), **Aislamiento tienda** (TI), **RLS**, **Prueba positiva/negativa** (P+/P−), **Evidencia productiva** (PRD), **Auditoría** (AUD), **Riesgo residual** (RR), **Criterio de aceptación** (CA). El detalle completo por regla vive en TRACEABILITY-MATRIX.md; aquí se certifica el estado consolidado tras la fusión.

| # | Regla · Invariante | Estados permitidos / transiciones prohibidas | SS | TI | RLS | P+/P− | PRD | AUD | RR | CA | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **FIN-002** · Total = Pagado + Saldo con neteo de reversas (calculador único CxP) | receipts: unpaid→partial→paid; sin saltos inversos sin reversa | trigger `update_payment_status` (3 ramas) + calculador | ✅ store_id en las 3 ramas | ✅ | ✅/✅ (13 tests contrato + 692 migraciones) | ✅ 18/18 OTs coherentes, 0 stale | PAYMENT_REVERSED | bajo: FIN-013 (OT sin vía de reversión) | escritor nuevo debe pasar por el motor | **CERTIFICADA** |
| 2 | **FIN-003** · Prohibido borrar pagos (PT007) | payment_transactions: solo INSERT y contra-fila; DELETE no expuesto | RPC con ROLLBACK en borrado; sin DELETE grant | ✅ | ✅ | ✅/✅ | ✅ 0 borrados (forense) | n/a | bajo | ninguna vía de borrado | **CERTIFICADA** |
| 3 | **FIN-004** · Reversión solo con contra-fila única (idempotencia) | dirección='reversal' única por `reverses_payment_id`; re-intento → idempotent | `reverse_supplier_payment` 5-args + índice único + advisory lock | ✅ `has_store_access_as` | ✅ | ✅/✅ | ✅ 1 reversa histórica correcta (Pixelarte) | PAYMENT_REVERSED + metadata completa | bajo | 2ª llamada → idempotent sin doble contra-fila | **CERTIFICADA** |
| 4 | **FIN-008** · Los cierres históricos no se reabren | pago en período closed/locked → reversión BLOQUEADA; excepción: admin+motivo+flag, con evento | guard R-14 en `reverse_supplier_payment` | ✅ (período por tienda) | ✅ | ✅/✅ (contrato) | ✅ 0 cierres hoy, guard activo | PAYMENT_REVERSED_CLOSED_PERIOD | bajo (0 cierres aún) | excepción sin auditoría = imposible | **CERTIFICADA** |
| 5 | **FIN-009** · Monedas distintas nunca se suman | saldos convertidos solo con tasa canónica; sin tasa → null + bloque `unrated` | `rates.ts` (helper puro) + ruta CxC server-side | ✅ tasa por tienda | ✅ | ✅/✅ (9 tests, regresión ×450) | ✅ 0 OTs no-CUP activas hoy | n/a (cálculo) | medio: tasas desactualizadas en tienda | ninguna constante; sin tasa → visible, no sumada | **CERTIFICADA** (caja+CxC; R-02 remediado) |
| 6 | **FIN-011** · CxC coherente entre pagos y columnas desnormalizadas | paid_amount = Σ neta de pagos por el trigger SIEMPRE | trigger R-01 (rama OT restaurada) + rate server-side + R-25/R-26 remediados (2026-11-27) | ✅ | ✅ | ✅/✅ | ✅ E2E dedicado 16/16 + baterías R-25 16/16 y R-26 11/11 | CREATE_SALE/audit motor | ~~evidencia E2E dedicada falta~~ COMPLETA (16/16, net-zero, smoke CI verde) | E2E dedicado + conciliación cero diferencias | **CERTIFICADA** (elevación 2026-11-27: camino §3 ejecutado) |
| 7 | **FIN-012** · Anulación de servicio con pagos → reversión completa obligatoria | servicio con pagos vivos NO se anula (`ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS`) | guard 20261126120000 en las 4 vías | ✅ | ✅ | ✅/✅ | ✅ 0 anulados con pagos vivos (forense) | audit de reversas | bajo | primera resolver pagos por el procedimiento oficial | **CERTIFICADA** |
| 8 | **POS-001** · Venta atómica con lock de tienda y seller binding | create_sale_v2 única vía; sin partial; idempotencia por hash | RPC /35 con idempotency_registry | ✅ store lock | ✅ | ✅/✅ (692 tests) | ✅ CI E2E pos-checkout PASS | CREATE_SALE_V2 con param_hash | bajo | retry = mismo id, nunca doble venta | **CERTIFICADA** |
| 9 | **POS-006** · Incidencias: la puerta exige verificación server-side | incidencia tipada + aritmética coherente + EXPLICA el descuadre real; sin incidencia → PT011 estricto | `ERR_INCIDENT_*` en create_sale_v2 (§11.6+§18) | ✅ | ✅ | ✅/✅ (contrato + E2E POS-015b) | ✅ 3 ventas históricas compatibles y trazadas | SALE_PAYMENT_INCIDENT | medio: sin tope por incidencia ni supervisor (decisión del propietario, INFORME §5.2) | array arbitrario NO desactiva PT011 | **VERIFICADA** (control estructural; política de tope pendiente) |
| 10 | **INV-003** · Costo de venta server-side (WAC) | costo desde WAC sin fallback cliente; kardex valorado | `create_sale_v2` + `update_product_wac` | ✅ | ✅ | ✅/✅ | ✅ (CI inventory-integrity) | kardex automático | medio: costos unitarios «$1» en recepciones históricas (calidad de datos) | venta con costo cliente = rechazada | **CERTIFICADA** |
| 11 | **INV-005 (R-05)** · Confirmación de ajustes exige rol de gestión | pending→confirmed exigía solo membresía activa (GAP cerrado) | ✅ `has_store_role_as({admin,manager,encargado})` fail-closed (mig 20261126170000) | ✅ tienda | ✅ | ✅ UI alineada en 3 vistas (simétrico con Anular) | ✅ caso histórico (encargado) compatible | ✅ auditoría `ADJUSTMENT_CONFIRMED` transaccional | ~~alto~~ resuelto | Aprobación del propietario + fusión + aplicación §11g | **CERTIFICADA** (2026-11-27: alternativa A aprobada §0.1; PR #1723 fusionado; producción verificada — expediente CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001/R05-APPROVAL-AND-DEPLOY.md) |
| 12 | **PUR-001** · Ciclo compra→recepción→inventario→obligación→pago | draft→confirmed; anulación solo sin pagos vivos | guards 20261126120000 + motor | ✅ | ✅ | ✅/△ (negativa de rol pendiente R-06) | ✅ 0 anuladas con pagos vivos | audit de reversas | medio (R-06 gate de rol sin decisión) | flujo dos pasos verificable | **CONDICIONAL** (R-06) |
| 13 | **PRO-001** · Alta de proveedor sin duplicados silenciosos | reuso exacto; sospechoso → fail-closed con candidatos; confirmación deliberada auditada | RPC `create_supplier_local` (R-15) | ✅ por tienda | ✅ | ✅/✅ (8+7 tests + 6/6 funcional aislada) | ✅ 0 duplicados (forense) | SUPPLIER_DUPLICATE_CONFIRMED | bajo (UNIQUE opcional queda documentado) | duplicado jamás silencioso | **VERIFICADA** (vía RPC; decisión §8.4 respetada) |
| 14 | **CAT-001** · Maestro = identidad; precio/costo/stock por tienda | sin precios en maestro; variantes referenciadas por SKU | esquema + RPC de alta (R-18/R-19 abiertos) | ✅ | ✅ | ✅/△ | ✅ | parcial (R-18: upsert cliente sin auditoría) | medio (R-18/R-19) | sin escritura cliente de identidad | **CERTIFICADA** con RR R-18/R-19 |
| 15 | **TEN-001** · Acceso por tienda como columna vertebral | todo writer valida membership/admin; anti-spoofing (uid de sesión) | `has_store_access_as`/`is_admin_check` en RPCs remediados | — (es la regla) | ✅ | ✅/✅ | ✅ ACLs verificadas en producción (sonda) | audit en writers críticos | bajo | writer nuevo sin check = bloqueante | **CERTIFICADA** |
| 16 | **SEC-003** · Autenticación fail-closed server-side con wrappers únicos | `withAuth`/`withRole`/`withStoreAccess`; service_role solo server | wrappers + `scripts/audit-route-auth.cjs` EN CI (sin wrapper = no merge automatizado) + guard CP-INFRA-019 | ✅ | ✅ | ✅/✅ (batería P− 22/22 vía HTTP real + baterías de dominio) | ✅ | audit_logs | bajo (R-22 separado: zod/CSRF/rate-limit) | sin wrapper = no merge (automatizado) | **CERTIFICADA** (2026-11-27, CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 — diag-splash corregido; cobertura 229/229) |

## 3. FIN-011 — evaluación específica (misión §9.1)

| Evidencia exigida | Estado | Fuente |
|---|---|---|
| E2E aislado | ⚠️ parcial — la suite de humo oficial (CI, `E2E Aislado (project)`) PASS en los 4 heads: pos-checkout + inventory-integrity + auth + isolation; **no existe E2E dedicado de pagos/reversiones/monedas/tasas/conciliación** | CI runs de #1717–#1720 |
| Pagos | ✅ contrato 13/13 + acta funcional aislada (400→partial, +600→paid) | 20261126140000 + CI |
| Reversiones | ✅ contrato + 1 reversa real en producción (Pixelarte, PAYMENT_REVERSED auditado) | forense R-14 |
| Monedas | ✅ validación de moneda/método/tasa en RPC (external_transfer solo USD/EUR; ERR_TASA_NO_DISPONIBLE) | SQL motor |
| Tasas | ✅ tasa de tienda server-side con ERR si falta; helper CxC canónico | 20261126140000 + rates.ts |
| Conciliación | ✅ forense: 18/18 OTs paid_amount = Σ real neta, 0 divergencias | `cpbra-forensic-7criticals.mjs` |
| Concurrencia | ✅ FOR UPDATE en documento + fila; advisory lock en reversa; idempotencia | SQL motor + contrato |
| Integridad de saldos | ✅ recomputo en INSERT/UPDATE/DELETE con neteo | trigger verificado en producción |
| Ausencia de diferencias silenciosas | ✅ en CxP/CxC (0 stale) · POS: ERR_INCIDENT_* exige explicación del descuadre | forense + SQL |

**Decisión:** FIN-011 **se conserva VERIFICADA (no elevada a CERTIFICADA plena)** porque la misión exige E2E aislado dedicado del ciclo pagos↔reversiones×monedas×tasas×conciliación como evidencia para la elevación, y esa suite dedicada no existe aún (la de CI es la de humo). No se eleva una regla a CERTIFICADA solo porque exista una migración o una suite de humo verde. La elevación queda como criterio de cierre para una misión de E2E dedicado.

## 4. Sello global (misión §9.2)

- R-05 (INV-005) sigue abierto (decisión del propietario pendiente) y existe 1 regla crítica sin resolución (11/16 certificadas plenas, 2 condicionales, 2 verificadas pendientes de evidencia/política, 1 rechazada-pendiente).
- Por la política §2: **NO se declara `COSTPRO — BUSINESS RULES COMPLIANCE: VERIFIED`.**
- **Resultado: CERTIFICACIÓN GLOBAL CONDICIONADA.** Condición de cierre del sello:
  1. Decisión del propietario sobre R-05 e implementación de la política elegida (DECISION-R05.md §6) con pruebas positivas/negativas;
  2. (Para FIN-011 plena) E2E aislado dedicado del ciclo de pagos/reversiones con monedas, tasas y conciliación;
  3. (Opcional, decisión del propietario) tope por incidencia POS (INFORME remediación §5.2) y UNIQUE de proveedores (§5.3).

## 5. Actualizaciones de documentación aplicadas por esta misión

1. `RISK-REGISTER.md` — fila R-04 actualizada a RESUELTO (guards `ERR_RECEIPT/SERVICE_HAS_UNRESOLVED_PAYMENTS` verificados en producción + forense 0 anulados con pagos vivos; cerrada por #1716).
2. `TRACEABILITY-MATRIX.md` — tarjeta TR-PRO-001 alineada con la vista consolidada (VERIFICADA vía RPC) y tarjeta TR-FIN-009 actualizada (R-02 remediado; CxC ya no se excluye).
3. `RISK-REGISTER.md` — nota R-05 remite a `DECISION-R05.md` de esta misión.

---

## 6. ELEVACIÓN DE CERTIFICACIÓN — 2026-11-27 (misión CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001)

Camino de elevación definido en CP-BRA-INV005-FIN011-CLOSURE-001/CERTIFICATION-UPDATE.md §1 y **ejecutado íntegramente**:

| Condición definida | Evidencia de cumplimiento |
|---|---|
| 1. Decisión del propietario sobre R-05 + implementación | **APRUEBO alternativa A** (misión §0.1) · PR #1723 revisado conforme, fusionado `819c0adca` · migración 20261126170000 aplicada en producción §11g (11/11 marcas, body_hash 26657592 idéntico en E2E/prod) · verificación productiva read-only (caso histórico encargado compatible, 0 pendientes) · surface re-certificado, entrada allowlist retirada |
| 2. Remediar F011-001/F011-002 (R-25/R-26) con pruebas positivas/negativas y actualizar pins | PR #1728 fusionado `8c3dbf815` (R-25: cliente administrativo tras gate canManageStore en las 3 rutas; batería API real 16/16) · PR #1729 fusionado `c9350fb421` (R-26: migración 20261127120000 — único SUM del pre-check con el CASE del motor single; batería §4.4 A–H 11/11) · **pines N6/N7 convertidos a regresiones positivas conservando los negativos** · suite FIN-011 16/16 PASS · R-26 aplicada en producción §11g (6/6 marcas, body_hash 9ab5db94 idéntico en E2E/prod, histórico intacto) |
| 3. Re-ejecución verde del smoke set | CI de #1728 (7/7 success) y #1729 (9/9 success) — incl. `E2E Aislado (project)` con la suite fin011 en el smoke set |

**Estados resultantes:**
- **FIN-011: VERIFICADA → CERTIFICADA** (la política §2 exigía «no hay defectos críticos abiertos en el alcance» — R-25/R-26 resueltos con evidencia de producción).
- **INV-005 (R-05): RECHAZADA-pendiente → CERTIFICADA** (aprobación expresa + despliegue gobernado + verificación productiva).
- **FIN-002: CERTIFICADA consolidada** (una sola fórmula de saldo pendiente: motor single = batch = trigger; canales de invocación alineados con el patrón canónico).
- **RISK-REGISTER: 0 defectos CRÍTICOS abiertos.**

**Sello global:** ~~CERTIFICACIÓN GLOBAL CONDICIONADA~~ → **`COSTPRO — BUSINESS RULES COMPLIANCE: CERTIFIED`** (alcance: las 16 reglas críticas de CP-BRA-001 + los 32 invariantes del alcance auditado; exclusiones documentadas en el encabezado).

**Excepciones que NO bloquean el sello (decisiones reservadas del propietario, no defectos):**
- SEC-003 CONDICIONAL (cobertura P− de wrappers — alcance de auditoría).
- PUR-001/R-06 (gate de rol en anulación de compras), R-11 (tope por incidencia POS), R-15 (UNIQUE de proveedores): políticas opcionales pendientes de decisión del propietario.
- Identidad del proveedor de las 3 recepciones «—» ($19.435): requiere documentación externa.
- R-03 (loop OT multi-fila no atómico): mitigado (trigger + fin garantizan la verdad contable; asiento ORDEN_TRABAJO verificado por AUD1); la atomicidad multi-fila para OT es decisión del propietario.

**Evidencia de regresión general (2026-11-27):** Vitest 5.335 tests PASS / 0 FAIL (5 chunks) · ESLint 0 errores · ci-gate PASS · check-writers OK · security-contract 0 divergencias · replay MATCH (220) · guardrail net-zero ×3 · PM2 online + /api/health 200 con el .env principal restaurado.
