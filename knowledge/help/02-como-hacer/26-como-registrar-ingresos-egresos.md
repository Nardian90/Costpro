# Cómo Hacer: Registrar Ingresos/Egresos de Caja

> **Necesita esto cuando**: entra o sale **efectivo físico** de la caja por un motivo que no es una venta ni un pago registrado en otro módulo — constituir, reponer o devolver el **fondo de cambio**, o cualquier otro movimiento de efectivo autorizado.

## ¿Para qué sirve?

La vista **Ingresos/Egresos** es el registro documental del dinero que entra o sale físicamente de la caja de la tienda. Cada movimiento es un **documento numerado** (formato `IE-000001-2026`) con responsable, justificación y comprobante PDF, y su efecto en el efectivo queda reflejado en el arqueo del turno y en el Reporte Entrega.

Es un módulo de **documentos de caja**, no un registro de gastos generales: las ventas y cobros se registran en el POS, los pagos a proveedores en Cuentas por Pagar, las comisiones en Trabajadores y los servicios de terceros en Servicios Recibidos. Esta vista solo documenta el efectivo que entra o sale de la gaveta.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Caja** → **Ingresos/Egresos**.
- **Móvil**: menú inferior → **Más** → grupo OPERACIÓN → **Ingresos/Egresos** (o el acceso directo «Ingresos/Egresos» de la tarjeta Caja en Inicio).
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «ingresos», «egresos», «fondo de cambio» o «comprobante».

## Antes de comenzar

- **Registrar**: roles admin, manager, encargado o clerk de la tienda.
- **Anular**: solo admin, manager o encargado.
- Debe existir un **turno abierto en Caja**: sin turno abierto no se puede registrar (ni anular un ingreso).
- Defina primero la **tasa USD de la tienda** si va a operar en dólares: el sistema la resuelve del servidor con la jerarquía tienda → BCC → elToque y rechaza el registro en USD si no hay tasa vigente o está desactualizada (más de 45 días).
- No es lo mismo una **entrega de dinero del día** (eso se cuadra y documenta en la vista **Reporte Entrega**, dentro de OPERACIÓN → Ventas): aquí solo se registran entradas y salidas puntuales de efectivo.

## Cómo registrar un movimiento

1. Vaya a **OPERACIÓN → Caja → Ingresos/Egresos** y pulse **Registrar Ingreso / Egreso**.
2. Elija el **Tipo**:
   - **Ingreso (+)** — «Entra efectivo a la caja».
   - **Egreso (−)** — «Sale efectivo de la caja».
3. Elija el **Motivo** (obligatorio) según el tipo. Solo aparecen los motivos válidos:

   | Tipo | Motivo | Efecto en el fondo de cambio |
   |------|--------|------------------------------|
   | Ingreso | **Constitución del fondo de cambio** | Aumenta el fondo de cambio |
   | Ingreso | **Reposición del fondo de cambio** | Aumenta el fondo de cambio |
   | Ingreso | **Otro ingreso de efectivo autorizado** | No toca el fondo |
   | Egreso | **Devolución total del fondo de cambio** | Agota el fondo de cambio |
   | Egreso | **Devolución parcial del fondo de cambio** | Reduce el fondo de cambio |
   | Egreso | **Otro egreso de efectivo autorizado** | No toca el fondo |

4. Complete **Importe** (mayor que cero, máximo 2 decimales) y **Moneda** (solo **CUP** o **USD**; no existe EUR).
5. Revise la **Fecha operativa**: por defecto hoy; puede retro-fechar dentro de la ventana del turno abierto y del piso histórico (6 meses). Nunca futura.
6. Opcional: **Quien entrega/recibe el dinero** (máx. 120 caracteres; en el comprobante aparece como «Entregado por» / «Recibido por») y **Observaciones** (máx. 500).
7. En las devoluciones de fondo puede vincular el **Fondo de origen** a la constitución o reposición que lo creó, o dejarlo «Sin vínculo específico (del fondo global)».
8. Escriba la **Justificación** (obligatoria, máx. 500 caracteres): explique el motivo del movimiento.
9. Confirme. El documento nace directamente **Confirmado** y recibe su número `IE-…`.

> ℹ️ **Moneda USD**: el formulario no pide la tasa. El servidor calcula el equivalente en CUP canónico con la tasa vigente de la tienda al momento de registrar; usted verá «Equivalente CUP: tasa del servidor (se confirma al registrar)».

## Qué significa cada indicador

| Tarjeta | Qué muestra |
|---------|-------------|
| **Saldo de caja (ahora)** | El efectivo esperado del turno vigente en CUP canónico: fondo inicial + ventas en efectivo + anticipos + ingresos de caja − pagos a proveedores y servicios recibidos en efectivo − comisiones − egresos de caja. **No** es solo la suma de esta vista. |
| **Fondo de cambio vigente** | Apertura + constituciones/reposiciones − devoluciones confirmadas en la ventana del turno. |
| **Ingresos del período / Egresos del período** | Dos tarjetas con los totales de los documentos confirmados del período (CUP y, si existe, USD). |
| **Fondo pendiente de devolución** | Fondo constituido o repuesto que aún no ha sido devuelto. |
| **Anulados del período** | Documentos anulados en el rango visible. |

## Estados y resultados

| Estado | Qué significa |
|--------|---------------|
| **Confirmado** | El documento entró en vigor: su efecto ya está en el efectivo esperado del arqueo y en el Reporte Entrega. |
| **Anulado** | El efecto fue revertido con una **fila contraria** fechada en el momento de la anulación. La historia queda intacta: el documento original sigue visible. |

No existen borrador ni edición: el documento se crea confirmado y su única corrección es la **anulación**.

## Cómo anular un documento

1. Localice el documento (use la búsqueda o los filtros de tipo, motivo, estado, moneda, responsable y rango de **Fecha operativa**).
2. Pulse **Anular** (visible solo para admin/manager/encargado sobre documentos confirmados).
3. Escriba el **motivo de anulación** (obligatorio, mínimo 3 caracteres).
4. Confirme. El sistema registra una fila contraria con la fecha actual del servidor.

> ⚠️ **Anular un ingreso exige turno abierto** y no puede dejar el efectivo esperado en negativo. Si el turno del documento original ya está cerrado, la reversión entra en la ventana del turno vigente: el cierre histórico no se modifica. Esto puede mover el cuadre del turno actual — anule con el contexto en mano.

## Efectos sobre el arqueo y los reportes

- El arqueo del cierre de turno incluye las filas **«Ingresos de Caja (Fondo y Otros)»** y **«Egresos de Caja (Devolución y Otros)»**.
- El **Reporte Entrega** (OPERACIÓN → Ventas) incorpora los ingresos/egresos confirmados dentro del «Efectivo esperado a entregar» (en el PDF y el Excel aparecen como «Ingresos de caja (fondo y otros)» y «Egresos de caja (fondo y otros)»). El panel «Resumen del Día» de la pantalla no lista filas propias para ellos: están dentro del total.
- Un documento anulado aporta la fila original y la contraria: efecto **neto cero**.
- La tarjeta de Caja del Inicio muestra el saldo y el fondo ya con estos documentos incluidos.

## Restricciones importantes

- **No hay edición ni borrado**: si se equivocó, anule y registre un documento nuevo.
- El egreso no puede superar el **efectivo disponible** y la devolución no puede superar el **fondo de cambio vigente**.
- La fecha operativa debe caer **dentro del turno abierto** (si retro-fechas fuera de la apertura del turno, la operación queda fuera del arqueo de este turno).
- No existen «retiros» ni «depósitos bancarios» como tipos de esta vista: si necesita mover efectivo hacia fuera use una devolución del fondo o «Otro egreso» con su justificación.
- Cada documento exige **justificación**: los movimientos sin explicación no deben registrarse.

## Errores frecuentes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| «La caja no tiene un turno abierto: ábrelo en Caja antes de registrar.» | No hay turno vigente. | Abra el turno en **Caja** (Fondo Inicial) y vuelva a intentar. |
| «El egreso supera el efectivo disponible (X).» | El monto excede el saldo esperado. | Reduzca el importe o verifique que las ventas del día están registradas. |
| «La devolución supera el fondo de cambio vigente (X).» | Devuelve más fondo del que existe. | Use «Devolución parcial» por un monto menor. |
| «No hay tasa USD disponible. Configura la tasa de la tienda antes de operar en USD.» | Falta la tasa del día. | Configúrela en la gestión de tasas de la tienda (o confirme la tasa diaria). |
| «La fecha operativa debe caer dentro del turno abierto.» | Fecha fuera de la ventana del turno. | Elija la fecha operativa actual o amplíe la ventana abriendo el turno correspondiente. |
| «El motivo de la anulación es obligatorio (mínimo 3 caracteres)» | Motivo vacío o demasiado corto. | Describa el motivo de la anulación. |
| «Anular este ingreso dejaría el efectivo esperado en negativo» | El ingreso ya salió físicamente por otro concepto. | Anule primero el movimiento posterior o corrija el orden de operaciones. |

## Preguntas frecuentes

**¿Diferencia entre registrar un egreso y pagar a un proveedor?**
El pago a proveedores se ejecuta desde Cuentas por Pagar (o Servicios Recibidos) y descuenta el efectivo por su propio camino. «Otro egreso» es para salidas de efectivo que no corresponden a esos módulos. Registrar aquí un pago de proveedor duplicaría la salida.

**¿Diferencia entre devolución del fondo y entrega de dinero del día?**
La devolución del fondo devuelve a la gerencia el dinero del fondo de cambio constituido. La **entrega de dinero del día** se documenta con el Reporte Entrega: cuadre del efectivo del período y desglose de billetes para entregar. Son operaciones distintas que pueden coincidir en el tiempo.

**¿Por qué el saldo de la tarjeta no coincide con la suma de mis documentos?**
Porque el saldo esperado incluye también ventas en efectivo, anticipos, comisiones y pagos; esta vista es solo una parte del efectivo del turno.

**¿Puedo registrar un movimiento de ayer?**
Sí, si ayer está dentro de la ventana del turno abierto y del mínimo de la tienda (la política temporal es forward-only, con piso de 6 meses). Si no, la fecha será rechazada.

**¿El comprobante vale como factura?**
No: el PDF se titula «Comprobante de Ingreso / Egreso de Caja» y aclara que «no constituye factura de venta». Incluye firmas del responsable que registra y de quien entrega/recibe.

## Información relacionada

- **Cómo cerrar caja** — el arqueo donde estos documentos pesan en el efectivo esperado.
- **Cómo generar el Reporte Entrega** — la entrega física del dinero del día.
- **Cómo recibir un servicio** — por qué los pagos de servicios no se registran aquí.
- **Cómo usar la tasa de cambio** — la tasa de tienda que convierte USD al CUP canónico.
- **Roles y permisos** — qué puede hacer cada rol en caja.
