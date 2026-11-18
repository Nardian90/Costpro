# CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 — Expediente de la misión
## Corrección de importes, monedas, medios de cobro y trazabilidad documental en Estados Financieros

**Fecha:** 2026-11-18 · **Tienda analizada:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`, tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`)
**PR:** #1652 (head final `d3873b9d7`; CI 5/5 success: CI · Test Coverage · E2E Aislado · Security CI Gate · SQL Security Gate)
**Rama:** `fix/fin-statements-origin-traceability-20261118` · **Migración:** `20261118130000_cp_fin_fs_origin_traceability.sql` (aplicada SOLO a la BD aislada CostproE2E)
**Reglas cumplidas:** cero escrituras en producción; cero modificaciones de asientos históricos (§11); sin migraciones aplicadas a producción sin autorización (§12).

---

## 1. Causa raíz exacta de cada uno de los tres casos

### Caso prioritario — 2026-11-07 «125,550.00 USD»
**Cadena real reconstruida (ventas/pagos en producción, solo lectura):**

| Elemento | Valor |
|---|---|
| Documento de origen (venta) | `e2614f36-4c86-4317-b80f-6f2fb5d34648` (transactions, status `completed`) |
| Productos | Cable Solar Rojo 4mm ×15 @ 4.50 USD + Cable Solar Negro 4mm ×15 @ 4.50 USD (skus 88 y 87) |
| **Importe original** | **135.00 USD** (Σ cantidad × precio por ítem; coincide con la estimación del propietario) |
| Tasa registrada | **930.0000** (`transactions.sale_exchange_rate`; idéntica en el pago) |
| Equivalente contable | **125,550.00 CUP** (`total_amount`; Σ amount_cup de pagos EXACTO) |
| Pago registrado | `e1eb5e60-f883-42c2-b2a5-0545976d7460`: method **zelle**, currency USD, amount **135.00**, amount_cup 125,550, tasa 930 |
| Asiento contable | `2d109ccf-1e44-4217-a260-d9f80c1fa442` (reconocimiento, posted 2026-11-14 02:15 UTC): **ACT_BANCOS débito 125,550** · ING_VENTAS crédito 125,550 · GAS_COSTO_VENTAS débito 25,200 · ACT_INVENTARIO crédito 25,200 |
| `invoice_number` | **NULL** → Documento «—» y descripción «Venta » (espacio final) |

**Causa raíz (dos capas):**
1. **Presentación:** `CategoryDetailPanel.tsx` columna «Moneda origen» imprimía `formatCurrency(m.amount)` — el importe **contable en CUP** — etiquetado con `currency_origin` del documento → «125,550.00 USD», cuando 125,550 es el equivalente CUP y el original es 135.00 USD.
2. **Datos del motor:** `fin_movements.amount_origin` (columna de la migración motor 20261113) **jamás fue escrito** (538 movimientos con `currency_origin='USD'` y `amount_origin` NULL en producción): el motor no computaba el nominal original ni lo propagaba a las líneas.

### 2026-11-14 «10,000.00» (moneda «No identificada»)
Venta `83b8e88e-ae01-413b-b6bf-159353e57856`: CUP 10,000, pago `231d6911` method **transfer** CUP 10,000 → asiento `3b704c9a`: ACT_BANCOS débito 10,000 (coherente con el registro). La columna mostraba «No identificada» porque la UI ocultaba `currency_origin='CUP'` (y NULL) — no había dato que mostrar, no hay error monetario en esta fila.

### 2026-11-17 «2,400.00» (moneda «No identificada»)
Venta **MIXTA** `867d9017-4e9d-41de-9a99-028296838e0a`: total 7,200 CUP = efectivo 4,800 (pago `829359f6`) + transferencia 2,400 (pago `ec89dfe0`). El reconocimiento `674b53ca…` tiene 5 líneas: ACT_EFECTIVO_CUP débito 4,800 · **ACT_BANCOS débito 2,400** · ING_VENTAS crédito 7,200 · GAS débito 1,603 · INVENTARIO crédito 1,603. **La fila «2,400 Reconocimiento» que ve el propietario es la parte de transferencia de esa venta mixta — clasificación correcta según los pagos registrados.**

**Alcance del defecto «Documento = —»:** `invoice_number` es NULL en **233/233 ventas** del sistema desde octubre (100%).

## 2. Medio de pago confirmado y DISCREPANCIA documentada (7-11)
El propietario informa **cobro en efectivo**; los registros originales de COSTPRO (payment_transactions + transactions.payment_method) registran **zelle**. La clasificación del motor (ACT_BANCOS) es coherente con los DATOS REGISTRAADOS — el defecto está en el dato capturado en el POS, no en el motor. Conforme a §11 de la misión: **no se modificó el histórico**; ver §8 (propuesta de rectificación).

## 3. Correcciones implementadas (causa raíz, no solo texto)

### Motor (migración `20261118130000`, cuerpos BASE = LIVE capturada byte-a-byte el 2026-11-18)
1. `fin_compute_metrics` — VENTA expone **ADITIVAMENTE**: `total_cup_origin` (nominal del documento desde `transaction_items.price_at_sale` con `price_currency` = moneda del doc), `tasa_documento` (la REGISTRADA — nunca reconstruida) y `cob_<metodo>_<moneda>_cup_origin` (nominal por método desde `payment_transactions.amount`). Descripción con fallback al **ID real** (`'Venta <id8>'`) cuando no hay `invoice_number`.
2. `fin_apply_templates` / `fin_post_document` — escriben `fin_movements.amount_origin` (NULL cuando no hay dato: **jamás se inventa**).
3. `fin_post_document_annulment` — el compensatorio copia `amount_origin`.
4. `fin_get_category_detail` — expone `amount_origin` + `currency` al drilldown.
5. `fin_metric_catalog` — métricas de origen visibles al constructor (Vista A).
6. **`create_sale_v2` (§5b, defecto preexistente corregido):** el bloque legacy de TRANSFERENCIA insertaba una **SEGUNDA fila de pago** cuando el cliente declaraba `payment_components` → invariante I1b reventaba `ERR_PAYMENT_INVARIANT_VIOLATED` (SUM(amount_cup) duplicaba la parte transfer; en PostgREST se manifestaba como reset 502). Demostrado en la aislada por **ablación** (falla igual con y sin los cuerpos CP-FIN-001) y por SQL directo (PT011: 8370 ≠ 4185). Corrección de UNA línea: `IF v_transfer_amt > 0 AND NOT v_components_ok THEN` (el mismo guard que el bloque zelle ya usa). Cualquier venta con componente de transferencia (CUP o USD) era **imposible** desde el riel canónico; esto bloqueaba los escenarios §10.4/§10.11 de la propia misión.
7. Guard fail-closed de cuerpos al final de la migración.

### Presentación (frontend)
- **`CategoryDetailPanel.tsx`**: columna «Importe contable (CUP)» con código de moneda EXPLÍCITO (`formatLabeledCurrency`); columna «**Importe original**» con el nominal registrado (ej. caso 7-11 corregido: `135.00 USD` + `125,550.00 CUP` — nunca 125,550 etiquetado USD); histórico sin original → «**No registrado**» explícito (deficiencia de trazabilidad, título explicativo); moneda CUP → «—» (sin duplicación); **Documento** con número o ID REAL (prefijo del UUID con title del UUID completo); acción «**Ver documento**» para VENTA → Historial de Ventas vía `saleDetailNavContext` (ID real, consumo único, permisos de la vista destino); documento no localizable → aviso explícito «Documento de origen no disponible»; **Medio de pago** según la CUENTA del asiento (Efectivo CUP/USD · Banco/Transferencia — no por la moneda, §5); descripción sin espacio residual; **ordenamiento por importe contable** (§10.17).
- **`types.ts`**: `MovementRow.amount_origin` + `currency`.
- Convención Débito/Crédito §8: **intacta** (sin cambios de signos ni columnas).

### Navegación
- `store/index.ts`: `SaleDetailNavContext` (patrón financialOpeningNavContext, consumo único).
- `useSalesHistoryView.ts`: consume el contexto — abre `TransactionDetailsModal` para el ID real; si la venta no está en el historial → toast «Documento de origen no disponible» + console.warn (§6).

### Menú (instrucción final del propietario)
- `NavEntry.isInDevelopment` + badge «**En desarrollo**» en: Sidebar (menú izquierdo), SectionHubView, GroupHubView, sheet móvil (MobileTabBar), FlatNavItem (⌘K) y NavModule (sidebar.structure) — con `data-testid="nav-badge-en-desarrollo"`. El badge NO es gate de permisos.

## 4. Importes/monedas/tasas — verificación E2E (BD aislada, escritores reales)
| Escenario | Resultado |
|---|---|
| CUP/efectivo 2,000 | ACT_EFECTIVO_CUP débito 2,000; banco sin línea; original NULL (sin conversión inventada) ✓ |
| CUP/transferencia 1,000 | ACT_BANCOS débito 1,000 ✓ |
| **USD/efectivo tasa 930 (9 USD)** | ACT_EFECTIVO_USD débito **8,370** = amount_cup de pago; **amount_origin 9.00 USD** en ingreso y cobro; pago persistido con nominal 135→9 USD y tasa 930 (UNA conversión) ✓ |
| USD/transferencia (4.50 USD) | ACT_BANCOS débito 4,185 con original 4.50 USD ✓ (requirió el fix de create_sale_v2) |
| Mixta CUP (1,200+800) | caja 1,200 + banco 800 en el MISMO documento ✓ |
| Idempotencia (re-checkout) | misma venta, 1 asiento, 1 pago ✓ |
| Apertura sin document_id | fila sin identificador, sin navegación inventada ✓ |
| Reversión USD | anulacion enlazada (reversal_of) **copia amount_origin 4.50** ✓ |
| Filtros período/tienda | sin fugas ✓ · **RLS**: clerk → ERR_UNAUTHORIZED ✓ |

## 5. Tests y controles
- **Vitest** 19/19 (9 del drilldown + 6 navegación + 4 vista) · **ESLint** 0 errores (repo y archivos tocados).
- Correcciones de CI: `MovementRow.document_id: string | null` (TS2322 ×3 — el RPC devuelve NULL en aperturas) y manifiesto 179 → 180 (bump del conteo).
- **E2E misión** `e2e/fin-statements-origin-traceability.spec.ts`: **18/18 PASS** (stats: expected=18, unexpected=0) + guardrail **net delta = 0**.
- **tsc**: OOM en sandbox (3 GB RAM) — TypeCheck autoritativo en CI (job TypeCheck+Lint+Unit+Build).
- **Gates**: destructive-guard OK · BOLA 5/5 · check-writers OK (147 excepciones) · contrato estático OK con **3 baselines temporales** (patrón 1616) · ledger-sync OK · replay MATCH (180 migraciones) · SQL Static/DB Security y Security Audit corren en CI del PR.

## 6. Propuesta de rectificación histórica (REQUIERE AUTORIZACIÓN — NO ejecutada)
1. **Clasificación 7-11**: si el propietario confirma que el cobro real fue EN EFECTIVO, la rectificación (vía escritor canónico, migración con autorización expresa) sería: reversa compensatoria de la parte ACT_BANCOS 125,550 del asiento `2d109ccf` + débito equivalente en ACT_EFECTIVO_USD 125,550 (el KPI «Efectivo en caja (USD)» suma 125,550 CUP y «Bancos y transferencias» resta lo mismo; ING_VENTAS intacta). **NO se ejecuta en esta misión (§11).**
2. **amount_origin histórico** (538 movimientos USD sin original): migración autorizada de completado de datos (UPDATE de campo de presentación nullable, sin tocar asientos/saldos) reconstruyendo desde `payment_transactions.amount` (fuente registrada; sin reconstrucciones por tasa). Mientras tanto la UI lo declara «No registrado».
3. Tras la autorización de producción: aplicar migración → regenerar surface → retirar las 3 baselines temporales (patrón 1616/1605).

## 7. Impacto sobre indicadores
Ningún cambio de saldos por esta misión (corrección de presentación/trazabilidad; el guard de create_sale_v2 solo habilita ventas hoy imposibles). Con el dato registrado actual, el 7-11 sigue en «Bancos y transferencias» (correcto según registros); la rectificación §6.1 movería 125,550 CUP de banco a efectivo USD **solo con autorización**.

## 8. Ficheros del PR
- `supabase/migrations/20261118130000_cp_fin_fs_origin_traceability.sql`
- `src/components/views/terminal/views/financial_statements/{CategoryDetailPanel,types}.tsx/.ts`
- `src/store/index.ts` · `src/components/views/terminal/views/sales/useSalesHistoryView.ts`
- `src/config/navigation/{navigation-definition,mobile-sheet,sidebar.structure}.ts` · `src/components/views/terminal/Sidebar.tsx` · `MobileTabBar.tsx` · `section_hub/{GroupHub,SectionHub}View.tsx`
- `src/__tests__/components/financial-statements-category-detail.test.tsx` · `src/__tests__/navigation/fin-navigation.test.ts`
- `e2e/fin-statements-origin-traceability.spec.ts` · `ci-gate-allowlist.json` · manifiesto replay regenerado
- Evidencia: `audit-evidence/cp-fin-financial-statements-accuracy-001/` (producción solo lectura, verificación E2E, reporte 18/18, capturas UI) — escaneada: **0 secretos**.
