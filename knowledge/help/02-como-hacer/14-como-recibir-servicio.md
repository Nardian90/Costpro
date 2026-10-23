# Cómo Hacer: Registrar y Pagar un Servicio Recibido

> **Necesita esto cuando**: la tienda contrata a un tercero un servicio ligado al abastecimiento de mercancía — transporte, flete, aduana, estiba, descarga, seguro, manipulación, gastos portuarios — y necesita dejar registrado cuánto costó, repartirlo al costo de la mercancía recibida y controlar su pago hasta saldarlo.

## ¿Para qué sirve?

**Servicios Recibidos** registra los costos de servicios de terceros que la tienda paga como parte de traer mercancía al almacén. Cada registro documenta quién lo prestó, cuánto costó, a qué operación se asocia y cuánto falta pagar.

Con un servicio registrado puedes:

- Llevar la **obligación de pago**: el saldo pendiente aparece en **Cuentas por Pagar** con su fecha de vencimiento.
- **Distribuir el costo** entre las recepciones de mercancía vinculadas, lo que sube el costo promedio (WAC) de los productos afectados.
- **Pagar total o parcialmente** y ver el historial de pagos del servicio.
- Ver el gasto reflejado en el reporte **Gastos/Costos por Día**.

### ¿En qué se diferencia de un gasto general?

Un **servicio recibido** es un costo del abastecimiento: nace junto a la mercancía (recepción → flete del viaje → distribución al costo del producto). Un **gasto general** es un costo de operación que no toca la mercancía: renta del local, electricidad, internet, limpieza.

| Aspecto | Servicio recibido (este módulo) | Gasto general |
|---------|-------------------------------|---------------|
| Ejemplos | Transporte, aduana, estiba, seguro de carga | Renta, luz, agua, limpieza del local |
| ¿Dónde se registra? | OPERACIÓN → Logística → Servicios Recibidos | OPERACIÓN → Caja → Ingresos/Egresos |
| ¿Reparte su costo a los productos? | Sí, opcionalmente (WAC) | No |
| ¿Aparece en Cuentas por Pagar? | Sí, con vencimiento | Depende de cómo se registre |

Si lo que pagas no se relaciona con traer mercancía, regístralo como ingreso/egreso de caja, no aquí.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Logística** → **Servicios Recibidos** (justo después de Recepciones).
- **Móvil**: pestaña inferior **Recibir** → **Servicios Recibidos**.
- **Búsqueda global**: pulsa `Ctrl/Cmd + K` y escribe «servicios», «gasto», «flete», «aduana», «transporte» o «pago a proveedores».
- **Ayuda contextual**: el botón **?** de la barra superior abre directamente esta ayuda cuando estás en la vista.

## Antes de comenzar

1. **Permisos**: para ver el módulo necesitas rol de tienda (admin, manager, encargado o warehouse). Para **crear, pagar o anular** necesitas rol de gestión en esa tienda (admin global, manager o encargado). Un cajero (clerk) no ve este módulo.
2. **Tipo de servicio**: el formulario te pide elegir un tipo del catálogo oficial. El catálogo inicial incluye: **Aduana, Transporte, Estiba, Descarga, Seguro, Manipulación, Gastos Portuarios, Comisión y Otros**. Solo un administrador global puede añadir o desactivar tipos con el botón **Gestionar tipos**.
3. **Proveedor**: ten a mano el nombre del proveedor del servicio; el formulario lo exige (campo marcado con *).
4. **Importe**: se registra siempre en **CUP**. No hay selector de moneda ni tasa de cambio en este módulo.

## Cómo registrar un servicio

1. Abra **OPERACIÓN → Logística → Servicios Recibidos**.
2. Haga clic en **+ Nuevo Servicio**.
3. Elija el **Tipo de servicio** tocando una de las fichas del catálogo (Transporte, Aduana, Estiba…). Si el tipo que necesita no existe, pida a un administrador que lo cree con **Gestionar tipos**.
4. Escriba el **Proveedor** (ej.: «TransCaribe S.A.»).
5. Escriba el **Importe total**. Debe ser mayor que 0.
6. Si el servicio tiene factura o documento, escríbalo en **Documento ref.**.
7. Revise la **Fecha del servicio**: por defecto trae la fecha de trabajo configurada (o hoy). No admite fechas futuras.
8. *(Opcional)* En **Vinculación operativa**, asocie el servicio a una **Orden de Trabajo/Producción** o a una **Recepción de almacén**. Esta vinculación es documental: conecta el registro con la operación, pero por sí sola no mueve inventario ni dinero.
9. Si vinculó recepciones, elija el **Método de distribución** (ver sección de distribución más abajo).
10. Agregue **Observaciones** si algo necesita aclaración.
11. Haga clic en **Crear Servicio**.

El servicio aparece en la tabla con su número **SRV-AAAAMMDD-NNNN**, el estado **Activo** y el pago en **⏳ Pendiente**.

> 💡 En raras ocasiones la activación puede fallar después de crear el registro. En ese caso el servicio queda en **Borrador** y el sistema lo avisa: actívelo con el botón ✅ **Activar** de la fila.

## Qué significa cada campo

| Campo | Obligatorio | Qué es |
|-------|-------------|--------|
| **Tipo de servicio** | Sí | Categoría oficial del catálogo de servicios (Transporte, Aduana, Estiba…). El nombre del tipo queda «fotografiado» en el registro: si luego renombran el tipo, el historial conserva el nombre original. |
| **Proveedor** | Sí | Quién prestó el servicio (persona o empresa). Aparece en Cuentas por Pagar y en la búsqueda de la lista. |
| **Importe total** | Sí | Costo del servicio en CUP. Determina el saldo a pagar y el monto a distribuir. |
| **Documento ref.** | No | Referencia de factura o comprobante del proveedor. |
| **Fecha del servicio** | Automática | Fecha operativa del servicio. Por defecto usa su preferencia de fechas de trabajo (o hoy). Nunca futura. |
| **Orden de Trabajo / Producción (OT)** | No | Vinculación documental con una OT de la tienda. |
| **Recepción de almacén** | No | Vinculación documental con recepciones de mercancía. Habilita la distribución al costo. |
| **Método de distribución** | Con recepciones vinculadas | Cómo se reparte el importe entre las líneas de las recepciones vinculadas. |
| **Observaciones** | No | Notas libres del registro. |

## Estados y resultados

### Estado del documento

| Estado | Qué significa | Cómo se llega |
|--------|--------------|---------------|
| **Borrador** (ámbar) | Registro creado pero no vigente. No distribuye costos. | Si la activación falla tras crear. |
| **Activo** (verde) | Registro vigente. Puede pagarse y distribuirse. | Al crear correctamente, o activando un borrador. |
| **Anulado** (rojo) | Registro retirado. | Botón 🚫 **Anular** de una fila activa. |

No existe edición del documento: los datos de un servicio (tipo, importe, proveedor, fecha) no se pueden modificar después de creado. Si quedó mal, anúlelo y cree uno nuevo. No hay eliminación física: todo queda con rastro de auditoría.

### Estado del pago

| Estado | Qué significa |
|--------|---------------|
| **⏳ Pendiente** | No se ha registrado ningún pago. |
| **⚖️ Parcial** | Hay pagos registrados menores al importe total. |
| **💰 Pagado** | La suma de pagos cubre el importe total. |

El estado se calcula automáticamente al registrar o revertir pagos. Además, cada servicio tiene **fecha de vencimiento**: la fecha del servicio más los días de crédito (30 por defecto). Si vence y sigue debiendo saldo, aparece resaltado en rojo en el detalle y como obligación vencida en **Cuentas por Pagar**.

## Cómo pagar un servicio

1. En la tabla, haga clic en 👁 **Ver detalle** del servicio.
2. Abra la pestaña **Pagos**. Verá tres tarjetas: **Total**, **Pagado** y **Saldo**, más el historial de pagos.
3. Haga clic en **Registrar Pago**.
4. Complete el formulario:
   - **Monto**: por defecto el campo sugiere el saldo pendiente. Puede pagar menos (pago parcial); el sistema no permite pagar más del saldo.
   - **Método**: 💵 Efectivo, 📱 Transferencia o 💳 Zelle.
   - **Referencia** (opcional): número de transferencia o comprobante.
   - **Fecha del pago**: por defecto hoy. Puede ser una fecha pasada de su periodo operativo, nunca futura.
5. Haga clic en **Confirmar**.

**¿Y la caja?** Solo los pagos en **efectivo** se cuentan como egreso en el **arqueo del turno**: el resumen del día muestra la fila «Servicios recibidos pagados en efectivo». Los pagos por transferencia o Zelle no reducen el efectivo físico de la caja.

**Registrar no es pagar.** Crear el servicio solo documenta la obligación; el dinero sale de caja únicamente cuando registra un pago en efectivo.

> ⚠️ **Anular un pago** aparece como opción en el historial, pero actualmente la base de datos no permite eliminar pagos registrados y la reversión de pagos no está disponible. Registre sus pagos con cuidado: verifique monto, método y fecha antes de confirmar.

## Distribución al costo de la mercancía (opcional)

Si el servicio está vinculado a recepciones, su importe puede **repartirse entre los productos recibidos**, subiendo su costo promedio (WAC):

1. Vincule las recepciones al crear el servicio (o después, desde la recepción: **Ver detalle → costos asociados → Vincular servicio existente**). Desde la recepción también puede hacer una **Creación rápida** con los tipos más comunes: Transporte, Manipulación, Seguro y Estiba.
2. Elija el método de distribución:
   - **Por importe**: proporcional al valor de cada línea (cantidad × costo unitario).
   - **Por cantidad**: proporcional a las unidades recibidas.
   - **Manual**: se define desde la vinculación de la recepción (porcentajes línea a línea).
3. El sistema genera las distribuciones y recalcula el costo promedio de los productos afectados.
4. Puede regenerar el reparto con el botón 🔄 **Recalcular** de la fila; el sistema confirma cuántas líneas se recalcularon.

Si anula el servicio, sus distribuciones y vínculos se eliminan y el costo de los productos vuelve a su valor anterior.

Si nunca vincula recepciones, el servicio queda como documento de gasto: se paga y aparece en reportes, pero no toca el costo de ningún producto.

## Restricciones importantes

- El importe debe ser **mayor que 0**.
- El proveedor es **obligatorio**: sin él el registro no se guarda.
- La fecha del servicio y la fecha del pago **nunca son futuras**; hacia atrás se respeta el piso operativo de su tienda (por defecto 6 meses).
- Un servicio **no se edita**: anule y vuelva a crear.
- **Anular** solo está disponible en servicios **Activos**: elimina distribuciones y vínculos, reinicia el pago a Pendiente y deja constancia en auditoría. Los pagos ya registrados no se borran: quedan marcados como revertidos.
- Un servicio en **Borrador** no distribuye costos: actívelo primero.
- No se puede pagar más que el saldo pendiente (no hay sobrepago).
- Gestionar el catálogo de tipos de servicio (**Gestionar tipos**) es exclusivo del **administrador global**; los tipos no se borran, solo se desactivan.
- Registrar servicios no requiere turno de caja abierto; pagar en efectivo sí se refleja en el arqueo del turno.

## Errores frecuentes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| «Selecciona un tipo de servicio del catálogo» | No eligió ficha de tipo. | Toque un tipo de la lista antes de crear. |
| «Supplier requerido» (Proveedor requerido) | El proveedor quedó vacío. | Escriba el nombre del proveedor y vuelva a guardar. |
| «El importe debe ser mayor a 0» | Importe en 0 o vacío. | Escriba el monto correcto en CUP. |
| «La fecha del servicio no es válida» / «no puede ser futura» | Fecha fuera del rango operativo. | Elija hoy o una fecha pasada dentro del piso de 6 meses. |
| «Pago N: excede el saldo pendiente. Overpay no permitido» | Intentó pagar más de lo que falta. | Registre un monto igual o menor al saldo. |
| «Fecha del pago no admisible» | Fecha de pago futura o fuera del piso operativo. | Use hoy o una fecha pasada válida. |
| «No se pudo cargar el documento» / «Error de conexión» | Corte de red al abrir detalle o registrar pago. | Verifique su conexión y reintente; el pago tiene clave de idempotencia y no se duplica. |
| «Error al recalcular» | El servicio no tiene recepciones vinculadas o ya se recalculó igual. | Verifique las recepciones vinculadas en el detalle. |
| «Solo un administrador puede gestionar el catálogo de tipos de servicio» | Intentó editar tipos sin ser admin global. | Pida al administrador que cree o desactive el tipo. |

## Preguntas frecuentes

**¿Un servicio recibido es lo mismo que un gasto?**
No exactamente. Es un costo de abastecimiento con ciclo propio: registro → distribución opcional al costo de la mercancía → pago. Un gasto de operación (renta, luz) se registra en Caja → Ingresos/Egresos y nunca toca el costo de los productos.

**¿Puedo registrar el servicio en USD o EUR?**
No. El importe se registra en CUP. Si su acuerdo con el proveedor está en otra moneda, registre el equivalente en CUP.

**¿Puedo pagar en cuotas?**
Sí, y es la forma correcta: registre pagos parciales desde la pestaña **Pagos** hasta saldar. No cree un servicio separado por cada cuota; el sistema calcula el estado Parcial automáticamente.

**¿Registrar el servicio saca dinero de la caja?**
No. Registrar crea la obligación documental. El efectivo se mueve solo cuando registra un **pago en efectivo**, y ese egreso se ve en el arqueo del turno. Transferencia y Zelle no tocan el efectivo físico.

**¿Dónde veo lo que debo por servicios?**
En **OPERACIÓN → Ventas → Opciones → Cuentas por Pagar**: cada servicio con saldo aparece como obligación con su vencimiento y antigüedad (Vencidas, 30, 60, 90 y 120 días).

**¿Por qué subió el costo de mis productos después de vincular un servicio?**
Es el comportamiento esperado: la distribución suma el costo del servicio al costo promedio (WAC) de los productos recibidos. Puede ver el detalle en el análisis de costo del producto o en **OPERACIÓN → Costo → Estructura de Costo**.

**¿Se puede corregir un servicio mal registrado?**
No se edita. Anule el servicio (si está activo) y cree uno correcto. La anulación revierte distribuciones y deja el pago en Pendiente. Si ya pagó y necesita revertir, contacte al administrador: la reversión de pagos aún no está disponible.

**¿Quién puede usar este módulo?**
Ver: admin, manager, encargado y warehouse de la tienda. Crear, pagar, anular y recalcular: admin global, manager o encargado de esa tienda. Gestionar tipos de servicio: solo admin global.

**¿Aparece en los reportes?**
Sí: el reporte **Gastos/Costos por Día** (ANÁLISIS → Reportes) suma los servicios activos por fecha del servicio, y el **Reporte Entrega** considera los pagos en efectivo del día.

## Información relacionada

- **Cómo recibir mercancía** — las recepciones que luego vincula a un servicio.
- **Cómo consultar Cuentas por Cobrar y Pagar** — donde aparece la obligación de pago del servicio.
- **Cómo cerrar la caja (arqueo)** — dónde se reflejan los pagos en efectivo del día.
- **Estructura de Costo y costeo dinámico** — cómo el WAC incorpora los servicios distribuidos.
- **Glosario de términos** — WAC, distribución de costos y otros conceptos.
