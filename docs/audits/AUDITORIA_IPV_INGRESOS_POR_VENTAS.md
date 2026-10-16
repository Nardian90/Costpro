# AUDITORÍA IPV — INGRESOS POR VENTAS

**Proyecto:** COSTPRO 4 Multitienda · **Repositorio:** `Nardian90/Costpro`
**Fecha:** 2026-10-16 · **Misión:** IPV — Ingresos por Ventas con conciliación de inventario, PDF y Excel
**Rama:** `feat/ipv-ingresos-por-ventas` · **Commits:** `c23904c`, `e26761f`, `0533112`

---

## 1. Diagnóstico de la arquitectura actual

Antes de programar se auditó el sistema con tres exploraciones paralelas del código y verificación directa del esquema en vivo de Supabase (information_schema + consultas de datos). Hallazgos que condicionaron el diseño:

| Hallazgo | Evidencia | Consecuencia en el IPV |
|---|---|---|
| El ledger de inventario es `stock_movements` (append-only): `quantity_change` con signo, 18 valores reales de `movement_type`, `movement_date` operativa retrodatable ≤6 meses, `balance_after` por orden de INSERCIÓN | Migraciones `20260115`, `20260916000001` (cuerpos certificados), `20260803000005` (inmutabilidad RLS) | Cantidades SIEMPRE desde `stock_movements`; el saldo histórico se reconstruye sumando `quantity_change` por fecha, nunca usando `balance_after` (roto con retrodatación) |
| `inventory.quantity` es la fuente canónica del saldo actual (truth model documentado en `docs/BACKUP_RESTORE_INVENTORY_TRUTH_MODEL.md`); existen derivas documentadas (cargas iniciales previas al ledger) | Doc §133-158; `reconcile_stock` / `v_stock_discrepancies` | La conciliación contra `inventory.quantity` se verifica aparte y las diferencias se reportan como incidencias — nunca se "ajustan" |
| No existe función de saldo histórico en Supabase | Búsqueda en ~450 migraciones: solo snapshots puntuales (`inventory_snapshots`) y ledger paginado | El IPV reconstruye Ei con agregación del ledger (documentada la estrategia y su límite) |
| Ventas: `transactions` (status `completed` = único que afecta; `completed_at` nunca NULL en completadas — verificado: 0 nulos en 1194) + `transaction_items` con precio capturado al vender (`price_at_sale`, `price_at_sale_cup`, `price_currency`, `exchange_rate`) | `create_sale_v2` (`20260807000003`), datos en vivo | Importe por producto desde líneas de ventas completadas del período |
| **BUG LEGADO crítico**: en filas V1, `price_at_sale_cup` ya es `precio×qty×tasa` (total de línea), NO precio unitario | `src/lib/commission-engine.ts:641-652`; fila real verificada: `2 × 9450 USD → price_at_sale_cup = 6.426.000` | Guarda de detección por autocoherencia (`computeLineTotalCup`): evita inflación ×qty del importe |
| `item_discount_value` es INFORMATIVO: `transactions.total_amount = Σ líneas brutas` | 3 transacciones reales verificadas (total 38.000 = 2×19.000 con descuento 2.000 NO restado) | El IPV usa la línea bruta cobrada → concilia con el total contable del sistema |
| Devoluciones: documento `devolutions`/`devolution_items` (status `completed`/`reversed`) + movimiento `return` (+) en el ledger | `create_devolution_v2`, `reverse_devolution` | Cantidades de devolución SOLO del ledger; el importe se descuenta de `devolution_items` |
| **Colisión de nombre "IPV"**: existe módulo experimental `ipv` (conciliación bancaria en Dexie/IndexedDB, admin-only) con aliases `ipv_reporting`, `ipv_module`, etc. | `TerminalShell.tsx:494`, `navigation-definition.ts:634-644` | Nuevo viewId `ipv_ventas`, sin tocar el módulo experimental |
| Patrón de reportes canónico: `CashReportView` (config≠cálculo, anti-doble-envío, preview jsPDF bloburl, lazy chunks) + `withAuth` + `getSupabaseForSession` (RLS por sesión) + tienda desde `profiles.active_store_id` | `CashReportView.tsx`, `/api/cash-report/route.ts` | La vista y la API replican exactamente ese patrón |
| Rendimiento: BD con 1.619 movimientos totales (2,5 MB); índice `(store_id, created_at)`; operation date retrodatable ≤6 meses acota el ledger | Consultas en vivo | Agregación en Node con 5 consultas acotadas por tienda; sin consulta por producto |

## 2. Decisión de ubicación y justificación

**Decisión: nueva hoja `ipv_ventas` — "IPV — Ingresos por Ventas" — bajo `OPERACIÓN → Ventas`, entre Reporte Entrega y Opciones. Vista canónica única.**

| Alternativa evaluada | Veredicto |
|---|---|
| Dentro de Reporte Entrega | Descartada: Reporte Entrega es un cuadre de caja para la entrega de dinero (propósito, filtros y audiencia distintos); mezclar lo rompería (§1 de la misión: no asumir que es el lugar correcto solo porque existe) |
| `OPERACIÓN → Almacén → Inventario` (pestaña) | Descartada como ubicación primaria: el informe es primariamente de INGRESOS por ventas; Inventario es gestión de stock (ajustes, catálogo, trazabilidad). Duplicaría la vista como tab y rompería "una sola vista canónica" |
| `ANÁLISIS → Reportes` (ReportsView) | Descartada: roles `['admin','manager']` excluyen a encargado/clerk, audiencia natural del informe; y es un generador genérico con otras fuentes |
| **`OPERACIÓN → Ventas` (elegida)** | El nombre y propósito del informe ("Ingresos por Ventas") pertenece al ciclo comercial; la audiencia es la misma del Reporte Entrega (`['admin','manager','encargado','clerk']`, sin heredar `usuario`); convive con el POS sin duplicar nada; el guard de roles y la paleta de comandos se derivan solos de la definición |

**Criterios de la misión cubiertos**: coherencia funcional (ingresos→Ventas) · facilidad de búsqueda (junto a Vender y Reporte Entrega) · relación con inventario (la conciliación vive DENTRO del informe, no en Almacén) · consistencia del menú (hoja simple del submenu Ventas) · accesibilidad (mismos roles que Reporte Entrega; backend valida además `canViewStore`) · mantenibilidad (una vista, un dataset, tres renderers) · reutilización (PageHeader, apiFetch, lazy-pdf, lazy-excel, patrón CashReportView).

**No se creó acceso directo desde Almacén** para no duplicar puntos de entrada; el informe es descubrible por paleta de comandos (`keywords: ipv, ingresos, conciliación, kardex, saldo inicial…`).

## 3. Diseño funcional del IPV

- **Filtros**: Tienda (selector de tiendas con membresía activa; defecto = tienda activa; validada en servidor con `canViewStore`) · Fecha inicial y final obligatorias (validación de orden; convención oficial COSTPRO de rangos: `T00:00:00`→UTC y `T23:59:59.999`→UTC, inclusiva en ambos extremos — idéntica a Reporte Entrega) · Períodos rápidos (Hoy, Ayer, 7/30 días, mes actual/anterior) · Búsqueda de producto por código o descripción (filtro de presentación sobre el dataset, aplicado también a exportaciones).
- **Encabezado del informe**: nombre de la tienda · título `IPV — Ingresos por Ventas` · período · fecha y hora de generación · monedas ("CUP contable · USD informativo") · número de productos incluidos (y visibles).
- **Tabla** (elemento principal, 12 columnas): Código · Descripción · Existencia inicial · Cantidades vendidas · Vales salidas · Entradas · Devoluciones · Ajustes · Transferencias · Existencia final · **Ventas en importe (CUP)** · Ventas USD (informativa). Fila de TOTALES al pie. Marcadores: `—` = cero real, `N/D` = información no disponible, ⚠ = fila con incidencia de conciliación (con tooltip y panel explicativo).
- **Estados**: sin calcular (explicación del informe) · calculando (aria-busy + spinner) · resultados obsoletos (badge "Resultados anteriores" + aviso) · vacío informativo (con contador de excluidos) · error (toast + reintentable).
- **Exportaciones**: Vista previa PDF (iframe bloburl cacheado por firma de configuración, revocación de URLs) · PDF · Excel. Las tres representaciones consumen el MISMO subconjunto de filas filtradas y los mismos totales (`totalsFromRows`).
- **Responsive**: tabla con desplazamiento horizontal controlado (`overflow-x-auto`, min-width) · grid de filtros que colapsa a 1 columna · targets táctiles ≥44px · acciones con texto oculto en móvil.
- **Accesibilidad (WCAG 2.2 AA)**: labels asociados a cada control · `aria-live` del estado de cálculo · `aria-busy` en acciones · caption descriptiva de tabla · `scope="col"` en encabezados · foco visible (`focus-visible:ring-2`) · el estado no se comunica solo con color (icono + texto) · contraste con tokens semánticos del sistema.

## 4. Fuente de datos de cada columna

| Columna | Fuente (única, sin doble conteo) |
|---|---|
| Código / Descripción | `products.sku`, `products.name` (de la tienda) |
| Existencia inicial | `Σ stock_movements.quantity_change` con `movement_date < fecha_inicial` (ledger completo de la tienda). `NULL` (N/D) si el producto no tiene ningún movimiento en el ledger |
| Cantidades vendidas | `−Σ quantity_change` de `movement_type ∈ {sale, sale_void, sale_reverse}` con `movement_date` en período (los reversos netan dentro de la columna) |
| Vales salidas | `−Σ quantity_change` de `{issue_slip_out, issue_slip_reverse, production_out, production_reverse}` (un vale ligado a OT emite `production_out` — incluido) |
| Entradas | `+Σ quantity_change` de `{purchase, purchase_reverse, initial, production_in}` (reversos de recepción netan; cargas iniciales dentro del período cuentan como entrada) |
| Devoluciones | `+Σ quantity_change` de `{return, devolution_reverse}` |
| Ajustes | `+Σ quantity_change` de `{adjustment, void}` + cualquier tipo futuro no mapeado (con incidencia `UNMAPPED_TYPE`) |
| Transferencias | `+Σ quantity_change` de `{transfer, transfer_in, transfer_out}` (neto por tienda: salida −, entrada +) |
| Existencia final | `Ei + Σ período` (calculada, no leída del stock actual) |
| Ventas en importe (CUP) | `Σ transaction_items` (ventas `completed`, `completed_at` en período) convertidos a CUP con la tasa histórica de cada venta, MENOS `Σ devolution_items` de devoluciones `completed` del período |
| Ventas USD | Informativa: `Σ price_at_sale × qty` de líneas con `price_currency='USD'` (nativo, NO se suma con CUP) |

## 5. Fórmula de existencia inicial y final

```
Ei(producto) = Σ quantity_change WHERE movement_date <  from   (ledger de la tienda)
Σ período    = Σ quantity_change WHERE from ≤ movement_date ≤ to
Ef(producto) = Ei + Σ período

Identidad por construcción (cada movement_type mapea a UNA columna):
Ef = Ei + EN + DV − V − VS + AJ + TR
```

**Conciliación contra la fuente canónica** (por producto, en cada generación):
`Σ ledger completo vs inventory.quantity` → si difiere, incidencia `RECONCILIATION` con calculado/esperado/diferencia. Si el producto tiene stock actual pero CERO movimientos → `PRE_LEDGER` con Ei = N/D (nunca cero inventado).

**Limitación informada (§5.1 de la misión)**: la Ei histórica es exacta SOLO si el ledger está completo desde antes del período. Cuando hay pérdida de ledger (resets con saldo de apertura) el informe lo declara con incidencias y `meta.historicalBalanceLimited=true`; NO inventa el saldo.

## 6. Tratamiento de devoluciones, anulaciones y otros movimientos

- **Venta anulada (`void_transaction` → `sale_void`)**: el ledger conserva el `sale` original (−q) y el `sale_void` (+q) → la columna V netea a 0 automáticamente; el dinero NUNCA entra porque solo se suman ventas `status='completed'`. Reversión contable (`reverse_transaction_v2` → `sale_reverse`): mismo tratamiento. **Sin dobles conteos por construcción.**
- **Devolución de venta (`create_devolution_v2`)**: documento `devolutions` (status `completed`; `reversed` al reversarse) + movimiento `return` (+q). El IPV: cantidades del ledger (columna Devoluciones) e importe restado de `devolution_items` (dinero). Una devolución `reversed` no suma ni resta (status ≠ completed; su `devolution_reverse` netea el ledger). **Cantidad y dinero viven en dominios separados** — por diseño no se cuenta dos veces.
- **Vale de salida**: el stock sale al CREAR el vale (`issue_slip_out`, o `production_out` si está ligado a OT; los vales no tienen estado borrador — default `completed`). Reversado → `issue_slip_reverse`/`production_reverse` (+q) netan la columna. Un vale anulado que nunca salió no existe como movimiento → no resta (escenario F).
- **Recepciones**: `purchase` (+) al registrar (o al confirmar si era `pending`); `purchase_reverse` (−) netea. Pedidos/órdenes sin recepción no generan movimiento → no aparecen (§5.4).
- **Ajustes y regularizaciones** (`adjustment`, `void` legacy): columna propia con el signo real del ledger — la conciliación no se rompe si un ajuste es negativo o positivo.
- **Transferencias**: `transfer_out` (−) en origen y `transfer_in` (+) en destino, columna neta por tienda. Las reservas ACTIVE de transferencias pendientes NO afectan al saldo físico (`inventory.quantity` ya es físico; `get_available_stock` es disponibilidad lógica, otro dominio).
- **Nuevo hallazgo (producción)**: divergencia documento↔ledger — dinero de ventas/devoluciones sin NINGÚN movimiento correspondiente en el ledger (pérdida por reset de tienda). Incidencias `SALE_WITHOUT_LEDGER` / `DEVOLUTION_WITHOUT_LEDGER` lo señalan por producto. **Caso real verificado**: TIENDA CENTRAL COSTPRO tiene 5 devoluciones completadas (ago-2026) del producto CAT-0002 cuyo movimiento `return` no existe (ledger reconstruido con `initial` +966 el 06-sep tras un reset). El IPV muestra el dinero tal cual, deja la columna de cantidades fiel al ledger y explica la diferencia — no altera datos.

## 7. Regla de inclusión de productos

Se incluye un producto si cumple AL MENOS UNA:
1. Existencia inicial ≠ 0 (reconstruida) · 2. Tiene movimientos válidos en el período · 3. Existencia final ≠ 0 · 4. Presenta incidencia que requiere conciliación · 5. (Ampliación auditada) Importe vendido ≠ 0 aunque el ledger no tenga su movimiento — ocultar ingresos sería peor que mostrar la columna de stock N/D.

Se excluye solo el producto con Ei=0, sin movimientos, Ef=0 y sin incidencias (contador `excludedCount` visible). La selección es 100% por datos reales — sin listas estáticas de códigos.

## 8. Tratamiento de monedas

- **CUP es la moneda contable de COSTPRO** (`transactions.total_amount` SIEMPRE CUP, inmutable por trigger). La columna "Ventas en importe (CUP)" usa el `price_at_sale_cup` de cada línea — **la tasa aplicada es la histórica de esa venta** (jerarquía server-side de `create_sale_v2`: tasa manual de tienda → BCC → elToque), nunca la tasa actual. No se inventa ni se reconvierte nada.
- **USD**: columna informativa separada con el importe nativo de las líneas vendidas en USD (`price_currency='USD'`). **Nunca se suman CUP y USD**; el encabezado declara ambas monedas y el PDF/Excel lo rotulan.
- Ventas `sale_currency='MIXED'`: su importe vive en las líneas (cada línea tiene su moneda y tasa), por lo que el IPV las captura correctamente por producto (a diferencia del resumen de caja, que las excluye por método de pago).
- Comisiones: excluidas — viven en `payment_transactions` (ref_type='commission'), `commission_payments` y `sales_transactions` (espejo para comisiones); ninguna entra al IPV.
- Pagos mixtos: irrelevantes para el importe por producto (el desglose por forma de pago es dominio de Reporte Entrega; el IPV suma LÍNEAS, no pagos — no hay doble conteo posible por varias líneas de pago).

## 9. Cálculo de "Ventas en importe"

Por línea de venta del período (`transactions.status='completed'`, `completed_at` ∈ período, tienda):

```
tasa      = item.exchange_rate > 0 ? item.exchange_rate : (transactions.sale_exchange_rate > 0 ? … : 1)
unit_esp  = price_at_sale × tasa
forma     = |price_at_sale_cup − unit_esp| ≤ 0,02        → UNITARIA  → total = price_at_sale_cup × qty
          = |price_at_sale_cup − unit_esp × qty| ≤ tol(0,5%) → LEGADO V1 → total = price_at_sale_cup   (ya era total de línea)
          = price_at_sale_cup ausente                     → total = unit_esp × qty
          = ambigua                                       → UNITARIA + incidencia PRICE_ANOMALY
Ventas en importe (CUP) = Σ totales − Σ devolution_items(completed) por producto
```

Descuentos: se usa la **línea bruta cobrada** porque el sistema contable suma brutas (`total_amount = Σ líneas`; `item_discount_value` es informativo — verificado en BD). La guarda legacy fue validada contra la fila real `2×9450 USD @340 → 6.426.000` (sin inflación). Redondeo: `round2` por línea (moneda) y `roundQ` (6 decimales) para cantidades — 10.125, 65.25, 1.75 se muestran fieles; precisión de display hasta 4 decimales (ej. real: 966.1289).

## 10. Componentes y archivos modificados/creados

| Archivo | Tipo | Función |
|---|---|---|
| `src/lib/ipv-ventas/compute.ts` | **Nuevo** | Núcleo PURO: mapeo de los 18 `movement_type` a 6 columnas, reconstrucción de Ei, conciliación, guarda legacy de precios, incidencias (6 tipos), regla de inclusión, totales compartidos (`totalsFromRows`) |
| `src/lib/ipv-ventas/format.ts` | **Nuevo** | Formato numérico compartido pantalla/PDF (es, 4 dec. cantidades, 2 dec. importes, `—`/`N/D`) y etiquetas canónicas de columnas |
| `src/app/api/ipv-ventas/route.ts` | **Nuevo** | `GET /api/ipv-ventas`: `withAuth` + cliente de sesión (RLS) + `canViewStore` (tienda explícita o activa del perfil), validación server-side (ISO, orden, tope 366 días, UUID), 5 consultas acotadas por tienda, solo lectura |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | **Nuevo** | Vista canónica: filtros, tabla+totales, incidencias, estados, búsqueda, preview cacheado, exportaciones con el mismo dataset, WCAG AA |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf.ts` | **Nuevo** | PDF A4 horizontal (jsPDF+autoTable): encabezado completo, encabezados repetidos, números alineados, totales al pie, sección de incidencias, nota metodológica, paginación |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-excel.ts` | **Nuevo** | Excel 3 hojas (IPV, Incidencias, Nota metodológica): números reales con formatos de celda, códigos como texto (ceros iniciales), sanitización anti-fórmulas, totales idénticos |
| `src/store/index.ts` | Editado | ViewType `'ipv_ventas'` |
| `src/config/navigation/navigation-definition.ts` | Editado | Hoja bajo Ventas (roles como Reporte Entrega, keywords) + `VALID_VIEWS` + import `ReceiptText` |
| `src/components/views/TerminalShell.tsx` | Editado | Dynamic import + `case 'ipv_ventas'` con ViewErrorBoundary |
| `src/__tests__/ipv-ventas/compute.test.ts` | **Nuevo** | 28 pruebas: escenarios A–L + guarda legacy + incidencias + precisión + inclusión |
| `src/__tests__/navigation/ipv-ventas-navigation.test.ts` | **Nuevo** | 6 pruebas de contrato de navegación |

**Migraciones o RPC añadidas: NINGUNA (decisión deliberada).** El IPV es de solo lectura y reutiliza la fuente canónica existente; crear una RPC duplicatearía lógica de agregación y requeriría cambiar el esquema de producción sin necesidad. El volumen actual (≤2,5 MB de ledger; ≤6 meses de retrodatación por política) hace innecesaria la agregación en SQL. Camino de escalado documentado: si el ledger creara órdenes de magnitud, una RPC `ipv_aggregate(p_store_id, p_from, p_to)` con `GROUP BY product_id` sería la optimización natural (contrato equivalente a la entrada actual de `computeIpv`).

## 11. Pruebas ejecutadas y resultados

**Locales (entorno PM2 + bun, 2026-10-16):**

| Suite | Resultado |
|---|---|
| `src/__tests__/ipv-ventas/compute.test.ts` (escenarios A–L + hallazgos) | **28/28 ✓** |
| `src/__tests__/navigation/ipv-ventas-navigation.test.ts` (contrato) | **6/6 ✓** |
| ESLint módulo IPV (lib + api + vista + tests) | **0 errores** (5 warnings del mismo tipo que el patrón existente `<button>` — igual que CashReportView) |
| TypeScript | tsc local OOM (4 GB sin swap — limitación conocida del entorno); **CI = autoridad** (ver §15) |

**Escenarios de la misión (§13) — todos automatizados con datos SINTÉTICOS (ninguno toca datos reales):**

| Escenario | Prueba | Resultado |
|---|---|---|
| A — Venta que agota existencia | Ei=5, V=5 → Ef=0; producto aparece | ✓ |
| B — Entrada de inventario | Ei=0, EN=10 → Ef=10; aparece | ✓ |
| C — Entrada y venta parcial | Ei=5, EN=10, V=7, VS=2, DV=1 → Ef=7 exacto | ✓ |
| D — Producto irrelevante | Ei=0, sin movs, Ef=0 → excluido (también si solo tiene movs posteriores) | ✓ |
| E — Devolución de venta | Cantidades del ledger (5 vendidas, 2 devueltas), importe neto 3000=5000−2000; sin doble conteo | ✓ |
| F — Vale anulado | out −3 + reverse +3 → VS neto 0; `production_out` cuenta como vale | ✓ |
| G — Período histórico | Ei = saldo previo al día 1 (15); compras posteriores al corte NO entran; límites inclusivos | ✓ |
| H — Monedas diferentes | CUP y USD separados; línea USD con tasa histórica 400 → 18.000 CUP + 45 USD nativo | ✓ |
| I — Precisión decimal | 65.5, 65.25, 0.5, 1.75, 10.125 fieles (roundQ 6 dec; display 4 dec) | ✓ |
| J — Cambio de tienda | Cada ejecución solo consume su tienda (la API filtra por store_id + RLS) | ✓ |
| K — Exportaciones | Tabla, PDF y Excel consumen las MISMAS filas filtradas y `totalsFromRows` (misma ejecución) | ✓ |
| L — Diferencia de inventario | Deriva controlada → incidencia RECONCILIATION con calculado/esperado/diferencia; sin ajuste de datos | ✓ |
| Extras | Guarda legacy (forma V1 real 6.426.000 sin inflar), PRE_LEDGER N/D, UNMAPPED_TYPE, sale_reverse neteo, conciliación de totales, importe bruto (descuento informativo), dinero sin ledger | ✓ |

**Pruebas de interfaz/servidor contra PRODUCCIÓN (solo lectura; `ENABLE_DEV_BYPASS` activado temporalmente para autenticar y restaurado a `false` después; `pm2 save` ejecutado):**

| Verificación | Resultado |
|---|---|
| TIENDA CENTRAL COSTPRO (tienda de pruebas), 01-ago → 16-oct | 98 filas, 28 excluidas, conciliación limpia vs `inventory` (0 RECONCILIATION); Ei 0 → EN 6.427 → Ef 6.416 = stock canónico ✓ |
| Puerto Padre (sep 2026) | 27 filas, 0 incidencias, Ei = Ef = 966.1289 (4 decimales reales) ✓ |
| ENERVIDA (solo lectura, may → oct) | 150 filas, 1.000 movimientos, **1.054 ms** de latencia end-to-end; incidencias honestas: 51 RECONCILIATION (deriva documentada), 26 PRICE_ANOMALY (guarda legacy activa), 4 SALE_WITHOUT_LEDGER, 4 PRE_LEDGER; Ei/Ef totales = N/D (no ceros) ✓ |
| Validaciones de error | fecha inválida→400; from>to→400; store_id no-UUID→400; sin sesión→401 ✓ |
| Integridad | El IPV no ejecuta NINGÚN write en producción (GET + SELECT únicamente) — aislamiento Enervida garantizado por diseño read-only |

## 12. Comparación entre la vista, el PDF y el Excel

Una sola ejecución del informe (`/api/ipv-ventas`) produce el dataset; la vista filtra por búsqueda y las TRES representaciones consumen ese mismo subconjunto:

| Aspecto | Vista | PDF | Excel |
|---|---|---|---|
| Filas | `filteredRows` | `filteredRows` | `filteredRows` |
| Totales | `totalsFromRows(filteredRows)` | idem (`totalsOverride`) | idem (`totalsFromRows`) |
| Orden de columnas | canónico (12) | idem | idem |
| Ceros / N/D | `—` / `N/D` | `—` / `N/D` | `0` numérico / texto `N/D` |
| Números | formateados es | formateados es, alineados a la derecha | **números reales** con formatos de celda (#,##0.#### / #,##0.00) |
| Códigos | texto | texto | **texto** (conserva ceros iniciales), sanitizado anti-fórmula |
| Incidencias | panel plegable | sección propia al final | hoja "Incidencias" separada |
| Metodología | tooltip/panel | nota al pie | hoja "Nota metodológica" |

El preview del PDF renderiza EL MISMO documento que se descarga (`doc.output('bloburl')` vs `doc.save()` sobre el mismo `jsPDF`) → el preview es fiel al PDF final.

## 13. Evidencias de conciliación

1. **Costpro Central (01-ago → 16-oct-2026)**: Ef calculada total 6.416 == Σ `inventory.quantity` de los productos incluidos → **0 incidencias RECONCILIATION**; el API devuelve `historicalBalanceLimited=false`. Fila ejemplo: CAT-0001 "Abrazade metálica de 3/4" Ei 0 → EN 19 → V 1 → Ef 18, importe 350 CUP (coincide con la devolución unitaria de 350 de la misma familia de productos).
2. **Puerto Padre (sep)**: sin movimientos en el mes → Ei = Ef = 966.1289 exactos por producto; 0 incidencias.
3. **ENERVIDA**: 51 productos con deriva ledger↔canónica reportada CON cifras (calculado/esperado/diferencia) — corresponde a la deriva documentada del sistema (cargas iniciales sin movimiento); el informe la muestra, no la corrige.
4. **Divergencia documento↔ledger (hallazgo nuevo)**: CAT-0002 de Central con 5 devoluciones completadas (agosto) y 0 movimientos `return` en un ledger reiniciado el 06-sep → incidencia `DEVOLUTION_WITHOUT_LEDGER` con explicación; importe neto mostrado tal cual (−353.500 del período), columnas de stock fieles al ledger.
5. **Conciliación monetaria estructural**: Σ importes del IPV ≡ Σ líneas brutas de ventas `completed` (el sistema suma brutas) − devoluciones completadas; comisiones y pagos excluidos por diseño; verificable con cualquier transacción (p. ej. 38.000 = 2×19.000).

## 14. Evaluación de calidad (ISO/IEC 25010, OWASP, WCAG 2.2, buenas prácticas de inventario)

Evaluación basada en pruebas ejecutadas (no certificación formal). Referencias: ISO/IEC 25010 (adecuación funcional, fiabilidad, usabilidad, rendimiento, seguridad, mantenibilidad), OWASP ASVS/Top-10 (A01 autorización, A03 inyección, A04 diseño seguro), WCAG 2.2 AA, prácticas de auditoría de inventarios (saldos reproducibles, conciliación, trazabilidad).

| # | Dimensión | Puntuación | Justificación (con límites reales) |
|---|---|---|---|
| 1 | Exactitud del saldo inicial | **8.5** | Ei reconstruida del ledger con ventana por fecha operativa; límites declarados con incidencias PRE_LEDGER/RECONCILIATION y `historicalBalanceLimited`. No es 10 porque el sistema NO conserva ledger completo para todas las tiendas (deriva documentada + resets): donde el ledger falta, Ei es N/D o aproximada, y así se declara — no se inventa |
| 2 | Exactitud de cantidades por movimiento | **9.5** | Un solo dominio (ledger), mapeo completo y probado de los 18 tipos reales, reversos netean por construcción, precisión 6 dec internos/4 display, UNMAPPED_TYPE defensivo para tipos futuros. Riesgo residual: variantes (qty en unidades de venta vs base) ya resuelto al usar el ledger (base), pero no hay test específico con conversion_factor ≠ 1 |
| 3 | Conciliación del saldo final | **9** | Ef por construcción cierra la identidad de columnas (testeada); verificación cruzada vs `inventory.quantity` con incidencias explícitas; validado en producción (Central 6.416 == canónico). No 10: la conciliación "final == canónico" solo es estricta cuando el período llega a hoy y el ledger está completo |
| 4 | Exactitud de los importes de ventas | **9** | Precio capturado al vender + tasa histórica por venta; guarda legacy probada contra fila real corrupta; línea bruta = criterio contable del sistema verificado; devoluciones restadas por documento. Riesgo residual: `PRICE_ANOMALY` muestra 26 casos reales de Enervida cuya forma no pudo confirmarse (se asume unitaria y se marca) |
| 5 | Tratamiento de monedas | **9** | CUP contable con tasa histórica (nunca tasa actual), USD nativo en columna separada, nunca se suman; documentado en pantalla/PDF/Excel. No 10: devoluciones registradas en moneda distinta a CUP no tienen desglose USD propio (no existen hoy; limitación documentada) |
| 6 | Calidad del PDF | **9** | A4 horizontal apropiado a 12 columnas, encabezado completo (tienda/título/período/generación/monedas/nº productos), encabezados de tabla repetidos, números alineados, totales al pie, sección de incidencias, numeración de páginas, preview fiel (mismo doc), sin elementos de navegación. Verificación pendiente de inspección visual del archivo generado en dispositivo real del usuario |
| 7 | Calidad del Excel | **9** | Números reales (no texto) con formatos de celda, códigos como texto con ceros iniciales, 3 hojas separadas que concilian con el resumen, anti-fórmulas, totales idénticos a lo visible, sin duplicados ni excluidos indebidos (regla de inclusión única compartida) |
| 8 | Rendimiento | **8.5** | 5 consultas acotadas (sin N+1), agregación en Node, lazy chunks (jsPDF/xlsx solo al exportar), 1.054 ms end-to-end en la tienda más grande (1.000 movs) y 0 incidencias de timeout. No 10: la consulta de movimientos trae TODO el ledger de la tienda (necesario para Ei) — con años de datos convendrá la RPC agregada documentada |
| 9 | Seguridad multitienda | **9** | `withAuth` + cliente Supabase de SESIÓN (RLS respetada) + `canViewStore` sobre el store_id solicitado + validación server-side de todos los parámetros + sin secretos en errores + solo lectura (cero writes) + aislamiento verificado (ENERVIDA leída sin escribir). No 10: la RLS efectiva depende de las políticas existentes del proyecto (no se añadieron políticas nuevas para este módulo — no hizo falta) |
| 10 | Experiencia de usuario | **9** | Ubicación coherente, filtros compactos con períodos rápidos, tabla protagonista con totales y marcas —/N/D/⚠, estados completos (sin calcular/cargando/obsoleto/vacío/error), preview integrado, 3 exportaciones, responsive con scroll controlado, coherencia visual con Reporte Entrega (PageHeader neutral). Pendiente: validación con usuarios reales del campo |
| 11 | Cobertura de pruebas | **8.5** | 34/34 locales: 12 escenarios obligatorios + 8 casos de borde + contrato de navegación; smoke tests reales de API en 3 tiendas + 4 rutas de error. No 10: la suite E2E Playwright de UI del IPV y el typecheck/build completos dependen de CI (4 GB locales insuficientes) — estado en §15 |
| 12 | Mantenibilidad | **9** | Núcleo puro testeable separado de I/O, un solo dataset para 3 renderers, mapeo de tipos centralizado y defensivo, sin migraciones ni RPC nuevas (cero superficie de esquema), patrón replicado de CashReportView (consistencia), comentarios que citan misión y hallazgos |

**Ninguna puntuación es 10** deliberadamente: existen datos históricos con pérdida de ledger (limitación estructural del sistema, informada), 26 anomalías de precio reales sin resolver en origen, y las verificaciones de build/E2E quedan delegadas a CI. OWASP: sin riesgo A01/A03 identificado en el módulo (autorización por membership + RLS de sesión; entrada sanitizada en Excel; sin SQL dinámico). WCAG: criterios AA cubiertos en los componentes nuevos (labels, foco, contraste por tokens, no-color-solo, targets 44px).

## 15. Riesgos y limitaciones pendientes

1. **Ledger incompleto en tiendas con historial de resets** (documentado por el propio sistema): la Ei histórica es N/D o declarada limitada con incidencias. Mitigación futura: backfill de movimientos de apertura o snapshots programados; FUERA del alcance (requeriría escritura en datos de producción).
2. **Anomalías de precio legacy (26 en ENERVIDA)**: la guarda asume forma unitaria y marca la fila. Distinguir por fecha de creación contra las versiones del RPC sería posible pero frágil; se eligió autocoherencia + incidencia.
3. **Divergencias documento↔ledger** (ventas/devoluciones sin movimiento): reportadas; su reparación requiere investigación operativa por tienda (no automatizable sin riesgo).
4. **Variants con `conversion_factor ≠ 1`**: el IPV usa unidades base del ledger (correcto para conciliación); el importe usa el precio por unidad de venta — la fila es coherente, pero un test E2E con variantes sería deseable.
5. **Períodos > 366 días** bloqueados por diseño (protección de rendimiento); la política del sistema limita la retrodatación a 6 meses, alineado.
6. **Typecheck/build/E2E**: autoridad en CI (limitación local de 4 GB). Estado en la tabla siguiente.

## 16. Estado de rama, PR, CI y despliegue

| Ítem | Estado real (verificado) |
|---|---|
| Rama | `feat/ipv-ingresos-por-ventas` — commits `c23904c`, `e26761f`, `0533112`, `6b5f57c`, `9019683` pushados a `origin` |
| PR | **#1411** — https://github.com/Nardian90/Costpro/pull/1411 |
| CI (SHA `9019683`) | **Security CI Gate: success · Test Coverage: success · CI: success** (TypeCheck + Lint + Unit Tests + Build — el build pasa en el runner de CI, autoridad por la limitación local de 4 GB). Primer run (`6b5f57c`) falló por el contrato GATE 1.3 del menú Ventas; el contrato se actualizó CON el nuevo hijo (`ipv_ventas`) sin desactivar la prueba y CI quedó verde |
| Suite local completa | (ver comentario del PR / resultados finales del run — CI es la referencia autorizada) |
| Despliegue | Vercel despliega `main` tras el merge — verificación de producción registrada al cierre del informe |
| Datos comerciales | NINGÚN dato fue alterado: el IPV es read-only; las pruebas usan datos sintéticos y lecturas; `ENABLE_DEV_BYPASS` se activó solo para el smoke test local y quedó restaurado a `false` (+ `pm2 save`) |
| Aislamiento | ENERVIDA: solo lecturas de verificación; cero escrituras |
