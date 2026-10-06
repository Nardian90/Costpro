# Cómo Hacer: Emitir un Vale de Salida

> **Necesita esto cuando**: Productos salen del inventario **sin ser una venta comercial**: consumo en un trabajo, merma, traslado interno, obsequio, entrega a un técnico. El stock baja, pero no se cobra nada y no se genera caja.

## Qué es

Un **Vale de Salida (VS)** es una salida de inventario **sin venta**:

- Descuenta productos del almacén y queda en el **kardex** con su costo.
- **No genera ingreso, no toca la caja, no crea cuentas por cobrar y no tiene pago**.
- El **costo** del vale se calcula automáticamente con el costo promedio del producto (el servidor decide, el cliente solo ve una estimación).
- Cada vale recibe un número de documento `VS-000NNN-AAAA` trazable.

> **Cuándo NO usarlo**: si el cliente paga (aunque sea a cuenta o con descuento), es una **Venta** en el POS, no un vale. Si el producto vuelve al almacén, evalúe una **Devolución** (si hay venta original) o un **Ajuste de Inventario**.

## Dónde está

El vale **no tiene vista propia**: es un modo dentro del POS.

```text
Operación → Vender → (toggle del carrito) [Venta] [VS]
```

## Cómo emitirlo

1. Abra **Vender** y mueva el toggle del carrito a **VS**.
2. Agregue los productos y cantidades al carrito (igual que en una venta).
3. **Orden de Producción (opcional)**: si la salida es material de un trabajo, seleccione la orden (aparecen las que están Aprobadas, En Progreso o Pausadas). Si no, deje **"— Sin OT (solo descuenta stock) —"**.
4. Si eligió OT, el sistema permite **asociar cada ítem a una línea de la orden**; al emitir, se descuenta también la cantidad **Real** de esa línea (no puede exceder lo presupuestado).
5. Escriba las **Notas** (obligatorias): describa el motivo (consumo interno, merma, traslado, a quién se entrega...).
6. Revise el **costo estimado** y haga clic en **"Emitir Vale"**.
7. El sistema muestra el número del vale (ej: `VS-000126-2026`) y limpia el carrito.

## Qué ocurre automáticamente

- El inventario **baja** y el movimiento queda en el kardex con tipo `Vale de Salida` y el número del documento como referencia.
- Si asoció líneas de OT, la cantidad **Real** de esas líneas aumenta.
- Queda **auditoría** del vale (usuario, tienda, costo total, fecha de operación).

## Cómo consultarlo después

- **Inventario → Trazabilidad (kardex)**: cada salida muestra el documento `VS-000NNN-AAAA`, la cantidad y el costo.
- Los vales también quedan registrados con su nota, por lo que buscar por el texto de la nota (por ejemplo el nombre de la OT o del técnico) permite reconstruir el histórico.

## Precauciones

- **Las notas son obligatorias** y son la única explicación del motivo: escriba algo que entienda dentro de 6 meses.
- **Reversión de un vale**: el mecanismo funcional existe — `POST /api/vale-salida/{id}/reverse` (RPC `reverse_vale_salida`) marca el vale como `reversed`, registra el movimiento compensatorio `issue_slip_reverse` (+cantidad, kardex `in`), restaura la línea de la OT si aplica y deja auditoría `REVERSE_VALE_SALIDA`. Solo vale en estado `completed` es reversible (protección anti doble reversión). **Gap actual**: no existe todavía una vista o botón en la UI que invoque esa reversión (no hay historial de vales en pantalla); hasta que exista, la reversión queda como operación de administrador vía API y el ajuste documental de inventario (Inventario → Ajustes) es la alternativa disponible desde la interfaz.
- No use el vale para "regalar" sin permiso: el costo del vale impacta el costo de la tienda aunque no haya ingreso.

## Preguntas frecuentes

**¿El vale puede ir sin Orden de Trabajo?**
- Sí. La OT es **opcional**: con OT, además de bajar el stock se descuenta la línea de la orden; sin OT, solo baja el stock y las notas explican el motivo.

**¿Afecta la caja o los reportes de venta?**
- No. No genera ingreso ni movimiento de caja; solo costo de inventario.

**¿Qué pasa si no hay stock suficiente o la cantidad excede lo presupuestado en la OT?**
- El sistema rechaza la emisión: revise el stock o el presupuesto de la orden antes de reintentar.
