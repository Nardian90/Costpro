# Cómo Hacer: Crear una Orden de Compra

> **Necesita esto cuando**: Va a pedir mercancía a un proveedor y quiere registrar el pedido en el sistema antes de que llegue, para poder comparar lo pedido contra lo recibido.

## ¿Qué es una Orden de Compra (OC)?

Es un **documento formal** que usted le envía al proveedor diciendo: *"Quiero pedir estos productos, en estas cantidades, a estos precios"*. El proveedor luego le envía la mercancía con una factura, y usted compara la factura con la OC.

En CostPro, la OC sirve para:

- Tener un registro de lo que pidió.
- Comparar lo pedido con lo recibido (¿me mandaron todo? ¿me cobraron más?).
- Llevar control de proveedores.
- Generar reportes de compras.

## Paso 1 — Ir a Órdenes de Compra

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Órdenes de Compra**.
3. Verá una lista con las OC anteriores y un botón **"+ Nueva OC"** arriba.

## Paso 2 — Iniciar una nueva OC

1. Haga clic en **"+ Nueva OC"**.
2. Se abre un formulario. Llene:

| Campo | Qué escribir |
|-------|--------------|
| **Proveedor*** | Elija de la lista. Si no existe, hay que crearlo en Configuración. |
| **Tienda*** | La tienda que va a recibir la mercancía. |
| **Fecha esperada** | Cuándo cree que llegará la mercancía. |
| **Moneda*** | Pesos, USD, EUR, etc. |
| **Tasa de cambio** | Si la moneda no es pesos, escriba la tasa del día. |
| **Notas** | Cualquier comentario para el proveedor. |

3. Haga clic en **"Continuar"**.

## Paso 3 — Agregar productos a la OC

1. En la tabla vacía, escriba el nombre del primer producto en el campo de búsqueda.
2. Haga clic en el producto correcto.
3. Se agrega una fila. Llene:
   - **Cantidad pedida**: cuántas unidades quiere.
   - **Precio unitario**: el precio acordado con el proveedor.
   - **Descuento** (opcional): si el proveedor le dio descuento.
4. El sistema calcula el subtotal automáticamente.
5. Repita para cada producto.

## Paso 4 — Verificar los totales

Abajo de la tabla verá:

- **Subtotal**: suma de todos los productos sin impuestos.
- **Impuestos**: si aplica (normalmente IVA).
- **Total**: lo que va a costar toda la OC.

Compare con su presupuesto. Si el total es mayor a lo esperado, revise los precios unitarios: a veces el proveedor subió precios y no le avisó.

## Paso 5 — Guardar como borrador

1. Revise todo.
2. Haga clic en **"Guardar borrador"**.
3. La OC queda con estado **"Borrador"**.

> 💡 En estado "Borrador", la OC no afecta el inventario ni la contabilidad. Es solo un documento en preparación.

## Paso 6 — Enviar la OC al proveedor

1. Con la OC abierta, haga clic en **"Enviar al proveedor"** (arriba a la derecha).
2. El estado cambia a **"Enviada"**.
3. Aparece un botón **"Descargar PDF"**. Descargue el PDF.
4. Envíe el PDF al proveedor por correo o WhatsApp.

> ⚠️ **Importante**: Solo el estado "Enviada" es válido para el proveedor. Si le manda un PDF en estado "Borrador", el proveedor podría rechazarlo o confundirse.

## Paso 7 — Esperar la respuesta del proveedor

El proveedor puede:

- **Confirmar**: dice que sí, va a enviar todo lo pedido.
- **Confirmar parcialmente**: dice que sí, pero algunos productos no los tiene. Le enviará los que tiene.
- **Rechazar**: dice que no puede cumplir con el pedido (sin stock, sin transporte, etc.).

Cuando el proveedor le conteste:

1. Vuelva a la OC en el sistema.
2. Haga clic en **"Registrar respuesta"**.
3. Seleccione el tipo de respuesta y, si es parcial, ajuste las cantidades.
4. Guarde.

## Paso 8 — Recibir la mercancía (cuando llegue)

Cuando llegue el camión del proveedor:

1. Abra la OC correspondiente.
2. Haga clic en **"Recibir mercancía"**.
3. Esto lo lleva a la pantalla de Recepciones, pero con la OC ya cargada.
4. Solo tiene que contar las cantidades reales y ajustar si hay diferencias.
5. Confirme la recepción.

> 💡 **Beneficio clave**: Si usa OC, el sistema **compara automáticamente** lo que pidió contra lo que recibió. Le alerta si el proveedor mandó de menos o si cobró un precio diferente.

---

## Estados de una Orden de Compra

| Estado | Significado |
|--------|-------------|
| **Borrador** | Está creando la OC. Aún no es oficial. |
| **Enviada** | Ya se la mandó al proveedor. Esperando respuesta. |
| **Confirmada** | El proveedor aceptó el pedido. |
| **Parcial** | El proveedor aceptó pero con menos productos. |
| **Recibida** | Llegó toda la mercancía y se registró. |
| **Parcialmente recibida** | Llegó parte de la mercancía. Falta el resto. |
| **Cerrada** | Se completó todo el proceso. |
| **Anulada** | Se canceló por algún motivo. |

## Preguntas frecuentes

**¿Puedo modificar una OC ya enviada?**
- No directamente. Tiene que **anularla** y crear una nueva.
- O crear una OC "modificatoria" que reemplaza a la original.

**¿Qué hago si el proveedor me cobra más caro que en la OC?**
- Reciba la mercancía con el precio **real** de la factura.
- El sistema registrará la diferencia y se la mostrará en el reporte de recepción.
- Llame al proveedor para reclamar.

**¿Puedo tener varias OCs abiertas con el mismo proveedor?**
- Sí. Cada OC es independiente.

**¿La OC descuenta el inventario?**
- No. La OC es solo un pedido. El inventario se descuenta recién cuando **recibe** la mercancía.

**¿Cómo veo todas mis OCs?**
- En Multi-Tienda → Órdenes de Compra. Puede filtrar por estado, proveedor o fecha.
