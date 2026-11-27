# R03-PARTIAL-PAYMENTS — Pagos múltiples de órdenes de trabajo: operación parcial con atomicidad por orden

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Rama:** `fix/payments-ot-partial-batch-r03-20261127`
**Fuente normativa:** decisión expresa del propietario §0.1 (misión) · Regla: FIN-013 · Riesgo: R-03 (RISK-REGISTER)

---

## 1. Decisión del propietario (§0.1 — vinculante)

> **OPERACIÓN PARCIAL. Cada orden de trabajo es independiente.** Si un pago múltiple de cinco órdenes falla en una: las cuatro válidas se procesan; la fallida no se confirma; el error no revierte las correctas; se identifica cuál falló y por qué; se puede corregir y reintentar sin duplicar. **Regla fundamental: independencia entre órdenes, atomicidad dentro de cada orden.** No se autoriza una transacción global que convierta el lote completo en una operación indivisible.

## 2. Auditoría previa (misión §3.1) — estado real antes de la remediación

| Camino | Alcance | Comportamiento |
|---|---|---|
| `POST /api/payments` (production_order\|work) | UNA OT por request; `payments[]` = pago mixto multi-moneda | **LOOP no atómico**: cada componente en una transacción separada → si el componente i falla, 0..i-1 quedan confirmados (**pago parcial dentro de una OT** — viola la decisión) |
| `POST /api/production-orders/[id]/payments` | UNA OT, una fila por request | Atómico por llamada (motor single) — intacto |
| `POST /api/payments/multi` (RPC `register_supplier_payment_multi`) | receipt\|service SOLO (ERR_ITEM_INVALID para OT) | Atómico (all-or-nothing) — no aplica a OT |
| `POST /api/accounts-payable/bulk-pay` | receipt\|service\|commission SOLO | Operación parcial por ítem (convención de referencia) — no aplica a OT |
| UI multi-OT | **No existe** flujo de selección múltiple de OT para pagar | — |

Conclusión: el defecto aplicable de R-03 era (a) la atomicidad interna del pago mixto de una OT y (b) la inexistencia de la operación parcial multi-OT que la decisión exige.

## 3. Diseño (misión §3.3/§3.4)

**Capa SQL — `register_ot_payment_batch` (migración `20261127140000`, NUEVA función, no se toca el motor single ni el batch CxP certificado):**

- Exclusiva de `production_order|work` (`ERR_REF_TYPE_INVALID`).
- Lock `FOR UPDATE` de la OT primero → pertenencia de tienda fail-closed → gate de estado `ERR_ORDER_NOT_PAYABLE` (voided).
- `validate_operation_date` (nunca futuro — Habana).
- Componentes 1..20 con la aritmética canónica CP-FIN-004 (zelle→external_transfer, riel divisa, tasas fail-closed `ERR_TASA_NO_DISPONIBLE`).
- Pre-check de saldo con el **mismo CASE de neteo de contra-filas** del motor single y del batch CxP (invariante CP-BRA-001: una sola fórmula de saldo pendiente) → `ERR_BATCH_OVERPAY`.
- **Fast-path de replay por bloque `<key>:<i>` ANTES del pre-check** (lección ADN-008/P1).
- Inserción por componente **vía `register_supplier_payment`** (el motor re-valida bajo el mismo lock): cualquier fallo → RAISE → rollback completo de la OT → **cero pagos parciales dentro de una orden**.
- ACL **service_role exclusiva** (REVOKE PUBLIC/anon/authenticated; GRANT service_role) + guards `R03-GUARD`/`R03-VERIFY` fail-closed (5/5 marcas).
- Allowlist: +1 entrada `register_ot_payment_batch` (SD sin auth-check por diseño — autorización en la ruta tras `canManageStore`, actor real en `p_paid_by`).

**Capa API — `POST /api/payments/ot-batch` (operación parcial multi-OT):**

- `withAuth` + `withSecurity` (rate limit 30/min — precedente V2.12.32) + contexto de tienda desde `profiles.active_store_id` + gate `canManageStore` **antes** de cualquier privilegio; identidad desde la sesión (el actor real viaja en `p_paid_by`; el cliente administrativo nunca llega al navegador).
- Pre-check RLS por ítem con el cliente de sesión (OT existe y pertenece a la tienda; sin fuga de información).
- **Una llamada a `register_ot_payment_batch` por orden = una transacción independiente por OT** → el fallo de una no revierte las demás.
- Bloque de idempotencia **por orden**: `otb:<clave-del-lote>:<ref_id>` → el reintento del lote reusa el bloque de las OT ya aplicadas (replay) y solo procesa las fallidas. Duplicado de `ref_id` en el payload → `400 ERR_BATCH_DUPLICATE`.
- Respuesta por ítem (convención bulk-pay, HTTP 201): `{ ref_id, order_number, success, amount_requested, amount_registered, payment_ids, replayed, error_code, message, retryable, idempotency_key }` + estado general `status: all_success | partial | all_failed` + `success_count/error_count/total`.
- Mapeo de errores por ítem: `ERR_ORDER_NOT_PAYABLE` (409-semántica), `ERR_BATCH_OVERPAY` (400), `ERR_TASA_NO_DISPONIBLE` (422), `ERR_COMBINACION_NO_SOPORTADA` (400), `ERR_ORDER_NOT_FOUND`/`ERR_ORDER_STORE_MISMATCH`, `ERR_BATCH_INVALID`, `ERR_FUTURE_OPERATION_DATE` (422), inesperados con `retryable:true`.

**Ajuste de `/api/payments` (rama OT):** el pago mixto multi-componente de UNA OT ahora se enruta por `register_ot_payment_batch` (una transacción). La fila única conserva el motor single sin cambios («no cambies las reglas generales de pago de una OT»).

## 4. Pruebas (misión §3.6)

**Batería E2E `scripts/e2e/cpbra-r03-ot-batch-battery-e2e.mjs` — 17/17 PASS vía API real (Bearer JWT) contra CostproE2E:**

| # | Caso | Resultado |
|---|---|---|
| B1 | Cinco OT válidas | all_success 201 ×5; actor real (managerA) y tienda correcta |
| B2 | Cuatro válidas + una anulada | partial 4/1; anulada → `ERR_ORDER_NOT_PAYABLE` **sin movimientos** (§3.2) |
| B3 | Válida + OT de otra tienda + válida | partial; rechazo por ítem sin fuga RLS |
| B4 | Una con saldo insuficiente + correctas | `ERR_BATCH_OVERPAY` por ítem, cero pagos en esa OT |
| B5 | Todas fallidas | all_failed (3 errores clasificados) |
| B6 | Reintento del mismo lote (misma clave) | `replayed:true`, MISMOS payment_ids, sin duplicados |
| B7 | Dos errores independientes en un lote | 2 OK + anulada 409 + overpay 400 |
| B8 | Reintento exclusivo de la OT fallida | solo esa OT se procesa; las demás sin duplicación |
| B9 | OT duplicada en el payload | 400 `ERR_BATCH_DUPLICATE` |
| B10 | Clave de idempotencia repetida tras éxito | replay del bloque |
| B11 | Dos lotes concurrentes comparten OT (presupuesto justo) | `FOR UPDATE` serializa: 1 entra / 1 `ERR_BATCH_OVERPAY`; las otras OT de ambos lotes pagadas |
| B12 | **Atomicidad por orden**: pago mixto de una OT con componente 2 en overpay (vía /api/payments) | 400 y **CERO pagos** de la OT (antes quedaba 1 pago parcial — defecto FIN-013) |
| B12b | Pago mixto válido de una OT | 2 componentes confirmados en UNA transacción |
| B13 | Conciliación post-fallos | paid_amount = Σ neta en todas las OT exitosas (150/350/600/1000/400/400) |
| B14 | Conciliación con el mayor | asientos ORDEN_TRABAJO con partida doble (débitos=créditos=1000 CUP) |
| SEC1 | clerk → 403 | gate antes de cualquier privilegio |
| SEC2 | no autenticado → 401 | — |

Historial de la batería: run 1-2 con 3 defectos de TEST (acceso a `results` en el objeto response en vez de `json`; expectativas acumuladas mal calculadas — la secuencia real suma B1+B2+B3+B4+B8+B11; partida doble con sense `debito/credito`); run 3 con rate limit 429 por >10 POST/min (mitigado: 30/min con precedente V2.12.32). **Run final 17/17.**

**Contratos estáticos (CI, sin BD):** migración 13/13 (`cpbra-r03-ot-batch-migration.test.ts` — exclusividad OT, atomicidad vía motor single, una-sola-fórmula de saldo, replay antes de overpay, ACL, guards, sin UPDATE/DELETE histórico) + ruta 8/8 (`r03-ot-batch-route.test.ts`) + pin R-25 convertido (`adn008-payments-batch.test.ts`: pago mixto OT = UNA llamada al lote por orden) + replay 221 (posición 221). **54/54 PASS.**

**Sin regresión:** FIN-011 dedicada **16/16 PASS** (pins N6/N7 intactos) · guard de higiene **PASS — net delta = 0** · ESLint 0 errores · TypeScript 0 errores (heap 6 GB — el runner monolítico OOM sin él, defecto de entorno conocido).

## 5. Reglas de negocio afectadas (CP-BRA-001)

`FIN-013` (remediada — esta misión) · `FIN-002` (fórmula única de saldo preservada: el pre-check del lote OT reutiliza el CASE del motor single) · `FIN-011` (sin cambio de comportamiento del trigger; batería sin regresión) · `FIN-003` (sin reversión de pagos OT — decisión vigente, riesgo residual).

## 6. Aplicación y despliegue

- Aislada (CostproE2E): aplicada una vez con `scripts/e2e/cpbra-r03-apply-e2e.mjs` (guard aislamiento, PRE `ya_existe=0/motor_certificado=1`, POST **5/5 marcas** — gate OT, lock, neteo, motor single, ACL service_role — body_hash `393d422397b43d9b6b81a3d3fd80da71`; NOTIFY pgrst; idempotente).
- Producción: **pendiente** — se aplicará con el protocolo gobernado §11g (script guardProtected + doble flag) tras revisión del PR, CI verde y verificación de contratos (misma mecánica que R-05/R-26).

## 7. Riesgos residuales

1. **Sin reversión de pagos OT** (`reverse_supplier_payment` sigue excluyendo OT — FIN-003): decisión vigente; los sobrepagos OT se previenen con overpay fail-closed. No se modifica sin decisión del propietario.
2. **Sin canal UI multi-OT todavía**: la operación parcial existe como canal API documentado; una vista de liquidación multi-OT puede consumirlo sin cambios de contrato.
3. El error opaco de la BD en un ítem se clasifica `ERR_RPC_UNEXPECTED` con `retryable:true` — el reintento usa la misma clave y el replay evita duplicados.
