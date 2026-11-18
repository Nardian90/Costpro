# CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 — Expediente final
## Corrección integral de importes, monedas, medios de cobro, contabilidad y trazabilidad documental en Estados Financieros

**Fecha de cierre:** 2026-11-19 · **Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`, tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`)
**PR principal:** #1652 (merge `05f4a5466683071f80e79f0a926a61f4cefb96c4`, 2026-11-18 20:03 UTC) · **PR complementario:** fase 3 (surface 211 + baselines retiradas + B.1)
**Autorización:** propietario (§16 de la misión: «finalizar la misión sin otra ronda de confirmaciones»).

---

## A. Informe ejecutivo

**Estado inicial (confirmado LIVE 2026-11-18/19, solo lectura).**
El drilldown de Estados Financieros (`fin_get_category_detail` → `CategoryDetailPanel.tsx`) mostraba el importe CONTABLE en CUP etiquetado como importe ORIGINAL en la moneda del documento («125,550.00 USD» cuando 125,550 es el equivalente CUP de 135.00 USD); la columna Documento mostraba «—» para el 100% de las ventas (233/233 sin `invoice_number` desde octubre); la descripción era el genérico «Venta » y la columna Moneda origen «No identificada» para documentos CUP. La causa raíz era DOBLE: (1) presentación — `formatCurrency(m.amount)` etiquetado con `currency_origin`; (2) datos — `fin_movements.amount_origin` (columna del motor 20261113) JAMÁS fue escrita: 538 movimientos con `currency_origin='USD'` sin original, todos de ENERVIDA. Adicionalmente se confirmó un defecto preexistente en `create_sale_v2`: el bloque legacy de transferencia insertaba una SEGUNDA fila de pago cuando el checkout usaba `payment_components` (invariante PT011; demostrado por ablación y SQL directo en la sesión del 18-11).

**Correcciones aplicadas (causa raíz, no cosméticas).**
1. Motor (migración `20261118130000`, aplicada a producción 2026-11-18 20:05 UTC): `fin_compute_metrics` expone aditivamente `total_cup_origin` (nominal del documento desde `transaction_items`), `tasa_documento` (la REGISTRADA) y `cob_<metodo>_<moneda>_cup_origin` (nominal por método desde `payment_transactions`); `fin_apply_templates`/`fin_post_document` escriben `amount_origin` (NULL cuando no hay dato: jamás se inventa); `fin_post_document_annulment` copia el original al compensatorio; el drilldown expone original+moneda; catálogo de métricas; guard de `create_sale_v2` (`IF v_transfer_amt > 0 AND NOT v_components_ok`).
2. Presentación (PR #1652): columna «Importe contable (CUP)» con código de moneda explícito; «Importe original» con el nominal registrado o «No registrado»; Documento con ID REAL + acción «Ver documento» (VENTA → Historial de Ventas vía `saleDetailNavContext`, consumo único, RLS de la vista destino); «Documento de origen no disponible» explícito cuando no existe; medio de pago según la CUENTA (no la moneda); ordenamiento por importe contable; descripción con fallback al ID real.
3. Motor FLUJO_CAJA (migración `20261119120000`): `importe_cup_origin` + `tasa_documento` para documentos de caja en moneda extranjera (nominal registrado del documento).
4. Rectificador canónico (migración `20261119120000` + parche B.1 `20261119130000`): `fin_rectify_sale_payment_method` — escritor idempotente, fail-closed, ACL solo service_role (patrón T12).
5. Backfill autorizado (migración `20261119120000`): 233 movimientos completados con evidencia exacta (ver §E).
6. Badge «En desarrollo»: añadido el 18-11 por instrucción previa y RETIRADO el 19-11 por orden del propietario (§5 de la misión) — Estados Financieros se presenta como funcionalidad disponible; tests de regresión inversos.

**Estado final.** Producción desplegada (deployment success sobre el SHA del merge), health 200, `fin_posting_errors` = 0, la venta e2614f36 muestra Efectivo/135 USD en Historial de Ventas y 125,550 CUP + 135 USD + Efectivo en Caja en Estados Financieros; los KPIs de efectivo/banco provienen de las categorías correctas.

**Limitaciones documentadas (§12).** 305 movimientos históricos quedan con `amount_origin` NULL por diseño/ausencia de fuente primaria exacta (ver §E): se muestran «No registrado». El rectificador soporta cash/transfer/zelle en CUP/USD (EUR/MLC en efectivo no tiene categoría contable: fail-closed). La etiqueta de `exchange_rate` de movimientos históricos permanece 1 (convención del motor).

## B. Conciliación monetaria — caso prioritario (venta e2614f36, 2026-11-07)

| Concepto | Valor verificado |
|---|---|
| Documento | `e2614f36-4c86-4317-b80f-6f2fb5d34648` (completed, 01:29 p. m. Havana) |
| Ítems | Cable Solar Rojo 4mm ×15 @ 4.50 USD + Cable Solar Negro 4mm ×15 @ 4.50 USD |
| **Importe original** | **135.00 USD** (Σ qty×price_at_sale, price_currency=USD) |
| **Moneda original** | **USD** · **Tasa registrada: 930.0000** (venta y pago; sin reconstrucción) |
| **Importe contable** | **125,550.00 CUP** (total_amount = Σ amount_cup del pago, EXACTO) |
| Asiento original | `2d109ccf` (reconocimiento, posted 2026-11-14 02:15 UTC): ACT_BANCOS D 125,550 · ING_VENTAS C 125,550 · GAS_COSTO_VENTAS D 25,200 · ACT_INVENTARIO C 25,200 |
| Pago | `e1eb5e60`: **método corregido zelle→cash**, USD 135.00, amount_cup 125,550, tasa 930 (importe y tasa INTACTOS) |

Tras el backfill, las líneas ING_VENTAS y ACT_BANCOS del asiento original llevan `amount_origin=135.00 USD`; las líneas de costo permanecen NULL (semántica del motor).

## C. Rectificación de la venta e2614f36 (§6 — autorizada y EJECUTADA)

- **Hecho económico confirmado por el propietario:** se cobraron **135.00 USD EN EFECTIVO** (no Zelle, no transferencia).
- **Ejecución:** `fin_rectify_sale_payment_method('e2614f36…','zelle','cash', a1111111, '<causa>')` vía Management API (postgres), 2026-11-18 20:20:07 UTC.
- **Asiento de rectificación:** `cf781c93-5be4-496f-8297-f018ae96d77a` — `RECTIFICACION_FIN` / `ajuste_manual` / `RECT-FIN-E2614F36` / economic_date 2026-11-07 / posted:
  - ACT_BANCOS **crédito 125,550.00 CUP** (amount_origin 135.00 USD) — «Contra-partida: retiro del cobro clasificado como zelle (asiento 2d109ccf)»
  - ACT_EFECTIVO_USD **débito 125,550.00 CUP** (amount_origin 135.00 USD) — «Cobro real cash … reclasificado a ACT_EFECTIVO_USD»
  - `traza` con `ref_entry` 2d109ccf, `ref_mov` f89b5424, causa y misión.
- **Conservado íntegro:** ING_VENTAS (una sola línea), COGS 25,200, inventario, cantidad vendida, 135 USD, tasa 930, 125,550 CUP. El asiento original NO se editó (histórico intacto).
- **Datos de la operación corregidos** (Historial de Ventas): `transactions.payment_method`='cash', `cash_amount`=125,550, `zelle_amount`=0; `payment_transactions.payment_method`='cash' (nota «Rectificado zelle → cash»; idempotency_key y tasa intactos); ítems: `cash_paid`=67.50, `cash_currency`='USD', `zelle_paid`=0 (parche B.1: la moneda de la asignación movida prevalece).
- **Efecto en saldos (ENERVIDA):** ACT_BANCOS 25,974,520.01 → **25,848,970.01** (−125,550); ACT_EFECTIVO_USD 132,610.00 → **258,160.00** (+125,550). Activos totales sin cambio (reclasificación entre cuentas). Neto de esta venta: bancos 0,00 · caja USD +125,550.
- **Idempotencia:** segunda ejecución → `YA_APLICADO`; exactamente 1 asiento de rectificación.
- **Evidencia:** `scripts/out/cpfin001-rectify-{PRE,RESULT,POST}.json` (réplica en `audit-evidence/`).

## D. Casos del 14 y 17 de noviembre (§11 — conciliados, SIN cambios)

**Caso B — 14-11, venta `83b8e88e`:** CUP 10,000, pago `231d6911` método **transfer** CUP → asiento `3b704c9a` ACT_BANCOS débito 10,000. **Clasificación CORRECTA según los datos registrados** (transferencia bancaria real). Tras el backfill su línea ING_VENTAS lleva original NULL (documento CUP: sin conversión, la UI muestra moneda CUP sin duplicación). No se modificó.

**Caso C — 17-11, venta mixta `867d9017`:** total 7,200 CUP = efectivo 4,800 (pago `829359f6` → ACT_EFECTIVO_CUP débito 4,800) + transferencia 2,400 (pago `ec89dfe0` → ACT_BANCOS débito 2,400) + ING_VENTAS crédito 7,200 + COGS 1,603. La fila «2,400 Reconocimiento» que motivó la consulta es la parte de transferencia de esta venta mixta: **componentes suman el total exacto y están en cuentas diferentes — clasificación CORRECTA**. Un único reconocimiento de ingresos. No se modificó.

**Regla de conciliación cumplida (ambos casos):** cada pago vinculado a su documento, cada componente clasificado por su forma de pago real, reconocimiento único, moneda original distinta de la contable cuando aplica, sin duplicados.

## E. Históricos USD — universo 538 (§12 — auditado y conciliado)

Universo: 538 movimientos `currency_origin='USD'` sin `amount_origin`, **todos de ENERVIDA** (verificado por tienda). Dry-run previo con desglose exacto (`scripts/out/cpfin001-backfill-dryrun.json` + `cpfin001-dryrun2.json`); reglas = réplica EXACTA de la semántica del motor nuevo; aplicación idempotente (solo `amount_origin`, importes contables intactos).

| Regla | Conjunto | Resultado |
|---|---|---|
| R1 — ING_VENTAS: nominal del documento (Σ qty×price_at_sale, ítems en moneda del doc) | 130 | **101 completados** (Σ 13,519.50 USD) · 29 NULL (ítems solo en CUP: no existe nominal USD; reconstruir por división de tasa está PROHIBIDO §12) |
| R2 — ACT_BANCOS débito: nominal del grupo de pagos (método, moneda≠CUP) con Σamount_cup == amount_cup del movimiento (match ÚNICO) | 131 | **130 completados** (Σ 15,333.63 USD) · 1 NULL (transfer CUP 6,500 de d461485c: cobro en CUP, el motor no escribe original para cobs CUP) |
| R3 — FLUJO_CAJA: nominal registrado del documento de caja | 2 | **2 completados** (IE-000002-2026, 367.00 USD × 800 = 293,600 exacto) |
| — COGS/inventario (GAS_COSTO_VENTAS + ACT_INVENTARIO) | 260 | NULL por diseño (el motor no escribe original para líneas de costo) |
| — Cobros CUP en ventas USD (ACT_EFECTIVO_CUP) | 15 | NULL por semántica (cob_cash_cup no tiene contraparte _origin) |
| **Total** | **538** | **233 completados + 305 NULL documentados** |

Estado final verificado en producción: 235 movimientos USD CON original (233 del backfill + 2 del asiento de rectificación RECT-FIN) y 305 NULL. La UI muestra «No registrado» para los NULL (limitación documentada, sin invención).

## F. Implementación

| Elemento | Valor |
|---|---|
| PR principal | #1652 — 30 archivos · merge `05f4a5466683071f80e79f0a926a61f4cefb96c4` · CI 9/9 success en `f4657af70` |
| Migraciones a producción (canal Management API, lote único, libro registrado) | `20261118130000` (sha 074ef9dd03972cf4…, 2026-11-18 20:05 UTC) · `20261119120000` (sha e6056a6f5c15914d…, 20:07 UTC) · `20261119130000` B.1 (sha 2e9d1c86614df0c5…, 20:20 UTC) |
| Libro de migraciones | 3 entradas nuevas `applied` (evidencia JSON en cada una) |
| Contract-surface | Regenerado LIVE dos veces: 211 funciones (sha `e8f1abb6cdd725ba…` final, incluye `fin_rectify_sale_payment_method`) |
| Baselines temporales | Las 3 de la misión (`create_sale_v2/34`, `fin_post_document/5`, `fin_post_document_annulment/2`) **RETIRADAS** de `ci-gate-allowlist.json` — el contrato estático pasa sin ellas (surface = stream) |
| Manifiesto replay | 180 → **182** migraciones (A, B, B.1); `--check` MATCH |
| Normalización | Migraciones A y B sin control transaccional explícito (convención del canal de producción; semántica idéntica) |
| Rectificación | `RECT-FIN-E2614F36` (`cf781c93`) — ver §C |

## G. Cierre

| Control | Resultado |
|---|---|
| CI del PR #1652 | 9/9 success (CI · Test Coverage · E2E Aislado · Security CI Gate · SQL Security Gate · TypeCheck+Lint+Unit+Build · SQL Static/DB · Security Audit · Allowlist) |
| E2E aislada (CostproE2E) | **20/20 PASS** (batería §10 completa + caso de aceptación 7-11 + E19 rectificación/idempotencia + E20 flujo de caja USD) · guardrail **net delta = 0** · hygiene PASS |
| Vitest | 15/15 (panel + navegación) · replay 7/7 (182) |
| Gates locales | contract-static OK (2 warnings MEDIUM/LOW preexistentes) · SQL checks OK · BOLA OK · check-writers OK (script de aplicación aislada declarado) · replay MATCH |
| Ledger | 3 migraciones registradas (`management_api`, `applied`) |
| Deployment | GitHub Deployment **success** sobre `05f4a54666` (Production, 2026-11-18 20:14 UTC) |
| Health producción | `{"status":"ok"}` HTTP 200 · drilldown LIVE verificado con `amount_origin` |
| Worklog | Actualizado por fases (protocolo 11a) |

**Declaración:** CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 — COMPLETADA Y DESPLEGADA.
