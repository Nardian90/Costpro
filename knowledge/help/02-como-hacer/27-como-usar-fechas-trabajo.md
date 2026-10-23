# Cómo Hacer: Usar las Fechas de Trabajo

> **Necesita esto cuando**: necesita que el **próximo documento** de un tipo (una venta, una recepción, un vale, un servicio…) lleve una fecha operativa distinta de hoy, o quiere revisar el estado temporal de todos los tipos de movimiento de la tienda.

## ¿Para qué sirve?

**Fechas de trabajo** es el centro de control del estado temporal de la operación. Desde aquí puede:

- Ver, para cada tipo de movimiento, la **fecha de trabajo actual** (la que usará el próximo documento), la **última fecha operativa registrada** y los límites **mínimo/máximo** permitidos.
- **Fijar una fecha** como valor inicial del selector de fecha del próximo documento de ese tipo.

Una «fecha de trabajo» **no es una entidad del sistema**: es una **preferencia personal** (por usuario, tienda y tipo de movimiento) que preselecciona la fecha en el formulario del flujo correspondiente. No cambia documentos históricos ni afecta a otros usuarios.

> ⚠️ **No confunda fecha de trabajo con turno de caja.** El turno de caja es la sesión que se abre y cierra en la vista **Caja** (con su arqueo). La fecha de trabajo es solo la fecha efectiva que llevará un documento. Son conceptos separados: puede haber varios turnos en un mismo día de negocio, y un documento con fecha de ayer entra (o no) en el arqueo del turno abierto según su hora real de registro.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Control operativo** → **Fechas de trabajo**.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «fechas de trabajo», «fecha operativa», «fecha efectiva» o «retro-fechar».

## Antes de comenzar

- La vista está disponible para todos los roles de la sección OPERACIÓN (admin, manager, encargado, clerk, usuario, warehouse).
- Necesita una **tienda activa** seleccionada: la política temporal es **por tienda**.
- Conozca las reglas que el servidor aplicará a cualquier fecha (fije la preferencia que fije):
  - **Máximo permitido**: hoy (día de negocio de América/La Habana). No se aceptan fechas futuras.
  - **Mínimo permitido**: la última fecha operativa de la tienda (la fecha más alta ya registrada). El tiempo operativo **no retrocede**.
  - **Piso histórico**: no se aceptan documentos con más de **6 meses** de antigüedad.

## Cómo usar la vista

1. Vaya a **OPERACIÓN → Control operativo → Fechas de trabajo**.
2. Revise las tarjetas superiores:
   - **Hoy (negocio)**: fecha máxima de todo documento.
   - **Mín. operativo (tienda)**: última fecha operativa registrada; es el mínimo para nuevos documentos.
   - **Piso histórico**: hoy − 6 meses.
   - **Fechas de trabajo activas**: cuántas de sus preferencias están fijadas en esta tienda.
3. Use la matriz de **12 tipos de movimiento** (Ventas, Logística, Almacén, Caja, Costo). Filtre por texto o por área, o marque **Solo configurables**.
4. Para un tipo **Configurable**, pulse **Cambiar fecha** (o **Fijar fecha**) en su fila.
5. En el diálogo elija la fecha dentro de los límites y pulse **Guardar**, o use **Restaurar HOY** para eliminar la preferencia.
6. Use **Ir al flujo** para saltar directamente a la vista donde se crea ese tipo de documento.

## Qué significa cada columna

| Columna | Significado |
|---------|-------------|
| **Tipo de movimiento** | Uno de los 12 tipos: Venta (POS / carrito / express), Recepción de mercancía, Vale de Salida, Servicio recibido, Caja — turnos y arqueo, Caja — ingresos/egresos documentados, Devolución / nota de crédito, Ajuste de inventario individual, Transferencia entre tiendas, Venta por catálogo, Orden de compra, Pago a proveedor (CxP / OT). |
| **Área** | Agrupación funcional: Ventas, Logística, Almacén, Caja o Costo. |
| **Fecha de trabajo actual** | Su preferencia para el próximo documento de ese tipo, o «hoy implícito» si no fijó ninguna. Puede mostrar la preferencia como **caducada** si quedó bajo el mínimo actual: en ese caso el formulario usará HOY. |
| **Última fecha operativa** | Fecha del documento más reciente de ese tipo en la tienda (con conteo de documentos). |
| **Mín. permitida / Máx. permitida** | Ventana válida para la fecha del próximo documento. |
| **Estado** | **Configurable** (puede fijar fecha), **Fija** (la fecha la determina el sistema: turnos de caja) o **Informativa** (solo lectura: orden de compra). |
| **Acción** | Cambiar fecha / Fijar fecha, o Ir al flujo. |

## Estados y resultados

Al guardar una preferencia verá el resultado en la fila correspondiente:

| Resultado | Efecto real |
|-----------|-------------|
| **Preferencia fijada** | El formulario de ese tipo abrirá su selector de fecha con esa fecha. Al crear el documento, el servidor revalida la fecha. |
| **HOY implícito** (sin preferencia) | El formulario trae hoy y el servidor estampa la hora actual del registro. |
| **Restaurar HOY** | La preferencia se elimina: el tipo vuelve a «hoy implícito». |
| **Preferencia caducada** | La fecha fijada quedó bajo el mínimo operativo de la tienda: el formulario usará HOY hasta que fije otra fecha válida. |

## Restricciones importantes

- La preferencia es **local de su puesto** (por usuario + tienda + tipo) y **no edita documentos ya registrados**: para corregir un documento existente use su propia reversión/anulación en su módulo.
- Fijar una fecha **no autoriza nada**: el servidor valida cada documento contra el mínimo de la tienda, el piso de 6 meses y la prohibición de fechas futuras, aunque su formulario traiga otra cosa.
- Los tipos **Fija** (Caja — turnos y arqueo) e **Informativa** (Orden de compra) no permiten fijar fecha.
- Convención de estampado: si la fecha elegida es hoy, el servidor usa la hora real; si es un día anterior, se registra al mediodía de ese día.
- Trabajar después de medianoche pertenece al **nuevo día de negocio** (zona América/La Habana): el mínimo y el máximo se recalculan por día de negocio.
- En el POS, si elige una fecha anterior a la apertura del turno activo, la venta se registra con su fecha económica y **no entrará en el arqueo de este turno** (aviso en pantalla).

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| «La fecha seleccionada no puede ser futura…» | Eligió una fecha mayor que hoy (negocio). | Use hoy o una fecha anterior. |
| «No se puede retroceder en el tiempo operativo. La fecha mínima permitida es …» | La fecha está por debajo de la última registrada en la tienda. | Use la fecha mínima indicada o posterior. |
| «La fecha … es anterior al límite histórico permitido de 6 meses» | Fecha bajo el piso histórico. | No es posible registrarla: es una política del sistema. |
| Mi preferencia aparece «Caducada» | La tienda avanzó su mínimo operativo por encima de la fecha fijada. | Fije una nueva fecha o use **Restaurar HOY**. |
| No veo el botón «Cambiar fecha» en una fila | El tipo es Fija o Informativa. | Solo los tipos Configurables aceptan preferencia. |
| No puedo fijar nada y no hay matriz | No hay tienda activa. | Seleccione una tienda activa en el selector superior. |

## Preguntas frecuentes

**¿Si fijo la fecha de trabajo de «Venta», cambia las ventas de otros cajeros?**
No. La preferencia es suya, de este puesto y esta tienda. Otro usuario seguirá con «hoy implícito» salvo que fije la suya.

**¿Esto es lo mismo que el turno de caja?**
No. El turno se abre y cierra en Caja y define la ventana del arqueo. La fecha de trabajo solo preselecciona la fecha del próximo documento. Un turno puede abarcar documentos de un mismo día de negocio; las fechas de trabajo son por tipo de documento.

**¿Puedo retro-fechar una venta de hace 3 meses?**
Solo si ese día no está bajo el piso histórico (hoy − 6 meses) y no es anterior al mínimo operativo de la tienda. El servidor lo valida al registrar, no solo el formulario.

**¿Dónde se ve la fecha que llevará el documento?**
En el selector de fecha del propio formulario de cada flujo (Fecha de venta, Fecha de Recepción, Fecha del vale, Fecha operativa, etc.). La preferencia solo define con qué valor arranca ese selector.

**¿Cambiar la fecha de trabajo altera reportes antiguos?**
No. Los reportes se atribuyen por las fechas ya registradas en cada documento. Su preferencia solo influye en documentos futuros.

## Información relacionada

- **Cómo cerrar caja** — la ventana temporal del arqueo del turno.
- **Cómo generar el Reporte Entrega** — atribución por día de negocio de cada cobro.
- **Cómo usar la tasa de cambio** — la confirmación diaria de tasa y el día de negocio.
- **Gestión del Inventario** — dónde ver los movimientos con su fecha efectiva.
