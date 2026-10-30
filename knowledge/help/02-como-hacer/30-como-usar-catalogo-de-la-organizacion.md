# Cómo Hacer: Usar el Catálogo de la Organización

> **Necesita esto cuando**: su organización quiere administrar la identidad de los productos de forma centralizada (SKU, nombre, imagen) y compartirlos entre tiendas conectadas, manteniendo el precio, el costo y las existencias propios de cada tienda.

## ¿Para qué sirve?

El **Catálogo de la Organización** (catálogo maestro) guarda la **identidad compartida** de un producto: SKU, nombre, código de barras, unidad de medida e imagen. Esa identidad se define **una sola vez** y todas las tiendas conectadas la reconocen.

Los **datos comerciales** (precio de venta, costo, existencias, recepciones, ventas y movimientos del kardex) siguen siendo **exclusivos de cada tienda**. Compartir un producto no comparte ni copia valores comerciales entre tiendas.

Ejemplo: el producto «Paracetamol 500 mg» (SKU `PAR-500`) existe una vez en el catálogo de la organización. ENERVIDA lo vende a 150 CUP con 40 unidades; otra tienda conectada lo activa y le pone su propio precio y sus propias existencias. El nombre, el SKU y la imagen son los mismos; el dinero y el inventario, no.

## ¿Dónde encontrarlo?

- **Catálogo de la organización (tienda conectada)**: Inicio → **OPERACIÓN** → **ALMACÉN** → **Inventario** → pestaña **«CATÁLOGO»** → botón **«Catálogo de la organización»** (parte superior derecha de la vista).
- **Gobernanza (conectar tiendas, editar identidad, revisar propuestas)**: Inicio → **SISTEMA** → **Organizaciones** → **Ver detalle** → pestaña **«Catálogo»**.
- **Alta de producto con identidad compartida**: pestaña **«CATÁLOGO»** → botón **«+ CREAR»** (flujo normal de Nuevo producto), cuando la tienda está conectada.

## Antes de comenzar

- Su organización debe tener habilitado el catálogo maestro (modelo por organización).
- Para **consultar y activar** en una tienda conectada: cualquier usuario con acceso a esa tienda.
- Para **crear productos** desde una tienda conectada: rol admin, manager o encargado en la tienda.
- Para **conectar/desconectar tiendas y editar identidad compartida**: ser **gobernador del catálogo** — el propietario de la organización, o un usuario autorizado expresamente por el SuperAdmin.
- Los administradores de plataforma **no** gobiernan el catálogo automáticamente: la capacidad es organizacional.

## Procedimiento 1 — Ver el catálogo de la organización (tienda conectada)

1. Entre a **Catálogo** desde el menú principal.
2. Pulse **«Catálogo de la organización»**.
3. La ventana muestra:
   - El **estado del enlace** de la tienda activa (conectada o no).
   - Un buscador por **SKU, nombre o código de barras**.
   - Cada producto maestro con su **imagen compartida** y su estado: **«disponible»** (aún no activado aquí) o **«activado en esta tienda»**.

Si la tienda no está conectada, la ventana lo indica y le remite al gobernador del catálogo.

## Procedimiento 2 — Conectar una tienda (gobernador)

1. Entre a **SISTEMA → Organizaciones**.
2. Localice su organización y pulse **Ver detalle**.
3. Abra la pestaña **«Catálogo»**.
4. En «Tiendas conectadas» verá el estado de cada tienda:
   - **Conectada desde [fecha]** — ya usa el catálogo.
   - **Sin conexión al catálogo maestro** — nunca se conectó.
   - **Desconectada (productos e historial conservados)** — se desconectó en algún momento.
5. Pulse **«Conectar»** junto a la tienda deseada.
6. Confirme el resultado: la etiqueta cambia a «Conectada desde…» y la acción queda registrada en la auditoría del sistema.

**Si el servidor rechaza la operación**: el mensaje «No tienes facultades de gobernanza…» indica que su usuario no es gobernador. Contacte al propietario de la organización o al SuperAdmin para que le concedan la capacidad. No existe forma de conectar la tienda desde la propia tienda: la acción solo está permitida al gobernador y se valida en el servidor.

## Procedimiento 3 — Activar un producto existente (tienda conectada)

1. Abra **«Catálogo de la organización»** (Procedimiento 1).
2. Busque el producto por SKU, nombre o código de barras.
3. Pulse **«Activar»** en el producto marcado como «disponible».
4. El sistema crea el **producto local de esta tienda** vinculado al maestro:
   - Existencia inicial **0**, sin movimientos de inventario.
   - Precio y costo en sus valores de alta por defecto — **nunca** se copian de otra tienda.
   - SKU, nombre e imagen tomados de la identidad compartida.
5. El producto aparece de inmediato en el **catálogo local** de la tienda y puede usarse en ventas, recepciones e inventario según los permisos habituales.

Si el producto ya estaba activado, el sistema lo informa y no duplica nada.

## Procedimiento 4 — Crear un producto nuevo (tienda conectada)

1. En **Catálogo**, inicie el alta habitual (**Nuevo producto**).
2. Complete SKU, nombre y demás datos. Los valores comerciales que escriba (precio, costo) serán **los de su tienda**.
3. Al guardar, el sistema comprueba primero si el SKU ya existe en el catálogo de la organización:
   - **Existe**: se le ofrece **activarlo** en lugar de crear un duplicado. Si ya está activado aquí, el alta se detiene con el aviso correspondiente.
   - **No existe**: se crea la **identidad compartida una sola vez** y la fila local de su tienda, en una sola operación segura del servidor.
4. Si otra tienda crea el mismo SKU a la vez, la base de datos impide el maestro duplicado: el segundo intento recibe el aviso «Otra tienda acaba de crear ese SKU…» y la salida segura es actualizar y activarlo desde «Catálogo de la organización».
5. Compruebe el resultado en el Procedimiento 1: el producto debe figurar como «activado en esta tienda». Las demás tiendas conectadas lo verán como «disponible».

## Procedimiento 5 — Editar la identidad compartida (gobernador)

1. Entre a **SISTEMA → Organizaciones → Ver detalle → pestaña «Catálogo»**.
2. En «Productos maestros», busque el producto y pulse **«Editar»**.
3. Modifique nombre, SKU, código de barras o unidad de medida. También puede:
   - **Promover una imagen local** de cualquiera de los productos vinculados como imagen compartida.
   - **Subir un archivo nuevo** (requiere el producto activado en al menos una tienda).
4. Pulse **«Guardar y propagar»**: los cambios se aplican a todas las filas locales vinculadas y quedan **auditados campo a campo**.

Los precios, costos y existencias de cada tienda **no se modifican** desde esta edición: solo viaja la identidad.

## Procedimiento 6 — Revisar propuestas de cambio (gobernador)

1. En la pestaña **«Catálogo»**, baje a «Propuestas pendientes».
2. Cada propuesta muestra el maestro afectado, la fecha y los campos propuestos.
3. Pulse **«Aprobar»** (se aplica y propaga) o **«Rechazar»**. Ambas decisiones quedan registradas.

## Procedimiento 7 — Desconectar una tienda (gobernador)

1. En la pestaña **«Catálogo»**, pulse **«Desconectar»** junto a la tienda.
2. Confirme. La desconexión:
   - **NO** elimina productos locales, precios, existencias, recepciones, ventas ni historial.
   - Solo deja de exponer el catálogo compartido a esa tienda.
3. Para reconectarla, use «Conectar»: las relaciones anteriores se recuperan de forma coherente, sin duplicados.

## Problemas frecuentes

| Síntoma | Qué hacer |
| --- | --- |
| No aparece el botón «Catálogo de la organización» | Verifique que está en la vista **Catálogo**; el botón está arriba a la derecha. Si falta, actualice la página. |
| «Esta tienda no está conectada…» | Pida al gobernador que conecte la tienda (Procedimiento 2). |
| «No tienes facultades de gobernanza…» | Su usuario no es gobernador. Solo el propietario o usuarios autorizados por SuperAdmin pueden gobernar. |
| «El SKU ya existe…» | El producto existe en el catálogo de la organización: actívelo en lugar de crear otro. |
| El producto está en el maestro pero no en mi catálogo local | Está «disponible» pero sin activar: actívelo (Procedimiento 3). |
| No puedo editar nombre o SKU | La identidad compartida solo la edita el gobernador (Procedimiento 5). |
| La activación falla | Actualice la página y reintente. Si el error persiste, anote el mensaje y escale al administrador. |
| La imagen no se muestra | La imagen compartida puede no estar definida aún: el gobernador puede promoverla o subirla (Procedimiento 5). |

Consulte también la referencia de campos y permisos: **Referencia → Catálogo maestro: campos y permisos**.
