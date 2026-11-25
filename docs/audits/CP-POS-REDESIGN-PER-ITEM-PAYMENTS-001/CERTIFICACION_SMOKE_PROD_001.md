# CERTIFICACIÓN SMOKE — CP-POS-SMOKE-PRODUCTION-001
## Pagos por artículo en Cajero Express — cierre funcional del ciclo CP-POS

**Fecha:** 2026-11-25 · **Ejecutada por:** agente (sesión CP-POS-SMOKE-PRODUCTION-001)
**Commit probado:** `2a0368785` (main local + aislada) = commit de producción en Vercel (`2a036878`, deploy success)
**Ciclo:** PR #1708 (implementación, merge `a3f398a88`) + PR #1709 (migración `20261125120000` aplicada en producción, merge `2a0368785`) + acta `APLICACION_MIGRACION_20261125120000_PRODUCCION.md`
**Producción:** https://costpro4.vercel.app · health 200 · `create_sale_v2` firma `/35` verificada · `transaction_items.payment_distributions` presente · **0 ventas de la funcionalidad aún en producción**

---

## 0-bis. CIERRE DOCUMENTAL DEL CICLO (registro final)

| Hito | Valor |
|---|---|
| PR de certificación y fix | **PR #1712** (`fix/cp-pos-modal-pago-vivo-20261125`, commit `4a90a1df6`) — 5/5 checks success (E2E Aislado, Security Audit, TypeCheck+Lint+Unit+Build, Unit & Integration Tests, Vercel Preview) |
| Merge del PR #1712 | `b82e53e41` (fusionado por el propietario, 2026-11-25) |
| Despliegue en producción | Vercel sobre `b82e53e41` → **success**; `GET /api/health` → **200** — el **fix del modal «Configurar pago» VIVO ya está en producción** |
| Ciclo completo | #1708 (implementación) → migración 20261125120000 aplicada en producción (acta propia) → #1709 (script+acta de aplicación) → #1710 (recepciones/catálogo, ciclo paralelo) → #1712 (certificación + fix) |
| Estado final del ciclo CP-POS | **CIERRE FUNCIONAL COMPLETADO** — certificación E2E desde la interfaz 7/7, conciliación financiera independiente 44/44, defecto del modal corregido y desplegado; smoke transaccional de producción PENDIENTE (único hito abierto, runbook en §5) |

---

## 0. Principio de la certificación

Las pruebas **API/integración** del ciclo ya estaban documentadas (E2E-POS-001…018, 21/21 en BD aislada;
payload tests; escenarios A–O en RESULTADOS.md §9). Esta certificación **no las repite**: las usa como
evidencia previa y cierra lo que faltaba — **la validación funcional desde la INTERFAZ REAL** (usuario que
agrega productos, asigna el pago de cada producto, confirma) más una **conciliación financiera independiente**
y la verificación de efectos colaterales (inventario/caja), re-ejecutables como artefactos versionados.

---

## 1. Entornos y evidencia

| Entorno | Qué se certificó | Evidencia |
|---|---|---|
| **BD aislada CostproE2E** (`lguovmvrozxgssupkwpf`) + app local `2a0368785` | Certificación funcional E2E completa (interfaz real, Playwright) + conciliación financiera independiente + inventario/caja + idempotencia UI + móvil | `e2e/flows/pos-peritem-cert.spec.ts` (7/7 PASS) + `scripts/cert-pos-conciliacion.mjs` + actas `evidencia/certificacion/CONCILIACION_*.md/.json` + 8 capturas `evidencia/certificacion/cert-*.png` |
| **Producción** (`wthkddeleylijmonclxg` / costpro4) | SOLO verificación read-only: deploy, health, firma `/35`, columna, fail-closed (previo) | Acta de migración + sondas read-only (§5 abajo) |

**Distinción explícita (§13 de la misión):** la **certificación funcional en entorno aislado está COMPLETA**;
la **ejecución transaccional en producción permanece PENDIENTE** (motivo y runbook en §5). No se declara
«100% certificado».

---

## 2. FASE 1 — Auditoría del flujo (interfaz → BD)

Recorrido verificado con la implementación real (recon + código):
`Cajero Express (POSExpressMode) → «Configurar pago» por línea (POSExpressPaymentModal + PaymentRowsEditor,
compartido con el carrito clásico) → store del carrito (CartItem.payments[]) → usePOSCheckout construye
items[].payments (método canónico, moneda, importe, referencia, ajuste, tasa) → POST /api/pos/checkout
(zod; ERR_ITEM_PAYMENTS_INVALID→422) → RPC create_sale_v2 **/35** → transaction_items.payment_distributions
(por línea) + payment_transactions (ledger consolidado con moneda original + amount_cup) + transactions
(totales, customer_name/CI) → stock_movements (movement_type 'sale', reference_id = venta) + inventory (delta).

Interfaz y backend usan el MISMO contrato (mismos valores canónicos: `cash|transfer|external_transfer`;
normalización `zelle→external_transfer` en ambos extremos). Sin llamadas antiguas: la firma `/34` fue
eliminada por la migración y la ruta/envío compilados contra `/35` con `p_customer_ci` condicional.

**Hallazgo de arquitectura (no defecto):** `payment_distributions` no se renderiza en ninguna vista — el
detalle de venta muestra el desglose consolidado del ledger (autoridad financiera). Las distribuciones por
línea son la trazabilidad persistida; su lectura UI sigue siendo el carrito pre-confirmación (chips + resumen).

---

## 3. FASE 2/5/7 — Pruebas funcionales E2E desde la interfaz (aislada)

Suite versionada `e2e/flows/pos-peritem-cert.spec.ts` — **7/7 PASS** (report: 6 expected / 0 unexpected /
0 flaky; guard de higiene net-zero PASS en todos los runs). Datos: tienda piloto del run + 6 productos
controlados (100/150/450/120/80/60) + tasa USD leída de BD (450).

| Test | Escenario (§misión) | Resultado | Evidencia |
|---|---|---|---|
| **CERT-UI-A** | **Prueba A/C**: 3 productos (A 100 CUP efectivo · B 150 CUP transferencia + ref · C 450 CUP **Transf. Exterior USD 1.00** a la tasa vigente) desde la interfaz real: buscador SKU → «Configurar pago» por línea → chips por línea (Efect./Transf./Ext.) → pestaña «Datos de transferencia» (cliente + CI + **una referencia POR operación**) → Confirmar | **PASS** | capturas `cert-desktop-express-3productos/pagos-asignados/confirm-datos-transferencia.png`; DB: distribución por línea exacta (cash CUP 100 / transfer CUP 150+ref / external USD 1+ref+**exchange_rate 450**), total 700, customer_name+CI persistidos |
| **CERT-UI-D** | **Prueba D** (validaciones negativas en UI, sin crear ventas inválidas): carrito vacío → «Cobrar» disabled; importe 200 → **«Sobrepago»** visible; importe 0 → **«Falta»** visible; transferencia sin referencia → botón **«Completar datos»** (fail-closed, sin «Confirmar»), redirige a la pestaña de datos, **0 POST** de checkout; vaciar carrito | **PASS** | assertion `posted=false` + DOM snapshot del run |
| **CERT-UI-B** | **Prueba B**: 3 productos, mismo método (efectivo): una fila de distribución por línea (sin duplicados), sin datos personales (customer_name/CI **null**), ledger solo cash, Σ=total | **PASS** | DB verificada en test + acta de conciliación |
| **CERT-UI-I+C** | **Prueba C + §7 idempotencia**: 2 productos, 2 métodos independientes (cash 120 / transferencia 80+ref) + **doble clic en Confirmar** → exactamente **1 venta** (botón se deshabilita durante el procesamiento; sin duplicados en stock ni ledger) | **PASS** | `transactions` con ese total: count=1; delta inventario −1/−1 |
| **CERT-UI-E** | **Prueba E** (persistencia): reload del navegador → Historial de Ventas → búsqueda por ID de la venta → detalles: «Mixto / CUP+USD / Completada», desglose consolidado (Efectivo 100 · Transfer. 150 · **US$1.00 ≈ $450**), tasa aplicada «1 USD = 450 CUP», artículos y total — sin depender del estado del navegador | **PASS** | captura `cert-desktop-detalles-venta.png` |
| **CERT-UI-M** | **FASE 7 móvil** (390×844): barra móvil visible, carrito móvil (panel dedicado), «Configurar pago» dentro del panel, venta completa con QR + ID verificable + mecanismo «Deshacer (30s)» | **PASS** | capturas `cert-movil-*.png` |
| **CERT-CONCILIACION** | **FASE 3** — conciliación financiera INDEPENDIENTE (proceso y código aparte, ANTES del cleanup, sobre la BD) | **PASS — 44/44** | acta §4 |

Errores JavaScript/peticiones fallidas: ninguna durante los flujos (los tests habrían fallado; `posted=false`
verifica ausencia de POST en el flujo inválido).

---

## 4. FASE 3/4 — Conciliación financiera independiente (acta 44/44)

`scripts/cert-pos-conciliacion.mjs` (read-only, REST service-role sobre la aislada) re-verifica cada venta
capturada por la interfaz, **sin reutilizar las aserciones de los tests**. Reglas aplicadas (contrato CP-POS):

- Equivalente CUP de una distribución = `amount × exchange_rate` (CUP ×1) — **las monedas NUNCA se suman
  entre sí** (CUP 250 + USD 1 se reportan por separado).
- El ledger (`payment_transactions`) es la autoridad consolidada: `amount_cup` por fila y moneda original preservada.

Verificaciones por venta (4 ventas: A=700, B=300, I+C=200, M=60 — **44/44 OK**):

| Check | Contenido | Resultado |
|---|---|---|
| C1 | Σ (cantidad × precio por línea) = `transactions.total_amount` | OK ×4 |
| C2 | Σ distribuciones (equivalente CUP con la tasa REGISTRADA en cada fila) = total | OK ×4 |
| C3 | Σ `payment_transactions.amount_cup` = total | OK ×4 |
| C4 | Por método: distribuciones vs ledger (cash/transfer/external_transfer) | OK ×4 |
| C5 | Por moneda ORIGEN (CUP vs USD, sin conversión ni mezcla) | OK ×4 |
| C6 | Cada distribución vinculada a su línea (product_id) | OK ×4 |
| C7 | Toda transferencia con monto>0 lleva su número de operación | OK ×4 |
| C8 | Inventario: delta exacto −cantidad por línea + UN movimiento 'sale' con `reference_id` = venta | OK ×4 |
| C9 | Sin filas de ledger huérfanas (nada contabilizado dos veces) | OK ×4 |
| C10 | Moneda original preservada + `amount_cup` coherente con la tasa (sin redondeos indebidos) | OK ×4 |
| C11 | Datos del cliente exactos con transferencia (F) y null sin ella (G) | OK ×4 |

Ejemplo (venta A): distribuciones {cash CUP 100} + {transfer CUP 150, ref} + {external USD 1, ref, rate 450}
⇒ CUP 100 + 150 + 450 = **700** = Σ líneas = Σ ledger = total. USD conservado como 1.00 USD (≈450 CUP).
Acta completa: `evidencia/certificacion/CONCILIACION_2026-11-25T15-45-47.{md,json}`.

---

## 5. FASE 6 — Producción: verificación read-only y estado del smoke transaccional

Verificado HOY (read-only, canal Management API):

1. Deploy de Vercel: main `2a036878` → **success**; `GET /api/health` → **200**.
2. Estructura de la funcionalidad: `create_sale_v2` firma `/35` (1 overload) ✓ · `transaction_items.payment_distributions` ✓ (acta de migración 10/10).
3. Fail-closed en producción (misión anterior, cero escrituras): llamada sin JWT → `ERR_UNAUTHORIZED` (AUTH §3.1 antes de cualquier INSERT).
4. Uso real: **0 ventas con distribuciones en producción** (la funcionalidad aún no se ha usado en operación real).
5. **Mecanismo de prueba en producción:** existe la tienda `QA UI Icons Store` (activa, productos etiquetados
   `QA-ICON-001/002`, cuentas QA `qa.ui.icons.20261108@costpro.test` (admin) y `qa.stores.cmp.20261108@costpro.test`,
   expediente `docs/audits/2026-11-08-iconos-colapsados-svg/INFORME.md`), **pero NO está operativa para ventas**:
   sin filas de inventario (ERR_INSUFFICIENT_STOCK garantizado) y sin credenciales disponibles en esta sesión
   (la contraseña de la cuenta QA no está documentada en el repo).

**Decisión (cláusula prevista por la misión):** habilitar el smoke en producción exigiría una cadena de
escrituras NO autorizadas explícitamente (restablecer credenciales QA + entrada de inventario + venta +
reversión), por lo que **la ejecución transaccional en producción queda EXPRESAMENTE PENDIENTE**, con este
runbook para ejecutarla en una sesión futura (≈15 min):

1. Proporcionar/restablecer la contraseña de `qa.ui.icons.20261108@costpro.test` (canal admin de Auth).
2. Con esa cuenta en costpro4: añadir stock a `QA-ICON-001/002` desde la UI (flujo normal de inventario).
3. Ejecutar la suite de certificación contra producción: `CERT_ENV=prod CERT_OUT=... bunx playwright test e2e/flows/pos-peritem-cert.spec.ts` (variante de fixtures apuntando a la tienda QA; `cleanupProducts` DESACTIVADO — nada se borra por SQL).
4. Verificar las distribuciones/ledger/inventario de las ventas QA (script de conciliación con ref producción).
5. **Reversión por el flujo empresarial**: «Revertir venta (invierte stock + kardex)» del Historial de Ventas (mismo canal UI) + verificación de la reversión.
6. Documentar IDs de las operaciones en el expediente.

---

## 6. FASE 8 — Defecto detectado y corregido durante la certificación

**Defecto (bloqueante para el uso real del modal):** `POSExpressPaymentModal` montaba el **snapshot** del
ítem capturado al abrir (`payingItem` en `useState`): el select de método, la validación de cuadre
(«Pago completo/Sobrepago/Falta») y el campo condicional de referencia quedaban **congelados** aunque el
store del carrito sí registraba los cambios (el chip de la línea mostraba el valor real). El cajero no veía
lo que seleccionaba; «Agregar Pago» no mostraba la fila nueva.

- **Causa raíz:** props congeladas + solo `getState()` (sin suscripción) en el modal de Express.
- **Corrección mínima y consistente:** resolver el ítem VIVO del store por identidad
  (`livePayingItem = useCartStore(s => s.items.find(...))`) en `POSExpressMode.tsx`; el modal pasa a
  re-renderizar con cada cambio (método/moneda/importe/referencia/filas). Cero reglas nuevas.
- **Regresión automatizada:** `§FIX-SMOKE-001` en `pos-express-per-item-payments.test.tsx` — ajustar el
  importe a 900 con el modal abierto debe mostrar «Sobrepago» y el valor vivo 900 (fallaba antes del fix).
- **Puertas:** vitest POS 37/37 + payload/per-item 177/177 + ESLint 0 errores en archivos tocados.
- Evidencia del hallazgo: captura del primer run (`error-context.md` del run E2E-20261125-A3AA40) donde el
  modal mostraba «Efect.» con el chip ya en «Transf.».

---

## 7. MATRIZ DE RESULTADOS (§11 de la misión)

| Prueba | Entorno | Resultado | Evidencia |
|---|---|---|---|
| Venta con pagos por producto (A) | E2E UI aislada | **PASS** | CERT-UI-A + conciliación C1-C7 |
| Diferentes formas de pago (3 métodos, USD×tasa) | E2E UI aislada | **PASS** | CERT-UI-A (chips + DB + acta) |
| Varios productos mismo pago (B) | E2E UI aislada | **PASS** | CERT-UI-B (sin duplicados, null cliente) |
| Validaciones negativas (D) | E2E UI aislada (+ API 015/016/017 previas) | **PASS** | CERT-UI-D (Sobrepago/Falta/Completar datos/0 POST) |
| Persistencia (E) | E2E UI aislada | **PASS** | CERT-UI-E (reload + detalles + desglose) |
| Conciliación financiera | Aislada (proceso independiente) | **PASS 44/44** | acta CONCILIACION_*.md |
| Distribuciones en BD | Aislada | **PASS** | payment_distributions por línea (C2/C4/C5) |
| Inventario | E2E aislada | **PASS** | C8: Δ exacto + 'sale' único por línea |
| Caja (ledger payment_transactions) | E2E aislada | **PASS** | C3/C4/C10 (moneda + amount_cup + sin duplicar) |
| Idempotencia (doble clic UI) | E2E UI aislada (+ API E2E-POS-002 previa) | **PASS** | CERT-UI-I+C: 1 venta exacta |
| Seguridad y RLS | Aislada (401/403/409 previos) + producción fail-closed | **PASS** | E2E-POS-005/006/007 previos + ERR_UNAUTHORIZED en producción |
| Interfaz móvil | E2E UI aislada | **PASS** | CERT-UI-M (panel móvil + venta completa) |
| **Ejecución transaccional en producción** | **Producción** | **PENDIENTE** | §5 (runbook) — tienda QA sin inventario/credenciales |

---

## 8. Condiciones de cierre (§13 de la misión)

1. Pagos por producto funcionan desde la interfaz ✓ (aislada, 7/7)
2. Distribuciones persistidas ✓ (C2/C4/C5/C6)
3. Importes conciliados ✓ (44/44, moneda por origen)
4. Sin duplicaciones ✓ (C9 + doble clic + B sin duplicados)
5. Inventario y caja correctos ✓ (C8 + C3/C10)
6. Consulta posterior conserva los datos ✓ (CERT-UI-E)
7. Controles de seguridad ✓ (fail-closed UI + API/RLS previos + producción)
8. Pruebas automatizadas aprobadas ✓ (7/7 E2E + 13/13 + 177/177 unit + CI del PR)
9. Evidencia funcional reproducible ✓ (spec + script versionados; artefactos en evidencia/)
10. Worklog y expediente actualizados ✓

**Veredicto:** certificación **FUNCIONAL COMPLETA en entorno aislado** (interfaz real, conciliación exacta,
colaterales íntegros) + verificación estructural y fail-closed en producción. La **ejecución transaccional
en producción queda PENDIENTE** (runbook §5) — el ciclo CP-POS se cierra funcionalmente; el smoke
transaccional de producción es el único hito abierto, y no se declara «100% certificado».
