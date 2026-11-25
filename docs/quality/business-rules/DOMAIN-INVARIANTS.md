# MATRIZ DE INVARIANTES POR DOMINIO — COSTPRO 4
**Estándar:** CP-BRA-001 · **Versión:** 1.0 · **Fecha:** 2026-11-26 · **Commit:** main `0e684d6c1`

Un invariante es una condición que debe permanecer verdadera **independientemente de la ruta de ejecución** (UI, API, RPC, importación, restauración). Para cada invariante: enunciado, punto(s) de imposición reales, verificación observable, y estado (GARANTIZADO / PARCIAL / NO GARANTIZADO).

---

## A. INVARIANTES FINANCIERAS

| ID | Invariante | Imposición real | Verificación | Estado |
|---|---|---|---|---|
| INV-FIN-01 | Total = Pagado + Saldo (por documento, en su moneda) | Calculador único CxP `calculator.ts` (API+Excel); trigger `update_payment_status` en receipt\|service | 34 pruebas calculador + e2e accounts-payable; conciliación v3 | **PARCIAL** — CxC/OT usa columna desactualizada + tasa 450 (R-01/R-02) |
| INV-FIN-02 | Σ pagos activos de un documento ≤ Total (neteando reversas) | `register_supplier_payment[_batch|_multi]` overpay check con lock FOR UPDATE | pruebas de migraciones; replay batch | **GARANTIZADO en CxP receipt\|service; NO en OT** (FIN-013) |
| INV-FIN-03 | Σ amount_cup del ledger de venta (PT011) = total ±0.01 | `create_sale_v2` L1227-1238 | e2e pos-checkout (015/016/017 fail-closed); conciliación CP-POS 44/44 | **PARCIAL** — `payment_incidents[]` desactiva el invariante sin verificación (R-11) |
| INV-FIN-04 | Todo pago tiene contra-fila de reversión con mismo importe/moneda/tasa | `reverse_supplier_payment` + unicidad `uq_payment_reversal_origin` | pruebas + idempotencia replay | **GARANTIZADO** (receipt\|service) |
| INV-FIN-05 | Toda anulación de documento deja asientos compensatorios trazables | triggers `fin_trg_*` → `fin_post_document_annulment` | conciliación v3 detectores | **PARCIAL** — recepciones no revierten pagos (R-04); pagos OT sin asiento (R-03) |
| INV-FIN-06 | La tasa usada en una venta es la canónica server-side (jerarquía + staleness ≤45d) | `create_sale_v2` jerarquía tienda→BCC→elToque→Diviza fail-closed | `ERR_RATE_STALE`; e2e | **PARCIAL** — CxP acepta tasa del cliente >1 (R-06 FIN-007); CxC usa 450 fijo (R-02) |
| INV-FIN-07 | Monedas distintas nunca se suman entre sí | reportes caja separan por moneda; `amount_cup` generado por fila; regla anti-duplicación #1479 | cash-report-clasificacion-monetaria «regla P1»; IPV §2-3 | **PARCIAL** — vistas con tasa fija rompen el equivalente CUP |
| INV-FIN-08 | El mayor de partida doble solo cambia vía motor, con asiento único por (doc,evento,pago) | GRANT denegado a authenticated; `fin_entries` unicidad :157-159 | gate SQL (secdef_public_grant) | **GARANTIZADO** |
| INV-FIN-09 | Un pago liquidado/incluido en cierre no puede mutarse sin trazabilidad | cierres congelados; reversión inserta en turno vigente | — | **NO GARANTIZADO** — reversión sin guard de período (R-14) |
| INV-FIN-10 | Excedentes/anticipos a proveedor no existen como saldo implícito | overpay prohibido; no hay entidad de anticipo operativo | — | **GARANTIZADO** (decisión de diseño; si el negocio quiere anticipos → regla nueva) |

## B. INVARIANTES DE INVENTARIO

| ID | Invariante | Imposición real | Verificación | Estado |
|---|---|---|---|---|
| INV-INV-01 | `inventory.quantity` ≥ 0 y única por (store,product) | CHECK no negativo + UNIQUE | pruebas; guard en confirmación | **GARANTIZADO** |
| INV-INV-02 | Escritura de existencia SOLO vía `register_stock_movement` (ledger append-only) | RLS stock_movements deniega INSERT/UPDATE/DELETE a authenticated | `20260803000005:35-67` | **PARCIAL** — `reconcile_stock p_fix` corrige sin movimiento; `reset_store_data` históricamente bypassó triggers (remediado con re-sync) |
| INV-INV-03 | Σ movimientos = existencia actual (reconstruible) | kardex auto + conciliación + conteo físico con `ledger_drift` | IPV + `reconcile_stock` (read-only) | **NO GARANTIZADO** para el histórico pre-ledger y con retrodatación |
| INV-INV-04 | Costo de venta = WAC server-side, nunca del cliente | `create_sale_v2` DF-02; confirm relee costo (vale) | e2e inventory-integrity | **GARANTIZADO** en ventas/vales; variantes con `conversion_factor` sin CHECK (R-23) |
| INV-INV-05 | Transferencia genera exactamente OUT+IN emparejados atómicos | confirm atómica por SKU destino con rollback | pruebas transfer | **GARANTIZADO** |
| INV-INV-06 | Reserva activa no permite doble consumo | `get_available_stock = stock − reservas` + expiración 24h | — | **PARCIAL** — expiración con doc PENDIENTE produce atasco/riesgo de sobreventa (R-24) |
| INV-INV-07 | Ajuste confirmado solo por persona autorizada para sobrescribir stock | `has_store_access_as` (sin rol) | — | **NO GARANTIZADO** (R-05 CRÍTICO) |

## C. INVARIANTES DOCUMENTALES

| ID | Invariante | Imposición real | Verificación | Estado |
|---|---|---|---|---|
| INV-DOC-01 | Transición de estado ilegal es imposible en BD (fail-closed) | `fn_validate_document_transition` en 6 tablas | `20260913000001:116-121` | **PARCIAL** — 7+ entidades fuera del trigger (R-12) |
| INV-DOC-02 | Ninguna modificación destruye trazabilidad histórica | receipt_items inmutables; protect_total; SKU locked con movimientos; TRUNCATE global bloqueado; audit_logs con old_data/new_data | gates; tests | **PARCIAL** — borrado físico de suppliers/customers en resets (R-17); referencias suaves tras abuso histórico |
| INV-DOC-03 | Numeración consecutiva forward-only por tienda/documento | `document_sequences` + ENT/SRV/VS + maestro SKU con advisory lock | pruebas | **GARANTIZADO** |
| INV-DOC-04 | Toda escritura sensible queda auditada con actor y datos | triggers de auditoría en 10+ tablas | constraint whitelist | **PARCIAL** — whitelist puede romper en runtime para tablas nuevas (R-20); lecturas no auditadas |
| INV-DOC-05 | Un documento nunca pierde su vínculo con su origen (enlace documental) | `notes=receipt_id` en recepciones; `reverses_payment_id`; `reversal_of` contable; `master_product_id` | CP-RECEP-001 backfill conservador con guard fail-closed | **GARANTIZADO** en los enlaces existentes |

## D. INVARIANTES MULTITIENDA

| ID | Invariante | Imposición real | Verificación | Estado |
|---|---|---|---|---|
| INV-TEN-01 | Todo dato de negocio pertenece a su tienda/tenant y no es accesible desde otra | `has_store_access` (280 call sites) + RLS (522 policies) + tenant_id + triggers de coherencia | SQL tests isolation; e2e isolation-proof | **GARANTIZADO** (con lección histórica de OR-scope: CP-SEC-003) |
| INV-TEN-02 | Maestros compartidos por tenant; datos comerciales por tienda | CAT-001/PRO maestros por tenant; vínculos 1:1 | `20261028110000` | **GARANTIZADO** |
| INV-TEN-03 | Terceros (proveedores/clientes) son por tienda; identidad global por maestro con tax_id único | `master_parties` UNIQUE tax_id parcial; locales SIN unicidad | — | **PARCIAL** — duplicación local real (R-15/R-16) |
| INV-TEN-04 | El actor solo opera en tiendas con membership activa y rol suficiente | wrappers API + RPCs + RLS; roles canónicos en `roles.ts` | e2e auth; SQL tests | **GARANTIZADO** |

## E. INVARIANTES DE CONCURRENCIA E IDEMPOTENCIA

| ID | Invariante | Imposición real | Verificación | Estado |
|---|---|---|---|---|
| INV-CON-01 | Dos confirmaciones simultáneas de venta producen UNA venta | advisory lock por tienda + idempotencia por `param_hash` + cerrojo cliente 3 capas | e2e CERT doble-clic → 1 venta | **GARANTIZADO** |
| INV-CON-02 | Un pago re-enviado (timeout/retry) no duplica efectos | `idempotency_key` UNIQUE + replay fast-path batch/multi | pruebas replay | **GARANTIZADO** |
| INV-CON-03 | Dos usuarios confirman la misma recepción → una sola vez | `confirm_pending_reception` FOR UPDATE + `ERR_RECEIPT_ALREADY_CONFIRMED` | `20261125120000_cp_recep001:70-101` | **GARANTIZADO** |
| INV-CON-04 | Alta repetida/simultánea de terceros no duplica | — | — | **NO GARANTIZADO** (PRO-001/002) |
| INV-CON-05 | Reversión doble no duplica contra-filas | índice parcial `uq_payment_reversal_origin` + key `reversal:<id>` | pruebas | **GARANTIZADO** |
| INV-CON-06 | Un evento procesado dos veces no duplica asientos | `fin_entries` único por (doc,evento,pago); `reversal_of` idempotente | `20261113120000:157-159` | **PARCIAL** — asimetría: `fin_post_payment_annulment` no marca `status='reversed'` del original (R: FIN-08) |
| INV-CON-07 | Operaciones peligrosas (archive/restore/reset/bulk) con lock distribuido | `idempotency_keys` NX + Upstash | — | **GARANTIZADO** |

## F. LECTURA CONSOLIDADA

- **GARANTIZADOS:** el corazón de transacción (venta/pago/recepción/transferencia) está blindado con locks, idempotencia y unicidad estructural — la inversión de 2026-08→11 ha sido efectiva.
- **PARCIALES:** los invariantes que dependen de MÚLTIPLES escritores (salidos, reportes, tasas) son los que fallan: coexisten 3 definiciones de «pagado» y 2 de conversión CUP.
- **NO GARANTIZADOS:** alta de terceros (duplicación), autorización de ajustes de inventario, guard de período en reversiones, reconstrucción total del histórico pre-ledger.
- La regla de oro observable: **cada invariante roto en la historia de COSTPRO se rompió al añadir un escritor nuevo que no reemitió todas las rutas del invariante** (trigger OT perdido, KPI divergente, tasas). El estándar CP-BRA-001 §7 convierte esto en requisito formal para PRs.
