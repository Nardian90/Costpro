# Referencia: Los 11 Tipos de Reportes

> **Use esta tabla** cuando quiera saber qué reporte generar para cada necesidad.

## Tabla rápida

| # | Reporte | Responde a | Filtros típicos |
|---|---------|------------|------------------|
| 1 | **Ventas (Sales)** | ¿Cuánto vendí? | Fecha, tienda, cajero, método de pago |
| 2 | **Ganancias (Profit)** | ¿Cuánto gané? | Fecha, tienda, categoría |
| 3 | **Inventario (Inventory)** | ¿Cuánto stock tengo? | Tienda, categoría, estado de stock |
| 4 | **Kardex** | ¿Cómo se movió este producto? | Producto, fecha, tipo de movimiento |
| 5 | **Compras (Purchases)** | ¿Qué compré a proveedores? | Fecha, proveedor, tienda |
| 6 | **Auditoría (Audit)** | ¿Qué hicieron los usuarios? | Usuario, acción, fecha |
| 7 | **Ficha de Costo (Cost Sheet)** | ¿Cómo se calcula este costo? | Ficha específica |
| 8 | **Ingresos Diarios (Daily Income)** | ¿Cuánto entró por día? | Fecha, tienda |
| 9 | **Gastos Diarios (Daily Expenses)** | ¿Cuánto gasté por día? | Fecha, tienda, categoría |
| 10 | **Transferencias (Transfer)** | ¿Qué moví entre tiendas? | Fecha, tienda origen, tienda destino |
| 11 | **Arqueo de Caja (Cash)** | ¿Cuadró la caja? | Turno, cajero, fecha |

## Detalle de cada reporte

### 1. Reporte de Ventas (Sales)
- **Qué muestra**: Lista de todas las ventas del período, con folio, fecha, cajero, productos, total y método de pago.
- **Útil para**: Ver qué vendió, cuándo y a quién. Controlar actividad del día.
- **Disponible para**: admin, manager, encargado. clerk solo ve sus propias ventas.

### 2. Reporte de Ganancias (Profit)
- **Qué muestra**: Para cada venta, muestra el precio de venta, el costo y la ganancia. Totaliza por producto, categoría y período.
- **Útil para**: Saber si el negocio es rentable. Identificar productos que dan más margen.
- **Disponible para**: admin, manager, encargado.
- **Nota**: Requiere que los productos tengan el "precio de costo" cargado. Si no, el reporte sale en ceros.

### 3. Reporte de Inventario (Inventory)
- **Qué muestra**: Stock actual de todos los productos, con valor a precio de costo y a precio de venta.
- **Útil para**: Saber cuánto dinero tiene "parado" en inventario. Detectar productos sin rotación.
- **Disponible para**: admin, manager, encargado, almacen.

### 4. Reporte Kardex
- **Qué muestra**: Historial completo de movimientos de un producto: recepciones, ventas, ajustes, transferencias.
- **Útil para**: Investigar por qué el stock no cuadra. Ver cuándo entró y salió cada unidad.
- **Disponible para**: admin, manager, encargado, almacen.
- **Nota**: Se filtra por UN producto específico. No es un reporte de todos los productos a la vez.

### 5. Reporte de Compras (Purchases)
- **Qué muestra**: Lista de recepciones de mercancía del período, con proveedor, monto y productos.
- **Útil para**: Controlar cuánto compró y a quién. Comparar precios entre proveedores.
- **Disponible para**: admin, manager, encargado, almacen.

### 6. Reporte de Auditoría (Audit)
- **Qué muestra**: Todas las acciones importantes hechas por los usuarios: anulaciones, ajustes, cambios de precios, etc.
- **Útil para**: Investigar irregularidades. Detectar fraudes. Revisar qué hizo un usuario específico.
- **Disponible para**: admin, manager, encargado (solo de su tienda).

### 7. Reporte de Ficha de Costo (Cost Sheet)
- **Qué muestra**: Una ficha de costo específica con todo su desglose: materiales, mano de obra, gastos indirectos, margen, precio final.
- **Útil para**: Imprimir el detalle de cómo se calcula un costo. Presentar al cliente o al jefe.
- **Disponible para**: admin, manager, encargado.

### 8. Reporte de Ingresos Diarios (Daily Income)
- **Qué muestra**: Por cada día del período, cuánto entró en efectivo, cuánto en tarjeta, cuánto en transferencia. Total del día.
- **Útil para**: Ver la tendencia diaria. Detectar días atípicos (muy bajos o muy altos).
- **Disponible para**: admin, manager, encargado.

### 9. Reporte de Gastos Diarios (Daily Expenses)
- **Qué muestra**: Por cada día del período, cuánto se gastó en servicios, compras, gastos operativos. Total del día.
- **Útil para**: Controlar gastos. Detectar días con gastos anómalos.
- **Disponible para**: admin, manager, encargado.

### 10. Reporte de Transferencias (Transfer)
- **Qué muestra**: Todas las transferencias entre tiendas del período, con productos, cantidades, estado (pendiente, en tránsito, completada).
- **Útil para**: Ver qué se movió entre tiendas. Detectar transferencias incompletas.
- **Disponible para**: admin, manager, encargado.

### 11. Reporte de Arqueo de Caja (Cash)
- **Qué muestra**: Detalle de cada turno de caja: apertura, ventas, cierre, diferencias.
- **Útil para**: Ver si los cajeros están cuadrando. Detectar cajeros con diferencias frecuentes.
- **Disponible para**: admin, manager, encargado. clerk solo ve sus propios arqueos.

## Cómo elegir el reporte correcto

### "Quiero saber cuánto vendí hoy"
→ Reporte de Ventas, período = Hoy.

### "Quiero saber si gané dinero este mes"
→ Reporte de Ganancias, período = Este mes.

### "Quiero saber cuánto vale mi inventario"
→ Reporte de Inventario, sin filtro de fecha (es el stock actual).

### "Un producto no cuadra, quiero ver su historial"
→ Reporte Kardex, filtre por ese producto.

### "Quiero saber qué compré a proveedores este mes"
→ Reporte de Compras, período = Este mes.

### "Algo raro pasó ayer, quiero ver todas las acciones"
→ Reporte de Auditoría, período = Ayer.

### "Quiero ver si los cajeros cuadraron bien"
→ Reporte de Arqueo de Caja, período = Hoy o Esta semana.

### "Quiero ver la tendencia de ingresos del mes"
→ Reporte de Ingresos Diarios, período = Este mes.

### "Quiero ver cuánto gasté este mes"
→ Reporte de Gastos Diarios, período = Este mes.

### "Moví mercancía entre tiendas y quiero verlo"
→ Reporte de Transferencias, período = El que quiera revisar.

### "Quiero imprimir el detalle de un costo"
→ Reporte de Ficha de Costo, elija la ficha específica.

## Preguntas frecuentes

**¿Cualquier usuario puede generar cualquier reporte?**
- No. Depende del rol. Ver la columna "Disponible para" en cada reporte.

**¿Los reportes se pueden exportar?**
- Sí, todos a PDF y Excel.

**¿Los reportes se pueden programar para que se generen solos?**
- Sí. En Configuración → Tareas programadas, puede configurar que un reporte se genere y envíe por correo cada semana o cada mes.

**¿Por qué mi reporte sale en blanco?**
- Lo más común: no hubo operaciones del tipo solicitado en el período elegido.
- Cambie el período o los filtros.

**¿Los reportes incluyen información de todas las tiendas?**
- Si es admin o manager: sí, puede elegir "Todas las tiendas" o una específica.
- Si es encargado: solo de su tienda.

**¿Cuánto tarda en generarse un reporte?**
- Depende del volumen de datos. Normalmente 3-10 segundos.
- Reportes de un mes con miles de ventas pueden tardar hasta 30 segundos.
- Si tarda más de 1 minuto, cancele y reintente con un período más corto.
