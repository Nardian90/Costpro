# FIN011-E2E-DESIGN — Diseño de la suite E2E dedicada FIN-011

**Misión:** CP-BRA-INV005-FIN011-CLOSURE-001 (Línea B) · **Fecha:** 2026-11-26
**Regla:** FIN-011 (CRÍTICA — «El saldo CxC mostrado = realidad de pagos del mayor»)
**Archivo:** `e2e/fin011-financial-cycle.spec.ts` (16 tests) · **Workflow:** `.github/workflows/e2e-isolated.yml` (smoke set CP-INFRA-011 ampliado)

---

## 1. Brecha de evidencia que cierra (CERTIFICATION-MATRIX §3 de la misión anterior)

| Evidencia exigida para FIN-011 | Estado anterior | Estado con esta suite |
|---|---|---|
| E2E aislado dedicado del ciclo pagos/reversiones/monedas/tasas/conciliación | **AUSENTE** (la suite de humo no cubría el ciclo) | **EXISTS** — `fin011-financial-cycle` 16/16 PASS en CostproE2E, integrada al workflow manual+PR |
| Conciliación cero diferencias (motor vs mayor vs app) | solo forense read-only | **EXISTS** — escenario F1 en vivo con fixtures del propio run |

## 2. Arquitectura de la prueba

- **Modo:** Playwright, proyecto `core`, SOLO modo aislado (`readRunContext()`; skip si no hay run provisionado — `E2E_ISOLATION=1`).
- **Vía real de la aplicación:** las rutas API se invocan con `Authorization: Bearer <JWT>` del usuario admin del run (`getServerSession` acepta Bearer; los gates server-side `canManageStore` se ejercitan de verdad).
- **Barrera autoritativa del motor:** los pagos a la familia `production_order|work` se ejercitan por el RPC `register_supplier_payment` (service_role) — la vía app para OT está bloqueada por el DEFECTO F011-001 (ver `FIN011-E2E-RESULTS.md`). El ciclo de `service` se ejercita por la ruta app (batch admin) y su reversión por `POST /api/payments/[id]` (cliente admin tras gate).
- **Fixtures efímeros** namespace `FIN011-<runId>` (limpieza verificada en `afterAll` + guard de higiene con net delta = 0):
  - OT A: CUP 1.000 draft (A, B, F)
  - OT E: CUP 50.000 draft (E1 — pagos USD; el doc es CUP/tasa 1)
  - OT V: CUP 100 voided (N4)
  - OT B: **presupuesto USD** 100.000 en pilotStoreB (E2/E3 — sin tasa)
  - Servicio: CUP 500 activo con proveedor de prueba (C, D, F — familia reversible `receipt|service`)
  - Tasa USD canónica de pilotStoreA = 420 (backup/restauración si pre-existía)
  - Cambio temporal de `active_store_id` del admin (backup/restauración) para las rutas que resuelven tienda por sesión (CxC, pagos por tienda B)

## 3. Matriz de escenarios (misión §3.2) y negativos (§3.3)

| # | Escenario | Aserciones clave |
|---|---|---|
| A | Pago parcial OT (400/1000 CUP) | `paid_amount=400`; `payment_status='partial'`; 1 fila `direction='in'`; `amount_cup=amount` (CUP tasa 1); actor = admin del run |
| B | Pago completo (+600) | `paid_amount=1000`; `payment_status='paid'`; `paid_at` no nulo; 2 filas `in` exactas; Σ amount_cup = 1000 |
| C | Reversión parcial (servicio 300) | contra-fila EXACTA (mismo importe/moneda, `reverses_payment_id`); saldo neteado 0 → `unpaid`; fila original NUNCA UPDATE (importe/moneda/fecha/actor idénticos); asiento compensatorio: `fin_entries` event `anulacion` con `reversal_of` + `fin_movements` con sentidos invertidos |
| D | Reversión total (servicio 500) | saldo 0; reversa de contra-fila rechazada; saldo restablecido ADMITE nuevo pago (100 → partial) |
| E1 | USD con tasa canónica | `exchange_rate = tasa de tienda` (420, no inventada); `amount_cup = 100×420`; moneda original preservada; OT acumula en CUP del doc |
| E2 | Sin tasa de tienda | `ERR_TASA_NO_DISPONIBLE`; CERO filas en la obligación (rechazo sin efectos) |
| E3 | CxC sin tasa (presupuesto USD) | `balance` en moneda original; `balance_cup = null`; bloque `unrated.count ≥ 1` y `total_by_currency.USD ≥ 100000` — **jamás ×450 ni conversión inventada** |
| F1 | Conciliación integral | `paid_amount` (trigger) = Σ in − Σ reversal (mayor) = `balance` mostrado por `/api/accounts-receivable`; `tab='paid'` coherente; servicio concilia igual |
| F2 | Partida doble | cada `fin_entry` del ciclo con débito = crédito; cada `anulacion` referencia su `pago` (relación pagos↔reversiones reconstruible) |
| N1 | Reintento idempotente | misma idempotency_key → MISMO id devuelto, sin fila nueva, saldo intacto |
| N2 | Reversión concurrente | 2 reversiones paralelas (advisory lock `revpay:<id>`) → EXACTAMENTE 1 contra-fila |
| N3 | DELETE de pago | jamás 200 (la rectificación es la reversión) |
| N4 | OT voided | `ERR_ORDER_NOT_PAYABLE` (gate R-01) |
| N5 | Overpay | «excede el saldo» con OT ya pagada |
| N6 | PIN defecto F011-001 | vía app OT → permission denied (documentado hasta remediación) |
| N7 | PIN defecto F011-002 | batch tras reversión → `ERR_BATCH_OVERPAY` con saldo negativo (documentado hasta remediación) |

## 4. Alcance y límites del diseño (honestidad)

- El motor de partida doble cubre `RECEPCION|SERVICIO_RECIBIDO|VENTA|NOMINA` (verificado en BD: `select distinct document_type from fin_entries`); las OT NO generan asientos fin — su registro financiero es la fila de `payment_transactions` + columnas del trigger. Las aserciones de asientos se limitan a `SERVICIO_RECIBIDO`.
- Los pagos del ciclo C/D/N2 usan la vía batch de la app (funcional) para C y la vía motor para D/N2 (bloqueada por F011-002 tras reversiones); el PIN N7 documenta el bloqueo.
- La reversión vía app usa el cliente admin (patrón existente) — se ejercita con sesión real.
- No se cubren en esta suite: cierre fiscal real (el guard R-14 tiene pruebas de contrato y la excepción auditada `PAYMENT_REVERSED_CLOSED_PERIOD` fue verificada en la misión de remediación), ni CxP display (`/api/accounts-payable`) — FIN-011 es CxC.
