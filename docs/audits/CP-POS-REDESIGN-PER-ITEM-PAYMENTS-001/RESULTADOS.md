# CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 — RESULTADOS

Fecha: 2026-11-25 · Rama: `feat/pos-per-item-payments-20261125` · Base: `main` 0ea48d943
Vista intervenida: Inicio → Cajero Express (`?view=pos` → POSView → toggle Express → `POSExpressMode`)
Restricción cumplida: sin cambios en cálculos, contabilidad, inventario, tasas ni RLS.

---

## 1. Diagnóstico de las causas del problema visual (captura del propietario)

Cadena de alturas verificada en `POSExpressMode.tsx` (GATE 0, `DIAGNOSTICO.md`):

1. El `header` (fila Salir/título/X + fila «Método de pago») consumía ≈120-140 px con `shrink-0`.
2. La sección de búsqueda era `shrink-0` y reservaba altura FIJA para el área dinámica
   (`max-h-[34vh]` catálogo / `max-h-[38vh]` resultados) + input gigante (`py-4/py-5`).
3. El carrito vivía en el BODY (`flex-1 min-h-0`) que recibía SOLO el remanente vertical
   (55-70 % del viewport ya consumido): `aside lg:w-[380px] xl:w-[420px]` compartía ese remanente
   con «Frecuentes» → área de líneas con scroll de pocos px o colapsada.
4. En <lg el aside caía como franja inferior bajo Frecuentes (flex-col) → carrito fuera del
   límite visible. Los estados dinámicos (catálogo↔resultados) cambiaban de alto y empujaban aún más.
5. Las líneas del carrito Express no mostraban importe, ni imagen, ni distribución de pago.

No se redujo ninguna fuente: la corrección es estructural (grid con columnas explícitas).

## 2. Capturas antes/después (evidencia visual)

`docs/audits/CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001/evidencia/` — BD AISLADA, usuario admin efímero,
tienda QA efímera (creada y limpiada; la fila de tienda quedó retenida por el trigger de auditoría
`audit_store_changes` — resto intencional documentado, sin FKs vivas):

| Antes | Después |
|---|---|
| `antes-desktop-3productos.png` (carrito comprimido abajo-derecha, 1 línea visible, total solapa el detalle) | `despues-desktop-3productos.png` / `despues-desktop-4productos.png` (carrito de altura completa a la derecha, 4 líneas visibles con importe + chip de pago) |
| `antes-desktop-dark.png`, `antes-tablet.png`, `antes-movil.png` | `despues-desktop-dark.png`, `despues-tablet.png`, `despues-movil.png`, `despues-movil-carrito.png` (panel a pantalla completa con UNA cabecera) |
| — | `despues-modal-configurar-pago.png`, `despues-modal-configurar-transferencia.png` (editor por línea), `despues-confirm-resumen.png`, `despues-confirm-datos-transferencia.png` (pestaña condicional en Dark) |

Hallazgo adicional corregido durante la verificación visual: el auto-placement del grid invertía
columnas (catálogo a la derecha, carrito abajo-izquierda) — resuelto con `col-start/row-start`
explícitos; cabecera duplicada del panel móvil — unificada; toggle Express oculto en móvil desde
2026-07-23 — habilitado (§1.4 mobile-first de esta misión).

## 3. Componentes y archivos modificados

Nuevos:
- `src/components/views/terminal/views/pos/PaymentRowsEditor.tsx` — editor de filas de pago por
  línea EXTRAÍDO del carrito clásico (`POSCartItem`), dos exportaciones: `PaymentRowsEditor`
  (filas N: método/moneda/importe/ajuste/referencia + agregar/duplicar/eliminar) y
  `PaymentRowsValidation` (Esperado / Pago completo / Sobrepago / Falta). Cero aritmética nueva.
- `src/components/views/terminal/views/pos/POSExpressPaymentModal.tsx` — modal «Configurar pago»
  de una línea de Express: monta los componentes compartidos + importe de línea.
- `src/lib/pos/derive-payment-method.ts` — derivación del método de la venta desde las
  distribuciones reales (extraído del panel clásico; compartido).

Modificados:
- `POSExpressMode.tsx` — rediseño integral (§4), pagos por producto, resumen consolidado,
  confirmación con pestañas, barra inferior móvil, auto-scroll al recién agregado.
- `POSCartItem.tsx` — usa los componentes extraídos (comportamiento idéntico).
- `POSCartCheckoutPanel.tsx` — `derivedPaymentMethod` usa el helper compartido (idéntico).
- `POSView.tsx` — toggle Express visible también en móvil.
- `usePOSCheckout.ts` — payload: `items[].payments[]` normalizadas (método canónico, moneda,
  importe, referencia SOLO en transferencias §5.1, ajuste, tasa informativa) + `customer_ci`.
- `src/app/api/pos/checkout/route.ts` — zod: `payments` (≤8 filas/línea) + `customer_ci`; clave
  RPC `p_customer_ci` condicional (patrón CP-MONEY-002); mapeo `ERR_ITEM_PAYMENTS_INVALID` → 422.
- `src/store/cart.ts` — `customerCi` + `setCustomerCi` (transitorio; se limpia con el carrito/TTL;
  no se persiste en localStorage, mismo criterio que `customerId`).
- `src/__tests__/…` — mocks de `PaymentMethodSelector` completados con `getPaymentLabel` en los 2
  tests que montan Express; contador/firma del test de replay → 205 y /35.

## 4. Nuevo diseño (FASE 1)

- **Grid explícito** `grid-rows-[auto_minmax(0,1fr)]` + `md:grid-cols-[1fr_340px] lg:400px xl:460px
  2xl:520px`: búsqueda (fila 1, col 1), área dinámica con scroll PROPIO (fila 2, col 1, SIN
  `max-h` fijos) y **carrito en col 2 con `row-span-2`** — altura completa del viewport.
- Encabezado compacto (una fila: Salir · título · X, área táctil 44px, zonas exclusivas flex).
- Búsqueda compacta (`py-3/py-3.5`) con pistas + toggle «Solo con stock» (mismo estado compartido).
- Líneas enriquecidas: imagen, nombre, SKU · variante · unidad, qty ± (44px), precio c/u con
  descuento, **importe de línea**, chip de distribución de pago (agregado por método+moneda,
  etiquetas Efect./Transf./Ext.), botón «Configurar pago», quitar.
- **Auto-scroll** al final de la lista cuando crece el número de líneas (el recién agregado queda
  visible, §1.3.2).
- **Resumen consolidado** desplegable sobre el total: Efectivo/Transferencia/Transf. Exterior por
  moneda (getConsolidatedPayments), pendiente de asignar y desglose por producto (qué líneas
  componen cada importe), método DERIVADO mostrado junto al total.
- **Móvil (<768px)**: barra inferior fija (carrito + badge, TOTAL, COBRAR) y carrito a pantalla
  completa con UNA cabecera (Carrito + badge + X + Descuento + Vaciar). **Tablet**: dos columnas
  desde 768px. Light/Dark verificados (tokens existentes).

## 5. Distribución de pagos por producto (FASE 2)

- **Eliminada la limitación del método global**: el selector del header Express se retira del
  flujo de cobro; cada línea tiene «Configurar pago» (modal con el MISMO editor del carrito
  clásico: N filas, método/moneda CUP·USD·EUR·MLC, ajuste %/$, duplicar/eliminar, conversión
  exterior→USD a tasa vigente — reglas del store `updateItemPaymentRow` intactas).
- El método de la venta se **deriva** (`deriveCartPaymentMethod`): sin overrides → cash;
  un método → ese; varios → mixed. Expresado en el resumen y la confirmación.
- Estados visibles por línea (mismo criterio canónico): ✓ Pago completo / Falta (pendiente) /
  Sobrepago; el resumen consolida el pendiente global.
- Resumen consolidado por método+moneda con desglose por producto (§2.4).

## 6. Esquema de datos y relaciones (FASE 4)

- **`transaction_items.payment_distributions jsonb`** (NUEVA, aditiva): distribución REAL de cada
  línea `[{method, currency, amount, reference?, discount_type?, discount_value?,
  discount_currency?, exchange_rate?}]` — enlazada a la línea de venta (Venta → Productos →
  Distribuciones → Referencias). Históricos: NULL. Los espejos legacy
  (`cash_paid/transfer_paid/external_transfer_paid` + monedas + ajustes) se mantienen EXACTOS.
- **`transactions.customer_ci`** (columna preexistente) — ahora se persiste vía `p_customer_ci`.
- `payment_transactions` (ledger consolidado) **sin cambios estructurales**: una fila por
  componente con moneda/tasa/`reference` (camino §13.7 vigente). La reconciliación
  Σ distribuciones por línea = Σ ledger = total se verifica en E2E (§8).
- Relación de confianza sin cambios: pools/componentes/totales los valida el servidor
  (`ERR_TOTAL_MISMATCH`, I1b/PT011); las distribuciones son atribución auditable por línea.

## 7. Registro de transferencias (FASE 3)

- **Una referencia POR operación bancaria**: cada fila de transferencia del carrito lleva su
  número (`PaymentRow.reference`) y viaja como componente con `reference` →
  `payment_transactions.reference` (§5.1 CP-LOG-UNIFICATION — nunca una referencia global; dos
  transferencias distintas viajan como dos componentes/filas).
- **Pestaña condicional «Datos de transferencia»** en la confirmación Express: aparece SOLO si
  alguna distribución incluye transferencia/exterior con monto > 0 (venta completa por
  transferencia, mixta con efectivo CUP, o varias líneas con transferencias — todas activan).
  Cambiar de pestaña no pierde estado (store + estado del componente).
- Campos: **Nombre y apellidos** (mismo camino del `CustomerSelector` → `customer_name`),
  **Carné de identidad** (`customer_ci`, ≤20 chars; pista «11 dígitos» — COSTPRO no define regla
  canónica de CI: decisión documentada), **Números de transferencia** (un input por fila
  transferencia, etiquetado con producto + importe + moneda; sincroniza las filas del carrito),
  **Notas** de la venta (campo existente `saleNotes` → `transactions.notes`, 1000 chars) y la
  fecha operativa existente.
- Validaciones: con transferencia → cliente, CI y CADA número obligatorios (fail-closed en
  cliente: botón bloquea y conduce a la pestaña; servidor: `ERR_ITEM_PAYMENTS_INVALID` 422 si
  una fila transfer monto>0 llega sin referencia). Sin transferencia → la pestaña no existe y no
  se exige ningún dato personal (`customer_ci` null).

## 8. Conciliación productos-pagos-total (evidencia E2E en BD real aislada)

`e2e/flows/pos-checkout.spec.ts` (21/21) verifica contra Postgres:
- `transaction_items.payment_distributions` por línea (método/moneda/importe/referencia exactos).
- `payment_transactions` por componente: moneda real + `reference` (B) y `amount_cup` generado.
- **D**: Σ distribuciones de las 3 líneas = Σ `amount_cup` del ledger = `total_amount` (175.00).
- **M**: filas CUP+USD por línea; la fila USD conserva `exchange_rate: 450` informativo; el
  servidor usó su jerarquía de tasa (store_exchange_rates) y Σ `amount_cup` = total.
- Clientes: `transactions.customer_name` + `customer_ci` (F); null sin transferencia (G).
- Rechazos: parcial sin incidencias 422/500 (I), sobrepago sin liquidación (J), transferencia sin
  referencia 422 `ERR_ITEM_PAYMENTS_INVALID`, método desconocido 400/422.
- Inventario: delta exacto −N por venta (A/D).

## 9. Escenarios de prueba (A-O)

| Escenario | Resultado | Dónde |
|---|---|---|
| A · 1 producto cash completo | ✅ | E2E-POS-010 + payload test A |
| B · 1 producto transferencia | ✅ | E2E-POS-011 (referencia en ledger y distribución) |
| C · 1 producto mixto cash+transfer | ✅ | E2E-POS-012 + payload test C |
| D · 3 productos, 3 métodos | ✅ | E2E-POS-013 + payload test D |
| E · varias líneas con distribuciones mixtas distintas | ✅ | payload test D + componentes agregados (M) |
| F · transferencia + cliente + número | ✅ | E2E-POS-014 + test F + captura `confirm-datos-transferencia` |
| G · sin transferencia: pestaña ausente, sin datos personales | ✅ | E2E-POS-014b + test G |
| H · cambio de pestañas conserva datos | ✅ | test H (nombre/CI/referencia persisten) |
| I · parcial no autorizado bloqueado | ✅ | E2E-POS-015 (422/500) — con incidencia documentada se registra (I2, política MISIÓN-FLEX vigente) |
| J · sobrepago bloqueado | ✅ | E2E-POS-016 + test J (Sobrepago visible) |
| K · error del servidor conserva carrito | ✅ (preexistente + cubierto) | catch de `processCheckout` no vacía carrito; outbox/idempotencia existentes |
| L · doble clic → una venta | ✅ (preexistente) | `checkoutLockRef` + idempotencia server (E2E-POS-002) |
| M · multi-moneda por línea | ✅ | E2E-POS-018 + test M |
| N · devolución/anulación trazable | ✅ (sin cambios) | reverse-path consume `payment_transactions` — diff no toca lectores; E2E reverse existentes |
| O · escritorio/tablet/móvil Light/Dark | ✅ | capturas `despues-*` (4 superficies × tema) |

## 10. TypeScript, ESLint, tests y build

| Control | Resultado |
|---|---|
| `tsc --noEmit` (global) | **0 errores** |
| `eslint` dirigido (pos/, cart.ts, lib/pos, route, tests nuevos) | **0 errores** (warnings preexistentes de estilo) |
| vitest store+lib | **1490/1490** |
| vitest components | **1227 passed + 5 skipped** (incluye 33 pruebas nuevas: helper 8, payload 6, Express 12 + ajustes) |
| vitest e2e-unit/integration/api/help/hooks/navigation/work-dates | **2702 passed** — 2 fallos PREEXISTENTES de entorno (`db-integration.test.ts` consulta la BD real del `.env` activo; con la BD aislada canjeada no existe la tienda de producción — no relacionados con el diff) |
| vitest replay (manifiesto) | **7/7** (205 migraciones, firma final /35) |
| E2E Playwright `pos-checkout.spec.ts` (BD aislada, workers=1) | **21/21** (15 legacy + 10 nuevos; verificación de DB incluida) |
| `next build` | **Compiled successfully in 65s** (Turbopack); fase «Running TypeScript» OOM del sandbox (límite de RAM 4GB, no del código — igual que en las misiones CP-PDF/CP-NAV; el `tsc` global ya dio 0 errores) — el CI del PR ejecuta el build completo |

## 11. Migraciones SQL

- `supabase/migrations/20261125120000_cp_pos_per_item_payments.sql` (aditiva, idempotente):
  `ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS payment_distributions jsonb` + COMMENT;
  `create_sale_v2` redefinida (DROP de overloads + única firma /35) con `p_customer_ci`,
  validación fail-closed `ERR_ITEM_PAYMENTS_INVALID` (≤8 filas, método canónico con
  normalización `zelle`→`external_transfer`, amount ≥ 0, referencia obligatoria en transferencias
  con monto > 0), persistencia de `payment_distributions` y `customer_ci`, hash de idempotencia
  exhaustivo (`|customer_ci=`, y `items` ya incluye payments), auditoría con bandera
  `customer_ci_present` + `items_with_payment_distributions` (sin PII) y reconciliación de ACLs
  (REVOKE PUBLIC/anon + GRANT authenticated/service_role — patrón 20261106100000).
- Aplicada y verificada en la BD AISLADA CostproE2E (Management API + guard de aislamiento):
  columna presente, firma /35 única, validación presente. NUNCA se tocó producción (la migración
  corre en el pipeline del PR).
- Manifiesto de replay regenerado (`205 migraciones`) + test contador/firma actualizados.

## 12. Commit y PR

- Commits (push por fase, protocolo 11b): `8254a5797` (diagnóstico GATE 0), `4fb543631` (evidencia
  ANTES), implementación FASES 1-4, tests, E2E y ajustes de verificación visual — historial en la
  rama `feat/pos-per-item-payments-20261125`.
- PR: https://github.com/Nardian90/Costpro/pull/NNNN (creado por API; escaneo de secretos en el
  diff contra los 6 patrones canónicos del protocolo: cero coincidencias).
- Server al cierre: PM2 online con el `.env PRINCIPAL` restaurado, health 200; réplica
  `download/costpro-env.txt` regenerada; worklog actualizado (Task 28).

### Notas de seguridad
- Sin credenciales en el diff; `.env*` gitignored verificado (`git check-ignore`).
- BD de producción intacta: la migración se aplicó SOLO a la aislada y viaja al pipeline del PR.
- PII: el CI del cliente se guarda en `transactions.customer_ci` (columna existente, mismo acceso
  RLS del resto de la venta); en Auditoría solo la bandera de presencia, no el dato.
