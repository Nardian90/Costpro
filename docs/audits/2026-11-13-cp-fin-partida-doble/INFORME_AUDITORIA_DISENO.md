# CP-FIN — Auditoría de arquitectura y diseño del motor de partida doble

Misión: Sistema de Configuración de Documentos y Estados Financieros Automáticos (COSTPRO 4 MULTITIENDA).
Fecha: 2026-11-13 · Rama: `feat/estados-financieros-20261113` · Expediente: `docs/audits/2026-11-13-cp-fin-partida-doble/`

---

## 1. MAPA DOCUMENTO → EVENTO ECONÓMICO → MOVIMIENTOS → ESTADO FINANCIERO

El mapa se construyó inspeccionando las migraciones reales (`supabase/migrations/`) y el código fuente. **No existe tabla unificada de documentos**; la numeración vive en `document_sequences` por (tienda, tipo, año). No se crea ningún sistema paralelo: el motor LEE las tablas existentes y ESCRIBE únicamente en tablas nuevas con prefijo `fin_`.

| Tipo documental (real) | Tabla fuente | Estado que dispara reconocimiento | Métricas económicas (origen del importe) | Efectos por defecto (débito / crédito) |
|---|---|---|---|---|
| VENTA | `transactions` + `transaction_items` | `completed` | `total_cup` (total_amount×tasa), `cob_cash_cup`, `cob_cash_usd_cup`, `cob_transfer_cup`, `cob_transfer_usd_cup`, `cob_zelle_usd_cup` (de `payment_transactions` ref_type='sale', direction='in', agrupado por método+moneda), `costo_productos_cup` (Σ qty×cost_at_sale, fallback `products.cost_average`) | D Efectivo CUP/USD·Bancos por componente / C Ingresos por ventas; D Costo productos vendidos / C Inventario |
| DEVOLUCIÓN DE VENTA | `devolutions` + `devolution_items` | `completed` | `total_cup`, `reembolso_<método>_cup` (payment_transactions direction='refund'), `store_credit_cup` (`store_credit_ledger`), `costo_devuelto_cup` (items×costo original venta) | C Efectivo/Bancos por reembolso · C Anticipos clientes por store_credit / D Devoluciones s/ventas; C Costo ventas / D Inventario |
| ENTRADA DE ALMACÉN | `receipts` + `receipt_items` | `active` (numeración ENT- solo en active) | `total_cup` (Σ qty×unit_cost_cup — ya convertido por línea con `tasa_cambio_recepcion`) | D Inventario / C Cuentas por pagar proveedores (la deuda nace completa; cada pago posterior genera asiento de pago) |
| SERVICIO RECIBIDO | `received_services` | `active` | `total_cup` (total_amount×exchange_rate), `currency`, `pendiente_cup` | D Gastos por Servicios Recibidos / C Servicios pendientes de pago |
| VALE DE SALIDA | `issue_slips` + items | `completed` | `costo_cup` = `total_cost` (WAC capturado al crear el vale) | D Consumo interno de mercancías (vales) / C Inventario. **Limitación auditada**: el vale no tiene campo motivo/destino → por defecto se clasifica como consumo operacional; no hay transferencia entre almacenes en este documento (existe `transfers` aparte) |
| AJUSTE DE INVENTARIO | `inventory_adjustments` + items | `confirmed` | `valor_faltante_cup` / `valor_sobrante_cup` (Σ diferencia × WAC del producto con evidencia `wac_change_log`, fallback `cost_average`), `motivo` (STOCKTAKE_SHRINKAGE, STOCKTAKE_SURPLUS, DAMAGED_GOODS, OTHER) | Faltante/Deterioro: D Pérdidas de inventario / C Inventario. Sobrante: D Inventario / C Otros ingresos operacionales. OTHER: NO contabiliza (pendiente de clasificación — decisión honesta, sin inventar) |
| COMISIÓN | `commission_payments` | `paid` | `total_cup` (final_amount×exchange_rate), `metodo` (cash/transfer/zelle) | D Gastos por comisiones / C Efectivo o Bancos por método (reconocimiento y pago en el mismo evento: el módulo no tiene fase de devengo separada) |
| NÓMINA | `payrolls` + items + concepts | `confirmed` | `total_gross_cup`, `total_net_cup`, `total_deducciones_cup`, `total_social_cup`, `metodo_pago` (efectivo/tarjeta) | Confirmada: D Gastos de nóminas (gross) / C Nómina neta pendiente (net) + C Retenciones por pagar (deducciones). Pagada: D Nómina pendiente / C Efectivo o Bancos (por neto). Semántica del módulo: `gross = base+extras+complementos+otros+obligación_social`, `net = gross−deducciones` (la obligación social queda dentro del gasto reconocido, disponible como métrica para reglas custom) |
| FLUJO DE CAJA | `cash_flow_documents` | `confirmado` | `importe_cup` (amount_cup generated), `tipo` (ingreso/egreso), `concepto` (constitucion/reposicion/devolucion_fondo/otro) | Egreso: D Otros gastos operacionales / C Efectivo (CUP o USD por moneda). Ingreso: D Efectivo / C Otros ingresos operacionales. El concepto es condicionable para reglas custom |
| TRANSFERENCIA | `transfers` | `CONFIRMADA` | — (movimiento interno entre almacenes de la tienda) | **SIN efecto económico por defecto** (no gasto, no ingreso, valor total del inventario invariante) — cumple Caso F |
| ORDEN DE COMPRA | `purchase_orders` | — | — | Sin regla por defecto: la deuda nace en `receipts` (payment_status), no en la OC |
| ORDEN DE PRODUCCIÓN | `production_orders` | — | — | Sin regla por defecto: el consumo/entrada ya genera `stock_movements`; su valoración económica queda como configuración futura (no se inventa) |
| DEVOLUCIÓN A PROVEEDOR | (no existe tabla; se usa `reverse_receipt_v2`) | — | — | La reversa de recepción dispara `anulacion` del asiento de la recepción original |

### Eventos del motor

- `reconocimiento` — nace el efecto económico (ingreso, gasto, inventario, obligación) al alcanzar el estado definitivo.
- `pago` — cobros/pagos posteriores (trigger sobre `payment_transactions` con `ref_type IN ('receipt','service')`; nómina `paid`; comisión `paid`). Nunca re-reconoce gasto/ingreso.
- `anulacion` — el motor INVIERTE automáticamente el asiento original (asiento compensatorio enlazado, historial conservado). No es configurable: es semántica del motor (§14 misión).
- `apertura` — saldos iniciales autorizados (`fin_opening_balances`).
- `ajuste_manual` — reservado para correcciones auditadas.

### Estados documentales y contabilización (§14 misión)

- Borrador/draft/pending/pendiente → **no genera movimientos** (triggers solo en estados definitivos).
- Confirmado/completed/active/confirmed/paid → genera el evento correspondiente según la tabla anterior.
- Anulado/voided/reversed → genera `anulacion` (inversión compensatoria, sin doble reversión: única por asiento original).
- Idempotencia: índice único `(document_type, document_id, event, payment_ref)` + advisory lock por documento → doble clic, reintento o concurrencia no duplican.

## 2. FUENTES DE VERDAD ECONÓMICA REUTILIZADAS

1. **`payment_transactions`** (ledger autoritativo de cobros/pagos: ref_type, direction in/out/refund, amount, currency, exchange_rate, amount_cup generated, idempotency_key) — fuente de TODOS los importes de cobro/pago.
2. **`stock_movements`** (inmutable) + **`transaction_items.cost_at_sale`** + **`products.cost_average`** (WAC) + **`wac_change_log`** (evidencia WAC histórica) — fuente del costo de ventas.
3. **`exchange_rates`** / **`store_exchange_rates`** — las conversiones del motor usan SIEMPRE la tasa del propio documento (nunca tasas inventadas); si el documento no registra tasa y la moneda es CUP → tasa 1. No se suman CUP y USD: todo asiento lleva moneda original + tasa + `amount_cup`; los informes consolidan solo en CUP o muestran por moneda.
4. **RLS existente**: `user_store_memberships` + `has_store_access/has_store_role/is_admin/is_superadmin` — todas las tablas `fin_*` replican el patrón tenant/store; los movimientos SOLO se escriben por RPC SECURITY DEFINER (escritura directa denegada).

## 3. LIMITACIONES Y GAPS DOCUMENTADOS (no se inventan datos)

1. **No existe venta a crédito** en COSTPRO (el cobro es íntegro en la creación) → no hay CxC de clientes por ventas; la categoría `ACT_CXC` existe para configuración futura y para el `store_credit_ledger` si se implementa su cobro (hoy no existe mecanismo).
2. **Vales de salida sin campo motivo/destino** → el gasto por vales se clasifica como consumo operacional por defecto; el campo no existe para condicionar.
3. **Ajustes sin valoración económica propia** → el motor valora con WAC evidencial (`wac_change_log`) y fallback `cost_average` actual; se registra la fuente en la traza del movimiento.
4. **COGS histórico**: 632/1676 movimientos con `unit_cost=0`; el motor usa `cost_at_sale`, luego `unit_cost_derived` (evidencia) y luego `cost_average` — cada movimiento guarda la fuente en `traza`.
5. **Órdenes de compra y producción**: sin regla por defecto (aparecen como "pendientes de configurar").
6. **`receipts.payment_method`** refleja solo el último método → el motor ignora ese campo y usa `payment_transactions`.
7. **Efectivo físico multimoneda**: caja maneja CUP y USD por separado (ACT_EFECTIVO_CUP / ACT_EFECTIVO_USD); Zelle y transferencia a Bancos.

## 4. MODELO DE DATOS NUEVO (prefijo `fin_`)

- `fin_categories` — catálogo jerárquico (clase activo/pasivo/patrimonio/ingreso/gasto; grupo; parent_id; is_system; store_id NULL=global). 38 categorías semilla. Ampliable por el usuario sin tocar código.
- `fin_document_types` — catálogo de tipos documentales REALES (13 filas semilla, tabla fuente, módulo, is_postable).
- `fin_rule_versions` — versiones de reglas por (doctype, store NULL=global): `movements jsonb` (plantillas), status draft/active/inactive, effective_from, created_by, activated_at/by. Una activa por ámbito (índice único parcial).
- `fin_entries` — asientos: (document_type, document_id, event, payment_ref, economic_date, rule_version_id, movements_snapshot, reversal_of, status posted/reversed, description). Único por documento+evento+pago.
- `fin_movements` — líneas: (entry_id, store_id, category_code, sentido debito/credito, amount, currency, exchange_rate, amount_cup GENERATED, economic_date, document_number, worker_id, product_id, customer_id, traza jsonb). CHECK amount>0.
- `fin_opening_balances` — saldos iniciales (borrador → aplicado genera entrada `apertura`; autorizado y documentado).
- `fin_posting_errors` — errores de contabilización aislados del negocio (un trigger NUNCA bloquea la operación comercial; el error queda registrado y reprocesable).

Plantilla de movimiento (JSONB en `fin_rule_versions.movements[]`):
```json
{
  "id": "mv-1",
  "evento": "reconocimiento",
  "categoria": "ACT_EFECTIVO_CUP",
  "sentido": "debito",
  "origen": {"tipo": "metrica", "metrica": "cob_cash_cup"},
  "condicion": {"campo": "cob_cash_cup", "op": ">", "valor": 0},
  "orden": 1
}
```
- `origen.tipo`: `metrica` (nombre del catálogo de métricas del doctype) | `constante` (solo simulador/manual).
- `condicion.op`: `= != > >= < <= existe en`.
- Validación estructural al activar: categorías existentes, sentidos válidos, origen definido, ≥1 débito y ≥1 crédito no condicionales por evento. El simulador (`fin_simulate`) permite probar con documento real o métricas manuales ANTES de activar (sin escribir).
- Versionado: cada `fin_movement` conserva `rule_version_id`; los asientos históricos JAMÁS se recalculan al cambiar una regla (solo documentos nuevos desde `effective_from`; reprocesamiento explícito autorizado vía `fin_backfill` con dry-run).

## 5. INFORMES (misma fuente: `fin_movements`)

- `fin_get_balance_sheet(store, fecha_corte)` — jerárquico activo/pasivo/patrimonio con subtotales, ecuación A=P+P verificada (diferencias reportadas, NUNCA ajustadas artificialmente), indicador de completitud (apertura faltante si el primer documento precede a la primera apertura) y drilldown por categoría (`fin_get_category_detail`).
- `fin_get_income_statement(store, from, to)` — ingresos netos (con devoluciones/descuentos), costo de ventas, utilidad bruta, gastos por categoría detallada, resultado del período. Sin denominaciones tributarias inventadas.
- `fin_get_dashboard(store, from, to)` — KPIs, series temporales, top gastos, CxC/CxP, valor de inventario (en vivo desde `products`), efectivo por moneda, alertas (gastos>ingresos, desequilibrio, documentos sin configurar, errores de contabilización).
- Trazabilidad: cada importe navega Dashboard/Estado → categoría → movimientos → documento de origen (enlaces reales; los permisos los exige la vista de destino).

## 6. DECISIONES DE SEGURIDAD

- Escritura de `fin_movements`/`fin_entries` SOLO vía RPC `SECURITY DEFINER SET search_path='public','pg_temp'` con gate de rol; policies deny-all para authenticated (igual que `stock_movements`).
- Triggers de contabilización capturan excepciones → `fin_posting_errors` (el negocio NUNCA se bloquea por una regla mal configurada; el error queda visible y reprocesable).
- Migraciones idempotentes (CREATE IF NOT EXISTS / DROP POLICY IF EXISTS / guards), fecha > cutoff 20260828, manifiesto INFRA-011 regenerado.
- REVOKE EXECUTE FROM PUBLIC/anon en todas las RPC del motor (patrón `20261020000002`).
- Multitienda: cada `fin_entry`/`fin_movement` lleva `store_id`; reglas globales (store NULL) legibles por todos, modificables solo por admin; un cambio de tienda jamás altera saldos de otra (RLS + validación backend).

## 7. ENTREGABLES UI

- **Vista A — Configuración de Documentos** (`document-config`): catálogo por módulo con estado de configuración, editor de reglas (constructor de movimientos + balance de la configuración + validaciones), simulador, versionado/historial, activar/desactivar, saldos iniciales, errores de contabilización con reprocesado.
- **Vista B — Estados Financieros** (`financial-statements`): 3 pestañas (Estado de Situación | Estado de Rendimiento | Dashboard), filtros tienda/período/moneda, desplegables con drilldown, exportación PDF/Excel, gráficas recharts con `useChartTheme()`.
- Ambas: patrones del repo (navigation-definition + ViewType + TerminalShell dynamic + roles mínimos admin/manager/encargado, estados carga/error/vacío, mobile-first con cards).

## 8. CASOS DE PRUEBA (§18 misión) — mapeo

| Caso | Mecanismo verificado |
|---|---|
| A Venta efectivo | Regla VENTA: efectivo+ingreso+costo+inventario, asiento equilibrado, utilidad bruta 40 |
| B Venta a crédito | Documentado: no existen ventas a crédito en COSTPRO; el patrón débito CxC está soportado por el motor (regla condicional por métrica) pero sin documento real que lo dispare — se prueba en unit test del motor con métricas manuales |
| C Servicio pendiente | Regla SERVICIO_RECIBIDO: gasto+CxP; `register_payment` → asiento de pago D efectivo / C CxP sin segundo gasto |
| D Compra inventario | Regla RECEPCION: D inventario / C CxP; nunca costo de ventas |
| E Nómina | Confirmada: gasto+obligaciones neto/retenciones; pagada: cancela obligación neta sin re-gasto |
| F Transferencia interna | `transfers` SIN regla → sin ingresos/gastos, valor inventario invariante (unit test) |
| G Anulación | `anulacion` = asiento compensatorio enlazado, única, historial conservado, sin doble reversión |
| H Multimoneda | Movimientos con moneda+tasa+amount_cup; informes por moneda o consolidado CUP; sin suma directa |
| I Modificación config | `effective_from` + versiones: históricos conservan version (unit test) |
| J Concurrencia | Advisory lock + índice único + idempotencia (test de estrés en SQL test) |
