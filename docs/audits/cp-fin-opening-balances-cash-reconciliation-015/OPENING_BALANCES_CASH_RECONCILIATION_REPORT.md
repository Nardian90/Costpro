# CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · INFORME MAESTRO (A–H)

**Misión**: reconciliación de saldos iniciales (apertura) y caja USD de ENERVIDA-VITALLCONS.
**Fecha de reanudación**: 2026-11-18 (misión iniciada 2026-11-17, cortada por agotamiento de contexto y reanudada bajo protocolo de resiliencia 11a/11f).
**Alcance**: (A) el aviso «Estado incompleto: no existen saldos iniciales (apertura)» sin ruta de configuración; (B) «Efectivo en caja (USD)» = −184.120,00 CUP al 2026-11-17.

## A. Causa raíz confirmada (dos problemas independientes)

**Problema A — apertura ausente.** `fin_opening_balances` está VACÍA para ENERVIDA (línea base m106d S5: 0 filas) y el CHECK histórico exigía `amount > 0`, por lo que la tabla no podía representar una apertura en cero. La evidencia de la extracción read-only (u14, sesión 015) demuestra que la tienda arrancó el 01-07-2026 **sin saldos preexistentes**: 0 ventas, 0 pagos, 0 flujo de caja y 0 recepciones antes del 01-07 (la primera actividad es la recepción FAC-VITALLCONS-001 y la primera venta el 16-07). La apertura correcta es, por tanto, la **declaración documentada de apertura en cero** — nunca inventar importes para cuadrar. El aviso de la UI, además, no ofrecía ruta de navegación hacia la configuración.

**Problema B — caja USD negativa.** El saldo −184.120,00 CUP NO se corrige anulando el egreso IE-000002-2026 (367 USD entregados a Belkis «para ingresar al banco»): es una operación real, confirmada y trazada. La reconstrucción del libro físico de caja demuestra que el cajón USD recibió exactamente esos 367 USD: 150 (venta 68e7464d, 17-10) + 207 (venta 28e94349, 19-10) + 10 (venta 23ccd04f, 23-10) = 367 = barrido completo del 23-10. El motor contable no lo vio porque: (1) en 68e7464d y 23ccd04f el cobro a nivel de venta quedó clasificado CUP (el modelo físico de caja de ítems/settlement no llegaba al motor); (2) 28e94349 no llegó a contabilizarse (cobros 169.670 ≠ total 177.770 y el motor no tenía línea de diferencia de cobro). Adicionalmente, los egresos `entrega_efectivo` (CUP y USD, 8.729.279,98 en total) se contabilizaron como GASTO (GAS_OTROS_OPER) cuando son entrega del efectivo acumulado para depósito bancario — un activo pendiente de conciliar, no un gasto.

## B. Cambios de motor y reglas (migración 20261118120000)

1. `fin_compute_metrics` (VENTA): añade el **modelo físico de caja** (settlement explícito con precedencia, luego carve de ítems — misma fuente que `get_cash_currency_summary`) SOLO cuando la venta no tiene ningún pago USD a nivel de venta; añade métricas `cob_total_cup`, `diferencia_cobro_debe_cup` y `diferencia_cobro_haber_cup`.
2. `fin_rule_versions`: **VENTA v2** (líneas de diferencia de cobro en ING_DESCUENTOS, ids v-diff-d/v-diff-c) y **FLUJO_CAJA v2** (`entrega_efectivo` → ACT_OTROS_CORR como activo; los demás egresos conservan GAS_OTROS_OPER). v1 → inactive. La migración es **idempotente** (desactivación filtrada por `version < 2` e inserción con `WHERE NOT EXISTS` — el índice `fin_rule_versions_scope_version_key` no dispara `ON CONFLICT` con `store_id NULL`).
3. `fin_apply_opening_balance`: admite la **declaración de apertura en cero** (`amount=0` → asiento `event='apertura'` SIN movimientos, exige notas justificativas, audita `FIN_OPENING_APPLIED_ZERO`).
4. `fin_opening_balances`: CHECK `amount >= 0` (el cero solo como declaración documentada) + trigger `fin_opening_guard_applied` de inmutabilidad del saldo ya contabilizado (`ERR_OPENING_APPLIED_IMMUTABLE`).

## C. Rectificaciones contables (partida doble equilibrada)

| Rect | Contenido | Débito | Crédito |
|---|---|---|---|
| RECT-015-A | Reclasificación 68e7464d: cobro físico 150 USD @805 → caja USD | ACT_EFECTIVO_USD 120.750,00 | ACT_EFECTIVO_CUP 120.750,00 |
| RECT-015-B | Reclasificación 23ccd04f: cobro físico 10 USD @560 | ACT_EFECTIVO_USD 5.600,00 | ACT_EFECTIVO_CUP 5.600,00 |
| RECT-015-C | Contabilización 28e94349 vía regla VENTA v2 | ACT_EFECTIVO_USD 167.670,00 + ACT_EFECTIVO_CUP 2.000,00 + ING_DESCUENTOS 8.100,00 + GAS_COSTO_VENTAS 2,30 | ING_VENTAS 177.770,00 + ACT_INVENTARIO 2,30 |
| RECT-015-D | Entregas de efectivo IE-000001/0002-2026: gasto → activo | ACT_OTROS_CORR 8.729.279,98 | GAS_OTROS_OPER 8.729.279,98 |
| Apertura | PAT_CAPITAL amount=0 (declaración en cero, sin movimientos) | — | — |

Cada rectificación equilibra D=C al centavo. El mecanismo de producción es el gobernado de la misión (script E2E → script de producción con guardas CP-INFRA-019/020), **no** la migración, que no altera datos.

## D. Balance resultante (ENERVIDA, tras rectificaciones)

ACT_EFECTIVO_CUP 902.020,00 · **ACT_EFECTIVO_USD 109.900,00 (130 USD @845 — nunca negativo; mínimo de la ventana: 420,00 post-entrega)** · ACT_BANCOS 25.972.120,01 · ACT_INVENTARIO 601.525,51 · ACT_OTROS_CORR 8.729.279,98 · ING_VENTAS 36.020.899,99 · ING_DESCUENTOS −8.100,00 · GAS_COSTO_VENTAS 1.747.943,18 · **GAS_OTROS_OPER 0,00**. Ecuación contable: activos 36.314.845,50 = pasivos + patrimonio 36.314.845,50 (diferencia 0,00). Resultado del ejercicio Δ +8.898.947,68.

## E. Apertura (declaración en cero)

Tienda ENERVIDA-VITALLCONS (5e6fe821-5465-48b1-b3f1-3aa3182edc38), `as_of_date` 2026-06-30 (día anterior al primer documento, 01-07-2026). Declaración `PAT_CAPITAL amount=0` con notas de verificación → asiento de apertura sin movimientos; `sin_apertura=false` y `apertura_tardia=false` en la completitud del balance. En E2E se validó además la ruta de apertura con saldo (367 USD @800 + contrapartida PAT_CAPITAL) para cubrir el caso general.

## F. UI/UX — el aviso ya no deja al usuario sin ruta

- `FinancialStatementsView` y `BalanceSheetTab`: botones **«Configurar saldos iniciales»** y **«Configuración de Documentos»** (admin/manager) que navegan al destino correcto (`data-testid="go-opening-balances"` / `"go-document-config"`).
- `DocumentConfigView` + `OpeningBalancesDialog`: apertura directa del diálogo por contexto de navegación (`financialOpeningNavContext`, consumo único con caducidad 30 min), soporte de declaración en cero (exige notas), etiqueta «equiv. CUP» para cuentas en moneda extranjera y aviso reformulado con la ruta de acción.
- API `POST /api/fin/opening-balances`: acepta `amount >= 0`; el cero exige notas y solo se registra en CUP.

## G. E2E aislada (CostproE2E) — batería m108 completa

Ciclo 1 **14/14 PASS** y ciclo 2 (re-ejecutabilidad) **12/12 PASS**: auto-posteo 5/5 con 0 errores, carve físico y diferencia de cobro exactos, entrega_efectivo → activo, guard físico de caja (`ERR_INSUFFICIENT_CURRENCY` con el cajón vacío, válido fuera de turno), apertura completa + contrapartida patrimonial, guards de duplicado/cero-sin-notas/inmutabilidad, declaración en cero con completitud correcta, ecuación cuadrada (diferencia 0,00), idempotencia del motor, rollback con 0 persistencia y cleanup NET DELTA=0. La pre-limpieza m108b eliminó el residuo de la sesión cortada (incluido el usuario de fixture y 2 `fin_posting_errors` obsoletos) y 24 reglas v2 duplicadas, vía los RPC oficiales `e2e_hard_delete_store/user`.

## H. Producción, GitHub y cierre

- Línea base read-only m106d (ALLOW_PROD=read-only): reglas v1 activas, CHECK `> 0`, funciones sin M-015, sin trigger, 0 aperturas, los 6 movimientos USD intactos, 28e94349 sin contabilizar — **drift 0** con la extracción del 17-11.
- **EJECUTADO EN PRODUCCIÓN (m109, 2026-11-18)**: L1 infra (reglas v2 activas, CHECK >= 0, trigger, doctype RECTIFICACION_FIN) · L2–L5 rectificaciones A/B/C/D equilibradas (evento `ajuste_manual`) · L6 apertura en cero aplicada → **--verify 9/9 PASS** (ecuación diferencia 0,00; USD mínimo de la ventana 420,00; GAS_OTROS_OPER 0,00; CXP y bancos intactos) · **--idem 6/6 PASS** (0 cambios nuevos). Detalle: `PRODUCTION_EXECUTION_EVIDENCE.md`.
- Rama `fix/fin-opening-balances-cash-usd-015-20261118`, commits por fases, PR por flujo normal. Sin secretos en el diff (scan previo).
