# ENERVIDA 05/10/2026 — FLOW DISCOVERY (FASE 2)

> **Propósito**: Documentar el flujo REAL de Venta, Vale de Salida (VS), Devolución (DV) y Orden de
> Trabajo (OT) en CostPro, con evidencia verificada en código/migraciones/DB viva, ANTES de importar
> las 26 operaciones del 05/10/2026 de la tienda ENERVIDA-VITALLCONS.
>
> **Regla cumplida**: NADA se importó antes de completar este documento. Toda consulta DB fue READ-ONLY.
>
> - Repo: `main` @ `985e34974` (origin/main sincronizado) · versión 0.2.0
> - Tienda objetivo: **ENERVIDA-VITALLCONS** `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (is_active=true).
>   Coincidencia de nombre única: la otra tienda con "VITALLCONS" es `Puerto Padre VITALLCONS`
>   `43a4dabc…` — **PROHIBIDA por mandato, no se consulta ni toca**.
> - Operador: **admin@demo.com** = `a1111111-1111-1111-1111-111111111111` (profiles.role=`admin`,
>   `user_store_memberships` role=admin status=**active** en la tienda objetivo,
>   `profiles.active_store_id` = tienda objetivo). Login real verificado vía Supabase Auth
>   (grant_type=password, expira 3600s). **Sin service_role para operar.**
> - Contexto: esta importación **continúa el proyecto ENERVIDA-EXCEL-IMPORT** (migraciones
>   `2026100412000*` "APROBADAS por el usuario", FASE 17 del mandato previo): agregan
>   `p_operation_date` retro-compatible a `create_vale_salida` y `create_devolution_v2` para
>   fechar operaciones históricas. En DB existen 125 `issue_slips`, ventas con idempotencia
>   `enervida-imp-ven-<fila>` y devoluciones NC-000014/15-2026 con ese marcador de origen.

---

## 1. VENTA

### 1.1 UI (verificado en código)

```text
Sidebar: Operación → Vender        (ViewType 'pos'; nav id 'pos', label "Vender")
  ↓ POSView (src/components/views/terminal/views/pos/)
  ↓ POSCart — toggle de tipo de operación [Venta] [VS] (operationType 'sale' | 'vs')
  ↓ Añadir productos (catálogo/escáner) → tab Pago
  ↓ método de pago (cash | transfer | zelle | mixed), descuento (si ≥15% de desvío → SupervisorAuthModal)
  ↓ botón confirmar (id=pos-checkout-cta)
  ↓ usePOSCheckout → POST /api/pos/checkout
```

- Ruta/deep-link: vista `pos` (persistida en `useUIStore.currentView`).
- Componentes: `POSCart.tsx`, `POSCheckoutPanel` (checkout V2), `usePOSCheckout.ts`.
- El checkout V2 es el ÚNICO camino online: la ruta V1 fue eliminada por
  `20261005140000_drop_v1_sale_devolution.sql` (contrato canónico FASE 3).

### 1.2 Backend (cadena real, sin pasos inventados)

```text
Usuario (JWT admin@demo.com)
 ↓ POST /api/pos/checkout  (withAuth Bearer + validateOrigin CSRF + rate-limit 30/min)
 ↓ Zod checkoutSchema (incluye operation_date ISO opcional; items[], payment_method, split de pagos)
 ↓ RPC create_sale_v2  (SECURITY DEFINER; migración 20261004130000_h0r_create_sale_v2_hardening.sql)
   1. pg_advisory_xact_lock(hashtext(store_id))         — serializa ventas concurrentes
   2. AUTH: has_store_access_as(actor, store)           — ERR_UNAUTHORIZED
   3. SELLER BINDING: p_seller_id == auth.uid()          — ERR_SELLER_REQUIRED/MISMATCH (H0-R §4)
   4. validate_operation_date(p_operation_date, store)   — 6 meses atrás / +1 día futuro (TZ America/Havana)
   5. IDEMPOTENCIA: idempotency_registry + param_hash exhaustivo — ERR_IDEMPOTENCY_KEY_REUSE
   6. Por ítem: lock FOR UPDATE products → stock (ERR_INSUFFICIENT_STOCK),
      DF-02: cost_average=0 exige w62_zero_cost_flags(scope='sale') — ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED
   7. Precio: referencia SERVER (products.price); desvío solo si price < referencia;
      ≥15% → gate supervisor E-SEC-FINAL D1–D5 (token single-use + motivo); venta ≥ catálogo no dispara gate
   8. Impuestos: validados/reconstruidos server-side desde tax_configurations (ERR_APPLIED_TAX_INVALID)
   9. Tasa: resolución server-side (cliente solo informativa, D-EXR-01/02)
  10. INSERT transactions (status='completed', subtotal/total recalculados server-side,
      cash/transfer/zelle amounts, sale_exchange_rate servidor)
  11. Por ítem: register_stock_movement(-unidades, type='sale') [salta is_service]
      + INSERT transaction_items (price_at_sale, cost_at_sale=WAC server)
  12. INSERT payment_transactions por método (idempotency_key 'pay-cash/transfer/zelle-<tx>')
  13. Invariante PT011: SUM(payment_transactions.amount_cup) == total (±0.01) — ERR_PAYMENT_INVARIANT_VIOLATED
  14. UPDATE idempotency_registry (resultado definitivo)
  15. INSERT audit_logs ('CREATE_SALE_V2', metadata completa: líneas, descuento, supervisor_path, tasas)
 ↓ Respuesta: {status:'success', transaction_id, calculated_total,...}
```

- Tablas tocadas: `transactions`, `transaction_items`, `stock_movements`, `products.stock_current`,
  `payment_transactions`, `idempotency_registry`, `audit_logs`, `business_events`.
- Consulta posterior: vista **Historial de Ventas** (`history`), Caja (`cash`), reportes; pagos en
  `payment_transactions` (fuente autoritativa).
- Reversión: `useReverseDocument` → `POST /api/reverse` → RPC `reverse_transaction_v2`
  (stock + kardex + auditoría; exige motivo ≥3 chars).

### 1.3 Evidencia real (operación existente, no inventada)

Transacción `d939ea06-b328-42f8-ac42-931f201e81c2` (importación previa 04/10):
`audit_logs` action=CREATE_SALE_V2, user_id=a1111111…, policy_version=E-SEC-FINAL,
metadata con lines/subtotal/cash_amount/v2_checkout=true. `transactions.seller_id` = a1111111…
(el propio operador).

---

## 2. VALE DE SALIDA (VS) — investigación especial

### 2.A ¿Qué es realmente un VS en CostPro? (respuestas con evidencia)

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Es diferente de una Venta? | **SÍ** — operación de salida de inventario SIN venta comercial | `ValeSalidaPanel.tsx` banner: "Descuenta productos del inventario sin generar venta comercial"; tabla propia `issue_slips` |
| ¿Reduce inventario? | **SÍ** — `register_stock_movement(-qty, 'issue_slip_out')` + kardex | migración `20261004120000`, líneas 110-117 |
| ¿Genera ingreso? | **NO** — no crea `transactions` ni `transaction_items` | cuerpo RPC: no toca tablas de venta |
| ¿Genera caja? | **NO** — no crea `cash_movements` ni sesiones | idem |
| ¿Genera cuentas por cobrar? | **NO** | idem |
| ¿Tiene pago? | **NO** — "el vale no tiene pago comercial" | `useValeSalidaCheckout.ts` header punto 3 |
| ¿Tiene precio de venta? | **NO** — el cliente no envía precio alguno | Zod `/api/vale-salida`: solo product_id/variant_id/quantity/po_item_id |
| ¿Tiene costo histórico? | **SÍ** — `unit_cost = products.cost_average` (server-side, lock FOR UPDATE; DF-09 firma v3 si OT) | RPC líneas 106-108 |
| ¿Tiene reversión? | **NO dedicada** — `ReversibleDocType` NO incluye 'vale_salida' (solo transaction/receipt/transfer/adjustment/devolution/production_order) | `useReverseDocument.ts` |
| ¿Tiene auditoría? | **SÍ** — `audit_logs` action=`CREATE_VALE_SALIDA` con slip_number, total_cost, operation_date | RPC líneas 133-137 |

### 2.B ¿Necesita Orden de Trabajo? → **OT OPCIONAL** (no asumido: demostrado)

1. **RPC**: `create_vale_salida(p_production_order_id uuid DEFAULT NULL)`; rama
   `IF p_production_order_id IS NOT NULL … ELSE register_stock_movement(...)`: existe camino
   explícito sin OT (migración `20261004120000`, líneas 79/99).
2. **API**: `/api/vale-salida` Zod `production_order_id: nullable().optional()`.
3. **UI**: `ValeSalidaPanel` selector con opción por defecto **"— Sin OT (solo descuenta stock) —"**
   (línea 224); la OT selector solo lista OTs en estados `approved|in_progress|paused` (línea 107).
4. **Constraints**: no hay FK obligatoria ni CHECK que exija OT; `issue_slips.production_order_id` es nullable.
5. **Tests/DB viva**: 125 `issue_slips` históricos, todos `production_order_id=NULL` en la muestra
   (VS-000069, VS-000118, VS-000125…).

**Con OT** (rama alterna): cada ítem DEBE llevar `production_order_item_id`; valida producto/variante
contra `production_order_items`; llama `withdraw_production_item_v3` (DF-09: costo server-side,
actualiza `actual_qty` de la línea, ERR_OVERCONSUMPTION si excede presupuesto).

### 2.C ¿Notas? → **OBLIGATORIAS en la práctica real**

- API: Zod `notes: z.string().min(1).max(2000)` (ruta `vale-salida/route.ts` línea 44; errores
  `ERR_NOTES_REQUIRED` mapeados).
- UI: textarea obligatorio; botón deshabilitado sin notas (líneas 188-193, 350).
- El RPC acepta `p_notes DEFAULT NULL` (la obligatoriedad la pone la capa app); en DB los 125 vales
  históricos tienen notas. **Decisión de importación: notas SIEMPRE presentes** (convención previa:
  `<nota original> | fila Excel <N>`).

### 2.D ¿Dónde está la UI? → **NO existe vista independiente "Vale de Salida"** (explícito)

- El nav (`navigation-definition.ts`) NO tiene item propio: el modo VS vive **dentro del POS**
  ("Operación → Vender"), descrito en el item de nav: "Incluye el modo Vale de Salida".
- Crear: POS → toggle [VS] → carrito → ValeSalidaPanel → "Emitir Vale".
- Consultar: no hay listado dedicado de vales en nav; la trazabilidad queda en **Inventario →
  Trazabilidad (KardexModal)** (`stock_movements` con movement_type `issue_slip_out`,
  reference_doc="Vale de Salida VS-000NNN-YYYY") y en tabla `issue_slips` (vía DB/reports).
- Revertir: sin endpoint dedicado (ver 2.A); corrección por Ajuste de Inventario documental
  (`process_inventory_adjustment`, mecanismo real existente).

### 2.E Flujo real (salido del código, no del supuesto)

```text
POS → toggle [VS]
      ↓
Carrito (productos/cantidades) + [opcional] OT + [opcional] líneas de OT por ítem
      ↓
Notas (obligatorias) + preview de costo (estimado; servidor usa cost_average)
      ↓
"Emitir Vale" → useValeSalidaCheckout → POST /api/vale-salida (Bearer JWT)
      ↓ store_id derivado de profiles.active_store_id; user_id del JWT (TRUST BOUNDARY H2)
RPC create_vale_salida
      ├─ validate_operation_date + has_store_access_as + idempotencia (type 'vale_salida')
      ├─ next_document_number(store,'vale_salida') → VS-000NNN-YYYY
      ├─ INSERT issue_slips (notes, total_cost)
      ├─ por ítem: [con OT] withdraw_production_item_v3 / [sin OT] register_stock_movement(-qty,'issue_slip_out')
      ├─ INSERT issue_slip_items (unit_cost, total_cost)
      └─ audit_logs CREATE_VALE_SALIDA
      ↓
stock_movements (kardex) + products.stock_current actualizados
```

### 2.F Ejemplo real completo (reconstruido de DB — VS-000125-2026, importación 04/10)

```text
issue_slips      b46b7a6e-7545-4bb7-b826-06ed8b1081b8 | VS-000125-2026 | notas "Belki | fila Excel 815"
                 | total_cost=2 | production_order_id=NULL | created_at=2026-10-02T16:00Z
issue_slip_items 1 fila: product d1afd532… (Cemento TBV 50 Kg) qty=2 unit_cost=1 total=2
stock_movements  c3320b34… | quantity_change=-2 | movement_type='issue_slip_out'
                 | unit_cost=1 | reference_doc='Vale de Salida VS-000125-2026' | movement_date=2026-10-02T16:00Z
products         Cemento TBV 50 Kg: stock_current actualizado, cost_average=1
audit_logs       CREATE_VALE_SALIDA | user a1111111… | created_at=2026-10-04T05:10Z (tiempo real)
                 | metadata.import_origin='ENERVIDA-EXCEL-IMPORT', operation_date=2026-10-02T16:00Z
UI consulta     Inventario → Trazabilidad (Kardex) muestra la salida con su documento
```

Patrón confirmado: **documento retro-fechado, auditoría en tiempo real**.

---

## 3. DEVOLUCIÓN (DV)

### 3.1 UI real

```text
Sidebar: Operación → Ventas → Opciones → Devoluciones   (ViewType 'devolutions')
  ↓ DevolutionsView.tsx — listado GET /api/devolutions (NC con trazabilidad por tienda)
  ↓ "Nueva Devolución" (CreateDevolutionModal) → POST /api/devolutions
  ↓ [V2.2] ReverseDocumentModal — reversión contable (POST /api/reverse → reverse_devolution)
  ↓ [V2.4] DuplicateDocumentModal — duplicado como plantilla
```

⚠️ **Gap UI↔contrato detectado (HELP-02)**: `CreateDevolutionModal` NO envía
`original_transaction_id` ni `payment_method`, pero el RPC `create_devolution_v2` exige la venta
original (`ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original`). Toda devolución real
hoy debe pasar por el RPC con `p_original_transaction_id` (así se importaron NC-000014/15).

### 3.2 Backend real (RPC `create_devolution_v2` — único camino, FINALIZE-V2)

```text
Venta original (transactions, misma tienda) ← OBLIGATORIA (lock FOR UPDATE)
      ↓
create_devolution_v2(p_store_id, p_items, p_reason, p_original_transaction_id, p_payment_method,…)
      ├─ validate_operation_date (p_operation_date, añadido por 20261004120001)
      ├─ idempotencia: devolutions.idempotency_key (retorna 'idempotent' si existe)
      ├─ has_store_access_as(actor, store) — ERR_UNAUTHORIZED
      ├─ DF-07 tope acumulado por (venta, producto): devuelto+solicitado ≤ vendido —
      │   ERR_DEVOLUTION_CAP_EXCEEDED (evita doble devolución)
      ├─ next_document_number(store,'credit_note') → NC-000NNN-YYYY
      ├─ INSERT devolutions (status='completed', currency 'CUP') + devolution_items
      ├─ por ítem: register_stock_movement(+qty, 'return', unit_cost=cost_at_sale de la venta
      │   original, fallback cost_average) → vuelve inventario + kardex
      ├─ DF-03 contra-asiento financiero (total>0 obligatorio — ERR_DEVOLUTION_AMOUNT_POSITIVE):
      │   cash/transfer/zelle → cash_movements('out') en sesión abierta (find-or-create)
      │   + payment_transactions(direction='refund');
      │   store_credit → store_credit_ledger (exige customer_id, caja intacta)
      └─ audit_logs DEVOLUTION_CREATED_V2 (devolution_number, original, cap_lock_df07, financial_contra_entry_df03)
```

- Consulta posterior: vista Devoluciones; documentos NC numerados; pagos refund en
  `payment_transactions`.
- Reversión: `POST /api/reverse` → `reverse_devolution` (descuenta el stock restaurado).

### 3.3 Evidencia real

NC-000015-2026 (devolution `5bf9dd7c…` origen): reason "Devolución fila Excel 614 (original fila
470) — importación ENERVIDA", total 199125, status completed, con items y refund registrados.

---

## 4. ORDEN DE TRABAJO / PRODUCCIÓN (OT)

- Creación: vista **Órdenes de Producción** (ViewType `production-orders`, nav "Costo → Órdenes de
  Producción y Trabajo"); API `src/app/api/production-orders/route.ts`; tabla `production_orders`
  (+`production_order_items` con budgeted_qty/actual_qty), `order_number` serie OP-2026-NNNNN.
- Estados: `09-estados-orden-produccion.md` (Centro de Ayuda) y filtro UI
  approved/in_progress/paused para vales.
- Relación con VS: el VS con OT descuenta stock Y `actual_qty` de la línea de OT vía
  `withdraw_production_item_v3` (DF-09), con guard ERR_OVERCONSUMPTION (presupuesto) y
  ERR_ORDER_NOT_EDITABLE (estado).
- Pagos/liquidación: los pagos de venta viven en `payment_transactions`; la liquidación de costos
  de OT vive en Fichas de Costo/Costeo (fuera del alcance de estas 26 operaciones — no se toca).
- **Búsqueda de OT/54, OT/Ferro, OT/46 en DB (1000 últimas OTs, cualquier tienda): 0 coincidencias.**
  Conclusión: esas referencias del papel NO existen como OT en CostPro → no se fabrican. Las filas VS
  que las mencionan se registran por el **flujo real sin OT** con la referencia preservada en notas
  (mecanismo legítimo 2.B), y así queda documentado.
- Precedente: la importación del 04/10 creó OTs reales (OP-2026-00186…00203, customer_name "Cliente
  OT XX/26 (importación Excel ENERVIDA)") — en ese mandato previo se demostró ese flujo; para estas
  26 filas **no hay base** para crear OTs nuevas (los vales referencian OTs externas al sistema).

---

## 5. COMISIÓN (columna del papel) — mecanismo real y veredicto de representabilidad

- Subsistema real: `workers` → `commission_rules` → `POST /api/commissions/calculate`
  (`src/lib/commission-engine`) → `commission_payments` (trigger `trg_calc_commission_cup`), visible
  en vista **Trabajadores y Comisiones** (`workers`) y `13-como-pagar-comisiones.md`.
- Estado real de ENERVIDA: `workers` = **0 filas**, `commission_rules` = **0 filas** (consultado hoy).
- La venta (`create_sale_v2`) NO genera comisión automática ni tiene campo de notas.
- **Veredicto**: la columna "Comisión" (~1% en 7 ventas: 400/200/50/50/300/200/600 = 1,800 CUP)
  NO es materializable mediante flujo real sin crear antes trabajadores+reglas (configuración nueva
  no autorizada en este mandato). Se preserva el dato en la trazabilidad (CSV + reporte) y se
  reporta como LIMITACIÓN; no se fabrica ningún registro de comisión.

---

## 6. MATRIZ DE IMPORTACIÓN (consecuencia del discovery) — 26 filas

Clasificación de las 26 filas del 05/10/2026 (código = `products.sku`, verificado que existen los
20 códigos; nombres coinciden con variantes menores de grafía):

| Clase | Filas | Mecanismo real a usar | Estado |
|---|---|---|---|
| Venta | 10 (cód. 48,141×4,19,112,84,22,34) | `POST /api/pos/checkout` (operation_date 05/10, cash/transfer, precios del papel; ninguno dispara gate de descuento porque todos son ≥ catálogo) | 8 EJECUTABLES · **2 BLOQUEADAS DF-02** (48 Nudo de media, 112 Grapas metálicas: cost_average=0 sin `w62_zero_cost_flags` scope='sale'; la tabla de flags no tiene UI/RPC — se documentó, no se fabrica) |
| VS | 15 (9,139,103,147,29,35,45,55,77,81,97,106,112,111,141) | RPC `create_vale_salida` con JWT del operador + `p_operation_date`, notas preservadas | 15 EJECUTABLES (todas sin OT; referencias OT/54 etc. van en notas; stock suficiente verificado) |
| DV | 1 (cód. 9 Brecker D63 A qty 1) | `create_devolution_v2` exige venta original | **BLOQUEADA**: 6 ventas históricas candidatas (29/07→20/08) y el papel no identifica cuál; cap DF-07 disponible en todas, pero elegir una sería inventar → DETENERSE Y REPORTAR |

- Fechas: `2026-10-05T16:00:00+00:00` (12:00 America/Havana) — convención de la importación previa
  y dentro del gate validate_operation_date.
- Idempotencia: ventas `enervida-imp-20261005-ven-<n>` (convención previa `enervida-imp-ven-<fila>`);
  VS `enervida-imp-20261005-vs-<n>`; DV (si se autorizara) `enervida-imp-20261005-dv-1`.
- Nota mapeada a cada VS = columna "Descripción" del papel, verbatim. Las 4 notas sueltas del
  mandato ("Por venta de patas anteriores", "Dejado de pasar 4 unidades para Yila y 2 unidades para
  OT/53", "Belki", "Tienda Pueblo") no aparecen en la tabla pegada ni es posible mapearlas a filas
  concretas sin el Excel origen → **NO se inventa el mapeo; se reporta** (las VS ya conservan su
  descripción; el patrón previo `nota | fila Excel N` requiere la fila exacta).
- Semántica de stock: snapshot pre-import = "Existencia Inicial" del papel (verificado con SKU 141:
  DB stock_current=13 = "Inicial: 13" del mandato; y ninguna transacción del 05/10 existe aún).

---

## 7. ÍNDICE DE EVIDENCIA

- `supabase/migrations/20261004120000_enervida_import_vale_salida_operation_date.sql` (create_vale_salida completo)
- `supabase/migrations/20261004120001_enervida_import_devolution_operation_date.sql` (create_devolution_v2 completo)
- `supabase/migrations/20261004130000_h0r_create_sale_v2_hardening.sql` (create_sale_v2 /24, gates H0-R)
- `supabase/migrations/20261005140000_drop_v1_sale_devolution.sql` (contrato canónico V2 único)
- `supabase/migrations/20260817000003_validate_operation_date_6months.sql` (gate de fechas)
- `supabase/migrations/20260916000001_rem_inv_6…sql` (register_stock_movement canónico)
- `src/app/api/pos/checkout/route.ts` · `src/app/api/vale-salida/route.ts` · `src/app/api/devolutions/route.ts` · `src/app/api/reverse/`
- `src/components/views/terminal/views/pos/ValeSalidaPanel.tsx` · `useValeSalidaCheckout.ts` · `POSCart.tsx`
- `src/components/views/terminal/views/devolutions/DevolutionsView.tsx`
- `src/hooks/api/useReverseDocument.ts` · `src/store/index.ts` (ViewType) · `src/config/navigation/navigation-definition.ts`
- DB viva (read-only): issue_slips VS-000125-2026; transactions d939ea06 (ven-480); NC-000015-2026;
  157 productos ENERVIDA; 22 w62_zero_cost_flags; 0 workers; 0 commission_rules; 0 OTs "54/Ferro/46".

---

## 8. ADDENDUM GATE 16 (2026-10-06) — resolución de las 3 operaciones pendientes

Ejecución verificada de r01/r06/r19 (veredicto previo: CERTIFICADA CON BLOQUEOS → 26/26 completas).
Evidencia de código y DB viva; sin INSERT directos en tablas de operaciones; operador real `admin@demo.com`.

### 8.A Corrección de un hallazgo de esta misma discovery (§2/§5)

Esta discovery registró «¿Tiene reversión? NO dedicada» para el Vale de Salida. **Corrección**: la reversión
dedicada SÍ existe en backend — `src/app/api/vale-salida/[id]/reverse/route.ts` → RPC
`reverse_vale_salida` (`20260817000001_vale_salida.sql:538-660`): guard anti-doble-reversión (V-03),
`issue_slips.status='reversed'` + `voided_at/voided_by/void_reason`, movimiento compensatorio
`issue_slip_reverse` (+qty, kardex `in`), restauración de `production_order_items` si aplica, y
audit `REVERSE_VALE_SALIDA`. Lo que NO existe es superficie de UI (ningún componente invoca la ruta;
`ReversibleDocType` del modal genérico no incluye `vale_salida`; no hay historial de vales en pantalla)
ni tests. Clasificación: **gap de producto en capa de presentación** — corregido en
`knowledge/help/02-como-hacer/24-como-emitir-vale-salida.md`.

### 8.B r01 — devolución de la última salida (SKU 9, Brecker D63 A)

- Cadena reconstruida: producto 9 → última salida real = **VS-000126-2026** (id `c25aca39…`,
  `issue_slip_out` −1, bal 0, notas «OT/54 | fila 05/10/2026 #02 ENERVIDA», `production_order_id=NULL`).
- Ejecutado como **devolución de Vale de Salida, NO devolución de venta**: `POST
  /api/vale-salida/c25aca39…/reverse` con JWT real del operador (motivo documentado en el body).
- Consecuencias verificadas: status `reversed`, `voided_by` = operador, movimiento
  `issue_slip_reverse` +1 (bal 0→1, ref «Reversion Vale de Salida VS-000126-2026»), kardex `in`,
  audit `REVERSE_VALE_SALIDA`. WAC intacto (reversión de salida pura no lo toca). Stock final SKU 9 = 1.
- El kardex conserva AMBOS movimientos (salida −1 y devolución +1): trazabilidad completa.
- `create_devolution_v2` sigue sin aceptar vales (DF-07 exige venta): el documento «devolución de VS»
  como tipo aparte no existe en el producto; la reversión es el mecanismo funcional correcto.

### 8.C r06/r19 — desbloqueo DF-02 (cost_average=0) con tratamiento contable individual

Auditoría previa completa de ENERVIDA: **73 productos con cost_average=0** antes de GATE 16 (no solo 48/112).
Escritor canónico único del WAC: `fn_recalc_wac` (guard `trg_guard_wac_writer`:
`ERR_WAC_SINGLE_WRITER_VIOLATION` sin token `app.wac_writer` — probado empíricamente con ROLLBACK).
No existe vía canónica para fijar WAC sin entrada de stock (blend) ni RPC/UI para `w62_zero_cost_flags`.

| SKU | Caso | Evidencia | Decisión | Ejecución |
|-----|------|-----------|----------|-----------|
| 48 Nudo de media | **A — COSTO_REAL_RECUPERABLE** | receipt `fd9d6c88`: 38 uds × **250 CUP** (coherente) | WAC 0→**250** (la venta lleva COGS real; NO se sustituye por 1) | Escritura gobernada: token `app.wac_writer` + UPDATE individual + `wac_change_log(event='wac_correction', source_ref, changed_by=admin)` — réplica exacta del protocolo de `fn_recalc_wac` |
| 112 Grapas metalicas | **B — COSTO_NOMINAL_1_JUSTIFICADO** | Sin costo real fiable: receipt dice **1000 USD/ud** y movement 680000 (incoherentes con precio 1000 CUP) | WAC 0→**1** nominal (precedente de tienda: SKU 141 WAC=1 mismo papel; 43 `reception_in` + 32 `adjustment_plus` con uc=1 en `wac_change_log`) | Ídem (escritura gobernada individual auditada) |

- Clasificación de los 71 restantes (post-corrección): **44 COSTO_REAL_RECUPERABLE** (receipt CUP coherente),
  **14 COSTO_ZERO_LEGITIMO** (sin movimientos jamás), **13 REQUIERE_DECISION_CONTABLE** (costos USD
  incoherentes — patrón sistemático del Excel: costo duplica precio con moneda USD).
  Detalle: `scripts/gate16_zero_cost_audit.json`. Ninguno modificado automáticamente.
- Ventas ejecutadas después de la corrección: r06 → tx `1680f409…` (1 × 250 cash, `cost_at_sale=250`,
  stock 38→37), r19 → tx `acc2b470…` (3 × 1500 cash, `cost_at_sale=1`, stock 78→75). Idempotencia
  `enervida-imp-20261005-048` / `-112`. Audit `CREATE_SALE_V2`, movimiento `sale`, fechas 05/10T16:00Z.

### 8.D Verificación final GATE 16

- Reconciliación global: **157/157 delta=0** (baseline 02:55Z + movimientos de los 26 documentos;
  composición exacta: 10 `sale` + 15 `issue_slip_out` + 1 `issue_slip_reverse`).
- Objetivo del mandato cumplido SKU a SKU (9→1, 19→16, 22→78, 29→503, 34→0, 35→56, 45→1, 48→37,
  55→0, 77→0, 81→0, 84→35, 97→0, 103→2, 106→0, 111→45, 112→75, 139→18, **141→4**, 147→7).
- Aislamiento de mutaciones: **0 movimientos externos** a los 26 documentos con `created_at ≥ baseline`.
- 25 claves de idempotencia (23 previas + 048 + 112); la devolución r01 no usa clave (guard V-03).
- «125 VS sin OT»: verificación exhaustiva (no muestral): **140/140 issue_slips con
  `production_order_id=NULL`** (125 históricos + 15 de la importación; 14 `completed` + 1 `reversed`).
- CSVs finales: `ENERVIDA-2026-10-05-OPERATIONS.csv` (26 filas, r01/r06/r19 = OK) y
  `ENERVIDA-2026-10-05-RECONCILIATION.csv` (157 filas, delta=0).
