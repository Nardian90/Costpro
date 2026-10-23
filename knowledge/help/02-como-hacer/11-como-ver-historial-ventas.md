# Cómo Hacer: Ver el Historial de Mis Ventas

> **Necesita esto cuando**: Quiere revisar qué vendió hoy, esta semana, o en una fecha específica. Útil para verificar si cobró bien, para reenviar un comprobante, o para revertir una venta con error.

## Paso 1 — Ir al Historial de Ventas

1. En el POS, haga clic en el botón **Historial** (arriba), o
2. Vaya a **OPERACIÓN → Ventas → Opciones → Historial de Ventas**.
3. Verá la tabla de ventas de la tienda activa.

![Historial de Ventas con los indicadores del período, el buscador y las vistas Detalle/Producto/Resumen](/help/capturas/historial-ventas.webp "Figura 1. Historial de Ventas — indicadores del período y vistas de detalle")

## Paso 2 — Buscar y filtrar las ventas

Por defecto, la vista trae las ventas del **mes en curso hasta hoy**. Los controles disponibles son:

| Control | Qué hace |
|---------|----------|
| **Búsqueda** | Busca por referencia, vendedor, monto o método de pago (un solo campo inteligente). |
| **Estado** | Filtra entre Completadas, Anuladas y Pendientes. |
| **Rango de fechas** | Fecha desde / fecha hasta. |

No hay filtros separados por cajero, método de pago ni rango de montos: la búsqueda única cubre esos datos (ej.: escriba "efectivo" o un monto y encontrará las ventas que coinciden).

## Paso 3 — Leer la tabla

Cada fila es una venta. Las columnas son:

| Columna | Significado |
|---------|-------------|
| **Ref** | Referencia de la venta (identificador único truncado). |
| **Fecha** | Día y hora. |
| **Total** | Monto cobrado. |
| **Método** | Efectivo, transferencia, Transf. Exterior o mixto. |
| **Estado** | Completada, Anulada, Pendiente. |

Arriba verá los **indicadores del período** y puede alternar entre las vistas **Detalle / Producto / Resumen Consolidado**.

## Paso 4 — Ver el detalle de una venta

1. Haga clic en cualquier fila de la tabla.
2. Se abre una ventana con el detalle completo:
   - Lista de productos vendidos con cantidades y precios.
   - Descuentos aplicados.
   - Métodos de pago y desglose por moneda.
   - Impuestos ajustados (si se aplicaron).
3. Desde el detalle puede **Imprimir comprobante** (reimpresión térmica; disponible incluso para ventas anuladas).

## Paso 5 — Revertir una venta (solo roles de gestión)

> ⚠️ **Atención**: Revertir es una acción grave: devuelve el stock y anula la venta. Solo la usan admin, manager o encargado de la tienda de la venta.

1. Seleccione la venta y haga clic en **Revertir venta**.
2. Escriba el **motivo** (texto libre, obligatorio; ej.: *"Venta registrada por error"*).
3. Confirme. La venta queda **Anulada**, el stock vuelve al inventario y el movimiento queda en auditoría.

No existe ventana de 24 horas: el control es por rol. Para el error del propio cajero inmediato después de cobrar, use **Deshacer** en la pantalla de venta (30 segundos, solo ventas propias recién hechas).

## Paso 6 — Exportar el historial

1. Haga clic en **Exportar**.
2. Se descarga un **Excel (.xlsx)** con las ventas del período y el desglose por método (efectivo / transferencia / Zelle), respetando los filtros activos.

Para reportes PDF use el **Generador de Reportes** (ANÁLISIS → Reportes).

## Paso 7 — Otras acciones útiles

- **Duplicar venta**: carga los mismos ítems en el POS para volver a cobrar (útil para clientes recurrentes).
- **Ajuste de Impuestos** (admin/encargado/manager): aplica o quita impuestos a una venta ya registrada, con motivo; el sistema recalcula los totales en el servidor.

---

## Preguntas frecuentes

**¿Por cuánto tiempo se conservan las ventas?**
- Para siempre. El sistema no borra ventas, ni siquiera las anuladas.

**¿Puedo ver las ventas de otra tienda?**
- Cambie de tienda activa y abra el historial: siempre ve la tienda activa. El cajero (clerk) ve las ventas de su tienda, no solo las suyas.

**¿Cómo encuentro una venta específica si no recuerdo la fecha?**
- Use la búsqueda: acepta referencia, vendedor, monto o método (ej. "efectivo").

**¿El historial incluye las ventas anuladas?**
- Sí, con su estado visible. Puede filtrar por estado Completadas o Anuladas.

**¿Las ventas aparecen inmediatamente después de hacerlas?**
- Sí. Tan pronto como confirma el pago, la venta aparece en el historial. Si no aparece, refresque la página.

**¿Puedo editar una venta después de hacerla?**
- No. Las ventas son inmutables.
- Si necesita cambiar algo: **Deshacer** (30 s) o **Revertir** (roles de gestión) y volver a cobrar. Los impuestos sí se ajustan post-venta con el Ajuste de Impuestos.
