# Cómo Hacer: Recibir Mercancía del Proveedor

> **Necesita esto cuando**: Llega el camión del proveedor con productos que pidió, y debe registrarlos en el sistema para que el inventario se actualice.

## ¿Por qué no basta con poner los productos en el estante?

Porque el sistema no "ve" el estante. El sistema solo sabe lo que usted le dice. Si pone 20 leches en el estante pero no las registra, el sistema sigue diciendo que hay 0 leches, y cuando un cajero quiera vender una, el sistema le dirá que no hay stock.

**Recibir mercancía** es la operación de decirle al sistema: *"Hoy entraron X unidades de estos productos"*.

## Paso 1 — Preparar la factura del proveedor

Antes de tocar la computadora:

1. Pida al repartidor la **factura** o **remisión** del envío.
2. Antes de firmar, **cuente físicamente** cada producto y verifique que coincida con la factura.
3. Si hay diferencias (faltan productos, vienen rotos, vienen de menos), anótelas en la factura antes de firmar.
4. Una vez conformado, firme la factura del repartidor.

> ⚠️ **Importante**: Si firma la factura sin contar, después no puede reclamar al proveedor por faltantes.

## Paso 2 — Ir a Recepciones

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Busque y haga clic en **Recepciones** (también llamado "Recepción de Mercancía").
3. Verá la pantalla de recepciones con un botón **"+ Nueva recepción"** arriba a la derecha.

## Paso 3 — Iniciar una nueva recepción

1. Haga clic en **"+ Nueva recepción"**.
2. Se abre un formulario. Llene los campos siguientes:

| Campo | Qué escribir |
|-------|--------------|
| **Proveedor*** | Elija de la lista. Si no existe, hay que crearlo primero (en Configuración). |
| **Número de factura** | El número que aparece en la factura del proveedor. |
| **Fecha** | Hoy (ya viene por defecto). |
| **Tienda** | La tienda donde está recibiendo (ya viene por defecto). |

3. Haga clic en **"Continuar"**.

## Paso 4 — Agregar los productos recibidos

Verá una tabla vacía con un campo de búsqueda arriba.

1. En el campo de búsqueda, escriba el nombre del primer producto que recibió.
2. Haga clic en el producto correcto cuando aparezca.
3. Se agrega una fila a la tabla con estos campos:
   - **Cantidad recibida**: escriba cuántas unidades entraron.
   - **Precio de costo**: el precio unitario que viene en la factura.
   - **Lote / Vencimiento** (opcional): si el producto tiene fecha de vencimiento.
4. Repita este paso para cada producto de la factura.

> 💡 **Atajo**: Si ya tenía una **Orden de Compra** creada para este envío, haga clic en **"Cargar desde OC"** y seleccione la OC. El sistema llena la tabla automáticamente. Solo tiene que verificar las cantidades reales y corregir las que no coincidan.

## Paso 5 — Verificar los totales

Abajo de la tabla verá:

- **Total de productos**: cuántos artículos diferentes recibió.
- **Total de unidades**: sumando todas las cantidades.
- **Costo total**: cuánto dinero vale toda la recepción.

Compare estos totales con la factura del proveedor. **Deben coincidir**. Si no coinciden, hay un error en el formulario. Revise las cantidades y los precios.

## Paso 6 — Guardar y confirmar

1. Revise todo una vez más.
2. Haga clic en el botón verde **"Confirmar Recepción"** (arriba a la derecha).
3. Aparece un mensaje de confirmación: *"Recepción registrada. El inventario se actualizó."*
4. Aparece un botón **"Descargar PDF"**. Descargue el documento y archívelo con la factura del proveedor.

> ⚠️ **Importante**: Hasta que no hace clic en **"Confirmar Recepción"**, el inventario **no se actualiza**. Si solo guarda como borrador, los productos no aparecen en el stock.

## Paso 7 — Verificar que el stock subió

1. Vaya a **Multi-Tienda → Stock Actual**.
2. Busque uno de los productos que acaba de recibir.
3. La columna **"Stock actual"** debe mostrar el número anterior + la cantidad que acaba de entrar.

Si no se actualizó, espere 5 segundos y refresque con F5. Si sigue sin actualizarse, llame al administrador.

---

## Preguntas frecuentes

**¿Qué hago si un producto viene dañado?**
- Recíbalo en el sistema con cantidad 0 o no lo reciba.
- Anote en la factura del proveedor que ese producto venía dañado.
- Pida al repartidor una nota de crédito o un reemplazo.

**¿Puedo recibir productos que no están en el catálogo?**
- No. Primero debe darlos de alta en el catálogo (lea **Tutorial: Cómo dar de alta mi primer producto**).
- Después puede recibirlos.

**¿Qué pasa si recibí 20 y la factura decía 25?**
- Reciba solo las 20 que llegaron físicamente.
- Anote la diferencia en la factura del repartidor.
- El sistema guardará la recepción por 20. El proveedor debe enviar las 5 restantes después (en otra recepción).

**¿Puedo modificar una recepción después de confirmada?**
- Solo el administrador puede hacerlo, y solo dentro de las 24 horas siguientes.
- Después de 24 horas, la recepción queda bloqueada para auditoría.

**¿Cómo veo el historial de recepciones?**
- Vaya a **Multi-Tienda → Historial de Recepciones**.
- Ahí puede ver todas las recepciones pasadas, con su fecha, proveedor y monto.

**¿Y si recibí un servicio (limpieza, mantenimiento) en lugar de mercancía?**
- Eso es diferente. Use **Multi-Tienda → Servicios Recibidos** en lugar de Recepciones.
- Lea **Cómo recibir un servicio** para más detalles.
