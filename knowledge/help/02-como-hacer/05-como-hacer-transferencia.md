# Cómo Hacer: Enviar Productos a Otra Tienda (Transferencia)

> **Necesita esto cuando**: Una tienda se quedó sin stock de un producto y otra tienda tiene de sobra, y quiere mover mercancía entre las dos.

## ¿Qué es una transferencia?

Es el movimiento de productos **de una tienda a otra** dentro de la misma empresa. No es una venta (no hay dinero de por medio) y no es una recepción de proveedor (no viene de afuera). Es simplemente: *"de la tienda A, mandé X unidades a la tienda B"*.

El sistema lleva un control estricto porque cada transferencia **afecta el inventario de ambas tiendas** y debe estar firmada por ambas partes.

## Paso 1 — Ir a Transferencias

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Transferencias**.
3. Verá una lista con las transferencias anteriores y un botón **"+ Nueva transferencia"**.

## Paso 2 — Iniciar una nueva transferencia

1. Haga clic en **"+ Nueva transferencia"**.
2. Se abre un formulario. Llene:

| Campo | Qué escribir |
|-------|--------------|
| **Tienda origen*** | La tienda desde donde salen los productos. Por defecto es la tienda activa. |
| **Tienda destino*** | La tienda que va a recibir los productos. |
| **Fecha*** | Hoy (ya viene por defecto). |
| **Responsable*** | Su nombre de usuario. |
| **Motivo** | Una nota corta explicando por qué transfiere. Ej: *"Tienda Centro se quedó sin leche"*. |

3. Haga clic en **"Continuar"**.

> ⚠️ **Importante**: La tienda origen debe ser **una tienda donde usted tiene permiso**. Si no tiene acceso, el sistema le impedirá continuar.

## Paso 3 — Agregar los productos a transferir

1. Verá una tabla vacía con un campo de búsqueda arriba.
2. Escriba el nombre del primer producto que quiere transferir.
3. Haga clic en el producto cuando aparezca.
4. Se agrega una fila con:
   - **Stock disponible**: cuánto hay en la tienda origen.
   - **Cantidad a transferir**: escriba cuántas unidades quiere enviar.
5. Repita para cada producto que quiera mandar.

> ⚠️ **No puede transferir más del stock disponible**. Si la tienda origen tiene 10 unidades y usted quiere transferir 15, el sistema le impedirá continuar.

## Paso 4 — Verificar y guardar como borrador

1. Revise la tabla completa.
2. Verifique que las cantidades son correctas.
3. Haga clic en **"Guardar borrador"** (arriba a la derecha).
4. La transferencia queda con estado **"Pendiente"**.

> 💡 **Consejo**: Siempre guarde como borrador primero. Así puede revisar una vez más antes de enviar. Una vez que la transferencia se "envía", no se puede borrar, solo se puede anular con un proceso más largo.

## Paso 5 — Imprimir el reporte de transferencia

1. Con la transferencia abierta, haga clic en **"Imprimir reporte"**.
2. Se descarga un PDF con:
   - Los datos de la transferencia (origen, destino, fecha, responsable).
   - La lista de productos con sus cantidades.
   - Un **código QR** que la tienda destino debe escanear al recibir.
3. Imprima el PDF.

## Paso 6 — Despachar físicamente la mercancía

1. Saque los productos del estante según la lista.
2. Empáquelos.
3. Pegue el reporte impreso en el paquete.
4. Entréguelo al transportista (o llévelo usted mismo).

## Paso 7 — Cambiar el estado a "En tránsito"

1. Vuelva a la transferencia en el sistema.
2. Haga clic en **"Marcar como en tránsito"**.
3. El estado cambia a **"En tránsito"**.
4. En este momento, el sistema **descuenta el stock de la tienda origen**, pero **aún no lo suma a la tienda destino**.

> ⚠️ **Importante**: Si una tienda hace un reporte de stock en este momento, verá que las unidades transferidas "desaparecieron" de la tienda origen. Esto es correcto: están en camino, no en el estante.

## Paso 8 — Confirmación en la tienda destino

Cuando el paquete llega a la tienda destino:

1. El encargado de esa tienda entra al sistema.
2. Va a **Multi-Tienda → Transferencias**.
3. Filtra por estado **"En tránsito"**.
4. Encuentra la transferencia y la abre.
5. **Cuenta los productos físicamente** y compara con la lista.
6. Si todo coincide: hace clic en **"Confirmar recepción"**.
7. Si hay diferencias: hace clic en **"Registrar discrepancia"** y anota qué faltó o sobró.

## Paso 9 — Cierre de la transferencia

Después de la confirmación en destino:

- El stock se **suma a la tienda destino**.
- El estado cambia a **"Completada"**.
- Ya no se puede modificar.

---

## Preguntas frecuentes

**¿Qué pasa si la mercancía se pierde en el camino?**
- La transferencia queda en estado "En tránsito" para siempre.
- El administrador debe hacer un **ajuste de inventario** en la tienda destino para registrar la pérdida.
- Se recomienda investigar con el transportista.

**¿Puedo anular una transferencia ya enviada?**
- Solo si está en estado "Pendiente" o "En tránsito".
- Si está "Completada", no se puede anular. Tendría que hacer una **transferencia inversa**.

**¿Una transferencia afecta la caja de alguna tienda?**
- No. Las transferencias no involucran dinero. Solo mueven inventario.

**¿Cuánto tarda una transferencia en completarse?**
- Depende del transporte. Si es entre tiendas de la misma ciudad, normalmente el mismo día.
- Si es entre ciudades, puede tardar días.
- El sistema no tiene límite de tiempo. La transferencia puede estar "En tránsito" indefinidamente.

**¿Puedo transferir a una tienda de otra empresa?**
- No. Las transferencias son dentro de la misma empresa. Para mover mercancía a otra empresa, se hace una **venta** normal.
