# Cómo Hacer: Recibir Mercancía del Proveedor

> **Necesita esto cuando**: llega el camión del proveedor con productos que pidió, y debe registrarlos en el sistema para que el inventario se actualice y el costo quede correcto.

## ¿Por qué no basta con poner los productos en el estante?

Porque el sistema no "ve" el estante. El sistema solo sabe lo que usted le dice. Si pone 20 leches en el estante pero no las registra, el sistema sigue diciendo que hay 0 leches, y cuando un cajero quiera vender una, el sistema le dirá que no hay stock.

**Recibir mercancía** es la operación de decirle al sistema: *"Hoy entraron X unidades de estos productos, con estos costos"*. Al confirmar la recepción, el inventario sube y el costo promedio de los productos se recalcula.

## Paso 1 — Preparar la factura del proveedor

Antes de tocar la computadora:

1. Pida al repartidor la **factura** o **remisión** del envío.
2. Antes de firmar, **cuente físicamente** cada producto y verifique que coincida con la factura.
3. Si hay diferencias (faltan productos, vienen rotos, vienen de menos), anótelas en la factura antes de firmar.
4. Una vez conformado, firme la factura del repartidor.

> ⚠️ **Importante**: Si firma la factura sin contar, después no puede reclamar al proveedor por faltantes.

## Paso 2 — Ir a Recepciones

1. En el menú izquierdo, abra la sección **OPERACIÓN**.
2. Abra el grupo **Logística** y haga clic en **Recepciones**.
3. Ahí está el historial de recepciones de la tienda y el acceso a una nueva recepción.

## Paso 3 — Iniciar una nueva recepción

1. Abra una **nueva recepción**.
2. Complete la cabecera:

| Campo | Qué escribir |
|-------|--------------|
| **Proveedor** | El proveedor del envío. |
| **Número de factura** | El número que aparece en la factura del proveedor. |

La recepción se registra en su **tienda activa** (la que ve en la barra superior); no se elige en el formulario.

> 💡 **Escanear Factura**: si tiene cámara, puede subir la foto de la factura y el sistema hace **OCR** para ayudarte a llenar los datos. También puede **Importar/Exportar Excel** para recepciones grandes.

## Paso 4 — Agregar los productos recibidos

1. En el buscador, escriba el nombre o código del primer producto y agréguelo.
2. En la fila del producto complete:
   - **Cantidad recibida**: cuántas unidades entraron.
   - **Precio de costo**: el precio unitario de la factura. Si su factura viene en otra moneda, use la moneda y la tasa del formulario: el sistema convierte a CUP al confirmar.
3. Repita con cada producto de la factura.
4. Si el producto **no existe en el catálogo**, use **Agregar como nuevo** para darlo de alta desde la misma recepción.
5. Si ya tenía una **Orden de Compra** para este envío, use **Recibir contra OC**: el sistema carga lo pedido y usted ajusta las cantidades reales.

## Paso 5 — Verificar los totales

Abajo verá el **costo total** de la recepción y las cantidades. Compare con la factura del proveedor: deben coincidir. Si no, revise cantidades y precios antes de confirmar.

## Paso 6 — Guardar o confirmar

- **Guardar Pendiente**: deja la recepción como borrador **sin tocar el inventario**. Útil si el camión sigue descargando.
- **Confirmar Registro**: aplica la recepción. El stock sube, el costo promedio se recalcula y la recepción queda registrada con su documento.

> ⚠️ **Importante**: Hasta que **Confirma**, el inventario **no se actualiza**. Las recepciones pendientes no cuentan como stock disponible.

Al confirmar aparece la pantalla de éxito con la opción de descargar el documento de la recepción.

## Paso 7 — Verificar que el stock subió

1. Vaya a **OPERACIÓN → Almacén → Inventario** (pestaña **Stock Actual**).
2. Busque uno de los productos que acaba de recibir.
3. El stock debe mostrar el número anterior + la cantidad que entró.

---

## Preguntas frecuentes

**¿Qué hago si un producto viene dañado?**
- Recíbalo con cantidad 0 o no lo incluya.
- Anote en la factura del proveedor que ese producto venía dañado.
- Pida al repartidor una nota de crédito o un reemplazo.

**¿Puedo recibir productos que no están en el catálogo?**
- Sí: use **Agregar como nuevo** en la fila del buscador para crear el producto desde la recepción.
- También la importación de Excel puede crear productos nuevos.

**¿Qué pasa si recibí 20 y la factura decía 25?**
- Reciba solo las 20 que llegaron físicamente.
- Anote la diferencia en la factura del repartidor.
- El proveedor debe enviar las 5 restantes después (en otra recepción contra la misma OC, si aplica).

**¿Puedo modificar una recepción después de confirmada?**
- No. Las recepciones confirmadas **no se editan**.
- Si hubo un error grave, un admin/manager/encargado puede **revertir** la recepción (la reversión genera los movimientos inversos en el Kardex) y recibir de nuevo correctamente. No existe una "ventana de 24 horas": el control es por rol y por auditoría.

**¿Cómo veo el historial de recepciones?**
- La propia vista **Recepciones** (OPERACIÓN → Logística) es el historial: busque por proveedor o factura y filtre por estado (Pendiente, Confirmada, Anulada, Revertida).

**¿Y si recibí un servicio (transporte, aduana, estiba) en lugar de mercancía?**
- Eso es diferente: use **OPERACIÓN → Logística → Servicios Recibidos**.
- Lea **Cómo registrar y pagar un Servicio Recibido** para más detalles. Un servicio no toca el inventario y puede distribuirse al costo de la mercancía recibida.

## Información relacionada

- **Cómo crear una Orden de Compra** — recibir contra OC.
- **Cómo registrar y pagar un Servicio Recibido** — servicios del abastecimiento.
- **Cómo ajustar el inventario** — si la diferencia aparece después de confirmar.
- **Gestión del Inventario** — dónde consultar el stock actualizado.
