# COSTPRO-SALES-DASHBOARD-001 — Dashboard de Ventas: Definiciones de KPIs y Fuentes de Datos

> Misión: dashboard analítico dentro de **Inicio → OPERACIÓN → Ventas → Opciones → Historial de Ventas → tab «Dashboard»**.
> Este documento define la fórmula EXACTA y la fuente de datos REAL de cada indicador. Nada aquí se calcula con datos inventados ni convierte monedas con tasas arbitrarias.

## 1. Fuentes de datos reales (auditadas)

| Fuente | Uso en el dashboard |
|---|---|
| `transactions` | Documentos de venta. Montos **en CUP** (`subtotal`, `discount_value`, `tax_amount`, `total_amount` — el motor `create_sale_v2` convierte los ítems a CUP con la tasa del servidor). `seller_id` = usuario que generó la operación. `completed_at` = fecha de negocio. `payment_method` = riel de la venta. |
| `transaction_items` | Líneas de venta: `quantity`, `price_at_sale_cup` (CUP), `item_discount_value` (descuento de línea), `product_id`. |
| `devolutions` | Devoluciones / notas de crédito (documento `NC`). `total_amount` **en la moneda de la devolución** (`currency`), `status`, `processed_by`, vínculo a la venta vía `original_transaction_id`. |
| `devolution_items` | Unidades devueltas por producto (`quantity`). |
| `payment_transactions` | **Fuente autoritativa de cobros**: una fila por componente de pago con moneda real (`cash`/`transfer` → CUP; `zelle` → USD/EUR/MLC) y `exchange_rate` = tasa histórica del cobro. `amount_cup` (columna generada) = equivalente CUP a la tasa histórica de cada fila. |
| `products` | Catálogo activo (`is_active`, `status='ACTIVE'`) para productos con menor movimiento. |
| `profiles` | Nombres de vendedores (acceso vía RPC SECURITY DEFINER con guard, igual que `get_transactions`). |
| `sync_log` | Errores/conflictos de sincronización históricos (`entity='sale'`, `status IN ('error','conflict')`). |
| Cola offline local (`@/lib/sync/offline-storage`) | Ventas pendientes de sincronización / en conflicto **del dispositivo actual** (no existe cola en BD; se lee con fail-safe, nunca bloquea). |

## 2. Definiciones de indicadores

«Período» = ventana filtrada (por defecto: mes actual). «Válido» = documento de venta con `status='completed'` (el POS crea ventas directamente en `completed`; `pending/failed/compensated/cancelled` no representan ventas efectivas y se reportan solo en alertas si existen).

| Indicador | Fórmula exacta | Fuente |
|---|---|---|
| **Ventas brutas** | `Σ subtotal` de ventas válidas (antes de descuento e impuestos) | `transactions.subtotal` |
| **Descuentos** | `Σ discount_value` de ventas válidas (descuento de cabecera ya aplicado por el servidor) | `transactions.discount_value` |
| **Devoluciones (CUP/USD)** | `Σ total_amount` de devoluciones `status='completed'` del período, agrupadas por `currency` (las `voided`/`reversed` no restan) | `devolutions` |
| **Ventas netas** | `Σ total_amount` de ventas válidas **−** devoluciones CUP del período. `total_amount = subtotal − descuento + impuestos` (invariante de `create_sale_v2`) | `transactions` + `devolutions` |
| **Cantidad de ventas** | `COUNT` de documentos válidos del período | `transactions` |
| **Ticket promedio** | `Σ total_amount ÷ COUNT` de documentos válidos (por documento; las devoluciones se analizan aparte para no distorsionar el ticket) | `transactions` |
| **Unidades vendidas (netas)** | `Σ transaction_items.quantity` de ventas válidas **−** `Σ devolution_items.quantity` de devoluciones válidas del período | `transaction_items`, `devolution_items` |
| **Cobrado en USD** | `Σ payment_transactions.amount` con `currency='USD'` (riel zelle) de ventas válidas. Importe ORIGINAL en USD; sin conversión | `payment_transactions` |
| **Neto USD** | Cobrado USD **−** devoluciones con `currency='USD'` | `payment_transactions` + `devolutions` |
| **Participación** | Indicador del vendedor/producto ÷ total comparable del MISMO ámbito (tiendas filtradas, moneda CUP) del período | agregados del propio RPC |
| **Variación %** | `(actual − anterior) ÷ anterior × 100`, períodos equivalentes (misma duración, inmediatamente anterior). Si el anterior es 0 o no hay datos → se muestra `—` (nunca un % inventado) | ventana previa enviada al RPC |
| **Concentración** | % acumulado de ventas netas de los top-N productos (Pareto) | agregado productos |

### Comparación entre períodos
El cliente calcula la ventana anterior equivalente (misma longitud, terminando donde empieza la actual) y la envía al RPC (`p_prev_from`/`p_prev_to`). Ambas ventanas usan las mismas fórmulas. Ejemplo: 1–8 de noviembre se compara con 1–8 de octubre (ambos de 8 días).

### Moneda — reglas innegociables
- Los importes de **documentos** siempre se presentan en **CUP** (así los computa el motor contable; no existe «total del documento en USD»).
- Los importes **USD** presentados son cobros reales registrados en USD (riel zelle) y devoluciones emitidas en USD — importes originales, sin conversión.
- **No se suma CUP con USD.** El selector de moneda cambia la vista entre «CUP (contable)» y «USD (cobros zelle)»; cada tarjeta indica su moneda.
- La única conversión mostrada es `amount_cup` de `payment_transactions`: equivalente CUP a la **tasa histórica del propio cobro** (verificable fila a fila), usada únicamente en el bloque de métodos de pago como referencia contable, nunca como «total consolidado» del negocio.

### Serie temporal (evolución)
- Granularidad: hora (períodos ≤ 3 días), día (≤ 62 días), semana (≤ 180 días), mes (resto). Cambiable por el usuario dentro de lo razonable.
- Buckets vacíos = 0 ventas (se muestran explícitamente; `generate_series` server-side).
- Zona horaria de clasificación: **America/Havana** (timezone operativo del negocio, constante en todo el sistema).
- Series: brutas (CUP), netas (CUP), devoluciones (CUP, por su fecha de proceso) y cobrado USD.

### Rendimiento por vendedor
Atribuido a `transactions.seller_id` = usuario autenticado que ejecutó la venta (el que la generó; **no** quien la sincronizó, modificó o consultó — el modelo no tiene campos separados de cajero/creador: `seller_id` ES el creador). Filas: ventas (count), bruto, descuentos, devoluciones asociadas (vía venta original del mismo vendedor), neto, ticket promedio, participación sobre neto del ámbito. Al filtrar por vendedor, las devoluciones se atribuyen por el vendedor de la **venta original**.

### Productos
- Neto por producto = `Σ (quantity × price_at_sale_cup − item_discount_value)` de ventas válidas (CUP contable).
- **Top por facturación** = mayor neto; **top por unidades** = mayor `Σ quantity`; **menor movimiento** = productos del catálogo activo de las tiendas filtradas con 0 o pocas unidades vendidas en el período.
- **Margen de contribución: OMITIDO.** Existe `cost_at_sale`/`cost_price`, pero no puede garantizarse trazabilidad verificable del costo aplicable a cada venta en todas las tiendas/monedas del ámbito; la misión prohíbe estimarlo. No se muestra.
- Descuentos en USD por producto: OMITIDO (el descuento se registra en CUP; no existe campo de descuento en USD por línea con semántica homologada).

### Métodos de pago y cobros
Dos planos separados y etiquetados: **valor facturado** (documentos, CUP) vs **dinero cobrado** (`payment_transactions`, por moneda real). Una venta facturada ≠ dinero cobrado: el bloque muestra ambos y las **diferencias de conciliación** detectables (ver alertas). Este bloque no sustituye el cierre/conciliación de caja.

### Alertas (control operativo)
Todas las alertas son **informativas** — nunca corrigen ni alteran operaciones. Severidades:
- **Info**: pendientes de sincronización (dispositivo actual), ventas en cobro mixto.
- **Advertencia**: ventas anuladas (`voided`), revertidas (`reversed`), devoluciones del período, ventas con incidencias de pago (`payment_incidents` no vacío).
- **Conflicto**: cola offline en estado `conflict`/`retry_exhausted`; `sync_log` con `error`/`conflict` del período.
- **Error real**: ventas válidas **sin** filas en `payment_transactions`, o con diferencia `|total_amount − Σ amount_cup| > 0.05` (cobros incompletos/no conciliados).

Una venta simplemente pendiente de sincronización **no** se marca como error.

### Horario y días
Mapa de calor día-de-semana × hora (0–23, America/Havana) con cantidad de operaciones y neto CUP. Permite detectar picos, días fuertes y concentraciones anormales.

## 3. Arquitectura y rendimiento
- **Un único RPC agregado**: `get_sales_dashboard_analytics` (PostgreSQL, `STABLE`, `SECURITY DEFINER` — mismo patrón que `get_transactions`, necesario para nombres de vendedores porque `profiles` RLS los oculta a roles no administrativos).
  - Guards: `auth.uid()` obligatorio (gate CI Check 1); tienda: `has_store_access(p_store_id)` si se filtra tienda, si no `store_id = ANY(current_user_store_ids())` (superadmin → todas; admin → tenant; resto → membresías activas). `GRANT EXECUTE` solo a `authenticated` + `service_role` (nunca PUBLIC/anon — gate CI Check 2).
  - Sin `SECURITY DEFINER` adicionales, sin tocar funciones monetarias, una sola llamada por actualización (cero N+1, cero descarga de documentos al navegador).
  - Caché React Query (`staleTime` 60 s) + invalidación; refresco manual con marca de «última actualización».
- Drill-down: vendedor/día/método/estado → **tab Detalle existente** con filtros aplicados (no se duplica el historial). Producto → modal de ventas del producto del período (consulta read-only a `transaction_items`) con acceso a cada documento.
- El historial original (tabs Detalle/Producto/Resumen) queda intacto.

## 4. Indicadores omitidos por limitaciones del modelo (resumen)
1. **Margen/utilidad por producto** — costo no verificable por venta en todos los ámbitos.
2. **Descuentos en USD** — el descuento se computa en CUP.
3. **Ventas brutas/netas de documento en USD** — el documento es CUP; en USD se reportan cobros y devoluciones reales.
4. **Pendientes de sincronización de otros dispositivos** — la cola offline es local por dispositivo; no existe en BD.
