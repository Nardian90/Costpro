# Cómo Hacer: Generar el Reporte Entrega

> **Necesita esto cuando**: va a **entregar físicamente el dinero** del día o del período a gerencia y necesita el cuadre del efectivo (esperado vs. contado), el desglose de billetes y el comprobante con firmas.

## ¿Para qué sirve?

El **Reporte Entrega** (título completo: «Reporte de Caja — Entrega») es el comprobante de la entrega de dinero del período. Calcula el **efectivo esperado** del sistema a partir de las ventas y todos los movimientos de caja, lo compara con el **efectivo contado** por denominaciones (cuadre), y produce un PDF/Excel con el detalle de ventas, el desglose de billetes y las líneas de firma (**Hecho por / Entregado por / Recibido por**).

No es el arqueo del turno (ese vive en la vista Caja al cerrar turno): es el documento formal que acompaña la entrega física del dinero. El cierre de caja no genera este PDF automáticamente — se genera aquí.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Ventas** → **Reporte Entrega**.
- **Desde Caja**: botón **Reporte Entrega** dentro de la vista de Caja.
- **Desde el POS**: icono de impresora en la barra del punto de venta.
- **Desde Trabajadores**: botón **Volver a Reporte Entrega** (tras gestionar comisiones).
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «reporte entrega», «entrega de dinero», «cuadre» o «desglose de billetes».

## Antes de comenzar

- Roles con acceso: admin, manager, encargado y clerk.
- Elija el **período** con «Desde» / «Hasta» (ambos traen hoy por defecto). El reporte **no se calcula solo**: pulse **Generar reporte**.
- Si va a cuadrar, active el **Desglose de efectivo** y cuente las denominaciones reales de la gaveta (CUP y, si opera en dólares, USD).
- Tenga a mano los movimientos del día que no son ventas: anticipos de órdenes de trabajo, comisiones pagadas, pagos a proveedores en efectivo e ingresos/egresos de caja — todos entran al efectivo esperado.

## Cómo generar el reporte

1. Vaya a **OPERACIÓN → Ventas → Reporte Entrega**.
2. Defina «Desde» / «Hasta». Si el intervalo es inválido («Desde» posterior a «Hasta»), el botón se bloquea.
3. Pulse **Generar reporte** (o **Actualizar reporte** si cambió el período). El estado pasa de **Sin calcular** a **Al día**; si modifica fechas después de generar verá **Resultados anteriores**.
4. Revise la pestaña **Resultados**: el Resumen del Día, las tarjetas de cuadre y los acordeones de detalle (Ventas por Método, Pagos a Proveedores, Comisiones a Trabajadores, Órdenes de Producción/Servicios).
5. En la pestaña **Desglose de efectivo**, cuente las denominaciones CUP y USD y verifique el **cuadre**.
6. En **Vista previa** revise el documento y descargue el **PDF** o el **Excel**.

## Qué muestra el Resumen del Día

| Concepto | Nota |
|----------|------|
| **Ventas totales (efectivo + transferencia)** | Del período, en la moneda correspondiente. |
| **Ventas en efectivo / por transferencia / por Zelle** | Desglose por método de cobro. |
| **Órdenes de trabajo (anticipos)** | Anticipos y pagos recibidos de producción/servicios. |
| **Comisiones pagadas en efectivo** | Restan del efectivo esperado. |
| **Comisiones pagadas por transferencia** | Se listan pero **no reducen el efectivo físico**. |
| **Servicios recibidos pagados en efectivo** | Pagos en efectivo a servicios de terceros. |
| **Pagos a proveedores (efectivo)** | Pagos en efectivo registrados. |
| **Ajustes extraordinarios (+) / (−)** | Hoy **deshabilitados** (apartado visible solo para administradores): la función está temporalmente desactivada («Función temporalmente desactivada. Pendiente de revisión e implementación.») y no admite registros nuevos; los históricos se muestran. |
| **Efectivo esperado a entregar** | Total: ventas en efectivo + anticipos + ajustes (+) + ingresos de caja − comisiones efectivo − servicios en efectivo − pagos a proveedores − ajustes (−) − egresos de caja − reembolsos en efectivo. |

## El cuadre de efectivo

Con el desglose activo, cuente billetes y monedas por denominación. El informe compara:

| Resultado | Significado |
|-----------|-------------|
| **Cuadrado** | Contado igual al esperado (diferencia menor que medio céntimo). |
| **Sobrante** | Contado mayor que el esperado (diferencia positiva). |
| **Faltante** | Contado menor que el esperado (diferencia negativa). |

El cuadre se calcula **por moneda**: el efectivo físico CUP y el efectivo físico USD se cuentan y reportan por separado. **Nunca se suman entre sí** ni con las transferencias.

## Monedas y métodos: qué se mezcla y qué no

- El informe maneja **CUP y USD** como dimensiones separadas en todo el cálculo (no hay EUR).
- Los métodos de cobro del informe son **Efectivo**, **Transferencia** y **Zelle**. Una venta **Mixta** no es un grupo: sus cobros se reconstruyen a su moneda real; lo indistinguible aparece como fila informativa «Ventas mixtas sin desglosar».
- Las **transferencias no son efectivo físico**: en el PDF Estándar tienen su propia línea «(-) Transferencias (no se entregan en efectivo)». En la hoja USD de la plantilla Diario, las transferencias USD se listan dentro de la columna «Efectivo (USD)» de esa hoja.
- Cada importe conserva su **equivalente CUP canónico** (tasa del momento del cobro) para la conciliación, sin mezclarlo con la moneda original.

## Exportaciones

- **PDF** con plantillas **Estándar**, **Simple** y **Diario (Empresa)**: la plantilla Diario produce dos secciones cortadas — «Reporte de Venta CUP» y «Reporte de Venta USD» — con Resumen y Entrega de Efectivo (desglose de billetes + cuadre), Detalle de Ventas y firmas; la Estándar añade flujo de caja CUP, productos vendidos, comisiones y el desglose para entrega. Las firmas («Hecho por», «Entregado por», «Recibido por») son configurables con nombres propios.
- **Excel** con hojas «Reporte Entrega» (CUP), «Reporte Entrega USD» (si hay USD y la opción «USD en hoja separada» está activa), «Órdenes de Trabajo» y «Nota metodológica», con totales calculados.
- Las opciones (plantilla, orientación, denominaciones, líneas de firma, desglose laboral) se recuerdan para próximas veces.

## Restricciones importantes

- **Cada dimensión por separado**: efectivo CUP, efectivo USD, transferencias y Zelle no se suman entre sí. El «Efectivo esperado a entregar» es efectivo físico (CUP + USD en sus hojas propias), no el total cobrado.
- Las ventas se atribuyen por su fecha de registro; los ajustes, reembolsos e ingresos/egresos de caja por su fecha de pago; las **comisiones por el día de negocio en que se confirmó su pago** — una comisión pagada hoy por ventas de ayer aparece en el reporte de hoy.
- Una venta retro-fechada (fecha operativa de un día anterior) aparece en el reporte de **su fecha operativa**, no del día en que se registró.
- Los **ajustes extraordinarios** están temporalmente deshabilitados para registros nuevos (el apartado, visible solo para administradores, muestra el aviso y el backend rechaza con «Función temporalmente desactivada»).
- El cuadre es orientativo para la entrega: el arqueo oficial del turno se ejecuta en la vista Caja.

## Errores frecuentes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| «Revisa el intervalo de fechas: la fecha inicial no puede ser posterior a la final.» | Rango invertido. | Corrija «Desde» / «Hasta». |
| «Genera el reporte primero: pulsa «Generar reporte».» | Intentó exportar o desglosar sin calcular. | Pulse **Generar reporte**. |
| «No hay efectivo CUP para desglosar…» | El período no tiene efectivo en esa moneda. | Verifique el período o desactive el desglose de esa moneda. |
| «Error al generar el reporte. Tu configuración se conserva.» | Fallo de red o del servidor. | Reintente; sus opciones siguen guardadas. |
| El cuadre no aparece | El desglose de efectivo está desactivado. | Active «Desglose de efectivo» en las opciones del panel. |
| Esperaba ver las transferencias en el efectivo | Las transferencias no son efectivo físico. | Revise la sección de transferencias del PDF o el Resumen del Día. |

## Preguntas frecuentes

**¿Diferencia entre este reporte y el cierre de caja?**
El cierre de caja (vista Caja) ejecuta el arqueo del turno y queda registrado en el sistema. El Reporte Entrega produce el **comprobante documental** de la entrega física del dinero, con desglose de billetes y firmas; se genera cuando se necesita, para el período que se elija.

**¿Las comisiones pagadas ayer por ventas de hoy aparecen dónde?**
Las comisiones se atribuyen al día de negocio de la **confirmación del pago**: si se pagaron ayer, están en el reporte de ayer, aunque las ventas sean de hoy.

**¿Puedo firmar con nombres reales?**
Sí: los nombres de las tres líneas de firma son editables y se recuerdan para el próximo reporte.

**¿Qué pasa con una venta Mixta?**
No hay grupo «Mixto»: el sistema reconstruye cada cobro a su moneda (efectivo CUP, efectivo USD, transferencia, Zelle). Lo que no puede distinguirse aparece como «Ventas mixtas sin desglosar».

**¿Este reporte incluye los ingresos/egresos de caja?**
Sí: los documentos confirmados de la vista Ingresos/Egresos entran al efectivo esperado (como «Ingresos de caja» y «Egresos de caja» en PDF/Excel).

**¿Puedo generar el reporte de un rango mayor a un día?**
Sí: «Desde»/«Hasta» aceptan cualquier rango válido. Recuerde que la atribución sigue las reglas del período por día de negocio.

## Información relacionada

- **Cómo cerrar caja** — el arqueo del turno y el Fondo Inicial.
- **Cómo registrar ingresos/egresos de caja** — los documentos que este reporte incluye en el efectivo esperado.
- **Cómo pagar comisiones** — la atribución por fecha de pago confirmado.
- **Cómo usar las fechas de trabajo** — el día de negocio y las fechas operativas.
- **Roles y permisos** — quién puede generar el reporte.
