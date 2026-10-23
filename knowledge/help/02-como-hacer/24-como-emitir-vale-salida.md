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

El vale tiene **dos caminos**:

```text
Camino principal:  Operación → Almacén → Vales de Salida (vista propia con historial)
Camino rápido:     Operación → Ventas → Vender → (toggle del carrito) [Venta] [VS]
```

La vista **Vales de Salida** reúne el historial completo con filtro por estado (Completados, Devueltos, Anulados), modo tabla o tarjetas y el botón **Crear Vale de Salida**.

## Cómo emitirlo

**Desde la vista de Vales de Salida:**

1. Abra **OPERACIÓN → Almacén → Vales de Salida** y pulse **Crear Vale de Salida**.
2. Agregue productos y cantidades (si un producto se vende en cajas y unidades, elija la **variante con su factor de conversión**: ej. 1 caja = ×24 unidades base).
3. **Orden de Producción (opcional)**: si la salida es material de un trabajo, seleccione la orden (aparecen las que están Aprobadas, En Progreso o Pausadas). Si no, deje **"— Sin OT (solo descuenta stock) —"**.
4. Si eligió OT, el sistema permite **asociar cada ítem a una línea de la orden**; al emitir, se descuenta también la cantidad **Real** de esa línea (no puede exceder lo presupuestado; el sistema avisa si supera el presupuesto restante).
5. Escriba el **Concepto / notas** (obligatorio): describa el motivo (consumo interno, merma, traslado, a quién se entrega...).
6. Revise la **fecha de operación** (por defecto hoy o su fecha de trabajo; nunca futura) y el **costo estimado**, y confirme.
7. El sistema muestra el número del vale (ej: `VS-000126-2026`) y queda en el historial en estado **Completado**.

**Desde el POS:** el toggle del carrito a **VS** hace el mismo flujo sin salir de la venta; útil para el encargado de almacén que ya está en la caja.

## Qué ocurre automáticamente

- El inventario **baja** y el movimiento queda en el kardex con tipo `Vale de Salida` y el número del documento como referencia.
- Si asoció líneas de OT, la cantidad **Real** de esas líneas aumenta.
- Queda **auditoría** del vale (usuario, tienda, costo total, fecha de operación).

## Cómo consultarlo después

- **Operación → Almacén → Vales de Salida**: historial completo con detalle documental, filtros por estado y búsqueda.
- **Inventario → Trazabilidad (kardex)**: cada salida muestra el documento `VS-000NNN-AAAA`, la cantidad y el costo.
- Los vales también quedan registrados con su nota, por lo que buscar por el texto de la nota (por ejemplo el nombre de la OT o del técnico) permite reconstruir el histórico.

## Cómo devolver (revertir) un vale

Si un vale se emitió por error, ábralo desde el historial de **Vales de Salida** y pulse **Devolver vale**: el sistema registra el movimiento compensatorio (el stock vuelve), restaura la línea de la OT si aplica y deja auditoría. Solo los vales en estado **Completado** se pueden devolver (protección anti doble reversión); después, el vale queda como **Devuelto**.

## Precauciones

- **Las notas son obligatorias** y son la única explicación del motivo: escriba algo que entienda dentro de 6 meses.
- **Solo se devuelven los vales Completados** y la devolución es total: no hay devolución parcial de un vale.
- No use el vale para "regalar" sin permiso: el costo del vale impacta el costo de la tienda aunque no haya ingreso.

## Preguntas frecuentes

**¿El vale puede ir sin Orden de Trabajo?**
- Sí. La OT es **opcional**: con OT, además de bajar el stock se descuenta la línea de la orden; sin OT, solo baja el stock y las notas explican el motivo.

**¿Afecta la caja o los reportes de venta?**
- No. No genera ingreso ni movimiento de caja; solo costo de inventario.

**¿Qué pasa si no hay stock suficiente o la cantidad excede lo presupuestado en la OT?**
- El sistema rechaza la emisión: revise el stock o el presupuesto de la orden antes de reintentar.
