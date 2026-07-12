# Referencia: Estados de Órdenes de Producción y de Pago

> **Use esta tabla** cuando necesite recordar qué significa cada estado de una orden de producción o cada estado de pago, y qué transiciones son válidas.

## Estados de una orden de producción

Una orden de producción (o de servicio/trabajo) pasa por 7 estados posibles. Cada estado determina qué acciones se pueden realizar.

### Tabla de estados

| Estado | Ícono | Color | Significado |
|--------|-------|-------|-------------|
| `draft` | 🕐 | Gris | **Borrador** — Orden creada pero no confirmada. Se puede editar todo. |
| `approved` | ✓ | Azul primario | **Aprobada** — El presupuesto fue confirmado. Lista para iniciar. |
| `in_progress` | ▶ | Azul claro | **En Progreso** — El trabajo está activo. Se pueden dar salidas de materiales. |
| `paused` | ⏸ | Ámbar | **Pausada** — El trabajo se detuvo temporalmente (ej: esperando material). |
| `completed` | ✓ | Verde | **Completada** — El trabajo terminó pero aún no se ha cerrado formalmente. |
| `closed` | ✓ | Gris | **Cerrada** — Finalizada formalmente. Pago registrado. No se puede editar. |
| `voided` | ✕ | Rojo | **Anulada** — Cancelada. No se puede reactivar. |

### Transiciones válidas

```
draft → approved → in_progress ⇄ paused → completed → closed
   ↓        ↓          ↓             ↓          ↓
 voided  voided     voided       voided     voided
```

- **Desde draft**: puede ir a `approved` o `voided`.
- **Desde approved**: puede ir a `in_progress` o `voided`.
- **Desde in_progress**: puede ir a `paused` (y viceversa), a `completed`, o a `voided`.
- **Desde paused**: puede volver a `in_progress` o ir a `voided`.
- **Desde completed**: solo puede ir a `closed`.
- **Desde closed o voided**: NO se puede cambiar (son estados terminales).

> **Importante**: Una vez cerrada o anulada, la orden queda congelada para auditoría. No se puede modificar ni reabrir. Si necesita corregir algo, debe crear una nueva orden que referencie la anterior en la descripción.

### Acciones disponibles por estado

| Estado | Editar datos | Dar salida a materiales | Registrar pagos | Cerrar | Anular |
|--------|--------------|------------------------|------------------|--------|--------|
| `draft` | ✓ | ✗ | Solo anticipo | ✗ | ✓ |
| `approved` | Solo descripción | ✗ | ✓ | ✗ | ✓ |
| `in_progress` | Solo descripción | ✓ | ✓ | ✓ | ✓ |
| `paused` | Solo descripción | ✗ | ✓ | ✓ | ✓ |
| `completed` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `closed` | ✗ | ✗ | ✗ | ✗ | ✗ |
| `voided` | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Estados de pago de una orden

Independientemente del estado del trabajo, el pago de la orden tiene su propio estado que refleja cuánto se ha cobrado:

### Tabla de estados de pago

| Estado | Ícono | Color | Significado |
|--------|-------|-------|-------------|
| `unpaid` | ⏳ | Rojo | **Pendiente** — No se ha registrado ningún pago. |
| `partial` | ⚖️ | Ámbar | **Parcial** — Se ha recibido un anticipo o pago parcial, pero falta saldo. |
| `paid` | 💰 | Verde | **Pagado** — El saldo está completamente cubierto. |

### Cálculo del estado

El sistema calcula automáticamente el estado de pago comparando:

- **Presupuesto total** (en CUP, convertido desde la moneda de la orden)
- **Monto pagado** (suma de todos los pagos registrados, convertidos a CUP)

| Condición | Estado resultante |
|-----------|-------------------|
| `paid_amount == 0` | `unpaid` |
| `0 < paid_amount < budget_total` | `partial` |
| `paid_amount >= budget_total` | `paid` |

> **Nota**: Al cerrar la orden, el estado de pago se fuerza a `paid` automáticamente, incluso si el monto final fue 0 (caso en que el cliente no pagó nada, se registra como pago pendiente pero la orden se cierra por motivos operativos).

---

## Tipos de orden y su comportamiento al cierre

| Tipo | Al cerrar | ¿Genera venta? | ¿Recibe producto? |
|------|-----------|----------------|-------------------|
| **Servicio** | Crea venta en `transactions` | Sí (aparece en reporte de ventas) | No |
| **Trabajo** | Solo cierra la orden | No | No |
| **Producción** | Ejecuta `receive_production_output` | No (el producto entra al inventario) | Sí (producto terminado al almacén) |

### Detalle por tipo

#### 🔧 Servicio

Al cerrar, el sistema ejecuta el RPC `close_service_order_as_sale` que:
1. Crea una fila en `transactions` con el monto final, método de pago y referencia a la orden.
2. Crea los `transaction_items` correspondientes (un item "Servicio" con el monto).
3. Marca la orden como cerrada y pagada.
4. La venta aparece en el reporte de ventas del día del cierre.

> **Por qué importa**: El cierre de un servicio **no** se puede deshacer. Si se equivocó, debe anular la venta resultante (lo que también deja rastro en auditoría).

#### 📦 Trabajo

Al cerrar, el sistema solo:
1. Registra el pago final (si lo hay) en `payment_transactions`.
2. Cambia el estado a `closed` y `paid`.
3. **No** crea una venta en `transactions` (los materiales ya salieron del inventario durante la ejecución).

> **Cuándo usar Trabajo vs Servicio**: Use **Trabajo** cuando el costo principal son los materiales (ej: instalación donde el cliente ya pagó los equipos). Use **Servicio** cuando el costo principal es la mano de obra (ej: consultoría, reparación).

#### 🏭 Producción

Al cerrar, el sistema ejecuta el RPC `receive_production_output` que:
1. Recibe el **producto terminado** en el inventario (suma stock al producto seleccionado).
2. Calcula el costo del producto terminado (materiales usados + opcional mano de obra).
3. Registra el pago final.
4. Cambia el estado a `closed`.

> **Requisito obligatorio**: Para cerrar una orden de producción, **DEBE** especificar:
> - `output_product_id`: el producto que entra al almacén
> - `output_quantity`: la cantidad producida
>
> Sin estos datos, el sistema rechazará el cierre con error: *"Las órdenes de producción requieren un producto terminado y cantidad"*.

---

## Tipos de pago registrables

Tanto para el anticipo (al crear la orden) como para el pago final (al cerrar), los métodos disponibles son los mismos del POS:

| Método | Campo en BD | Origen típico |
|--------|-------------|---------------|
| **Efectivo** | `cash` | Billetes físicos en CUP, USD, EUR o MLC |
| **Transferencia** | `transfer` | Transferencia bancaria nacional |
| **Zelle** | `zelle` | Envío desde el extranjero vía Zelle |

Cada pago se registra en la tabla `payment_transactions` con:
- `ref_type`: `'production_order'`
- `ref_id`: ID de la orden
- `amount`: monto en la moneda original
- `amount_cup`: monto convertido a CUP (para consolidación)
- `currency`: moneda original
- `payment_method`: `cash` / `transfer` / `zelle`
- `payment_date`: cuándo se recibió
- `paid_by`: ID del usuario que registró el pago

> **Auditoría**: Todos los pagos quedan registrados y son inmutables. Si necesita corregir un pago mal registrado, debe anular la orden completa (lo que también anula los pagos asociados) y volver a crearla.

---

## Convención de números de orden

Cada orden recibe un número legible generado automáticamente con el formato:

```
OP-YYYY-NNN
```

- **OP**: prefijo fijo (Orden de Producción)
- **YYYY**: año actual (4 dígitos)
- **NNN**: correlativo dentro del año (3 dígitos, empieza en 001)

Ejemplos:
- `OP-2026-001` — primera orden del año 2026
- `OP-2026-042` — orden número 42 del año 2026

> **Multi-tienda**: El correlativo es **por tienda**, no global. Cada tienda tiene su propia secuencia empezando en 001 cada año. Esto significa que puede haber `OP-2026-001` en la Tienda A y otro `OP-2026-001` en la Tienda B; son órdenes distintas con el mismo número pero diferente `store_id`.

---

## Preguntas frecuentes

**¿Puedo cambiar el estado de una orden manualmente con SQL?**
- Técnicamente sí, pero **no recomendado**. El cambio de estado dispara lógica de negocio (pagos, inventario, ventas). Si omite esa lógica, tendrá inconsistencias. Use siempre la API o la interfaz.

**¿Qué pasa si anulo una orden con materiales ya dados de salida?**
- Los materiales **NO vuelven automáticamente** al inventario. Debe hacer un ajuste manual de inventario con causa "Devolución de producción anulada" para reingresarlos.

**¿Puedo tener una orden con pago `paid` pero estado `draft`?**
- Sí, técnicamente es posible (si registró un anticipo al crearla). El estado de pago y el estado del trabajo son independientes. Una orden puede estar pagada pero aún no haber empezado el trabajo.

**¿El cierre de una orden se puede programar?**
- No automáticamente. El cierre es manual y requiere confirmación del usuario. Si necesita cerrar muchas órdenes a la vez, use la API con un script batch.

**¿Dónde veo el historial completo de cambios de estado?**
- En el detalle de la orden, tab **Auditoría** (si está implementado) o consultando la tabla `audit_logs` filtrada por `record_id = <order_id>`.

**¿El monto pagado se puede editar?**
- No directamente. Cada pago es una transacción inmutable. Si se equivocó en el monto, debe anular el pago (si la orden no está cerrada) o crear un pago negativo de compensación.

**¿Puedo aplicar descuentos al presupuesto de la orden?**
- No directamente en el formulario de creación. El presupuesto es el monto total acordado. Si quiere aplicar un descuento, regístrelo en el monto final al cerrar (que puede ser menor al presupuesto).

**¿Las órdenes caducan?**
- No automáticamente. Una orden puede quedar en `draft` o `paused` indefinidamente. Es responsabilidad del administrador anular las órdenes obsoletas periódicamente.

---

## Errores comunes y soluciones

### "Las órdenes de producción requieren un producto terminado y cantidad"

Está intentando cerrar una orden de tipo `production` sin especificar `output_product_id` y `output_quantity`. Solución: en el formulario de cierre, busque el producto terminado y escriba la cantidad producida.

### "Error al registrar pago: ..."

El RPC `register_supplier_payment` falló. Causas comunes:
- La moneda no es válida (debe ser CUP, USD, EUR o MLC).
- La tasa de cambio es 0 o negativa.
- El monto es negativo.
- El usuario no tiene permisos para registrar pagos en esa tienda.

### "Error al crear venta: ..."

El RPC `close_service_order_as_sale` falló al cerrar una orden de servicio. Causas comunes:
- El cliente no existe (si se especificó un `customer_id`).
- La tienda está inactiva.
- El método de pago no es válido.

### "Error al recibir producto: ..."

El RPC `receive_production_output` falló al cerrar una orden de producción. Causas comunes:
- El producto no pertenece a la tienda activa.
- El producto está dado de baja.
- La cantidad es 0 o negativa.

### "Orden no encontrada"

El ID de la orden no existe o pertenece a otra tienda. Verifique que está en la tienda correcta (use el selector de tienda en la barra superior).
