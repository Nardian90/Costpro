# Resolución de Ambigüedad en get_paginated_products

Se ha detectado y resuelto un problema de sobrecarga de funciones en la base de datos que causaba errores al invocar `get_paginated_products` mediante parámetros nombrados.

## Causa Raíz
Existían dos versiones de la función con el mismo nombre y tipos de parámetros compatibles, pero en diferente orden:
1.  Firma antigua: `(p_limit, p_offset, p_store_id, p_search_term, p_category)`
2.  Firma optimizada (actual): `(p_store_id, p_search_term, p_category, p_limit, p_offset)`

Al usar parámetros nombrados desde el cliente de Supabase, PostgreSQL no podía determinar inequívocamente cuál versión ejecutar, lanzando un error de ambigüedad.

## Acción Realizada
Se procedió a eliminar la firma antigua para asegurar que todas las llamadas utilicen la versión optimizada que incluye el soporte para la columna `has_movements`.

```sql
DROP FUNCTION IF EXISTS public.get_paginated_products(integer, integer, uuid, text, text);
```

## Resultado
El catálogo maestro y las vistas de inventario ahora resuelven correctamente a la función optimizada sin necesidad de cambios en el código del frontend.
