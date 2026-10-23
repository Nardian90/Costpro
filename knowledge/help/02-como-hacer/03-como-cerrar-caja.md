# Cómo Hacer: Abrir y Cerrar la Caja (Arqueo)

> **Necesita esto cuando**: comienza su turno y debe poner el fondo inicial de efectivo, o termina su jornada y debe declarar cuánto dinero hay en caja y cerrar el turno.

## ¿Para qué sirve?

La vista **Caja** gestiona los **turnos de caja** de la tienda. Un turno comienza al abrir con un fondo inicial de efectivo y termina al cerrar con un **arqueo**: comparar lo que el sistema calcula que debería haber con lo que usted declara contar físicamente.

El arqueo no es solo de billetes: el sistema separa el dinero en dos lados:

- **Efectivo**: billetes y monedas en la gaveta.
- **Vouchers**: ventas por transferencia y Zelle (no son efectivo físico, pero también se declaran).

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Caja** → **Caja**.
- **Móvil**: pestaña inferior **Caja**.
- Desde el punto de venta: si intenta vender sin turno abierto, un banner en el POS le lleva directo a esta vista.

## Antes de comenzar

- **Abrir turno**: cualquier usuario con acceso al POS puede abrir el turno con su fondo inicial.
- **Cerrar turno**: solo **admin, manager o encargado**. Un cajero (clerk) puede declarar su conteo y actualizarlo, pero el cierre lo ejecuta un rol de gestión (el sistema le mostrará el aviso correspondiente).
- Solo puede haber **un turno abierto por tienda** a la vez.

## Cómo abrir un turno

1. Vaya a **OPERACIÓN → Caja → Caja**.
2. En la tarjeta **Apertura de Turno**, escriba el **Fondo Inicial de Efectivo**: el dinero físico que coloca en la gaveta.
3. *(Opcional)* Escriba **Otros Fondos Iniciales** (por ejemplo, si recibió transferencias como fondo) y **Notas de Apertura**.
4. Confirme. El turno queda abierto y el POS habilitado para vender.

## Cómo cerrar el turno (arqueo)

1. Al terminar la jornada, vaya a **OPERACIÓN → Caja → Caja**.
2. En la tarjeta **Declaración de Cierre** verá el desglose del sistema:

   | Concepto | Qué es |
   |----------|--------|
   | **Fondo Inicial** | El efectivo con el que abrió el turno. |
   | Ventas en efectivo | Suma de las ventas cobradas en efectivo del turno. |
   | Otros conceptos de efectivo | Ingresos/egresos de caja, anticipos, pagos a proveedores en efectivo, comisiones en efectivo y reembolsos: cada uno suma o resta al esperado. |
   | **Efectivo Esperado (Sistema)** | El total que debería haber en la gaveta. |

3. Cuente el dinero físico de la gaveta (conviene contar dos veces) y escríbalo en **Efectivo Contado (Final)**.
4. Cuente o verifique las transferencias y Zelle del turno y escríbalas en **Transferencias Contadas (Final)**. Este campo es editable: declare lo que realmente entró por vouchers.
5. Agregue **Observaciones del Cierre** (texto libre, hasta 1000 caracteres) si hay algo que explicar: un vuelto mal dado, un billete rechazado, una venta con incidente. No existe una lista de motivos predefinidos: escriba la explicación con sus palabras.
6. El sistema muestra la **Diferencia de Arqueo** automáticamente para efectivo y para vouchers (contado − esperado). No hay botón de "calcular": la diferencia se actualiza mientras escribe.
7. Si tiene rol de gestión, haga clic en **Cerrar Turno** y confirme con **Sí, Cerrar Turno**. Si es cajero, asegure su declaración con **Actualizar Declaración** y pida a un encargado que ejecute el cierre.

## Después del cierre: Reporte Entrega

Al cerrar no se genera un PDF automático. El comprobante formal de entrega de dinero se produce desde la vista **Reporte Entrega** (OPERACIÓN → Ventas → Reporte Entrega), que permite generar un **PDF/Excel con desglose de billetes CUP y USD** y campos de firma (Entrega / Recibe / Hecho por). Es el documento que acompaña la entrega física del dinero.

## Si el cierre quedó mal

Un cierre confirmado puede **reabrirse** por un admin o manager indicando un **motivo obligatorio**. Tras corregir la declaración, cierre de nuevo. Toda reapertura queda registrada en auditoría.

## Restricciones importantes

- Solo hay **un turno abierto por tienda**: para abrir otro, primero debe cerrarse el vigente.
- El **efectivo esperado** no se calcula "a mano": el sistema suma fondo + ventas en efectivo + ingresos de caja + anticipos, y resta pagos a proveedores en efectivo (incluidos servicios recibidos pagados en efectivo), comisiones pagadas en efectivo, egresos de caja y reembolsos.
- Las ventas por transferencia/Zelle son **vouchers**: no deben meterse en la gaveta ni contarse como billetes.
- Los cierres guardan quién declaró, quién cerró y cuándo; el historial no se borra.
- Si la tienda trabaja con **fechas de trabajo** configuradas, el cierre respeta la fecha operativa del día de negocio.

## Errores frecuentes

| Situación | Causa probable | Solución |
|-----------|---------------|----------|
| No aparece el botón Cerrar Turno, solo "Actualizar Declaración" | Su rol es cajero (clerk). | Guarde su declaración y pida a un encargado que cierre. |
| La diferencia de efectivo no cuadra y no encuentra el motivo | Vuelto mal dado, venta duplicada o gasto anotado fuera del sistema. | Revise el Historial de Ventas del día y los ingresos/egresos de caja; ajuste la declaración a lo físico y explíquelo en Observaciones. |
| "Transferencias Contadas" no coincide con el sistema | Cobró vouchers fuera del turno o hay reembolsos por voucher. | Verifique las ventas por transferencia/Zelle del turno y los reembolsos; declare el valor real. |
| Quiero abrir turno y no me deja | Ya existe un turno abierto en la tienda. | Cierre el turno vigente primero (o pida que lo cierren). |
| Cerré con un valor equivocado | Error de digitación. | Un admin/manager puede **reabrir** el cierre con motivo y corregirlo. |

## Preguntas frecuentes

**¿Puedo hacer un arqueo sin cerrar el turno?**
Sí: mientras escribe sus conteos, la diferencia se muestra en vivo sin cerrar nada. Si no confirma el cierre, el turno sigue abierto. No existe un botón de "arqueo parcial": simplemente no confirme el cierre hasta estar listo.

**¿Qué pasa si olvidé cerrar el turno ayer?**
El turno sigue abierto hasta que alguien lo cierre. Cierre normalmente; el sistema maneja la fecha operativa del día de negocio correspondiente.

**¿El sistema me avisa si no hay turno abierto?**
Sí. El POS muestra un banner con la opción de abrir turno o llevarlo a la vista de Caja.

**¿Las comisiones y los pagos a proveedores afectan el efectivo esperado?**
Sí: los pagos en efectivo a proveedores (incluidos servicios recibidos) y las comisiones pagadas en efectivo restan del efectivo esperado del turno. Los pagos por transferencia/Zelle no afectan el efectivo físico.

**¿Dónde veo los cierres anteriores?**
Desde la propia vista de Caja puede consultar los turnos cerrados y su resultado; el detalle completo de entregas está en Reporte Entrega.

## Información relacionada

- **Cómo registrar y pagar un Servicio Recibido** — pagos en efectivo que restan del arqueo.
- **Cómo hacer una venta (tutorial)** — el flujo del POS que alimenta el arqueo.
- **Cómo usar la tasa de cambio** — vouchers en divisas y su conversión.
- **Glosario de términos** — arqueo, vouchers, fondo inicial.
