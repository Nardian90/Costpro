# Cómo Hacer: Crear una Orden de Producción, Servicio o Trabajo

> **Necesita esto cuando**: Va a comenzar un trabajo para un cliente (reparación, instalación, obra, producción a medida) y necesita registrar el presupuesto, los materiales que se usarán, el anticipo que pagó el cliente y hacer seguimiento hasta el cierre.

## ¿Qué resuelve este módulo?

Antes, los trabajos "a medida" se anotaban en una libreta o en un Excel aparte. El dueño no tenía visibilidad del presupuesto, no sabía qué materiales se comprometieron, y al final cobraba "lo acordado" sin saber si ganó o perdió. Con este módulo:

- **Cada trabajo tiene un número de orden** (ej: `OP-2026-001`) que identifica el expediente.
- **El presupuesto queda registrado** con moneda y materiales estimados.
- **El anticipo se registra como pago** y descuenta del saldo pendiente.
- **Los materiales se van dando salida** del inventario a medida que se usan.
- **Al cerrar la orden**, se registra el pago final y (si es producción) entra el producto terminado al almacén.

---

## Los 3 tipos de orden

| Tipo | Ícono | Cuándo usarlo | ¿Genera producto? | ¿Descuenta inventario? |
|------|-------|---------------|-------------------|------------------------|
| **Servicio** | 🔧 | Trabajo intangible: limpieza, consultoría, reparación sin dejar material | No | No |
| **Trabajo** | 📦 | Trabajo físico sin producto terminado: instalación, montaje, albañilería | No | Sí (los materiales salen del almacén) |
| **Producción** | 🏭 | Fabricación de un producto: panadería, costura, carpintería, manufactura | Sí (entra al inventario) | Sí (los materiales salen y el producto entra) |

> **Diferencia clave**: En **Producción**, los materiales se transforman en un nuevo producto que vuelve al almacén. En **Trabajo**, los materiales se consumen pero no generan un producto re-vendible. En **Servicio**, ni siquiera se toca el inventario (se cobra solo la mano de obra).

---

## Paso 1 — Abrir el módulo

1. En el menú izquierdo, vaya a **Operaciones**.
2. Haga clic en **Órdenes de Producción y Trabajo**.
3. Verá la lista de órdenes existentes con su estado actual (Borrador, Aprobada, En Progreso, etc.).
4. Haga clic en el botón **"+ Nueva Orden"** (arriba a la derecha).

---

## Paso 2 — Elegir el tipo de orden

Al abrir el formulario de creación, verá 3 botones grandes:

- 🔧 **Servicio** — para trabajos intangibles
- 📦 **Trabajo** — para trabajos físicos sin producto terminado
- 🏭 **Producción** — para fabricar productos

Seleccione el tipo que corresponde. Esta elección **no se puede cambiar después** de crear la orden (si se equivoca, anule la orden y cree una nueva).

---

## Paso 3 — Datos del cliente

Llene los campos del cliente (todos opcionales, pero muy recomendados):

| Campo | Para qué sirve | Ejemplo |
|-------|----------------|---------|
| **Nombre** | Identificar al cliente en la lista | "María García" |
| **CI** | Documento de identidad (para facturas) | "91021512345" |
| **Teléfono** | Contactar al cliente cuando esté listo | "+53 5555 1234" |
| **Dirección** | Saber dónde hacer el trabajo (si es a domicilio) | "Calle 23 #456, Habana" |

> **Recomendación**: Aunque todos los campos son opcionales, **siempre registre al menos nombre y teléfono**. Sin estos datos no podrá contactar al cliente cuando el trabajo esté listo.

---

## Paso 4 — Definir el presupuesto

El presupuesto es **obligatorio** (no se puede crear la orden sin un monto mayor que cero).

1. En el campo **Presupuesto**, escriba el monto total acordado con el cliente.
2. En **Moneda**, elija:
   - **CUP** — pesos cubanos
   - **USD** — dólares estadounidenses
   - **EUR** — euros
   - **MLC** — moneda libremente convertible
3. Si la moneda no es CUP, el sistema usará la tasa de cambio configurada en Tasa Inteligente para mostrar equivalentes.

> **Importante**: El presupuesto es una **estimación**. Al cerrar la orden, podrá registrar el monto final real (que puede ser diferente si hubo cambios durante el trabajo).

---

## Paso 5 — Registrar el anticipo (opcional pero recomendado)

Si el cliente pagó un adelanto al momento de encargar el trabajo, regístrelo aquí:

1. En la sección **Anticipo (opcional)**, escriba el monto recibido.
2. En **Método**, elija cómo se recibió:
   - 💵 **Efectivo**
   - 📱 **Transfer**
   - 💳 **Zelle**
3. En **Moneda**, elija la divisa del anticipo (puede ser diferente a la moneda del presupuesto).

> **Por qué es importante el anticipo**: Cubre los materiales iniciales y demuestra el compromiso del cliente. Si el trabajo se cancela, el anticipo suele ser no reembolsable (aclárelo al cliente).

El sistema registrará automáticamente:
- El pago en `payment_transactions` con referencia `production_order`
- El estado de pago de la orden pasará a **Parcial** (si hay anticipo) o **Pendiente** (si no hay anticipo)

---

## Paso 6 — Agregar materiales presupuestados (recomendado)

Si el trabajo requiere materiales del inventario, agréquelos aquí para que el sistema sepa qué se va a comprometer:

1. En el campo **Buscar producto...**, escriba el nombre del material.
2. Aparecerá una lista con los productos que coinciden.
3. Haga clic en el producto para agregarlo.
4. Ajuste la **cantidad** estimada que se usará.
5. El sistema mostrará el costo unitario del producto.
6. Repita para cada material necesario.

> **Nota**: Estos materiales **no se descuentan del inventario** al crear la orden. Solo se descuentan cuando se ejecuta el trabajo (estado `in_progress`) y se da salida manualmente a cada material. Esto evita que el stock baje por trabajos que aún no empezaron.

---

## Paso 7 — Descripción (opcional pero útil)

En el campo de descripción, escriba los detalles del trabajo:
- Qué hay que hacer exactamente
- Plazos acordados
- Especificaciones técnicas
- Cualquier condición especial

Ejemplo: *"Instalar 3 aires acondicionados split de 12000 BTU en el apartamento del cliente. Incluye materiales de instalación (tuberías, cables, soportes) pero NO los equipos (los proporciona el cliente). Trabajo garantizado por 6 meses."*

---

## Paso 8 — Crear la orden

1. Revise todos los campos.
2. Haga clic en **"Crear Orden"**.
3. Aparece un mensaje de confirmación: *"Orden creada"*.
4. La orden aparece en la lista con estado **Borrador** y un número asignado (ej: `OP-2026-001`).

---

## Paso 9 — Cambiar el estado de la orden

Una vez creada, la orden pasa por varios estados. Use los botones de la columna **Acciones**:

| Estado actual | Botón disponible | Acción |
|---------------|------------------|--------|
| Borrador | ✓ Aprobar | Confirma el presupuesto y permite iniciar |
| Aprobada | ▶ Iniciar | Cambia a "En Progreso", ya puede dar salida a materiales |
| En Progreso | ⏸ Pausar | Pone el trabajo en espera (ej: esperando material) |
| Pausada | ▶ Reanudar | Vuelve a "En Progreso" |
| Cualquiera (menos Cerrada/Anulada) | ✕ Cerrar Orden | Finaliza el trabajo (ver Paso 10) |

> **Recomendación**: No apruebe la orden hasta que el cliente haya confirmado el presupuesto. Una vez aprobada, los números no se pueden cambiar fácilmente.

---

## Paso 10 — Dar salida a materiales durante el trabajo

Cuando la orden está **En Progreso** y va a usar materiales:

1. Haga clic en el botón **👁 Ver detalle** (ícono de ojo) de la orden.
2. Vaya al tab **Materiales**.
3. Para cada material, haga clic en **"Dar Salida"**.
4. Escriba la cantidad que está consumiendo.
5. El sistema descuenta esa cantidad del inventario.
6. Repita cada vez que tome materiales del almacén.

El sistema mostrará:
- **Presupuestado**: cantidad estimada originalmente
- **Real**: cantidad efectivamente usada
- **Desviación**: diferencia (positiva si usó más, negativa si usó menos)

> **Auditoría**: Cada salida de material queda registrada en el historial con fecha, usuario y cantidad. No se puede deshacer sin autorización del administrador.

---

## Paso 11 — Cerrar la orden (con pago final)

Cuando el trabajo está terminado:

1. Abra el detalle de la orden.
2. En el tab **Info**, haga clic en **"Cerrar Orden"**.
3. Se abre un formulario de pago final:
   - **Monto**: escriba cuánto pagó el cliente al final (por defecto, el saldo pendiente).
   - **Método**: efectivo / transferencia / Zelle.
   - **Moneda**: CUP / USD / EUR / MLC.
4. **Si es orden de Producción**: aparece un campo adicional para el **producto terminado**:
   - Busque el producto que entra al almacén.
   - Escriba la cantidad producida.
   - El sistema registrará la entrada al inventario.
5. Haga clic en **"Confirmar Cierre"**.

El sistema hará lo siguiente automáticamente:
- Registrará el pago final en `payment_transactions`.
- Marcará el pago de la orden como **Pagado**.
- Cambiará el estado a **Cerrada**.
- Si es producción: ejecutará `receive_production_output` para que el producto entre al almacén.
- Si es servicio: creará una venta en `transactions` para que aparezca en los reportes de ventas.

---

## Preguntas frecuentes

**¿Puedo editar el presupuesto después de crear la orden?**
- Sí, mientras esté en estado **Borrador**. Una vez aprobada, el presupuesto queda congelado. Si necesita cambiarlo, anule la orden y cree una nueva.

**¿Qué pasa si el cliente paga el saldo en cuotas?**
- Cada cuota se puede registrar como un pago adicional. Use el endpoint PATCH `/api/production-orders/[id]` con `action: 'close'` y `final_amount` parcial, pero NO confirme el cierre hasta que se pague la última cuota. Mientras tanto, el estado de pago será **Parcial**.

**¿Puedo anular una orden en progreso?**
- Sí, pero los materiales que ya se dieron de salida **NO vuelven al inventario automáticamente**. Tiene que hacer un ajuste de inventario manual (con causa "Devolución de producción anulada") para reingresarlos.

**¿El cierre de una orden de servicio aparece en el reporte de ventas?**
- Sí. El sistema crea automáticamente una transacción en `transactions` con el monto final, método de pago y referencia a la orden. Aparece en el reporte de ventas del día del cierre.

**¿Puedo tener varias órdenes abiertas para el mismo cliente?**
- Sí, no hay límite. Cada orden es independiente con su propio número y estado.

**¿El producto terminado de una orden de producción tiene el costo calculado?**
- El costo del producto terminado se calcula sumando los costos de los materiales usados + (opcionalmente) la mano de obra. El sistema usa el RPC `receive_production_output` que aplica esta lógica.

**¿Qué método de pago debo aceptar para el anticipo?**
- Cualquiera de los 3 (efectivo, transferencia, Zelle). Lo importante es que el monto y la moneda coincidan con lo que realmente recibió. Vea `03-referencia/06-metodos-pago.md` para más detalle.

**¿Puedo cerrar la orden sin pago final?**
- Sí, dejando el monto final en 0. La orden quedará con estado **Cerrada** pero pago **Pendiente** o **Parcial**. Útil cuando el cliente pagó todo por adelantado y no hay saldo final.

**¿Dónde veo el historial de pagos de una orden?**
- En el detalle de la orden, tab **Pagos**. Aparece cada transacción con fecha, monto, método y moneda.

---

## Casos especiales y errores comunes

### "No puedo aprobar la orden porque falta el presupuesto"

El presupuesto es obligatorio. Vuelva al formulario, complete el campo "Presupuesto" con un monto mayor que 0 y vuelva a intentarlo.

### "El material que quiero agregar no aparece en la búsqueda"

El sistema busca por nombre en el catálogo de la tienda activa. Verifique que:
- El producto existe en la tienda activa (no en otra tienda).
- El producto está activo (no dado de baja).
- El nombre está bien escrito (puede buscar por parte del nombre).

### "Al cerrar la orden de producción me pide producto terminado"

Es obligatorio para órdenes de tipo **Producción**. Si su trabajo no genera un producto re-vendible, debería haberlo creado como **Trabajo** o **Servicio** en su lugar.

### "El saldo no cuadra con lo que pagó el cliente"

Revise el tab **Pagos** del detalle. Cada pago aparece con su monto y moneda. Si pagó en USD pero la orden está en CUP, verifique que la tasa de cambio esté correcta en la configuración de Tasa Inteligente.

### "Aprobé la orden por error"

Si la orden está aprobada pero aún no ha empezado, puede anularla (cambiar estado a `voided`) y crear una nueva. Si ya está en progreso, debe cerrarla con pago 0 (si no hubo consumo) o registrar los materiales usados.
