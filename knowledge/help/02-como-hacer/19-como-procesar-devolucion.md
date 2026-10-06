# Cómo Hacer: Procesar una Devolución

> **Necesita esto cuando**: Un cliente devuelve un producto comprado y hay que registrar la devolución.

## Qué es

Las **Devoluciones** registran la reversa de una venta: el producto vuelve al inventario y el dinero sale de caja, con notas de crédito y trazabilidad por tienda.

## Dónde está

```
Operación → Ventas → Opciones → Devoluciones
```

También con `Ctrl + K` escribiendo "devoluciones".

![Vista de Devoluciones con el registro de devoluciones por tienda](/help/capturas/devoluciones.webp "Figura 1. Devoluciones — registro y trazabilidad de devoluciones")

## Cómo usarla

1. Abra **Devoluciones**.
2. Haga clic en **"Nueva Devolución"**.
3. **Busque el producto** devuelto (por nombre o código).
4. Indique la **cantidad** devuelta y seleccione o escriba el **Motivo**.
5. Agregue notas si el caso lo requiere.
6. Confirme. El sistema muestra el **Total** devuelto y genera el documento correspondiente.

## Qué significa cada dato

| Dato | Significado |
|------|-------------|
| **Motivo** | Causa de la devolución (producto defectuoso, error de venta, arrepentimiento...) |
| **Total** | Monto que se reversa de la venta original |
| **Nota de crédito** | Documento que respalda la reversa (numeración `NC-000NNN-AAAA`) |

## Reglas del sistema (importantes)

- **Toda devolución exige la venta original**: el sistema valida que el producto realmente se vendió en esa venta y que no se haya devuelto ya la misma cantidad (no se puede devolver dos veces lo mismo; el tope es acumulado por venta y producto).
- La devolución se registra como **nota de crédito** con método de reembolso (efectivo, transferencia, Zelle o crédito en tienda) y genera el **contra-asiento de caja** correspondiente: el dinero sale de la caja en el mismo método.
- La **cantidad** devuelta vuelve al inventario de la misma tienda de la venta original.
- No se puede registrar una devolución "huérfana" sin venta original: el sistema la rechaza.

> **Limitación conocida (2026-10)**: el botón **"Nueva Devolución"** de la vista aún no permite elegir la venta original, por lo que la creación directa desde el modal puede fallar con el rechazo del sistema. La vía operativa hoy es realizar la devolución con referencia a la venta original (el mismo mecanismo que usan las importaciones controladas y la reversión desde **Auditoría/Historial**). Consulte al administrador si el caso no le permite completar la devolución desde la vista.

## Qué ocurre automáticamente

- El producto **vuelve al inventario** de la tienda de la venta.
- La devolución queda **registrada y trazable** por tienda y fecha.

## Precauciones

- No se puede "borrar" una venta desde la caja: la forma correcta de reversar una venta es una devolución (o la anulación por parte del administrador desde la Auditoría).
- Verifique que la venta original pertenece a la tienda activa.

## Preguntas frecuentes

**¿Puedo duplicar una devolución como plantilla?**
- Sí. La vista permite duplicar devoluciones anteriores para agilizar los casos recurrentes.

**¿El cliente recibe el dinero en el mismo método de pago?**
- El reembolso sigue la política de su negocio. Registre en las notas cómo se resolvió (efectivo, transferencia...).
