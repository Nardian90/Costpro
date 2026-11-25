# MAPA DE PROCESOS TRANSVERSALES — COSTPRO 4
**Estándar:** CP-BRA-001 · **Versión:** 1.0 · **Fecha:** 2026-11-26 · **Commit:** main `0e684d6c1`

Reconstrucción de los ciclos completos con TODOS sus puntos de entrada, procedimientos que los ejecutan, efectos cruzados y verificación de consistencia independiente de la entrada. El defecto estructural que este mapa documentó: **las mismas reglas se imponen en rutas distintas con comportamientos distintos** (3 definiciones de «pagado», 2 conversiones CUP, trigger con rama perdida).

---

## CICLO 1 — COMPRAS

```
PO (create_purchase_order_final, draft)
  → receive_against_po_final [crea receipt vía register_reception + obligación CxP]
  → confirm_pending_reception [WAC + inventario + notes=receipt_id + numeración ENT]
  → register_supplier_payment[_batch|_multi] [obligación→pagos→asiento 'pago']
  → Estados financieros [fin_movements, generación activa]
```

**Puntos de entrada:** API PO/recepciones; importación catálogo; ajustes manuales; `/api/reverse` (reversas).
**Efectos cruzados:** inventario (WAC, kardex) · CxP (paid_amount por trigger) · mayor contable · Reporte Entrega (elegibilidad de pagos).
**Verificación de consistencia:** conciliación v3 (operativa vs mayor); e2e recepciones; suites migraciones.
**Riesgos del ciclo:** confirmación sin gate de rol (R-06) · anulación con pagos sin revertir (R-04) · dedup de factura por texto (R-07) · ACL huérfanas en RPC de edición (R: PUR-004).

## CICLO 2 — SERVICIOS RECIBIDOS

```
draft (create_received_service_draft/v2 con creation_key idempotente)
  → active (obligación CxP; numeración SRV-YYYYMMDD-NNNNN)
  → pagos (register_supplier_payment_batch; exige active fail-closed)
  → liquidación (pago total o multi-doc)
  → anulación (void_received_service_with_reversal: contra-filas + asiento anulacion; terminal)
```

**Incidente de referencia:** SRV-20261123-00146 — servicio anulado con pago liquidado sin resolver efectos; corregido 20261124120100 (reversión completa + bloqueo de duplicados por creation_key + índice único sobre audit_logs).
**Riesgo estructural:** cadena de 3 definiciones de la RPC de anulación (20261010000002 → 20261124120100) — un replay fuera de orden revive el defecto. La conciliación v3 y el Reporte Entrega (elegibilidad excluye pagos de docs anulados) son los detectores activos.

## CICLO 3 — VENTAS

```
Carrito/Express (UI) → usePOSCheckout [3 capas anti doble-clic; outbox; idempotencia sale-<uuid>]
  → POST /api/pos/checkout [zod; supervisor token jti+scope; seller de sesión]
  → create_sale_v2 [lock tienda; seller binding; stock; precios; impuestos; tasa canónica;
     ERR_ITEM_PAYMENTS_INVALID; ERR_TOTAL_MISMATCH; PT011; liquidación de vuelto]
  → effects: transactions completed + transaction_items (+payment_distributions)
     + register_stock_movement(sale) + payment_transactions (1 fila por componente)
     + fin_trg_transactions (asiento reconocimiento) + audit_logs
  → Caja/Reporte Entrega [derivado de payment_transactions; NO caja física]
  → Historial/Informes [IPV; cash-report; dashboard fin]
```

**Entradas alternativas:** cotizaciones, ofertas (sin asiento/auditoría — REP brecha menor), órdenes de servicio `close_service_order_as_sale`.
**Verificación:** e2e pos-checkout 21/21; certificación CP-POS-SMOKE-PRODUCTION-001 (7/7 UI + 44/44 conciliación exacta); PT011 en RPC.
**Riesgos:** referencia transferencia solo-frontend en componentes (R-09) · payment_incidents sin control server (R-11) · distribuciones sin reconciliación server-side (R-08) · CI de cliente solo-frontend (R-10).

## CICLO 4 — DEVOLUCIONES

```
Documento original (venta/compra) → verificación de pagos (tope por moneda neto pagado − reembolsos)
  → resolución financiera (reembolso físico AS_PAID multimoneda atómico / store_credit con cap)
  → devolución con stock de vuelta (create_devolution_v2; cross-store validado)
  → movimientos compensatorios (refund/recovery en payment_transactions)
  → conciliación (cash-report lee refund/recovery; elegibilidad Reporte Entrega)
```
**Verificación:** RC1-RC6 (v2.24.1) + reversión con recovery atómico `p_recovery`.
**Riesgo:** sin conversión implícita USD↔CUP es correcto; vigilar writers nuevos de reembolsos.

## CICLO 5 — PRODUCTOS

```
Creación (UI o import) → Catálogo Maestro (master_products por tenant; SKU consecutivo advisory lock)
  → Vinculación a sucursal (catalog_store_links; products.master_product_id 1-fila-por-tienda)
  → Precios (products.price por tienda — editable por cualquier rol R-19)
  → Existencias (inventory + stock_current sincronizado; ledger)
  → Movimientos (venta/recepción/ajuste/transferencia/vale)
```
**Riesgos:** maestros AUTO-* históricos (remediado con consecutivo oficial) · variantes sin RPC (R-18) · precios sin enforcement de historial (R-19) · import delega en `managed_bulk_import_products` con tenant stamping (correcto).

## CICLO 6 — PROVEEDORES

```
Creación (RLS directa sin dedup R-15) → Identidad global (master_parties UNIQUE tax_id parcial)
  → Documentos (recepciones con supplier TEXT snapshot — dedup por 'supplier | invoice' R-07)
  → Obligaciones (CxP) → Pagos (batch/multi) → Historial
  → Consolidación MANUAL (consolidate_local_party sin borrar; guard ERR_PARTY_HAS_HISTORY)
```
**Incidente de referencia:** CP-AP «Tienda Pueblo» vs «TiendaPueblo» (25+1 docs) y 3 recepciones `supplier='—'` ($19,435) — decisión del propietario: NO fusionar automáticamente.

---

## TABLA DE CONSISTENCIA ENTRE ENTRADAS (lo que la auditoría encontró)

| Operación | Entrada A | Entrada B | ¿Mismo resultado? | Evidencia |
|---|---|---|---|---|
| «Pagado» de un documento | Calculador CxP (TS) | Columna paid_amount (trigger) | SÍ en receipt\|service; NO en OT (rama perdida) | R-01 |
| Conversión CUP de un saldo | Tasa documental (motor) | 450 fijo (CxC route) | NO | R-02 |
| Anulación de doc con pagos | Servicios (reversión completa) | Recepciones (sin reversión) | NO | R-04 |
| Alta de proveedor | UI (RLS directa) | RPC governed (maestro) | NO — la local no deduplica | R-15 |
| Referencia de transferencia | items[].payments (server) | p_payment_components (server) | NO — la segunda no exige | R-09 |
| Costo en salida | create_sale_v2 (server WAC) | create_vale_salida directo (relee) | SÍ (ambos server) | — |
| Confirmación con doble clic | POS (3 capas) | Recepción (FOR UPDATE) | SÍ (ambas idempotentes) | — |

**Conclusión transversal:** los ciclos están individualmente bien protegidos en su vía principal; la integridad se rompe en las **costuras** (segunda entrada, writer perdido, trigger reemitido sin una rama). El estándar CP-BRA-001 §7 (Declaración de reglas afectadas en PR) y §8 (pruebas transversales obligatorias al tocar writers) existen precisamente para esas costuras.
