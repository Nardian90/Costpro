# Cómo Hacer: Crear una Orden de Compra

> **Necesita esto cuando**: planea comprar mercancía a un proveedor y quiere dejar documentado qué pedirá, cuánto cuesta y compararlo después con lo que realmente llega.

## ¿Para qué sirve?

Las **Órdenes de Compra (OC)** documentan la intención de compra antes de recibir mercancía. La OC **no descuenta inventario ni genera gastos**: es un documento de planificación. Su valor aparece al recibir: las recepciones pueden validarse contra la OC para comparar lo pedido contra lo recibido.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Logística** → **Órdenes de Compra** (después de Servicios Recibidos).
- **Móvil**: pestaña inferior **Recibir** → la misma vista.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «orden de compra» u «OC».

## Antes de comenzar

- Necesita rol admin, manager, encargado o warehouse en la tienda.
- Ten a mano el nombre del proveedor y la lista de productos con cantidades y costos estimados.
- La OC se registra en la **tienda activa**; no se elige tienda en el formulario.

## Cómo crear una OC

1. Vaya a **OPERACIÓN → Logística → Órdenes de Compra**.
2. Pulse **Nueva OC** / **Crear OC (Borrador)**.
3. Complete la cabecera:
   - **Proveedor**: nombre del proveedor (texto; el sistema le sugiere proveedores ya usados).
   - **N° OC**: número propio de referencia (opcional).
   - **Fecha esperada**: cuándo debería llegar (opcional).
   - **Notas**: aclaraciones para quien recibe (opcional).
4. Agregue los ítems: nombre del producto, SKU (opcional), cantidad pedida, costo unitario y unidad de medida. El total se calcula automáticamente.
5. Guarde la orden. Nace en estado **Borrador**.

## Estados y acciones

| Estado | Qué significa | Acciones |
|--------|--------------|----------|
| **Borrador** | Recién creada, aún sin vigencia. | Editar el contenido según su flujo de trabajo; ver detalle. |
| **Pendiente** | Confirmada como pedido vigente al proveedor. | **Cancelar** (con confirmación). |
| **Parcial** | Recibió una parte de la mercancía. | Seguir recibiendo; **Cancelar** si no va a completarse. |
| **Recibida** | Todo lo pedido fue recibido. | Consulta y comparación pedido vs. recibido. |
| **Cancelada** | Anulada antes de completarse. | Solo consulta. |

La OC no tiene flujo de "envío al proveedor" ni respuesta del proveedor dentro del sistema: el pedido en sí se hace por sus canales habituales y CostPro documenta y controla el cumplimiento.

## Cómo recibir contra una OC

1. Cuando llegue la mercancía, vaya a **Recepciones** (OPERACIÓN → Logística → Recepciones) y cree la recepción.
2. Use la opción **Recibir contra OC** y seleccione la orden.
3. Registre las cantidades que realmente llegan: la recepción valida contra lo pedido.
4. Al confirmar la recepción, la OC avanza a **Parcial** o **Recibida** según lo recibido.

## Órdenes sugeridas (Premium)

El botón **Sugerir OC Inteligente** genera una propuesta automática con los productos críticos (stock bajo) y frecuentes de la tienda. Puede definir un **presupuesto** y el sistema ajusta las cantidades para caber en él, avisándole de los recortes. Revise siempre la propuesta antes de guardarla como OC.

## Restricciones importantes

- La OC **no toca inventario**: el stock solo cambia al confirmar la recepción.
- No hay cálculo de impuestos ni conversión de moneda en la OC: los costos se anotan tal cual se acordaron.
- Solo se cancelan órdenes **Pendientes** o **Parciales**; una Recibida ya es historia.
- El proveedor es texto libre: si escribe un nombre nuevo, no se vincula automáticamente a proveedores anteriores.

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| No veo la opción "Recibir contra OC" | La OC está cancelada o ya recibida. | Verifique el estado de la orden. |
| La OC quedó con cantidades equivocadas | Error de carga. | Según el estado: corrígala si está en Borrador o cancélela y cree una nueva. |
| El total de la OC no coincide con la factura | Diferencia de costo o cantidades reales. | Registre la recepción con los valores reales; la comparación pedido vs. recibido se consulta en el detalle. |
| No puedo cancelar la OC | Ya está Recibida. | Una recibida no se cancela; si la mercancía debe devolverse, coordine con el proveedor fuera de la OC. |

## Preguntas frecuentes

**¿La OC genera un gasto o afecta la caja?**
No. Solo al confirmar la recepción se incorpora la mercancía y su costo al inventario. El pago al proveedor se gestiona después (Cuentas por Pagar / pagos de recepción).

**¿Puedo crear la OC con productos que no están en el catálogo?**
Sí: los ítems son texto libre. Al recibir, si el producto no existe, la recepción puede agregarlo como nuevo.

**¿Se puede enviar la OC al proveedor desde CostPro?**
No hay envío ni PDF de la OC: el documento es de control interno. Use sus canales habituales para el pedido.

**¿Qué pasa si recibo más de lo pedido?**
La recepción registra lo que realmente llega y la comparación con lo pedido queda en el detalle de la OC; la OC se marca Recibida al completar las cantidades.

## Información relacionada

- **Cómo recibir mercancía** — el paso siguiente: recibir contra OC.
- **Cómo registrar y pagar un Servicio Recibido** — los servicios del abastecimiento que complementan la compra.
- **Cómo transferir stock entre tiendas** — para mover mercancía ya recibida.
