# Aislamiento del Catálogo de Productos por Tienda

## Resumen del Cambio
Se ha refactorizado la estructura de unicidad en la tabla `products` para permitir que diferentes tiendas gestionen sus propios catálogos de forma independiente, permitiendo la reutilización de SKUs entre tiendas.

### Cambios en la Base de Datos
1.  **Restricción Única**: Se eliminó la restricción anterior y se creó una nueva restricción única compuesta:
    ```sql
    ALTER TABLE public.products ADD CONSTRAINT products_sku_store_unique UNIQUE (sku, store_id);
    ```
2.  **Funciones de Servidor (RPC)**:
    *   `fn_process_receipt`: Ahora requiere el parámetro `p_store_id` y realiza búsquedas de productos filtrando por SKU y `store_id`.
    *   `fn_process_sale`: Ahora valida que los productos pertenezcan a la tienda asignada al cajero antes de procesar la transacción.

## Impacto en el Stack de Programación

### 1. Upserts y Sincronización
Cualquier operación de `upsert` realizada a través del cliente de Supabase debe especificar explícitamente el conflicto sobre las columnas `sku` y `store_id`.

**Ejemplo en TypeScript:**
```typescript
const { data, error } = await supabase
  .from('products')
  .upsert(productData, { onConflict: 'sku,store_id' });
```

### 2. Consultas por SKU
Ya no se debe asumir que un SKU identifica de forma única a un producto en todo el sistema. Siempre se debe incluir el `store_id` en el filtro.

**Incorrecto:**
```typescript
const { data } = await supabase.from('products').select('*').eq('sku', 'ABC-123');
```

**Correcto:**
```typescript
const { data } = await supabase.from('products').select('*').eq('sku', 'ABC-123').eq('store_id', currentStoreId);
```

### 3. Procesamiento de Recepciones y Ventas
Las funciones almacenadas han sido endurecidas para garantizar que no haya cruces de inventario entre tiendas. Si se llama a `fn_process_receipt` desde una Edge Function o el cliente, es obligatorio pasar el `store_id` correspondiente.

## Beneficios
*   **Independencia de Inventario**: Cada tienda puede tener su propio listado de productos con precios y costos distintos, incluso si comparten proveedores y SKUs.
*   **Flexibilidad de Importación**: Permite importar catálogos existentes de una tienda a otra sin conflictos de duplicidad.
*   **Seguridad**: Refuerza el aislamiento multi-inquilino al validar la pertenencia de los productos a la tienda en operaciones críticas.

### 4. Seguimiento de Completitud del Producto
Se ha añadido una columna `is_complete` para rastrear si un producto tiene toda la información mínima requerida (ej. precio > 0).

*   **Uso**: Se utiliza para filtrar rápidamente productos que necesitan atención del usuario.
*   **Optimización**: Existe un índice parcial `idx_products_is_complete` que optimiza las consultas de productos incompletos (`is_complete = false`).

**Ejemplo de consulta de productos pendientes:**
```typescript
const { data } = await supabase
  .from('products')
  .select('*')
  .eq('store_id', currentStoreId)
  .eq('is_complete', false);
```
