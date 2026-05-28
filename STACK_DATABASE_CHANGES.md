# Cambios en la Base de Datos (Supabase) - Fase 1

## Tabla: stores
- **Columnas agregadas:**
  - `slug` (TEXT, UNIQUE): Identificador único para URLs públicas.
  - `plantilla` (TEXT, DEFAULT 'construccion'): Diseño visual de la vitrina.
- **Índices:**
  - `idx_stores_slug` sobre `slug`.
- **Restricciones:**
  - `stores_slug_unique` UNIQUE(slug).

## Tabla: products
- **Columnas agregadas:**
  - `visible_en_tienda` (BOOLEAN, DEFAULT false): Control de visibilidad pública.
- **Índices:**
  - `idx_products_visible_store` parcial sobre `(store_id, visible_en_tienda)` donde `visible_en_tienda = true`.

## Políticas RLS (Acceso Público)
- **Tiendas públicas - lectura**: Permite lectura de tiendas activas para `anon` y `authenticated`.
- **Productos públicos - lectura**: Permite lectura de productos con `visible_en_tienda = true` para `anon` y `authenticated`.
- **Variantes públicas - lectura**: Permite lectura de variantes si el producto relacionado es visible.

## Verificación
Las columnas han sido creadas exitosamente y los slugs iniciales se generaron para las tiendas existentes.
- **Nota:** Los slugs generados automáticamente han sido corregidos para reemplazar espacios por guiones bajos (`_`).
