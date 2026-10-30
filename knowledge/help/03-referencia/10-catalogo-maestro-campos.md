# Catálogo maestro: campos compartidos, campos locales y permisos

> **Necesita esto cuando**: necesita saber exactamente qué se comparte entre tiendas conectadas, qué permanece local y qué puede hacer cada rol.

## Campos compartidos vs. campos locales

| Campo | ¿Dónde vive? | ¿Quién lo cambia? | ¿Se propaga a otras tiendas? |
| --- | --- | --- | --- |
| SKU | Catálogo maestro | Gobernador del catálogo | Sí (coerción en filas vinculadas) |
| Nombre | Catálogo maestro | Gobernador del catálogo | Sí (coerción en filas vinculadas) |
| Descripción | Catálogo maestro | Gobernador del catálogo | Sí |
| Código de barras | Catálogo maestro | Gobernador del catálogo | Sí (único en la organización) |
| Unidad de medida | Catálogo maestro | Gobernador del catálogo | Sí |
| Imagen | Catálogo maestro (referencia al archivo) | Gobernador del catálogo | Sí (misma referencia; no se duplica el archivo) |
| Naturaleza (producto/servicio) | Catálogo maestro | Gobernador del catálogo | Sí |
| Precio de venta y moneda | Fila local de cada tienda | Personal autorizado de la tienda | **No** |
| Costo | Fila local de cada tienda | Personal autorizado de la tienda | **No** |
| Existencias y stock mínimo | Fila local de cada tienda | Operación de la tienda | **No** |
| Categoría y proveedor locales | Fila local de cada tienda | Personal de la tienda | **No** |
| Recepciones, ventas, vales, ajustes, kardex | Cada tienda | Operación de la tienda | **No** |

**Regla de oro**: compartir un producto **no** comparte precios, costos, existencias, proveedores, recepciones, ventas ni movimientos del kardex. Activar un producto crea la fila local con existencia 0, sin movimientos y con valores de alta por defecto de esa tienda.

## Permisos por acción

| Acción | ¿Quién puede? | ¿Dónde se valida? |
| --- | --- | --- |
| Ver el catálogo de la organización | Usuarios con acceso a una tienda conectada | Servidor (búsqueda por tienda) |
| Buscar productos maestros | Usuarios con acceso a la tienda conectada | Servidor |
| Activar un producto en la tienda | Usuarios con acceso a la tienda conectada | Servidor |
| Crear producto nuevo (identidad compartida) | Admin, manager o encargado de la tienda conectada | Servidor |
| Conectar / desconectar tiendas | Gobernador del catálogo (propietario de la organización o autorizado por SuperAdmin) | Servidor |
| Editar identidad compartida | Gobernador del catálogo | Servidor |
| Proponer un cambio de identidad | Usuarios con acceso a una tienda conectada | Servidor |
| Aprobar / rechazar propuestas | Gobernador del catálogo | Servidor |
| Conceder la capacidad de gobernador | Solo SuperAdmin | Servidor |

Los administradores de plataforma **no** gobiernan el catálogo de una organización automáticamente: la capacidad es organizacional y se concede de forma explícita.

## Errores del servidor y su significado

| Error | Significado | Salida segura |
| --- | --- | --- |
| `ERR_UNAUTHORIZED` | Sin capacidad para la acción solicitada | Solicite al propietario la capacidad o realice la acción el gobernador |
| `ERR_STORE_NOT_CONNECTED` | La tienda no usa el catálogo de la organización | Conecte la tienda (gobernador) |
| `ERR_MASTER_SKU_EXISTS` | Ya existe un maestro con ese SKU en la organización | Active el maestro existente en lugar de crear otro |
| `ERR_BARCODE_EXISTS` | El código de barras ya está en uso | Use otro código o deje que el maestro lo lleve |
| `ERR_MASTER_ARCHIVED` | El maestro está archivado | Solicite su revisión al gobernador |
| `ERR_INVALID_CHANGES` | Cambios vacíos o con campos no permitidos | Revise los campos del formulario |

Todas las escrituras del catálogo pasan por funciones del servidor que revalidan permisos, validan la pertenencia a la organización y dejan registro de auditoría. Ocultar un botón en la interfaz nunca es la única protección: el servidor rechaza la operación aunque se intente por otra vía.
