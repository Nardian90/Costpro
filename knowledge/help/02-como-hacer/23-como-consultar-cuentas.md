# Cómo Hacer: Consultar Cuentas por Pagar y por Cobrar

> **Necesita esto cuando**: Quiere saber qué debe pagar a proveedores o qué le deben sus clientes, organizado por antigüedad de saldo.

## Qué es

Dos vistas complementarias de **antigüedad de saldos**:

- **Cuentas por Pagar (CxP)**: deudas de la empresa — recepciones, servicios recibidos y comisiones pendientes.
- **Cobros por Antigüedad (CxC)**: saldos pendientes de clientes — órdenes de producción/servicio con saldo.

## Dónde están

```
Cuentas por Pagar   → Operación → Ventas → Opciones → Cuentas por Pagar
Cobros por Antigüedad → Operación → Ventas → Opciones → Cobros por Antigüedad
```

## Para qué sirven

- Saber **vencimientos próximos** y priorizar pagos/cobros de la semana.
- Pagar a proveedores y registrar el pago.
- Identificar clientes con saldo pendiente para gestionar el cobro.

## Cómo usarlas

### Cuentas por Pagar

1. Abra **Cuentas por Pagar**.
2. Revise las categorías de vencimiento: **Corriente**, **Por Vencer**, **Próx 7d** y **Pagado**.
3. Use la columna **Proveedor / Acreedor** y el **Estado** para ubicar el documento.
4. Registre el pago con la **Acción** correspondiente (efectivo, mixto...).
5. Exporte a **Excel** si necesita trabajar el listado fuera del sistema.

### Cobros por Antigüedad

1. Abra **Cobros por Antigüedad**.
2. Revise los cobros activos: cliente, descripción, presupuesto y **Saldo**.
3. Filtre por vencimiento (por ejemplo, **Por vencer 0-30d**).
4. Gestione el cobro con el cliente; al pagar la orden, el saldo se actualiza.

## Qué significa cada dato

| Dato | Significado |
|------|-------------|
| **Corriente** | Documentos dentro del plazo de pago |
| **Por Vencer / Próx 7d** | Vencimientos inminentes que requieren acción |
| **Saldo** | Monto pendiente de la orden |
| **Total Saldo por Cobrar** | Suma de todos los saldos pendientes del filtro |

## Precauciones

- Pagar un documento no lo elimina: queda registrado con su estado **Pagado** para auditoría.
- El total por cobrar es un compromiso del cliente, no dinero en caja: no lo cuente como disponible.

## Preguntas frecuentes

**¿Puedo exportar el listado?**
- Sí. CxP exporta a Excel y CxC exporta a CSV.

**¿Qué entra en CxC?**
- Órdenes de producción y de servicio con saldo pendiente (presupuestos aprobados parcialmente pagados).
