# MISIÓN — CATÁLOGO ENERVIDA: CREACIÓN SKU 178–181, ENTRADA SKU 139, NOMBRES 158/162/176 Y PRECIO SKU 108

**Estado de cierre: COMPLETADA** (las 4 tareas ejecutadas y verificadas contra la base de datos real).

| Campo | Valor |
|---|---|
| Fecha de ejecución | 2026-10-17, 14:28:21–14:28:32 UTC (10:28 AM Havana) |
| Repositorio | `github.com/Nardian90/Costpro` (clon local `/home/z/costpro`) |
| Rama del informe | `docs/mision-catalogo-entrada-sku139-precio-sku108` (desde `origin/main` = `295cae72e`) |
| Tienda | **ENERVIDA-VITALLCONS** — `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`) |
| Usuario ejecutor (identidad de negocio) | Admin CostPro — `051c6157-600b-425e-b8c0-72388bacf541` (membresía admin activa) |
| Canal de escritura | PostgREST de Supabase (`/rest/v1`) con rol de servicio — el mismo canal de tabla que usan los hooks oficiales `useCreateProduct` / `useUpdateProduct` / `useRegisterReception`; RPC `register_reception` con `p_user_id` real |
| Base de datos | Supabase CostproBD (ref `wthkddeleylijmonclxg`) — la misma que usa la aplicación |

---

## 1. Resumen ejecutivo

| # | Tarea | Resultado |
|---|---|---|
| A | Crear SKU 178, 179, 180, 181 con nombres exactos y existencia 0 | **COMPLETADA** — 4 productos creados, existencia 0, sin duplicados |
| B | Entrada SKU 139 × 2 (Proveedor1, costo 1) | **COMPLETADA** — recepción `aed568be-63f0-4082-a7ab-b20f43513e40`, Kardex +2, inventario 0 → 2 |
| C | Corregir nombres SKU 158, 162, 176 | **COMPLETADA** — 3 nombres actualizados, stocks y movimientos intactos |
| D | Precio SKU 108 → 12000 CUP | **COMPLETADA** — precio 0 → 12000 CUP, resto intacto |

No se registró ninguna otra operación. No se tocó ningún producto, precio, existencia, movimiento ni configuración fuera del alcance descrito (sección 10).

## 2. Fase de inspección previa (obligatoria)

Antes de cualquier escritura se ejecutó una inspección de solo lectura sobre la BD real (`scripts/mision17_inspeccion.py`, evidencia `mision17_inspeccion.json`):

1. **Repositorio/rama**: clon limpio en `/home/z/costpro`; la misión anterior quedó en la rama `docs/mision-registro-conciliacion-16-10-2026` (PR #1417, abierto, sin fusionar). Este informe se escribe en rama nueva desde `main` para no mezclar entregables.
2. **Tienda**: confirmada por consulta directa `stores.id = 5e6fe821-…` → `ENERVIDA-VITALLCONS`, tenant `5364ccf8-…`. Todas las escrituras se filtraron por `store_id`/`id` exactos.
3. **SKU 178–181**: **no existían** — 0 filas en ENERVIDA, 0 filas en cualquier otra tienda (`products` global), 0 variantes (`product_variants`). No había ocultos, inactivos ni variantes que reutilizar.
4. **Entrada SKU 139 (fila 20 del 16/10)**: **no estaba registrada**. La única recepción reciente del producto era la del 2026-09-18 (`d623d1b5-4d8c-43d3-9d86-fa5a11a819a8`, 63 uds, proveedor Vitallcons, costo 1, referencia `IMPORT-ENERVIDA-607`). Inventario canónico previo: **0.0000** (`inventory` versión 22), coherente con la conciliación del 16/10 que reportó la diferencia −2 explicada por esta entrada pendiente.
5. **Flujos oficiales identificados** (lectura de `src/hooks/api/useProducts.ts`, `src/hooks/api/useInventory.ts`, `src/components/modals/CreateProductModal.tsx`, migración `supabase/migrations/20260909000000_rem_f4_04_register_reception_canonical_wac.sql`):
   - **Creación de producto**: INSERT PostgREST en `products` (no hay RPC de creación); campos obligatorios `name`, `sku`, `store_id`; el formulario oficial usa `unit_of_measure='unidad'` por defecto; el stock inicial es 0 (sin fila en `inventory` hasta la primera recepción); el trigger `trg_ensure_product_barcode` asigna código de barras interno `INT…` si no se envía.
   - **Modificación de producto**: PATCH PostgREST en `products` por `id` con solo los campos editados (así lo hace `useUpdateProduct`); el trigger `trigger_audit_product_changes` registra `UPDATE_PRODUCT` cuando cambian `name`/`price`/`cost_price`/`sku`.
   - **Recepción**: RPC `register_reception(p_store_id, p_supplier, p_reception_date, p_invoice_number, p_items, p_user_id, p_po_id)`; exige proveedor no vacío, `unit_cost > 0`, producto de la tienda, y valida la fecha con `validate_operation_date` (lookback 6 meses, máximo hoy + 1 día); recalcula WAC (`fn_recalc_wac`) y registra el movimiento de Kardex (`purchase`) vía `register_stock_movement`; la protección antirrepetición es la restricción única `(store_id, reference_doc)` en `receipts`.
6. **Permisos**: el usuario Admin CostPro figura como admin activo y ya ejecutó operaciones oficiales en esta tienda el 16/10 (auditoría `UPDATE_PRODUCT` del 16/10 13:59 con su `user_id`).

## 3. Estado inicial relevante de los SKU involucrados

Consultado en la BD real antes de modificar (2026-10-17 ~14:27 UTC):

| SKU | id | Nombre (inicial) | Precio | Existencia (inv. canónica) | Movimientos | Observaciones |
|---:|---|---|---|---:|---:|---|
| 108 | `c2f4df7e-045a-4990-a34a-d211387e3924` | Cajita Breckera sencilla gris | **0 CUP** | 0 | 3 | `price_currency='CUP'` |
| 139 | `8436ffa6-8624-496d-b430-cdd5c0dae43f` | Panel de 640 W Suntech | 210 USD (fuera de alcance) | **0** | 22 | Último mov. 14/10 (VS-000183-2026 −8 → saldo 1; venta −1 → saldo 0) |
| 158 | `da7bb624-d5d6-4766-b46c-26dead861778` | **Detergente** | 800 CUP | 21 | 6 | — |
| 162 | `402ceab9-93c7-4b4f-9b16-016c8d978a01` | **Ventana** | 0 CUP | 0 | 0 | — |
| 176 | `8d8df1be-91ed-4ec8-aa77-b85dc4c57887` | **Batería 12.8v100Ah** | 0 CUP | 1 | 1 | — |
| 178–181 | — | — | — | — | — | **Inexistentes** (tienda, global y variantes) |
| 52 (control) | — | Pintura Verde 4L | 2500 CUP | 42 | — | Intacto, fuera de alcance |

## 4. Tarea A — Creación de los códigos 178, 179, 180 y 181

**Flujo oficial**: INSERT PostgREST en `products` (mismo canal que `useCreateProduct`). Se enviaron **únicamente** los campos obligatorios (`name`, `sku`, `store_id`) y el valor por defecto legítimo del formulario oficial (`unit_of_measure='unidad'`). El resto de propiedades quedaron con los valores predeterminados del sistema: `price=0`, `cost_price=0`, `min_stock=1`, `is_active=true`, `status='ACTIVE'`, `visible_en_tienda=false`, `stock_current=0`, código de barras interno asignado por el trigger `trg_ensure_product_barcode`. No se inventaron precios, costos, proveedores, categorías, unidades ni códigos de barras. `tenant_id` quedó NULL (patrón del flujo manual de creación; 157 de 179 productos de la tienda lo tienen así, incluidos 108 y 139).

Resultado: **HTTP 201**, 4 filas creadas (evidencia en `scripts/mision17_ejecucion.json` → `tareas.A_crear.creados`):

| Código | Nombre exacto | id generado | Código de barras (sistema) | Existencia |
|---:|---|---|---|---:|
| 178 | Brecker DC 125 Doble | `0889033f-1943-4e87-972a-00c4e941ef1f` | INT000000003030 (INTERNAL) | 0 |
| 179 | Brecker AC 25 Doble | `87c443a1-7d39-41ed-bdf9-7625ebe0c35b` | INT000000003031 (INTERNAL) | 0 |
| 180 | Pintura Blanco 4L | `57ebfa9e-fe39-496b-ba6f-e2c6dda5d82a` | INT000000003032 (INTERNAL) | 0 |
| 181 | Pintura Amarillo 4L | `fd994527-4367-4023-a518-85a8b2a5e0e1` | INT000000003033 (INTERNAL) | 0 |

**Verificación posterior** (consultas V1–V3 de `scripts/mision17_verificar.py`):
- Los 4 códigos existen con los nombres exactos, `price=0 CUP`, `is_active=true`, `stock_current=0.0000`.
- **Existencia cero canónica**: 0 filas en `inventory` y 0 movimientos en `stock_movements` para los 4 (el stock canónico es 0 hasta la primera recepción, igual que cualquier producto nuevo creado desde la UI).
- **Sin duplicados**: exactamente 1 fila por código en ENERVIDA y 1 fila global cada uno.
- El SKU 180 (`Pintura Blanco 4L`) no reutilizó ni afectó al SKU 52 (`Pintura Verde 4L`, verificación V13: nombre, precio 2500 CUP y existencia 42 intactos).

## 5. Tarea B — Entrada del SKU 139 (2 unidades, Proveedor1, costo 1)

**Comprobación previa**: no existía recepción del 16/10 para el SKU 139 (sección 2.4) y el stock previo era 0 — no había recepción parcial que completar; correspondía registrar la entrada completa de 2 unidades.

**Flujo oficial**: RPC `register_reception` (mismo que `useRegisterReception` en la vista de recepción), con las validaciones íntegras del sistema (fecha, acceso a tienda, proveedor obligatorio, costo > 0, producto de la tienda, WAC, Kardex, auditoría):

| Parámetro | Valor |
|---|---|
| `p_store_id` | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (ENERVIDA-VITALLCONS) |
| `p_supplier` | `Proveedor1` (valor autorizado por la misión) |
| `p_reception_date` | `2026-10-16T16:00:00+00:00` = 16/10/2026 12:00 mediodía Havana (fecha económica de la misión; validada por `validate_operation_date` dentro del lookback de 6 meses — pasada sin errores) |
| `p_invoice_number` | `MISION-1610-F20-SKU139` — referencia operativa para la protección antirrepetición (única `(store_id, reference_doc)`); no es una factura comercial: identifica la fila 20 de la misión 16/10 |
| `p_items` | `[{"product_id":"8436ffa6-…","variant_id":null,"quantity":2,"unit_cost":1,"moneda_recepcion":"CUP","tasa_cambio_recepcion":1.0}]` |
| `p_user_id` | `051c6157-600b-425e-b8c0-72388bacf541` (Admin CostPro) |

Resultado: **HTTP 200**, receipt **`aed568be-63f0-4082-a7ab-b20f43513e40`**.

**Verificación obligatoria** (consultas V4–V6, V14, V9):

| Comprobación | Evidencia real |
|---|---|
| Recepción persistida | `receipts` fila `aed568be-…`, estado `active`, tienda ENERVIDA, proveedor `Proveedor1`, fecha 2026-10-16 16:00 UTC, referencia `MISION-1610-F20-SKU139`, `total_cost = 2.00` |
| Cantidad exactamente 2, sin duplicación | `receipt_items`: 1 fila, `quantity = 2.0000`, `unit_cost = 1`, `moneda_recepcion = CUP`, `tasa = 1.0` |
| Movimiento en el Kardex | `stock_movements`: `movement_type='purchase'`, `quantity_change = +2.0000`, `movement_date = 2026-10-16 16:00 UTC`, `unit_cost = 1.0`, **`balance_after = 2.0000`**, `notes = aed568be-…` (id de la recepción), `created_by = Admin CostPro` |
| Existencia aumenta en 2 | `inventory.quantity`: 0.0000 (versión 22) → **2.0000 (versión 23)**; `products.stock_current`: 0 → **2.0000** |
| Proveedor y costo correctos | `supplier = Proveedor1`, `unit_cost = 1`, total de referencia 2 CUP |
| Pertenencia a la tienda | `store_id = 5e6fe821-…` en receipt, item y movimiento |
| WAC recalculado por el flujo | `cost_average = 1.0`; registro en `wac_change_log` id `f10cfeed-970c-4faf-8270-5d9afa29827c` (evento `reception_in`, qty 2, uc 1, WAC 1.0 → 1.0) |
| Auditoría | `audit_logs`: `REGISTER_RECEPTION` sobre `receipts` con `user_id = Admin CostPro`, metadata `{supplier: Proveedor1, total_cost: 2.0, items_count: 1}`, timestamp real 2026-10-17 14:28:26 UTC |

**Sobre la fecha**: la fecha económica 16/10/2026 fue aceptada por la validación oficial (`validate_operation_date`, lookback 6 meses). No se alteró ninguna marca de tiempo fuera del comportamiento estándar del RPC: `receipts.created_at`, `receipt_items.created_at` y `movement_date` quedan con la fecha económica (así funciona el flujo oficial para cualquier recepción con fecha anterior a hoy), mientras que la hora real de ejecución quedó registrada por el propio sistema en `audit_logs` (2026-10-17 14:28:26 UTC) y `wac_change_log` (2026-10-17 14:28:26.430 UTC). No se eludió ninguna validación.

**Cierre de la diferencia de conciliación**: con esta entrada, el SKU 139 pasa de la diferencia −2 documentada el 16/10 (esperado 2, actual 0) a un stock canónico de **2 unidades**, en línea con la referencia.

## 6. Tarea C — Corrección de nombres SKU 158, 162, 176

**Flujo oficial**: PATCH PostgREST en `products` por `id` con únicamente `{"name": …}` (mismo canal y mismos campos que `useUpdateProduct` desde `EditProductModal`). El trigger de BD `trigger_audit_product_changes` registró cada cambio (acción `UPDATE_PRODUCT`, timestamps reales 2026-10-17 14:28:28–14:28:31 UTC). Los tres PATCH devolvieron HTTP 200.

| Código | Nombre anterior | Nombre final (verificado) | SKU | Existencia | Movimientos |
|---:|---|---|---:|---:|---:|
| 158 | Detergente | **Detergente liquido** | sin cambios (`da7bb624-…`) | 21 (sin cambios) | 6 (sin cambios) |
| 162 | Ventana | **Ventana de cristal** | sin cambios (`402ceab9-…`) | 0 (sin cambios) | 0 (sin cambios) |
| 176 | Batería 12.8v100Ah | **Brecker de 125A** | sin cambios (`8d8df1be-…`) | 1 (sin cambios) | 1 (sin cambios) |

- Se verificó por consulta posterior (V7) que los nombres finales son **exactamente** los indicados por la misión (sin espacios ni mayúsculas extra).
- No se modificaron códigos, precios, costos, unidades de medida, existencias ni historiales: la consulta de verificación demuestra stocks e inventario idénticos al estado inicial (21 / 0 / 1) y los mismos conteos de movimientos (6 / 0 / 1).
- Los tres productos pertenecen exclusivamente a ENERVIDA-VITALLCONS (`products.store_id`), por lo que el cambio no afecta catálogos ajenos: el catálogo es por tienda (no hay tabla maestra compartida).

## 7. Tarea D — Precio de venta SKU 108 → 12000 CUP

**Flujo oficial**: PATCH PostgREST en `products` con únicamente `{"price": 12000}` (mismo canal que `useUpdateProduct`). **HTTP 200**.

- **Precio anterior**: `0` CUP (`price='0'`, `price_currency='CUP'`) — coherente con la venta del 16/10 (fila 17), donde el sistema calculó total 0 por precio de catálogo 0 y el sobrepago de 12,000 CUP quedó documentado como incidencia.
- **Precio final verificado**: **`12000`** en **`CUP`** (consultas V8 y V15).
- **Cómo almacena COSTPRO los precios**: una única columna `price` con discriminador `price_currency` (CUP/USD/EUR/MLC); no existen `price_usd`, listas de precios ni precios por tienda (el precio de venta del POS se lee de `products.price` interpretado en `products.price_currency`; `cost_price` es siempre CUP). El registro correcto era por tanto la fila del SKU 108 en ENERVIDA, y el valor se estableció **en CUP sin tocar la moneda** (ya era CUP).
- **No interpretado como USD**: `price_currency` sigue siendo `CUP`; el precio USD no existe para este producto y no se creó ninguno.
- **Integridad**: `cost_price` (0), existencia (0), movimientos (3) y nombre sin cambios. Auditado por trigger: `UPDATE_PRODUCT` sobre `c2f4df7e-…` a las 2026-10-17 14:28:32 UTC.
- **Precio efectivo en pantalla de venta**: el precio que muestra el POS proviene de `get_products_for_pos`, que devuelve `products.price`/`price_currency` (lectura de código: `POSView.tsx` y `cart.ts`). La llamada directa a esa RPC exige sesión de navegador (`auth.uid()`), no disponible en este canal; la verificación se realizó en la fuente de la que esa pantalla lee el valor (V15: `price=12000, price_currency=CUP`).

## 8. Notas técnicas y transparencia de canal

1. **Canal de escritura**: las escrituras de catálogo (INSERT/PATCH) se hicieron por PostgREST con rol de servicio — el mismo canal de tabla que la aplicación usa desde el navegador (Supabase client). Todas las restricciones, triggers y validaciones de BD quedaron activos (asignación de barcode, unicidad `(store_id, sku)`, auditoría `UPDATE_PRODUCT`, WAC, Kardex). La recepción usó el RPC oficial completo con `p_user_id` del usuario de negocio.
2. **`user_id` en auditorías de catálogo**: el trigger `trigger_audit_product_changes` guarda `auth.uid()`; por el canal de servicio ese valor es NULL (las filas V9 lo muestran). El identificador de negocio del operador queda en este informe y en los scripts de evidencia. En la recepción (RPC) sí quedó registrado el usuario real.
3. **`updated_at` de productos editados**: el flujo oficial del cliente (`useUpdateProduct`) envía solo los campos editados y no existe trigger que incremente `updated_at`; por eso los 4 productos editados conservan su `updated_at` histórico (idéntico comportamiento al editar desde la UI). El momento real de cada cambio queda en `audit_logs` (sección 7 y 6).
4. **Side-effect de creación (hoja de costos automática)**: la UI lanza de forma *fire-and-forget* `POST /api/product-cost-sheets/auto-generate` tras crear un producto; es un proceso en segundo plano no bloqueante que requiere sesión de navegador. No se ejecutó; no forma parte de la persistencia del producto ni afecta existencias.
5. **No se ejecutaron las 20 operaciones del 16/10** (ya registradas y verificadas en la misión anterior, PR #1417) ni ninguna otra operación de venta, VS o ajuste.

## 9. Pruebas realizadas y resultados

| # | Prueba | Resultado |
|---|---|---|
| P1 | Pre-chequeo de existencia 178–181 (tienda, global, variantes) antes de crear | PASS — 0 filas; se crearon solo los 4 faltantes |
| P2 | Validación de fecha de la recepción (`validate_operation_date`, 16/10 dentro de 6 meses) | PASS — RPC aceptó la fecha sin excepciones |
| P3 | Idempotencia de recepción por referencia única `(store_id, reference_doc)` | PASS — pre-chequeo previo; la referencia `MISION-1610-F20-SKU139` existe 1 vez |
| P4 | Post-verificación de 15 consultas (V1–V15) sobre la BD real | PASS — todas las comprobaciones de las secciones 4–7 |
| P5 | Unicidad de SKU: 1 fila por código nuevo en tienda y global | PASS |
| P6 | Existencia canónica 0 para productos nuevos (0 filas `inventory`, 0 movimientos) | PASS |
| P7 | Kardex SKU 139: +2 con `balance_after = 2` encadenado sobre el saldo previo 0 | PASS |
| P8 | Disciplina de alcance (sección 10) | PASS — 0 efectos colaterales |

## 10. Confirmación de no modificaciones fuera del alcance

Verificado por consulta directa sobre la BD (2026-10-17, umbral de ejecución 14:28 UTC):

- **Productos tocados en ENERVIDA**: exactamente 8 — los 4 creados (178–181) y los 4 editados (158, 162, 176, 108). Ningún otro producto de la tienda tiene `updated_at` posterior al inicio de la misión (V10).
- **Movimientos de stock nuevos**: exactamente 1 — el `purchase +2` del SKU 139 ligado a la recepción `aed568be-…` (V5, V11).
- **Recepciones nuevas**: exactamente 1 — `aed568be-…` (V4, V12).
- **Auditoría del día en la tienda**: exactamente 5 registros — 1 `REGISTER_RECEPTION` y 4 `UPDATE_PRODUCT` (158, 162, 176, 108) (V9).
- **SKU 52** (`Pintura Verde 4L`): nombre, precio (2500 CUP) y existencia (42) intactos (V13).
- No se crearon productos en otras tiendas; no se modificaron precios USD, comisiones, proveedores de otros productos, roles, usuarios, turnos ni configuraciones; no se eliminó ningún registro; no se desactivaron triggers, restricciones ni políticas RLS; no se fusionó ningún PR ni se desplegó a producción.

## 11. Registro de identificadores reales utilizados

| Elemento | Identificador real |
|---|---|
| Tienda | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` |
| Usuario ejecutor | `051c6157-600b-425e-b8c0-72388bacf541` (Admin CostPro) |
| Producto 108 | `c2f4df7e-045a-4990-a34a-d211387e3924` |
| Producto 139 | `8436ffa6-8624-496d-b430-cdd5c0dae43f` |
| Producto 158 | `da7bb624-d5d6-4766-b46c-26dead861778` |
| Producto 162 | `402ceab9-93c7-4b4f-9b16-016c8d978a01` |
| Producto 176 | `8d8df1be-91ed-4ec8-aa77-b85dc4c57887` |
| Productos nuevos 178/179/180/181 | `0889033f-1943-4e87-972a-00c4e941ef1f` / `87c443a1-7d39-41ed-bdf9-7625ebe0c35b` / `57ebfa9e-fe39-496b-ba6f-e2c6dda5d82a` / `fd994527-4367-4023-a518-85a8b2a5e0e1` |
| Recepción SKU 139 | `aed568be-63f0-4082-a7ab-b20f43513e40` (ref. `MISION-1610-F20-SKU139`) |
| Movimiento Kardex SKU 139 | `purchase +2.0000`, `balance_after 2.0000`, 2026-10-16 16:00 UTC |
| Registro WAC | `f10cfeed-970c-4faf-8270-5d9afa29827c` (`wac_change_log`) |

## 12. Criterio de cierre

- [x] SKU 178, 179, 180 y 181 creados correctamente con existencia cero (verificado en BD, sin duplicados).
- [x] Entrada del SKU 139 por dos unidades registrada correctamente y verificada en el Kardex (recepción `aed568be-…`, saldo 0 → 2, proveedor `Proveedor1`, costo unitario 1).
- [x] Nombres de SKU 158, 162 y 176 corregidos y verificados (`Detergente liquido`, `Ventana de cristal`, `Brecker de 125A`).
- [x] Precio CUP del SKU 108 actualizado a 12000 y verificado (0 → 12000 CUP, moneda CUP intacta).

**Estado final: COMPLETADA.** Los resultados fueron verificados contra la base de datos real (Supabase CostproBD) mediante las consultas de evidencia incluidas en `scripts/mision17_inspeccion.json`, `scripts/mision17_ejecucion.json` y `scripts/mision17_verificacion.json` del entorno de trabajo; los identificadores citados fueron recuperados del sistema, no inventados.

**Pendiente logístico (no afecta el cierre)**: publicar este informe en GitHub (rama + PR de protección). El PAT del repositorio no está disponible en la sesión actual; el commit local está creado en `docs/mision-catalogo-entrada-sku139-precio-sku108` a la espera de credenciales para `push`.
