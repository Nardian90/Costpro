# ¿Qué es el Catálogo Maestro de Productos?

> **Necesita entender esto cuando**: su organización opera varias tiendas y quiere que un mismo producto se reconozca igual en todas, sin perder la independencia de precios, costos y existencias de cada tienda.

## La idea en una frase

El catálogo maestro guarda **una sola identidad por producto** (SKU, nombre, código de barras, unidad e imagen) a nivel de **organización**, mientras que cada tienda mantiene sus **propios datos comerciales y operativos**.

## Identidad compartida vs. datos locales

Un producto del catálogo maestro tiene dos mitades bien separadas:

- **Identidad compartida** (vive en el maestro, la gobierna la organización): SKU, nombre, descripción, código de barras, unidad de medida, imagen, naturaleza del artículo (producto o servicio).
- **Datos locales** (viven en cada tienda, son inviolables por el maestro): precio de venta, moneda, costo, existencias, stock mínimo, categoría, proveedor, recepciones, ventas, vales, ajustes y movimientos del kardex.

Cuando la identidad cambia (por ejemplo, se corrige el nombre), el cambio se **propaga** a todas las tiendas conectadas y queda registrado en el historial de cambios. Cuando un dato local cambia (por ejemplo, el precio en una tienda), **ninguna otra tienda se entera**: es el modelo multitienda de COSTPRO intacto.

## Ejemplo práctico

| Campo | Catálogo maestro | ENERVIDA | Otra tienda conectada |
| --- | --- | --- | --- |
| SKU | `PAR-500` | `PAR-500` (vinculado) | `PAR-500` (vinculado) |
| Nombre | Paracetamol 500 mg | Paracetamol 500 mg | Paracetamol 500 mg |
| Imagen | compartida | misma imagen | misma imagen |
| Precio de venta | — | 150 CUP | 180 CUP |
| Costo | — | 90 CUP | 105 CUP |
| Existencias | — | 40 | 0 |

El maestro no tiene precio ni existencias: solo identidad. Cada fila local conserva su historia completa de kardex.

## Estados que verá

- **Producto maestro**: la identidad compartida de la organización.
- **Disponible**: existe en el maestro y la tienda conectada aún no lo activó.
- **Activado en esta tienda**: la tienda tiene su propia fila local vinculada al maestro, lista para operar.
- **Producto local no vinculado**: un producto creado antes de conectar la tienda o en una tienda sin conexión; sigue funcionando con normalidad y puede vincularse al activar un maestro con su mismo SKU cuando corresponda.

## Conexión y gobernanza

- Una tienda debe ser **conectada** al catálogo por el **gobernador** (propietario de la organización o usuario autorizado por el SuperAdmin) desde **Sistema → Organizaciones → Ver detalle → Catálogo**.
- Conectar no mueve datos: habilita la consulta y activación del catálogo compartido.
- Desconectar tampoco borra nada: los productos, precios, existencias e historial de la tienda permanecen intactos.
- Las tiendas de **otras organizaciones jamás** ven este catálogo: el aislamiento por organización está garantizado por las políticas de seguridad del servidor.

## Por qué existe

Antes del catálogo maestro, cada tienda nombraba sus productos por su cuenta: el mismo artículo podía llamarse distinto en dos tiendas y compartir imágenes obligaba a subirlas dos veces. El catálogo maestro resuelve eso manteniendo la regla de oro de COSTPRO: **la identidad viaja, el dinero y el inventario no**.
