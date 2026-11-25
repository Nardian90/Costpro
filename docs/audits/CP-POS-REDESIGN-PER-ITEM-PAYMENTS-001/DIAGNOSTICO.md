# CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 — GATE 0: Diagnóstico forense (antes de modificar)

Fecha: 2026-11-25 · Rama: `feat/pos-per-item-payments-20261125` (desde `main` 0ea48d943)
Vista: Inicio → Cajero Express (`?view=pos` → POSView → toggle Express → `POSExpressMode`)
Alcance: rediseño visual + pagos independientes por producto + pestaña «Datos de transferencia».
Restricción absoluta: NO tocar algoritmos de cálculo, contabilidad, inventario ni conciliación.

---

## 1. Mapa real del Cajero Express

- `TerminalShell.tsx:505` monta `POSView` para `view=pos` (full-width `:791`).
- `POSView.tsx:241,520-539,609-620`: `expressMode` (estado local, NO es el default) monta
  `POSExpressMode` (portal `fixed inset-0 z-[45]`). Ambos comparten el MISMO store de carrito
  (`src/store/cart.ts`) y el MISMO checkout (`usePOSCheckout` → `POST /api/pos/checkout` → RPC
  `create_sale_v2`, único camino; V1 retirada).
- Componentes: catálogo/buscador (`usePOSServerSearch` + área dinámica inline), carrito Express
  (aside propio de `POSExpressMode.tsx:979-1165`, líneas simples), editor de línea compartido
  (`POSCartItemEditModal`), descuento global compartido (`POSCartDiscountModal`), éxito compartido
  (`POSCartSuccessView` + `usePOSCartExports`).

## 2. Causa raíz del problema visual (captura del usuario)

Cadena de alturas en `POSExpressMode.tsx`:

1. `header` (fila 1 + fila «Método de pago») ≈ 120-140 px, `shrink-0` (`:578-624`).
2. Sección búsqueda **`shrink-0`** (`:627`) con input gigante (`py-4 sm:py-5`, `text-lg sm:text-xl`)
   + pistas + **área dinámica con reserva fija**: catálogo `max-h-[34vh]` (`:766`) / resultados
   `max-h-[38vh]` (`:852`) con scroll propio.
3. El BODY (`:918` `flex-1 min-h-0`) recibe SOLO el remanente vertical: en un viewport de 900 px,
   header+búsqueda+área dinámica consumen ≈ 55-70 % → el carrito vive en `aside lg:w-[380px]
   xl:w-[420px]` (`:979`) compartiendo el remanente con «Frecuentes».
4. Resultado: carrito comprimido abajo-derecha; el área de líneas (`flex-1 overflow-y-auto`,
   `:1039`) queda en pocos px; en <lg (tablet/móvil) el aside cae como franja inferior bajo
   Frecuentes (flex-col) y el detalle queda fuera del límite visible. Los estados dinámicos
   (catálogo↔resultados) cambian de alto y empujan aún más al BODY.
5. Agravante: las líneas del carrito Express NO muestran importe de línea, ni imagen, ni la
   distribución de pago asignada (solo nombre/SKU/precio c/u + qty ± y quitar).

Además, el panel clásico `POSCart.tsx:131-134` usa `hidden lg:flex` → en 768-1023 px el carrito
clásico desaparece (solo barra-resumen); no es la causa de la captura (que es Express) pero se
documenta como hallazgo.

## 3. Estado real del modelo de pagos (lo que ya existe y se reutiliza)

- **Pago por línea YA EXISTE en el carrito**: `CartItem.payments: PaymentRow[]` (`cart.ts:33-50`)
  con método/moneda/importe/referencia/ajuste; N filas dinámicas con acciones
  `addItemPayment/removeItemPayment/duplicateItemPayment/updateItemPaymentRow` (`cart.ts:1350-1453`).
- **UI de filas por línea YA EXISTE** en `POSCartItem.tsx:461-672` (selector método, monto, moneda
  CUP/USD/EUR/MLC, ajuste %/$, duplicar, eliminar, referencia obligatoria en filas de
  transferencia) + validación de cuadre por línea (`:679-740`: Esperado / Pago completo /
  Sobrepago / Falta). El Cajero Express NO la usa.
- **Consolidación**: `getConsolidatedPayments()` (por moneda {cash,transfer,exterior}),
  `getItemPaidCup()`, `getItemSubtotalCup()`, `getExpectedTotalCup()` (ajustes por fila),
  `getRateToCup()` (globalRates > tasa del item > 1).
- **Persistencia actual**: `buildPaymentComponents()` agrupa TODAS las filas del carrito en
  componentes por (método, moneda, referencia) → `p_payment_components` → el RPC inserta UNA fila
  de `payment_transactions` POR componente (moneda real + tasa + `reference`). La atribución por
  línea viaja como espejos `transaction_items.cash_paid/transfer_paid/external_transfer_paid`
  (un importe por método: lossy para multi-moneda por método).
- **LO QUE FALTA** (extensiones compatibles, aditivas):
  1. El payload `items[]` no porta las distribuciones por línea (solo espejos legacy).
  2. `transaction_items` no conserva la distribución real por línea (JSONB).
  3. `transactions` no recibe CI del cliente (la columna `customer_ci` YA EXISTE en la tabla —
     fixture `null_trap_audit_schema_fixture.sql:71` — pero el RPC no la persiste).
  4. Express usa un selector global (`selectedPayment` en header) que fuerza el método de toda la
     venta: `handleConfirmSale` llama `startCheckout(selectedPayment, null)`; con método global
     «cash» los pools canónicos fuerzan `cashAmount = totalAmountCup` aunque las líneas tengan
     distribuciones mixtas.

## 4. Registro del POST (integridad a preservar)

`create_sale_v2` (migración `20261121200100`, SECURITY DEFINER, 1 RPC = transacción):
advisory lock por tienda → auth `has_store_access_as` + seller binding → idempotencia
(`idempotency_registry`, param_hash exhaustivo) → recálculo server-side de subtotal/impuestos/total
(`ERR_TOTAL_MISMATCH`) → tasa server-side (tienda → BCC → Diviza) → componentes validados
(`ERR_PAYMENT_COMPONENTS_INVALID`, ≤20, exterior riel USD) → INSERT `transactions` (pools,
settlement, notas, incidencias) → loop items: costo FOR UPDATE, inventario vía
`register_stock_movement(p_movement_type:='sale')` EXACTAMENTE UNA VEZ, INSERT `transaction_items`
→ INSERT `payment_transactions` por componente → invariante I1b/PT011 (Σ pagos = total) →
audit_logs. No se crearán ventas por producto; una venta coherente con líneas y distribuciones.

## 5. Diseño de la intervención (reutilización máxima, sin duplicados)

### FASE 1 — Layout Express (estructural, sin bajar fuentes)
- Grid raíz `grid-rows-[auto_minmax(0,1fr)]` con `md:grid-cols-[1fr_360px] lg:420px xl:480px`:
  buscador+catálogo en la columna izquierda (fila 1 búsqueda compacta, fila 2 área dinámica con
  `min-h-0 overflow-y-auto` — SIN `max-h-[34vh]` fijo), **carrito a la derecha ocupando el alto
  completo** (row-span-2) con header/lines-scroll/totales (flex-column, `min-h-0`).
- Líneas Express enriquecidas: imagen, nombre, SKU, unidad, qty ±, precio, **importe de línea**,
  chip de distribución de pago, «Configurar pago», editar (modal compartido), quitar.
- Producto recién agregado: scroll automático al último ítem agregado (aparece visible de inmediato).
- Móvil (<md): catálogo a lo alto + barra inferior fija (total + Cobrar + «Ver carrito (n)») y
  carrito como panel a pantalla completa (patrón `POSCart` móvil ya existente); respuesta visual
  inmediata al agregar. Sin posiciones absolutas para «parchar» layout; solo overlays modales.
- Tablet: dos columnas desde `md` (768 px) con carrito suficiente. Light/Dark: tokens existentes.

### FASE 2 — Pagos por producto
- Se elimina la limitación del método global en Express: el selector del header se sustituye por
  **«Configurar pago» por línea** y el método de la venta se **deriva** de las distribuciones
  reales (misma regla `derivedPaymentMethod` del panel clásico, extraída a helper compartido
  `src/lib/pos/derive-payment-method.ts` — reutilizada por el panel y Express, sin duplicar).
- Editor de pago por línea: **extracción del bloque de filas de pago de `POSCartItem` a
  `PaymentRowsEditor.tsx`** (mismo JSX/store actions, cero aritmética nueva), usado por el
  carrito clásico (sin cambio de comportamiento) y por el nuevo modal Express
  (`POSExpressPaymentModal`: importe del producto, filas N, total asignado, pendiente, estados
  completo/parcial/excede, conversión exterior→USD vigente).
- Resumen consolidado (FASE 2.4) en el carrito Express y en la confirmación: totales por método y
  moneda desde `getConsolidatedPayments()`, pendiente global, y desglose por producto (qué líneas
  componen cada importe).
- Validaciones de confirmación (sin inventar reglas): referencia obligatoria por fila de
  transferencia (regla §5.1 existente), bloqueo de sobrepago sin liquidación
  (`ERR_OVERPAYMENT_UNREGISTERED_CHANGE` existente), tasa no resoluble (existente),
  incidencias MISIÓN-FLEX se informan y viajan al RPC (política vigente, no se endurece ni se
  relaja nada).

### FASE 3 — Pestaña «Datos de transferencia» (condicional)
- En el modal de confirmación Express: pestañas [Resumen | Datos de transferencia]. La pestaña
  aparece SOLO si alguna distribución tiene `transfer`/`external_transfer` con importe > 0, con
  indicador de datos requeridos. Cambiar de pestaña no pierde estado (estado en componente/store).
- Campos: Nombre y apellidos (vinculado a `cart.customerName`, mismo camino del
  `CustomerSelector`), Carné de identidad (nuevo `cart.customerCi`), Número de transferencia
  (UNA referencia POR operación bancaria: cada fila transfer del carrito con su propio número,
  editable desde la pestaña — el modelo por componente ya exige y persiste referencia por pago;
  nunca una referencia global), Notas (campo existente `saleNotes` → `transactions.notes`).
- Validaciones: si hay transferencia → nombre, CI y cada número no vacíos (CI ≤ 20 caracteres;
  pista «11 dígitos» — COSTPRO no define regla canónica de CI, decisión documentada). Sin
  transferencia → la pestaña no existe y NO se exigen datos personales.

### FASE 4 — Modelo de datos (aditivo y compatible)
- Migración nueva: `ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS payment_distributions
  jsonb` (nula; históricos intactos) + `CREATE OR REPLACE FUNCTION create_sale_v2` que:
  - añade `p_customer_ci text DEFAULT NULL` (al final de la firma; columnas ya existentes),
  - valida estructura de `items[].payments` (array ≤8 filas; método canónico, `zelle` normalizado;
    amount ≥ 0; referencia requerida en filas transfer con monto > 0; monedas libres ≤8 chars) →
    `ERR_ITEM_PAYMENTS_INVALID` (fail-closed),
  - persiste `payment_distributions` por línea (método, moneda, importe, referencia, ajuste, tasa
    informativa) — la atribución por línea deja de ser lossy,
  - persiste `customer_ci` en `transactions`,
  - añade `customer_ci` al param_hash de idempotencia (patrón v2_26_hotfix2),
  - NO cambia pools, componentes, totales, inventario, I1b ni ningún lector financiero.
- Payload: `items[]` porta `payments[]` (normalizadas del store) + `customer_ci`; los espejos
  legacy por método se siguen enviando EXACTAMENTE igual (compatibilidad total).
- Conciliación: Σ distribuciones por línea = espejos por método = componentes/pools = total
  (verificable por consulta; los lectores §7 del informe (Caja, Historial, EEFF, conciliación,
  informes por método/moneda, cierres, devoluciones) siguen consumiendo `payment_transactions`
  sin cambios).

### FASE 5-8
Flujo de cobro Express: agregar → configurar pago por producto → resumen consolidado →
(if transfer) pestaña de datos → notas/fecha → confirmar (validaciones) → POST → éxito.
Errores: no se vacía el carrito ni se pierden distribuciones (el estado vive en el store
persistido; la X cierra el panel sin revertir ventas confirmadas). Doble clic: cerrojo
síncrono `checkoutLockRef` + idempotencia server-side (existentes). Pruebas A-O (unit + E2E
BD aislada) y QA TypeScript/ESLint/vitest/build; capturas antes/después (desktop/tablet/móvil,
Light/Dark) en `evidencia/`.

## 6. Decisiones de alcance (explícitas)
- NO se toca `POSCart.tsx`/`POSCartCheckoutPanel.tsx` salvo extraer el helper derivado (cero
  cambio de comportamiento) para reutilizarlo en Express.
- NO se crea ninguna implementación paralela de venta/pagos: un solo store, un solo checkout,
  un solo RPC, una sola operación de venta por confirmación.
- NO se modifican RLS, permisos de Supabase, tasas ni equivalencias monetarias.
- El selector global de método del header Express se retira del flujo de cobro (FASE 2.1 manda
  eliminar la limitación global); `selectedPayment` del store se conserva para el Vale y el
  carrito clásico.
