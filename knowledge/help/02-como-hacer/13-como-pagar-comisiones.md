# Cómo Hacer: Gestionar y Pagar Comisiones

> **Necesita esto cuando**: paga a sus trabajadores por las ventas que realizan y necesita que el cálculo sea automático, trazable y cuadre con la caja y con Cuentas por Pagar.

## ¿Para qué sirve?

El módulo **Trabajadores y Comisiones** define **reglas de comisión** por trabajador, calcula lo devengado a partir de las ventas reales de la tienda y registra los **pagos de comisión** como documentos formales. Cada venta queda asociada al usuario que la cobró; las ventas anuladas o revertidas no computan (la base considera devoluciones).

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Trabajadores y Comisiones** (entrada de primer nivel, debajo del hub Costo).
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «comisiones» o «trabajadores».

## Antes de comenzar

- Necesita rol admin, manager o encargado en la tienda.
- Los trabajadores deben estar dados de alta en el módulo (pestaña **Trabajadores**).
- Las ventas deben estar registradas: la comisión se calcula sobre ventas reales de la tienda, no manualmente.

## Las 4 pestañas del módulo

| Pestaña | Para qué sirve |
|---------|---------------|
| **Trabajadores** | Ficha de cada trabajador, su último pago y el botón **Pagar comisión**. |
| **Reglas Comisión** | Crear y editar las reglas de cálculo por trabajador. |
| **Pagos** | Listado de pagos de comisión registrados. |
| **Historial** | Versiones de las reglas: qué regla estaba vigente en cada momento. |

## Cómo definir una regla de comisión

1. Abra la pestaña **Reglas Comisión** y cree una regla para el trabajador.
2. Elija el **tipo de regla**:
   - **Porcentaje de ventas**: un % sobre lo vendido.
   - **Monto fijo**: importe fijo por período.
   - **Basada en salario**: relacionada con el sueldo.
   - **Híbrida**: combinación de las anteriores.
   - **Por producto específico**: monto por producto vendido (con modo por venta o por unidad).
   - **Porcentaje escalonado**: el % cambia según el rango de precio.
3. Defina la **base de cálculo**: sobre el total de ventas, solo efectivo, solo transferencia o sobre ventas netas (descontando devoluciones).
4. Establezca **prioridad y vigencia** si el trabajador tiene varias reglas.

## Cómo pagar una comisión

1. En la pestaña **Trabajadores**, pulse **Pagar comisión** del trabajador.
2. En el asistente de pago:
   - El sistema **calcula automáticamente** lo devengado según las reglas vigentes, o puede **cargar los productos** vendidos y ajustar la comisión **línea a línea**.
   - Elija el período (fechas desde/hasta) y revise el detalle.
3. Confirme el pago. Se crea un **documento de pago de comisión** trazable: queda en la pestaña **Pagos**, entra en **Cuentas por Pagar** y, si se paga en efectivo, **descuenta del arqueo** del turno.
4. Desde el **Reporte Entrega** (OPERACIÓN → Ventas → Reporte Entrega) puede gestionar el pago de comisiones del día con **Confirmar y pagar**: al confirmar, el reporte se recalcula.

## Restricciones importantes

- Las comisiones se calculan sobre **ventas reales de la tienda**; las anuladas y revertidas no computan.
- Cada regla tiene **historial de versiones**: cambiar una regla no altera los pagos ya hechos.
- Un pago de comisión no se borra; queda como documento y en auditoría.
- La comisión es **por tienda**: cada tienda calcula y paga las suyas.
- Pagar en efectivo afecta el efectivo esperado del arqueo del turno correspondiente.

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| El cálculo automático da 0 | El trabajador no tiene regla vigente o no hubo ventas en el período. | Revise **Reglas Comisión** y las fechas del período. |
| No veo el botón Pagar comisión | Su rol no es de gestión o el trabajador no está activo. | Verifique su rol y la ficha del trabajador. |
| La comisión pagada no coincide con el reporte del día | Pagó después de generar el Reporte Entrega. | El reporte se recalcula al confirmar el pago; regenérelo. |
| Un pago quedó con un monto equivocado | Ajuste manual línea a línea mal aplicado. | Verifique el documento en la pestaña Pagos; consulte al administrador si requiere corrección. |

## Preguntas frecuentes

**¿Puedo pagar comisiones en transferencia?**
Sí. El pago de comisión admite los métodos de pago habituales; solo el efectivo reduce el efectivo esperado del arqueo.

**¿Las comisiones aparecen como deuda?**
Sí: los pagos de comisión pendientes entran en **Cuentas por Pagar** junto a recepciones y servicios.

**¿Puedo excluir una venta del cálculo?**
No existe una casilla de exclusión por venta. La base de cálculo se define en la regla (total, efectivo, transferencia o neto); las ventas anuladas quedan fuera automáticamente.

**¿Dónde veo qué regla se aplicó a un pago?**
En la pestaña **Historial**, que conserva las versiones de las reglas con su vigencia.

## Información relacionada

- **Cómo consultar Cuentas por Cobrar y Pagar** — dónde aparecen las comisiones por pagar.
- **Cómo cerrar la caja (arqueo)** — el efecto de las comisiones pagadas en efectivo.
- **Reporte Entrega** — gestión diaria de comisiones junto a la entrega de efectivo.
