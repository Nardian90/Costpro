# CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001

**Fecha:** 2026-11-19 · **Tienda:** ENERVIDA-VITALLCONS (5e6fe821-5465-48b1-b3f1-3aa3182edc38) · **Módulo:** Inicio → OPERACIÓN → Estados Financieros
**Mandato:** revisión y corrección integral de clasificación financiera (efectivo/bancos), cuentas de caja por moneda y equilibrio del Estado de Situación (desequilibrio mostrado: −2,425,986.00 CUP).

---

## A. Resumen ejecutivo

| Hallazgo | Causa raíz demostrada | Corrección aplicada |
|---|---|---|
| **Problema A** — 8 ventas CUP cobradas en efectivo aparecían en «Efectivo en caja (USD)» (299,860 CUP) | El POS registró el **nominal USD equivalente** del cobro (componente `cash/USD` = total CUP ÷ tasa del día); el motor clasificó por el registro. El mapeo del carrito está CORRECTO: Efectivo→`cash`, Transf.→`transfer`, Transf. Exterior→`zelle` (demostrado en `POSCartItem.tsx`); la MONEDA del registro no representaba el billete entregado | Escritor canónico NUEVO `fin_reclassify_sale_payment_method`-complementario: `fin_reclassify_sale_payment_currency` (migración 20261119150000) + rectificaciones R1–R8 |
| 2 ventas del registro de misión 16-10 con cobro real y **sin reconocimiento contable** (28,000 CUP de caja CUP no contabilizados) | Los asientos nunca se publicaron (`fin_post_document` no llegó a ejecutarse para esas ventas) | Reconocimiento vía `fin_post_document` (P1, P2) con el motor LIVE |
| **Problema B** — «Desequilibrio del Estado de Situación: −2,425,986.00 CUP» | `fin_get_dashboard` computaba `A(d−c) − (P+Pat+I)(c−d)` **omitiendo la clase gasto** → mostraba −(gastos netos). El libro está PERFECTO: Σ débitos 480,745,318.72 = Σ créditos 480,745,318.72 → identidad real 0.00 (verificado LIVE) | Fórmula v2 con la identidad pura de partida doble `Σ débitos − Σ créditos` (misma migración). Sin ajustes contables: el cero sale de calcular la ecuación completa sobre los mismos movimientos |
| Lista «Dinero en Banco» (20 documentos) | **18/19 reconstruidas CORRECTAS** (transferencias CUP y exteriores zelle genuinas; mixtas con caja CUP y banco bien partidas) + pareja de rectificación e2614f36 con neto bancario 0 | Sin cambios (verificación individual documentada) |
| RECT-015-A/B/D, FLUJO_CAJA IE-000001/000002 | Reclasificaciones M-015 §C genuinas con confirmación del propietario (cobros físicos USD y entregas de efectivo al banco) | Conservadas sin cambio |

**Resultado tras rectificar:** caja USD conserva únicamente los movimientos genuinos (RECT-FIN-E2614F36 débito 125,550 = 135 USD; egreso cd07fc7d crédito 293,600 = 367 USD; RECT-015-A/B como reclasificaciones identificadas). Caja CUP +299,860; bancos intacto; ingresos, COGS e inventario intactos.

## B. Regla vinculante de clasificación (demostración §2 del mandato)

Inspección de `src/components/views/terminal/views/pos/POSCartItem.tsx`:

- Opciones de forma de pago por fila de ítem: **Efectivo → `cash`**, **📱 Transf. → `transfer`**, **💳 Transf. Exterior → `zelle`** (comentario del código: «Zelle pasa a Transf. Exterior; el valor de BD sigue siendo 'zelle'»).
- Monedas permitidas: cash/transfer → CUP, USD, EUR, MLC; Transf. Exterior → **solo USD/EUR**.
- `create_sale_v2` persiste UNA fila de `payment_transactions` POR COMPONENTE con su moneda real (patrón «pay-<método>-<moneda>-<tx>»).
- Regla VENTA v2 activa: `cob_cash_cup`→ACT_EFECTIVO_CUP · `cob_cash_usd_cup`→ACT_EFECTIVO_USD · `cob_transfer_*`→ACT_BANCOS · `cob_zelle_usd_cup`→ACT_BANCOS · ingreso único `ING_VENTAS` · COGS · diferencia de cobro.

Conclusión: el motor obedece la regla vinculante («la moneda no determina el medio»); el defecto era el dato registrado (nominal USD equivalente en cobros CUP), no el mapeo.

## C. Rectificaciones históricas (Fase 7, escritor canónico, idempotente)

| ID | Venta | Cambio | Importe contable | Tasa documental (evidencia) |
|---|---|---|---:|---:|
| R1 | 9d1ccef8 (11-07) | cash/USD → cash/CUP | 6,510 | 930 (registrada en el pago) |
| R2 | 97263a9c (11-16) | cash/USD → cash/CUP | 9,200 | 920 |
| R3 | abab9e20 (11-17) | cash/USD → cash/CUP | 16,200 | 900 |
| R4 | e825ba93 (10-27) | cash/USD → cash/CUP | 60,840 | 845 |
| R5 | 8757444f (10-26) | cash/USD → cash/CUP | 32,000 | 800 |
| R6 | 6501f8da (11-07) | cash/USD → cash/CUP | 930 | 930 |
| R7 | 7d9ad144 (11-18) | componente cash/USD → CUP (el componente CUP 2,790 no se toca) | 6,510 | 930 |
| R8 | 28e94349 (10-19) | caso «asiento obsoleto» (motor M-015, reparto por ítems a 810) → caja CUP | 167,670 | 810 (reconstruida del propio débito: 167,670/207) |
| P1 | 8ab7becf (16-10) | reconocimiento ausente (cobro 16,000; total 15,800; sobrepago 200) | 16,000 | n/a (venta CUP) |
| P2 | 1df5d727 (16-10) | reconocimiento ausente (catálogo 0; recibido 12,000) | 12,000 | n/a (venta CUP) |

SQL de ejecución: `audit-evidence/cp-fin-enervida-cash-bank-001/RECTIFICACIONES-A-EJECUTAR.sql` (service_role/postgres; idempotencia `YA_APLICADO`/NULL en re-ejecución). No se ejecuta dos veces RECT-FIN-E2614F36.

## D. Conciliación de la población completa (§5)

192 ventas desde 2026-09-25 (extract read-only del 2026-11-19; matriz completa en `MATRIZ-CONCILIACION.xlsx`, hoja «Ventas»):

- **CORRECTO_EFECTIVO 116 · CORRECTO_TRANSFERENCIA 47 · CORRECTO_MIXTA 11** — débitos por cuenta == Σ pagos esperados, reconocimiento único (Σ ING_VENTAS por ventas = 36,134,999.99 = total del libro), 0 ventas con >1 asiento.
- **RECTIFICADA_FIN001 1** (e2614f36: bancos neto 0 por la pareja compensatoria cf781c93; caja USD débito 125,550 con original 135 USD).
- **INCORRECTO_MONEDA_CAJA_USD 8** → rectificaciones R1–R8 (299,860 CUP mueve caja USD → caja CUP).
- **COBRO_SIN_RECONOCIMIENTO 2** → P1/P2 (+28,000 caja CUP; +27,800 resultado vía regla v2; COGS 1.88).
- **ANULADA 7** (6 sin asiento; 3f214b0c con reconocimiento revertido + anulación posted — estado correcto).
- Asientos desequilibrados: **0 de 1,056**. Pagos duplicados: 0 (idempotencia PT-verificada). Sin pagos direction in/refund/out anómalos: los 2 `out` son los FLUJO_CAJA IE-000001/000002.

## E. Estado de Situación (§7)

- Ecuación reconstruida desde movimientos: Activo 36,369,905.10 = Pasivo 2,961,795.90 + Patrimonio (apertura 0) + Resultado (I 35,834,094.99 − G 2,425,985.79 = 33,408,109.20) → **0.00**.
- La fórmula v1 del dashboard (`A − (P+Pat+I)` sin gasto) devolvía exactamente **−2,425,985.79 → redondeado −2,425,986** = −(gastos netos): coincidencia exacta con el valor reportado por el propietario (evidencia: `cpfin002-fase1c-partes.sql`).
- La pestaña Estado de Situación (`fin_get_balance_sheet`) YA calculaba la ecuación completa (diferencia 0.00) — el defecto era exclusivo del Dashboard.
- **Puente (§7.4):** desequilibrio mostrado −2,425,986.00 = −(gastos netos 2,425,985.79 redondeado); corrección = fórmula v2; diferencia residual explicada tras rectificaciones = 0.00 en la ecuación; **residual documentado** en la cuenta caja USD (−41,700 CUP = −52.13 USD @800): el egreso cd07fc7d (367 USD «entrega para ingresar al banco») drenó USD cuyo ingreso físico a la caja no quedó registrado en ESA cuenta (las colecciones físicas USD de octubre están registradas como CUP — el defecto mismo que RECT-015-A/B corrigieron para 2 casos confirmados). No se inventan valores (mandato §7.4/§15).

## F. Implementación

- Migración **20261119150000_cp_fin002_cash_bank_reclassification.sql** (NUEVA; las aplicadas son inmutables): `fin_get_dashboard` v2 (identidad pura) + `fin_reclassify_sale_payment_currency` (genérico, fail-closed, idempotente por venta+método+moneda, traza completa, ACL service_role) + guardas de cuerpo.
- Aplicada y verificada en la **BD aislada CostproE2E** (guard OK, funciones OK).
- **E2E 21/21 PASS + net delta 0** (`e2e/enervida-cash-bank-reconciliation.spec.ts`, 25 escenarios del mandato §10 + caso principal Cable Solar 30 m @4.50 = 135 USD @930 → caja USD 125,550, bancos sin la venta, «Ver documento» OK).
- Gates: destructive OK · BOLA 5/5 · check-writers OK · SQL checks OK · contrato estático OK · replay MATCH (183) · vitest OK.
- Manifiesto de escritores y replay actualizados (183 migraciones).

## G. Despliegue y cierre

1. Merge del PR → aplicación de la migración en producción (canónigo, Management API, libro de migraciones).
2. Ejecución de RECTIFICACIONES-A-EJECUTAR.sql en producción + verificación de saldos y drilldown.
3. Verificación del Dashboard (desequilibrio 0.00) y de la vista caja USD.
4. Vercel Production sobre el merge + health 200.
5. Worklog y expediente actualizados en la misma sesión.

## H. Limitaciones documentadas

- Saldo caja USD post-rectificación negativo (−41,700 CUP) por las colecciones USD físicas de octubre registradas como CUP: solo 2 casos fueron confirmados por el propietario (RECT-015-A/B); el resto queda como incidencia de datos documentada, sin reconstrucción estimada.
- `invoice_number` NULL en el 100% de las ventas desde octubre (heredado de CP-FIN-001): la navegación usa el ID interno real.
- Sin riel de venta EUR/MLC en el escritor canónico de ventas (documentado; el plan contable real no define cajas EUR/MLC).
