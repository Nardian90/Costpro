# Cómo Hacer: Transferir Stock entre Tiendas

> **Necesita esto cuando**: una tienda necesita enviar mercancía a otra tienda del grupo y quiere que el movimiento quede trazado, con el stock reservado en origen y aplicado en destino.

## ¿Para qué sirve?

Las **Transferencias de Stock** mueven mercancía entre tiendas **sin intervenir dinero ni ventas**. Una transferencia no genera cobros ni comprobantes fiscales: es un movimiento interno documentado, con dos lados bien definidos:

- **Origen**: la tienda que envía (la tienda activa con la que crea la transferencia).
- **Destino**: la tienda que recibe y confirma.

Mientras la transferencia está **Pendiente**, el stock asignado queda **reservado** en origen: no está disponible para otras salidas (ventas, vales), pero todavía no se ha movido. El movimiento real ocurre cuando la tienda destino **confirma la recepción**.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Logística** → **Transferencia Stock**.
- **Móvil**: pestaña inferior **Recibir** → la misma vista.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «transferencia» o «transferir».

## Antes de comenzar

- Necesita rol de gestión o almacén en su tienda (admin, manager, encargado o warehouse).
- El producto debe existir en el catálogo; si el SKU no existe en la tienda destino, el sistema crea el producto espejo al confirmar.
- Debe haber **stock disponible suficiente** en origen: el sistema valida contra el stock real, no contra el teórico.
- Para confirmar la recepción, el usuario de destino debe tener acceso a esa tienda.

## Cómo crear una transferencia

1. Vaya a **OPERACIÓN → Logística → Transferencia Stock**.
2. Haga clic en **+ Nueva Transferencia**.
3. La **tienda origen es la tienda activa** con la que está trabajando (no se elige en el formulario).
4. Elija el **almacén destino**.
5. Agregue los productos y las cantidades a enviar.
6. Escriba **Notas/Observaciones** si aplica (opcional, pero recomendado para el receptor).
7. Revise la **fecha de operación** (por defecto hoy o su fecha de trabajo; nunca futura).
8. Haga clic en **Enviar Solicitud**.

La transferencia queda en estado **Pendiente** y el stock de los productos queda reservado en origen.

## Cómo recibir una transferencia (tienda destino)

1. La tienda destino abre la vista y va a la pestaña **Entrantes** (o abre el detalle desde la notificación de la lista).
2. Abre la transferencia en estado Pendiente y revisa productos y cantidades.
3. Hace clic en **Confirmar Recepción** y ajusta la **fecha de recepción** si corresponde.

En ese instante el movimiento se aplica **de forma atómica**: el stock sale de origen y entra a destino en el mismo acto. No hay un estado intermedio "en tránsito" con el stock desaparecido: mientras no se confirma, el stock sigue en origen (reservado).

## Estados y acciones

| Estado | Qué significa | Acciones disponibles |
|--------|--------------|---------------------|
| **Pendiente** | Solicitud enviada; stock reservado en origen. | El destino **Confirma Recepción**; el origen **Cancela Transferencia**. |
| **Confirmada** | Mercancía aplicada en destino. | **Revertir** (con rol en la tienda origen) y **Duplicar**. |
| **Cancelada** | Solicitud anulada antes de confirmar. | El stock reservado se libera. |
| **Revertida** | Una transferencia confirmada que se deshizo: el stock volvió a origen. | Consulta y auditoría. |

El listado tiene pestañas **Salientes/Entrantes**, filtro por estado y búsqueda. Desde el detalle puede **Exportar PDF** (comprobante interno del movimiento, sin código QR) y desde el listado exportar a Excel. **Duplicar** crea una nueva transferencia pendiente con las mismas líneas, útil para envíos recurrentes.

## Restricciones importantes

- No se puede enviar más stock del **disponible** en origen (las reservas de otras transferencias pendientes cuentan).
- Solo se cancela una transferencia **Pendiente**; una **Confirmada** solo puede **revertirse**.
- Confirmar requiere usuario con acceso a la **tienda destino**; revertir requiere rol en la **tienda origen**.
- Las cantidades se confirman tal cual: no hay flujo de "discrepancias parciales". Si llegó menos de lo enviado, confirme la transferencia y resuelva la diferencia con un ajuste documental.
- No hay "Guardar borrador": la transferencia nace directamente como Pendiente al enviar la solicitud.
- El PDF del detalle es un comprobante interno de movimiento, no un documento fiscal.

## Errores frecuentes

| Mensaje / síntoma | Causa | Solución |
|-------------------|-------|----------|
| No permite agregar la cantidad solicitada | Stock disponible insuficiente en origen. | Reduzca la cantidad o despache primero otra transferencia pendiente que reserve ese stock. |
| No veo el botón Confirmar Recepción | La transferencia no está en estado Pendiente, o no tiene acceso a la tienda destino. | Verifique el estado y su tienda activa. |
| El producto no aparece en destino | El SKU aún no existía en la tienda destino. | Al confirmar se crea el producto espejo; verifique su ficha en el catálogo destino. |
| Cancelé por error y ya no está | Las canceladas no se recuperan. | Use **Duplicar** desde el detalle para recrear la solicitud. |

## Preguntas frecuentes

**¿Cuándo se descuenta el stock de origen?**
Solo al confirmar la recepción en destino. Antes de eso, el stock queda reservado (no disponible para ventas ni vales), pero visible en la tienda origen.

**¿Puedo transferir entre dos tiendas siendo yo mismo usuario de ambas?**
Sí: cree desde la tienda origen y confirme cambiando su tienda activa a la destino.

**¿La transferencia afecta la caja o las ventas?**
No. Es un movimiento de inventario sin dinero.

**¿Qué hago si llegó mercancía dañada o faltante?**
Confirme la transferencia con las cantidades recibidas y documente la diferencia con un **Ajuste Documental** (OPERACIÓN → Almacén → Ajustes Documentales) en la tienda correspondiente.

## Información relacionada

- **Estados de una transferencia** (referencia rápida de estados y transiciones).
- **Cómo ajustar el inventario** — para diferencias posteriores a la recepción.
- **Cómo recibir mercancía** — el flujo de recepción de proveedores externos.
