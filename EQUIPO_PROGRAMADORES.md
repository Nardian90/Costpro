# Migración a Cantidades Decimales - NUMERIC(12,4)

Se ha realizado una migración completa del sistema para soportar cantidades decimales en el inventario, ventas y movimientos de stock. Originalmente, muchas de estas columnas estaban definidas como `INTEGER`, lo que provocaba errores de redondeo.

## Cambios Realizados

### 1. Esquema de Base de Datos (Tablas)
Se han alterado las siguientes tablas para cambiar el tipo de dato de `INTEGER` a `NUMERIC(12,4)`:
- `products`: `stock_current`, `min_stock`
- `inventory`: `quantity`, `low_stock_threshold`
- `stock_movements`: `quantity_change`, `balance_after`
- `receipt_items`: `quantity`
- `sale_items`: `quantity`
- `transaction_items`: `quantity`
- `transfer_items`: `quantity`
- `inventory_adjustment_items`: `expected_quantity`, `counted_quantity`, `difference` (recreada como columna generada numeric)
- `inventory_movements`: `quantity_change`, `balance_after`
- `inventory_batches`: `quantity`
- `inventory_snapshots`: `quantity`
- `purchase_items`: `quantity`

### 2. Tipos Compuestos (Composite Types)
Se han actualizado los atributos de los siguientes tipos para mantener la consistencia:
- `public.variant_decomposition`: `quantity`
- `public.adjustment_item`: `expected_quantity`, `counted_quantity`

### 3. Funciones de Base de Datos
Se han redefinido las funciones principales para aceptar y procesar parámetros `NUMERIC`. Esto es CRÍTICO para evitar errores de firma (signature mismatch) y asegurar que el motor de base de datos no trunque los valores decimales.

Funciones actualizadas:
- `register_stock_movement`
- `create_sale`
- `register_reception`
- `confirm_transfer`
- `perform_inventory_adjustment`
- `process_sale_transaction`
- `process_initial_stock`
- `process_bulk_import`
- `process_stock_adjustment`
- Triggers de sincronización de inventario.

### 4. Corrección de Datos
Se han corregido los stocks de los siguientes productos que presentaban errores por redondeo previo:
- `PROD-005`: 21.5
- `PROD-007`: 1.6241
- `PROD-009`: 79.2
- `PROD-010`: 12.9959

## Recomendaciones para el Equipo de Frontend

1. **Validación de Inputs:** Asegúrense de que los campos de entrada para cantidades permitan decimales (p. ej., `step=\"0.0001\"`).
2. **Manejo de Tipos en TypeScript:** Revisen las interfaces de Producto e Inventario. Las cantidades ahora deben ser tratadas como `number` (que en JS soporta decimales) en lugar de asumir enteros.
3. **Precisión:** El sistema soporta hasta 4 decimales. Se recomienda redondear a 4 decimales en el cliente antes de enviar datos a la API para asegurar consistencia con el backend.

## Verificación
Se pueden verificar los tipos de datos en Supabase ejecutando:
\`sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND (column_name ILIKE '%quantity%' OR column_name ILIKE '%stock%');
\`

---
*Documentación generada automáticamente por Jules (AI Engineer) tras la aplicación de mejoras en el esquema.*

### 5. Corrección de Funciones RPC (get_products_for_pos, get_paginated_products)
Se detectó que las funciones RPC que alimentan al POS y a la vista de Inventario no estaban sincronizadas con el cambio a `NUMERIC(12,4)`, lo que causaba errores de "structure of query does not match function result type".

**Cambios en RPC:**
- `get_products_for_pos`: Se redefinió la tabla de retorno para incluir tipos `NUMERIC` en los campos de stock y precio.
- `get_paginated_products`: Se actualizó la firma y la tabla de retorno. Nota: El orden de los parámetros cambió para poner `p_store_id` primero como obligatorio.
- `deduct_stock`: El parámetro `p_quantity` cambió de `INTEGER` a `NUMERIC`.


### 6. Limpieza Selectiva y Nueva Función register_reception
Se realizó una limpieza selectiva de datos para la tienda **VITALLCONS PUERTO PADRE** (`2271948c-3f10-4cb9-bba3-39b5ef6c9ab6`) para eliminar registros de recepción y movimientos procesados erróneamente como enteros.

**Nueva Función RPC:**
- `register_reception`: Esta función permite registrar recepciones de mercancía.
  - **Soporte Decimal:** Acepta `quantity` y `unit_cost` como `NUMERIC`.
  - **Integridad:** Vincula automáticamente los movimientos de stock (`purchase`) con el ID de la recepción.
  - **Seguridad:** Ejecuta chequeos de `has_store_access` y `auth.uid()`.

**Nota de Seguridad:** Se evitó el uso de `TRUNCATE` para no afectar a otras tiendas operativas en el sistema multi-tenant.
