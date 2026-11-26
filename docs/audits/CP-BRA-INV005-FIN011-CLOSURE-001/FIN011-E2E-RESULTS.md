# FIN011-E2E-RESULTS — Resultados de la suite E2E dedicada FIN-011

**Misión:** CP-BRA-INV005-FIN011-CLOSURE-001 (Línea B) · **Fecha:** 2026-11-26
**Instancia:** Supabase aislado **CostproE2E** (`lguovmvrozxgssupkwpf`; centinela verificado). **Producción NO tocada** (solo lecturas de ACL para caracterizar defectos).
**Ejecución:** `bunx playwright test --project=core e2e/fin011-financial-cycle.spec.ts` con swap de entorno aislado (técnica del CI) — reproducible por el workflow tras el merge.

---

## 1. Resultado global

| Métrica | Valor |
|---|---|
| Tests | **16/16 PASS · 0 FAIL** · exit=0 (duración ~2.1 min) |
| Guard de higiene post-corrida (`data-hygiene-guard.cjs`) | **PASS — net delta = 0** (stores=0 users=0 residuos) |
| Limpieza del namespace FIN011 (afterAll) | verificada: 0 production_orders, 0 received_services, tasa restaurada, active_store restaurado |
| Run de teardown del run-env | `Teardown del run ... completado (net zero)` |

## 2. Iteraciones de estabilización (clasificación de fallos — misión §4)

| Iteración | Fallo | Clasificación | Resolución |
|---|---|---|---|
| 1 | `received_services_supplier_not_null` en fixture | Defecto de test | `supplier` añadido al fixture (CHECK real de la tabla) |
| 2 | `permission denied for function register_supplier_payment` en vía app OT | **DEFECTO REAL F011-001** | Ciclo de OT vía RPC autoritativo + PIN N6 |
| 3 | Reversión esperaba 200, la ruta responde 201 en éxito | Defecto de test | [200,201] aceptados (200 = idempotente) |
| 4 | `ERR_BATCH_OVERPAY` con saldo −100 tras reversión | **DEFECTO REAL F011-002** | Ciclo post-reversión vía motor + PIN N7 |
| 5 | `balance_cup=100000` para presupuesto CUP sin tasa | Defecto de test (CUP→CUP es tasa 1 legítima) | Fixture OT B con `budget_currency='USD'` → unrated real |
| Final | — | — | **16/16 PASS, net delta = 0** |

## 3. DEFECTOS REALES DESCUBIERTOS (entrada al RISK-REGISTER)

### F011-001 — CRÍTICO operativo: pagos a OT vía app imposibles para sesiones reales
- **Qué:** `POST /api/payments` (vía single: `ref_type production_order|work`) y `POST /api/production-orders/[id]/payments` llaman `register_supplier_payment` con el **cliente de sesión** (`getSupabaseForSession` → JWT del usuario). La ACL de la función es `{postgres, service_role}` desde la re-certificación REM-INV-6 (`20260916000002`) → **permission denied** para cualquier sesión real.
- **Dónde:** `src/app/api/payments/route.ts` (bucle single ~:228) · `src/app/api/production-orders/[id]/payments/route.ts` (~:83,171).
- **Verificado en ACL:** E2E y PRODUCCIÓN idénticas (`proacl = {postgres=X,service_role=X}` — lectura only, 2026-11-26).
- **No afectado (funciona):** el camino batch `service|receipt` (`register_supplier_payment_batch` vía cliente ADMIN tras `canManageStore`) y la reversión (`POST /api/payments/[id]` vía admin).
- **Impacto:** el flujo de pagos a órdenes de trabajo desde la interfaz/API con usuarios reales está roto desde la hardening ACL; los pagos OT históricos (18/18 reconciliados) preceden al cambio.
- **Remediación propuesta (misión independiente):** alinear la vía single con el patrón del batch — cliente ADMIN después del gate `canManageStore` + actor contrastado con `auth.uid()`, manteniendo la ACL server-side sin debilitar. PIN N6 fuerza la actualización de la suite al remediar.

### F011-002 — CRÍTICO operativo: el pre-check del batch no netea contra-filas
- **Qué:** `register_supplier_payment_batch` (`20261121190000_adn009_sr_postmerge_hardening.sql:279-284` y `:462-468`) calcula `v_paid = SUM(monto)` de TODAS las filas **sin restar `direction='reversal'`**. El motor single (`20261126140000:296-306`) SÍ netea (`CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -…`). El diseño documentado del propio motor exige el neteo («una obligación con pago revertido vuelve a admitir pagos por el importe restablecido»).
- **Efecto reproducido:** tras una reversión, cualquier liquidación vía app (servicio/recepción) se rechaza con `ERR_BATCH_OVERPAY` y saldo pendiente NEGATIVO (reproducido: saldo −100 con neto real 0).
- **No corrupto:** la verdad en BD permanece correcta (el trigger `update_payment_status` netea bien; CxC muestra el saldo real) — es un BLOQUEO de pagos legítimos, no un saldo erróneo.
- **Remediación propuesta (misión independiente):** mismo CASE de neteo del motor single en ambos SUM del batch + pruebas positivas post-reversión vía app. PIN N7 fuerza la actualización al remediar.

### Estado de producción respecto a los defectos
- ACL idéntica E2E/producción (verificado read-only). El SQL del batch vigente en producción corresponde a 20261121190000 (mismo pre-check). Ambos defectos están ACTIVOS en producción para la vía app. Sin mutación de datos: solo bloqueos.

## 4. Evidencia por escenario (16/16)

| # | Escenario | Resultado |
|---|---|---|
| A | Pago parcial OT — saldo, estado, tasa 1 | **PASS** |
| B | Pago completo — paid, paid_at, sin duplicados | **PASS** |
| C | Reversión parcial — contra-fila + asientos + histórico intacto | **PASS** |
| D | Reversión total — saldo 0 y restablecido | **PASS** |
| E1 | USD tasa canónica de tienda | **PASS** |
| E2 | ERR_TASA_NO_DISPONIBLE sin efectos | **PASS** |
| E3 | CxC unrated (saldo original, balance_cup null) | **PASS** |
| F1 | Conciliación motor=mayor=app | **PASS** |
| F2 | Partida doble cuadrada + reconstruible | **PASS** |
| N1 | Reintento idempotente sin duplicados | **PASS** |
| N2 | Reversa concurrente → 1 contra-fila | **PASS** |
| N3 | DELETE prohibido | **PASS** |
| N4 | OT voided no pagable | **PASS** |
| N5 | Overpay rechazado | **PASS** |
| N6 | PIN F011-001 | **PASS** (documenta el defecto vigente) |
| N7 | PIN F011-002 | **PASS** (documenta el defecto vigente) |

## 5. Límites de la evidencia

- El PIN N6/N7 documentan comportamiento DEFECTUOSO vigente: al remediar F011-001/F011-002, los pins FALLARÁN por diseño y deberán sustituirse por las pruebas positivas de la remediación.
- No se recorrió en navegador la vista CxC (el saldo «mostrado por la aplicación» se valida por su API autoritativa, que es la misma fuente de la vista).
- El guard R-14 (período cerrado) no se ejercita con cierre fiscal real en esta suite (cobertura por contrato + forense de la misión de remediación).
