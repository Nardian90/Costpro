# CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 — Expediente del Reporte de Entrega (PR A)

**Identificador:** CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 (Objetivo A/B — P0)
**Fecha:** 2026-11-20 · **Sucursal:** ENERVIDA-VITALLCONS · **Rama:** `fix/delivery-report-per-item-currency-20261120`
**Base:** `main` = `bd42ad750` (merge PR #1666)

---

## 1. Incidencia

Venta del 19/11/2026 (TX `025f7b6b-f9c4-44ac-833e-f7fe52814d5b`, ENERVIDA-VITALLCONS):

| Artículo | Moneda del artículo | Importe | Cobro |
| --- | --- | --- | --- |
| Barilla de Aterramientos | USD | 40 USD (@930 → 37.200 CUP) | Efectivo USD |
| Escoba | CUP | 1.800 CUP | Transferencia CUP |
| Detergente líquido | CUP | 800 CUP | Efectivo CUP |

Total de la transacción: **39.800 CUP** (40×930 + 1.800 + 800). El Reporte de
Entrega presentaba la **escoba en USD con asterisco**.

### Datos originales verificados (consulta SOLO LECTURA a producción)

- Escoba: `price_at_sale=1800`, `price_at_sale_cup=1800`, `currency=CUP`,
  `price_currency=CUP`, `exchange_rate=1`, `cash_paid=0`, `cash_currency=CUP`,
  `transfer_paid=1800`, `transfer_currency=CUP` — **correctamente registrada**.
- Barilla: `price_at_sale=40`, `price_at_sale_cup=37200`, `currency=USD`,
  `exchange_rate=930`, `cash_paid=40`, `cash_currency=USD`.
- Detergente: `cash_paid=800`, `cash_currency=CUP`.
- Ledger `payment_transactions` (ref_type=sale): `cash CUP 800 (r1)`,
  `transfer CUP 1800 (r1)`, `cash USD 40 (r930)`.
- Pools de la transacción: `cash_amount=38000` (canónico), `transfer_amount=1800`.

**Conclusión: el defecto estaba en la PRESENTACIÓN (reconstrucción), no en los datos.**

## 2. Causa raíz

`src/lib/cash-report/collection-currency.ts` → `reconstructTxCollections()`,
rama **ledger-directo** (activada por `ledgerIsAuthoritative()` — la fila
`cash USD` marca una venta creada con `payment_components`, create_sale_v2 §13.7):

1. Los **buckets** (método × moneda) se tomaban del ledger — CORRECTO (Nivel 2).
2. Pero el reparto por artículo (`perItem`) prorrateaba **cada bucket entre
   TODOS los artículos**, proporcional al valor CUP de línea
   (`distribute(perItem, items.map((_, idx) => idx), …)`), **ignorando las
   filas de pago explícitas por ítem** (`cash_paid/cash_currency`,
   `transfer_paid/…`, `zelle_paid/…`).
3. Con Σ líneaCUP = 39.800, a la escoba le correspondía
   `cash_usd = 40 × 1800/39800 ≈ 1,81 USD` y `transfer_cup = 1800 × 1800/39800 ≈ 81,4 CUP`
   → `usd_total > ε` la metía en la **hoja USD** (`salesTableItems`) y
   `itemCupEquiv ≈ 83,2 ≠ 1800` activaba el **asterisco** (`has_payment_incident`).
4. Además, `attributeQuantityByPredominant()` mandaba TODAS las unidades a la
   moneda predominante de la VENTA (USD: 37.200 > 2.600) → `qty_cup = 0` para
   la escoba y el detergente.

**Por qué otras ventas mixtas no fallaban:** las anteriores (18/11, 17/10, 19/10,
27/10) se crearon **sin componentes** → su ledger solo tiene filas CUP →
`ledgerIsAuthoritative()` = false → rama **heurística**, que SÍ respeta las
filas explícitas por ítem. La composición de pagos del 19/11 (efectivo USD +
transferencia CUP + efectivo CUP por componentes) activó por primera vez la
rama ledger-directo en una venta con desglose individual.

## 3. Corrección (Nivel 1 artículo / Nivel 2 transacción)

| Nivel | Regla implementada |
| --- | --- |
| **1 — Artículo** | Las filas de pago explícitas del ítem se usan TAL CUAL (atribución documental). La moneda de clasificación procede de SU moneda de venta registrada. |
| **2 — Transacción** | El ledger sigue siendo la autoridad de los buckets (método × moneda), `sales_split`, grupos `sales` y conciliación total. |
| **Residual controlado** | Si un bucket excede lo declarado en filas explícitas, el residual se prorratea SOLO entre ítems SIN fila de ese método, proporcional al valor CUP de línea (Σ=0 → partes iguales), marcado como **estimado** (`cupEstimated`/`usdEstimated` + `attribution.proratedBuckets`). |
| **Contradicciones** | Filas explícitas que exceden el bucket, o buckets declarados sin fila en el ledger → `attribution.ledgerMismatch = true` (se conserva el desglose documental y el bucket; se SEÑALA, no se silencia). |
| **Incidencias (§2.4)** | Comparación NATIVA cuando el ítem se cobró íntegramente en SU moneda (una diferencia de TASA entre línea y cobro es conversión, no incidencia); equivalente CUP a la TASA DEL COBRO cuando es cruzado o mixto. La incidencia de VENTA (Σcobrado ≠ Σexigible) sigue marcando sus líneas. |
| **Cantidades (§2.5)** | Por COBRO de cada ítem: una moneda → esa moneda (= su moneda de venta en el caso normal); cobro mixto → predominante DEL ÍTEM (empate ⇒ CUP); sin cobro → moneda de venta del ítem. Invariante `qty_cup + qty_usd = total_quantity` por ítem. |

### Discrepancia documentada con reglas históricas (§2.5 de la misión)

- **2026-10-19** (auditoría «Entrega en tienda», tests `cash-report-qty-per-currency`):
  cantidad por **moneda de cobro** por línea — SKU 128: 1u CUP + 2u USD,
  «exigida por el negocio». **SE CONSERVA** para cobros cruzados (ítem USD
  cobrado en CUP → cantidad a la sección CUP, donde vive su importe).
- **2026-10-24** (misión pagos mixtos, tests `mixed-payments-predominant` G1):
  TODAS las unidades de la venta a la moneda **predominante de la transacción**.
  **SUSTITUIDA** por la regla por artículo de la misión actual (era la causa de
  que una venta mixta clasificara todos sus productos en la moneda predominante).
  Tests actualizados con la discrepancia documentada in situ.

## 4. Conciliación ANTES / DESPUÉS (venta del 19/11/2026)

### ANTES (main `bd42ad750`)

| Artículo | cash_cup | transfer_cup | cash_usd | ¿Hoja USD? | ¿Asterisco? | Cant. CUP |
| --- | --- | --- | --- | --- | --- | --- |
| Barilla | 747,74 | 1.682,41 | 37,39 | SÍ | no | 0 |
| **Escoba** | **36,18** | **81,41** | **1,81** | **SÍ** | **SÍ** | **0** |
| Detergente | 16,08 | 36,18 | 0,80 | SÍ | SÍ | 0 |

Los TRES productos aparecían en AMBAS hojas; totales del período correctos
(los buckets siempre fueron exactos) pero la tabla por artículo, artificial.

### DESPUÉS (rama fix)

| Artículo | cash_cup | transfer_cup | cash_usd | Hoja | Asterisco | Cant. |
| --- | --- | --- | --- | --- | --- | --- |
| Barilla | 0 | 0 | 40 | USD | no | 1 (USD) |
| **Escoba** | 0 | **1.800** | **0** | **CUP** | **no** | **1 (CUP)** |
| Detergente | 800 | 0 | 0 | CUP | no | 1 (CUP) |

- **La escoba conserva sus 1.800 CUP** (transferencia CUP exacta), sin USD
  artificiales, sin asterisco, fuera de la hoja USD. ✔
- Ledger ÍNTEGRO: grupos `sales` = `cash CUP 800 / transfer CUP 1800 / cash USD 40`
  (equivalente 39.800 CUP). ✔
- Atribución 100 % explícita: `attribution = { explicitItems: 3, proratedBuckets: 0, ledgerMismatch: false }`. ✔

## 5. Pruebas (Objetivo B)

`src/__tests__/lib/cash-report-delivery-per-item-fix.test.ts` (25 tests):

- **Caso 1** — venta real 19/11 (buckets exactos; atribución por ítem sin
  prorrateo; escoba sin USD/asterisco/hoja USD; cantidades 2 CUP + 1 USD;
  ledger completo; total 39.800 CUP).
- **Caso 2** — ventas mixtas del 18/11 (heurística intacta, sin USD inventado).
- **Caso 3** — 17/10 (mixta explícita: clasificación monetaria intacta, la
  cantidad del ítem USD pasa a su sección §2.5), 19/10 (incidencia AUTÉNTICA
  del subcobro 8.100 CUP conserva el asterisco; multi-método exacto) y
  27/10 (4 líneas USD cobradas en CUP exacto).
- **Caso 4** — sin desglose individual: fallback histórico (legacy-exact-usd
  con marca de estimado; `mixedUnresolved`; zelle-usd).
- **Caso 5** — pagos parciales y múltiples métodos: cash CUP + cash USD +
  transfer CUP + Zelle USD (tasa 930) con productos CUP y USD; tasas distintas
  por operación en la misma venta; prorrateo fallback estimado y trazable.
- **Caso 6** — incidencia auténtica: sobrecobro (residual estimado señalado),
  contradicción documento↔ledger (`ledgerMismatch` auditable) y diferencia
  explicable por conversión de tasa (NO incidencia).
- **Invariantes 1-7 de la misión**: Σ por (método, moneda) == ledger; sin
  duplicar cantidades ni inventar cobros; tasa del registro; determinismo
  (doble ejecución idéntica); legibilidad histórica (SKU 108); paridad
  PDF↔vista previa (mismos helpers `salesTableItems`/`salesTableQty`).

Actualizaciones documentadas de expectativas fijadas (regla predominante
sustituida): `cash-report-mixed-payments-predominant.test.ts` G1 e
`ipv-ventas/mision-ipv-usd-cobro-real.test.ts` Escenario 4 (el producto CUP
pagado en CUP ya no recibe USD artificial del prorrateo).

## 6. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `src/lib/cash-report/collection-currency.ts` | Nivel 1/Nivel 2 en la rama ledger; `usdCupEquiv`/estimated por ítem; `attribution`; regla de incidencias nativa/cruzada; cantidades por ítem; documentación. |
| `src/app/api/cash-report/items-summary/route.ts` | Solo documentación del contrato (qty/incidencias). |
| `src/__tests__/lib/cash-report-delivery-per-item-fix.test.ts` | Casos 1-6 + invariantes (nuevo). |
| `src/__tests__/lib/cash-report-mixed-payments-predominant.test.ts` | G1 actualizado (discrepancia documentada). |
| `src/__tests__/ipv-ventas/mision-ipv-usd-cobro-real.test.ts` | Escenario 4 actualizado (discrepancia documentada). |

## 7. Riesgos y limitaciones

- La regla de cantidades §2.5 cambia la presentación de ventas mixtas
  históricas CON ítems cobrados en su moneda no-predominante (p. ej. 17/10
  TX 68e7464d: la unidad del ítem USD pasa de la sección CUP a la USD). La
  clasificación MONETARIA (buckets/hojas/importes) de esas ventas no cambia.
- `attribution.ledgerMismatch` es informativo (auditoría): el reporte no
  bloquea la venta contradictoria — la señala.
- No se ejecutó E2E contra la BD aislada (la misión no lo requiere: sin
  cambios de esquema ni de flujos de escritura). Suite unitaria completa
  en verde (ver PR).
- Las consultas a producción fueron EXCLUSIVAMENTE de lectura.
