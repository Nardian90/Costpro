# Guía del Catálogo de Ventas (Tablas IPV)

Tutorial completo sobre el sistema de Catálogo de Ventas en CostPro, que permite consultar productos con precios indexados según las tablas oficiales de IPV, filtrar por categorías, seleccionar productos en tabla o cuadrícula visual, y procesar ventas directamente desde la vista de catálogo.

## Contenido

- [1. Qué es el Catálogo de Ventas](#1-qué-es-el-catálogo-de-ventas)
- [2. Acceder al Catálogo](#2-acceder-al-catálogo)
- [3. Vista de Tabla](#3-vista-de-tabla)
  - [3.1 Columnas Disponibles](#31-columnas-disponibles)
  - [3.2 Operaciones en la Tabla](#32-operaciones-en-la-tabla)
- [4. Vista de Cuadrícula](#4-vista-de-cuadrícula)
  - [4.1 Tarjetas de Producto](#41-tarjetas-de-producto)
- [5. Barra de Herramientas y Filtros](#5-barra-de-herramientas-y-filtros)
  - [5.1 Búsqueda](#51-búsqueda)
  - [5.2 Filtros por Categoría](#52-filtros-por-categoría)
  - [5.3 Filtros por Stock](#53-filtros-por-stock)
  - [5.4 Ordenamiento](#54-ordenamiento)
- [6. Resumen de Totales](#6-resumen-de-totales)
- [7. Ventas desde el Catálogo](#7-ventas-desde-el-catálogo)
  - [7.1 Procesar Venta Directa](#71-procesar-venta-directa)
  - [7.2 Modal de Checkout](#72-modal-de-checkout)
- [8. Exportación desde el Catálogo](#8-exportación-desde-el-catálogo)
- [9. Diferencias con el Terminal POS](#9-diferencias-con-el-terminal-pos)
- [10. Buenas Prácticas](#10-buenas-prácticas)

---

## 1. Qué es el Catálogo de Ventas

El **Catálogo de Ventas** es una vista especializada que muestra todos los productos disponibles para la venta organizados en una tabla o cuadrícula visual. A diferencia del Terminal POS — que está optimizado para ventas rápidas una por una — el Catálogo de Ventas permite **visualizar el portafolio completo** de productos con sus precios indexados, aplicar filtros avanzados, comparar productos y procesar ventas de forma selectiva.

Esta vista es especialmente útil cuando:

- Necesitas **consultar precios** de múltiples productos antes de vender.
- Un cliente desea **comparar opciones** dentro de una categoría.
- Realizas **ventas al por mayor** seleccionando múltiples productos a la vez.
- Requieres **exportar el catálogo** completo o filtrado para compartir con clientes.

El catálogo se integra con el sistema de **Tablas IPV** (Índice de Precios y Variaciones), lo que significa que los precios mostrados reflejan las actualizaciones oficiales de precios cuando estén configuradas.

---

## 2. Acceder al Catálogo

Navega al Catálogo de Ventas desde la barra lateral del módulo Multi-Tienda:

```
MULTI-TIENDA > Ventas > Catálogo de Ventas
```

> **Nota**: El Catálogo de Ventas aparece marcado con la etiqueta **"Nuevo"** en la barra lateral. Esta etiqueta indica funcionalidad añadida recientemente al sistema.

Al acceder, el catálogo carga automáticamente todos los productos de la tienda activa y los muestra en la vista predeterminada (tabla o cuadrícula, según tu última selección).

---

## 3. Vista de Tabla

La vista de tabla presenta los productos en un formato tabular denso, similar a una hoja de cálculo, que permite consultar rápidamente precios, stock y datos de cada producto sin desplazamiento excesivo.

### 3.1 Columnas Disponibles

La tabla incluye las siguientes columnas:

| Columna | Descripción |
|---------|-------------|
| **Imagen** | Miniatura del producto (40x40 px). Muestra la primera letra del nombre si no hay imagen. |
| **Nombre** | Nombre completo del producto. |
| **SKU** | Código interno del producto. |
| **Categoría** | Clasificación a la que pertenece el producto. |
| **Precio Base** | Precio original del producto antes de cualquier ajuste IPV. |
| **Precio Indexado** | Precio ajustado según la tabla de variaciones IPV vigente (si aplica). |
| **Stock** | Cantidad disponible en la tienda activa. |
| **Estado** | Indicador visual (activo/inactivo/sin stock). |

### 3.2 Operaciones en la Tabla

Desde la vista de tabla puedes realizar las siguientes acciones directamente sobre cada producto:

- **Seleccionar**: Haz clic en la fila para seleccionar el producto (aparece un indicador de selección).
- **Vista rápida**: Haz doble clic para abrir un panel lateral con los detalles completos del producto.
- **Agregar al carrito**: Haz clic en el botón de agregar (icono de carrito) para incluir el producto en la cesta de compra del catálogo.
- **Venta directa**: Haz clic en el botón de venta rápida para procesar la venta de ese producto inmediatamente.

> **Tip**: Puedes seleccionar múltiples productos manteniendo presionada la tecla `Ctrl` (o `Cmd` en Mac) mientras haces clic en las filas. Esto permite agregar varios productos al carrito de una sola vez.

---

## 4. Vista de Cuadrícula

La vista de cuadrícula muestra los productos como **tarjetas visuales** organizadas en un formato de grilla, similar a una vitrina digital. Esta vista es ideal para presentaciones o cuando se necesita una referencia visual rápida de los productos.

### 4.1 Tarjetas de Producto

Cada tarjeta muestra:

| Elemento | Descripción |
|----------|-------------|
| **Imagen principal** | Imagen del producto en formato cuadrado con proporción 1:1. |
| **Nombre** | Título del producto con truncado si excede 2 líneas. |
| **Categoría** | Etiqueta pequeña con el nombre de la categoría. |
| **Precio** | Precio formateado con símbolo de moneda y color de acento. |
| **Stock** | Indicador numérico con código de color (verde, amarillo, rojo). |
| **Botón de acción** | Botón para agregar al carrito o iniciar venta. |

La cuadrícula se adapta automáticamente al ancho de pantalla: más columnas en monitores anchos, menos columnas en pantallas pequeñas, y una sola columna en dispositivos móviles.

Para alternar entre vista de tabla y cuadrícula, usa el **control de vista** ubicado en la barra de herramientas del catálogo (icono de tabla o icono de grilla).

---

## 5. Barra de Herramientas y Filtros

La barra de herramientas superior del catálogo proporciona controles para buscar, filtrar, ordenar y operar sobre los productos mostrados.

### 5.1 Búsqueda

El campo de búsqueda permite encontrar productos rápidamente por:

- **Nombre del producto**: Búsqueda parcial, no requiere el nombre completo.
- **SKU o código**: Escribe el código interno del producto.
- **Categoría**: Las coincidencias de categoría también se muestran.

La búsqueda se ejecuta en tiempo real mientras escribes, con un debounce de 300 milisegundos para evitar consultas excesivas al servidor.

### 5.2 Filtros por Categoría

El selector de categoría permite filtrar los productos mostrados para incluir solo los de una categoría específica:

- **Todas las categorías** (predeterminado): Muestra todos los productos sin restricción.
- **Categoría específica**: Muestra solo los productos que pertenecen a la categoría seleccionada.

Puedes combinar el filtro de categoría con la búsqueda de texto para refinar aún más los resultados.

### 5.3 Filtros por Stock

El filtro de stock permite controlar qué productos se muestran según su nivel de inventario:

| Opción | Descripción |
|--------|-------------|
| **Todos** | Muestra productos con y sin stock. |
| **Con stock** | Solo muestra productos con stock mayor a cero. |
| **Sin stock** | Solo muestra productos agotados. |
| **Stock bajo** | Solo muestra productos por debajo del mínimo configurado. |

### 5.4 Ordenamiento

Los productos pueden ordenarse por cualquier columna de la tabla:

- Haz clic en el **encabezado de la columna** para ordenar ascendentemente.
- Haz clic nuevamente para ordenar **descendentemente**.
- La columna activa de ordenamiento muestra un indicador de dirección (flecha arriba/abajo).

---

## 6. Resumen de Totales

En la parte inferior del catálogo se muestra un panel de **resumen de totales** que incluye:

| Métrica | Descripción |
|---------|-------------|
| **Total productos** | Cantidad de productos mostrados (después de aplicar filtros). |
| **Productos con stock** | Cantidad de productos que tienen stock disponible. |
| **Productos sin stock** | Cantidad de productos agotados. |
| **Valor total del inventario** | Suma del valor de stock (precio x cantidad) de todos los productos mostrados. |
| **Productos seleccionados** | Cantidad de productos actualmente seleccionados (para operaciones por lotes). |

Este resumen se actualiza automáticamente cada vez que aplicas un filtro, cambias la búsqueda o seleccionas productos.

---

## 7. Ventas desde el Catálogo

El catálogo permite procesar ventas directamente sin necesidad de cambiar al Terminal POS. Esto es útil cuando atiendes a un cliente que desea comprar varios productos específicos que ha seleccionado de la tabla.

### 7.1 Procesar Venta Directa

Para vender un producto directamente desde el catálogo:

1. Haz clic en el botón de **venta rápida** en la fila del producto (vista de tabla) o en la tarjeta (vista de cuadrícula).
2. El sistema agrega el producto al carrito y muestra el resumen de la venta.
3. Selecciona la cantidad deseada.
4. Confirma la venta.

### 7.2 Modal de Checkout

Cuando procesas una venta desde el catálogo, se abre el **Modal de Checkout** que muestra:

- **Lista de productos** en el carrito con cantidades y subtotales.
- **Controles de cantidad** para ajustar las unidades de cada producto.
- **Subtotal** de la venta.
- **Total** con impuestos incluidos.
- **Botón de confirmar venta** que finaliza la transacción.

Al confirmar la venta, se ejecutan los mismos procesos automáticos que en el Terminal POS:

- Se genera un comprobante de venta.
- El inventario se actualiza automáticamente.
- La transacción queda registrada en el historial de ventas.
- Se genera un código QR de verificación para la venta.

---

## 8. Exportación desde el Catálogo

Desde la vista del Catálogo de Ventas puedes acceder al **exportador de catálogos** para generar materiales profesionales:

1. Aplica los **filtros deseados** para seleccionar los productos que quieres incluir.
2. Haz clic en el botón **"Exportar Catálogo"** en la barra de herramientas.
3. Selecciona la plantilla y personalización deseada (ver la [Guía Completa de Exportación de Catálogos](./exportacion-catalogo.md) para detalles).
4. Genera y descarga el archivo.

> **Tip**: Los filtros que tengas aplicados al momento de exportar determinan qué productos se incluyen en el archivo generado. Exporta primero, luego limpia los filtros para continuar trabajando.

---

## 9. Diferencias con el Terminal POS

Aunque tanto el Catálogo de Ventas como el Terminal POS permiten procesar ventas, cada uno está optimizado para un flujo de trabajo diferente:

| Característica | Catálogo de Ventas | Terminal POS |
|---------------|-------------------|--------------|
| **Enfoque** | Consulta y comparación de productos | Venta rápida |
| **Vista predeterminada** | Tabla o cuadrícula de productos | Carrito de compra |
| **Búsqueda avanzada** | Sí (filtros por categoría, stock, orden) | Básica (por nombre o código) |
| **Selección múltiple** | Sí (seleccionar varios productos) | Uno a uno |
| **Exportación de catálogo** | Sí (4 plantillas) | No |
| **Escáner de barras** | No | Sí |
| **Venta por volumen** | Sí (ideal para compras múltiples) | Limitado |
| **Velocidad por transacción** | Media (requiere selección) | Alta (escaneo directo) |
| **Ideal para** | Clientes que piden presupuesto, ventas mayoristas | Atención rápida en mostrador |

> **Tip**: Usa el **Catálogo de Ventas** cuando un cliente solicita ver opciones y precios antes de decidirse. Usa el **Terminal POS** cuando el cliente ya sabe qué quiere y solo necesitas procesar la venta rápidamente. Ambos módulos actualizan el mismo inventario e historial de ventas.

---

## 10. Buenas Prácticas

> **🔄 Filtros activos:** Antes de procesar una venta desde el catálogo, verifica que no tengas filtros activos que puedan ocultar productos disponibles. Un cliente podría solicitar un producto que no se muestra porque un filtro de categoría está aplicado.
>
> **📊 Revisión de precios indexados:** Si tu tienda utiliza tablas IPV, revisa regularmente que los precios indexados se actualicen correctamente. Los cambios en las tablas oficiales deben reflejarse automáticamente en el catálogo de ventas.
>
> **🖼️ Mantén imágenes actualizadas:** La vista de cuadrícula depende completamente de las imágenes de producto. Sin imágenes, la experiencia visual se degrada significativamente y el catálogo pierde su utilidad como herramienta de venta visual.
>
> **📦 Coordina con inventario:** El catálogo muestra stock en tiempo real, pero un producto puede agotarse mientras un cliente está consultando. Si un cliente intenta comprar un producto que se agotó entre la consulta y la venta, el sistema mostrará un aviso de stock insuficiente.
>
> **⌨️ Atajos de teclado:** Usa `Ctrl + K` para abrir la paleta de comandos y navegar rápidamente al Catálogo de Ventas o al Terminal POS según necesites.
