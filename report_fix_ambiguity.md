# Reporte de Solución: Error de Ambigüedad en `register_reception`

## Problema Detectado
Al intentar realizar una recepción de productos, el sistema devolvía el error:
```
code: '42725',
message: 'function public.register_stock_movement(...) is not unique',
hint: 'Could not choose a best candidate function. You might need to add explicit type casts.'
```

Este error (PostgreSQL 42725) ocurre cuando existen múltiples funciones con el mismo nombre pero diferentes parámetros (overloading), y la base de datos no puede determinar cuál llamar.

### Análisis Técnico
En la base de datos existían dos versiones de la función `register_stock_movement`:
1.  **Versión Obsoleta (9 parámetros):** Aceptaba `p_product_id`, `p_store_id`, `p_user_id`, `p_quantity`, `p_movement_type`, `p_reason`, `p_sale_id`, `p_unit_cost`, `p_notes`.
2.  **Versión Actual (10 parámetros):** Añadía `p_variant_id` al final.

La función `register_reception` realizaba la llamada omitiendo el parámetro `p_variant_id`. Debido a que ambas funciones tenían valores por defecto para los parámetros opcionales, Postgres encontraba que ambas eran candidatas válidas, generando el conflicto de ambigüedad.

## Solución Aplicada
1.  **Eliminación de la sobrecarga obsoleta:** Se ejecutó una migración para eliminar específicamente la versión de 9 parámetros que causaba el conflicto.
2.  **Consolidación:** Se aseguró que solo exista la versión de 10 parámetros (`canonical`), la cual soporta variantes de productos de forma opcional.
3.  **Permisos:** Se reafirmaron los permisos de ejecución para el rol `authenticated`.

## Resultado
- **Estado:** Solucionado.
- **Acción:** La función `register_reception` ahora puede invocar a `register_stock_movement` sin ambigüedades, ya que solo existe una definición válida en el esquema `public`.
- **Verificación:** Se realizaron pruebas sintácticas en la base de datos confirmando que el motor de Postgres ya no reporta conflictos al intentar resolver la llamada.

---
*Generado por Jules - Software Engineer*
