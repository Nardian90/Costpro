# Cómo Hacer: Ver el Historial de Mis Ventas

> **Necesita esto cuando**: Quiere revisar qué vendió hoy, esta semana, o en una fecha específica. Útil para verificar si cobró bien, para encontrar un recibo perdido, o para ver su desempeño.

## Paso 1 — Ir al Historial de Ventas

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Historial de Ventas** (a veces llamado simplemente "Ventas").
3. Verá una tabla con todas las ventas registradas.

## Paso 2 — Filtrar las ventas que quiere ver

Por defecto, la tabla muestra las ventas de **hoy** en la tienda activa. Si quiere ver otras:

### Filtrar por fecha
1. Haga clic en el campo **"Desde"** y elija una fecha.
2. Haga clic en el campo **"Hasta"** y elija otra fecha.
3. Use los botones rápidos: **Hoy**, **Ayer**, **Esta semana**, **Este mes**, **Mes pasado**.

### Filtrar por cajero
1. Haga clic en el campo **"Cajero"**.
2. Seleccione un usuario específico, o "Todos" para ver de todos.

### Filtrar por método de pago
1. Haga clic en **"Método de pago"**.
2. Elija: Efectivo, Tarjeta, Transferencia, Mixto, o Todos.

### Filtrar por monto
1. Escriba un monto mínimo en **"Desde $""**.
2. Escriba un monto máximo en **"Hasta $"**.
3. Solo verá ventas en ese rango.

### Buscar por folio
1. Si tiene el número de recibo (folio), escríbalo en el campo **"Buscar folio"**.
2. Aparecerá esa venta específica.

## Paso 3 — Leer la tabla

Cada fila es una venta. Las columnas son:

| Columna | Significado |
|---------|-------------|
| **Folio** | Número único de la venta. Ej: V-2024-0315-001. |
| **Fecha** | Día y hora. Formato DD/MM/AAAA HH:MM. |
| **Cliente** | Nombre del cliente (si se registró). |
| **Cajero** | Usuario que cobró. |
| **Productos** | Cuántos artículos vendidos. |
| **Total** | Monto cobrado. |
| **Método** | Efectivo, tarjeta, etc. |
| **Estado** | Completada, Anulada, Pendiente. |

## Paso 4 — Ver el detalle de una venta

1. Haga clic en cualquier fila de la tabla.
2. Se abre una ventana con el detalle completo:
   - Lista de productos vendidos con cantidades y precios.
   - Descuentos aplicados.
   - Método de pago.
   - Cambio entregado.
   - Cliente (si se registró).
   - Hora exacta.
3. Puede hacer clic en **"Imprimir recibo"** para volver a imprimirlo.

## Paso 5 — Anular una venta (solo si es necesario)

> ⚠️ **Atención**: Anular una venta es una acción grave. Solo se hace si la venta se registró por error, o si el cliente devuelve todos los productos. No se usa para cambios parciales.

1. Abra el detalle de la venta que quiere anular.
2. Haga clic en el botón rojo **"Anular venta"** (arriba a la derecha).
3. Aparece una ventana pidiendo el motivo. Seleccione o escriba:
   - *Venta registrada por error*
   - *Devolución total del cliente*
   - *Error en el monto*
   - *Otro*
4. Haga clic en **"Confirmar anulación"**.
5. La venta queda con estado **"Anulada"**.
6. El sistema **devuelve el stock** al inventario y **restituye el dinero** a la caja (si fue en efectivo).

> ⚠️ **Restricciones**:
> - Solo se puede anular dentro de las **24 horas** siguientes a la venta.
> - Después de 24 horas, necesita autorización del administrador.
> - Las ventas anuladas por tarjeta **no reembolsan el dinero** automáticamente (debe hacerlo por el banco).

## Paso 6 — Exportar el historial

1. Haga clic en **"Exportar"** (arriba a la derecha).
2. Elija **PDF** o **Excel**.
3. Se descargará con los filtros aplicados.

---

## Preguntas frecuentes

**¿Por cuánto tiempo se conservan las ventas?**
- Para siempre. El sistema no borra ventas, ni siquiera las anuladas.
- Puede ver ventas de hace años sin problema.

**¿Puedo ver las ventas de otra tienda?**
- Si usted es administrador: sí, cambie de tienda activa y vaya al historial.
- Si es cajero: solo ve las ventas de su tienda y de sus propias ventas.

**¿Puedo ver cuánto vendí este mes?**
- Sí. Filtre por fecha (este mes) y por cajero (su nombre).
- El total de la tabla le dirá cuánto vendió.

**¿Cómo encuentro una venta específica si no recuerdo la fecha?**
- Use el campo "Buscar folio" si tiene el número.
- Si no tiene el folio, filtre por cliente (si lo recuerda) o por monto aproximado.

**¿El historial incluye las ventas anuladas?**
- Sí, pero con un ícono diferente (tachado en rojo).
- Puede filtrar para ver solo las activas o solo las anuladas.

**¿Las ventas aparecen inmediatamente después de hacerlas?**
- Sí. Tan pronto como confirma el pago, la venta aparece en el historial.
- Si no aparece, espere 3 segundos y refresque con F5.

**¿Puedo editar una venta después de hacerla?**
- No. Las ventas son inmutables.
- Si necesita cambiar algo, tiene que **anularla** y hacer una nueva.
