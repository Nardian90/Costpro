# Cómo Hacer: Recibir un Servicio (no Mercancía)

> **Necesita esto cuando**: Paga por un servicio prestado a la tienda (limpieza, plomería, electricidad, mantenimiento, consultoría) y debe registrarlo en el sistema para que el contador lo vea y para que el gasto se refleje en los reportes.

## ¿Cómo se diferencia de una recepción de mercancía?

| Aspecto | Recepción de mercancía | Recepción de servicio |
|---------|------------------------|----------------------|
| **Qué entra** | Productos físicos (cajas, botellas, etc.) | Servicios intangibles (limpieza, reparación) |
| **Afecta inventario** | Sí, suma stock | No, no toca el inventario |
| **Tiene código de barras** | Sí | No |
| **Se puede devolver** | Sí | No |
| **Tiene garantía** | A veces | A veces (escrita en contrato) |
| **Proveedor** | Distribuidor, fabricante | Freelancer, empresa de servicios |

Ambos son "compras" pero el sistema los trata diferente porque los servicios **no son inventario**. Van directo a gastos.

## Paso 1 — Ir a Servicios Recibidos

1. En el menú izquierdo, haga clic en **Multi-Tienda**.
2. Haga clic en **Servicios Recibidos**.
3. Verá una lista con los servicios anteriores y un botón **"+ Nuevo servicio"**.

## Paso 2 — Iniciar un nuevo registro de servicio

1. Haga clic en **"+ Nuevo servicio"**.
2. Se abre un formulario. Llene:

| Campo | Qué escribir |
|-------|--------------|
| **Proveedor*** | Elija de la lista (puede ser una persona o empresa). |
| **Tienda*** | La tienda que recibió el servicio. |
| **Fecha*** | Hoy (ya viene por defecto). |
| **Categoría del servicio*** | Limpieza, Mantenimiento, Reparación, Consultoría, Transporte, Otros. |
| **Descripción*** | Explique qué se hizo. Ej: *"Limpieza profunda del local, 4 horas"*. |
| **Monto*** | Cuánto se pagó. |
| **Moneda*** | CUP, USD, EUR, etc. |
| **Tasa de cambio** | Si no es CUP, escriba la tasa del día. |
| **Número de factura** | Si el proveedor dio factura, escriba el número. |
| **Forma de pago*** | Efectivo, Transferencia, Tarjeta. |

3. Haga clic en **"Continuar"**.

## Paso 3 — Detallar el servicio

En esta sección puede agregar más información:

1. **Fecha de ejecución**: cuándo se hizo el servicio (puede ser diferente a la fecha de pago).
2. **Duración**: cuántas horas o días tomó.
3. **Materiales usados**: si el proveedor usó materiales propios, escríbalos (opcional).
4. **Garantía**: si el servicio tiene garantía, escriba hasta cuándo.
5. **Fotos**: si tiene fotos del trabajo hecho (reparación, antes y después), súbalo (opcional).

## Paso 4 — Asignar a una cuenta contable (recomendado)

Para que el contador vea este gasto bien clasificado:

1. En el campo **"Cuenta contable"**, haga clic.
2. Aparece una lista de cuentas. Elija la que corresponde:
   - *Gastos operativos - Limpieza*
   - *Gastos operativos - Mantenimiento*
   - *Gastos operativos - Reparaciones*
   - *Servicios profesionales*
   - *Transporte y flete*
3. Si no sabe cuál elegir, deje "Sin clasificar" y el contador lo arreglará después.

## Paso 5 — Adjuntar la factura (muy recomendado)

1. En la sección **"Documentos"**, haga clic en **"+ Subir archivo"**.
2. Seleccione la factura escaneada o foto de la factura del proveedor.
3. Formatos válidos: PDF, JPG, PNG.
4. El archivo queda adjunto al registro para siempre.

> ⚠️ **Importante**: Sin factura adjunta, el gasto puede ser rechazado por el contador o por la auditoría fiscal. Siempre pida factura al proveedor del servicio.

## Paso 6 — Verificar los totales

Abajo del formulario verá:

- **Subtotal**: el monto antes de impuestos.
- **Impuestos**: si la factura tiene IVA.
- **Total a pagar**: lo que efectivamente se paga.

Verifique que coincida con la factura del proveedor.

## Paso 7 — Guardar y confirmar

1. Revise todo el formulario.
2. Haga clic en **"Guardar borrador"** si quiere revisar después.
3. O haga clic en **"Confirmar servicio"** si todo está correcto.
4. Aparece un mensaje: *"Servicio registrado correctamente"*.
5. Aparece un botón **"Descargar PDF"**. Descargue el comprobante.

## Paso 8 — Verificar en los reportes

1. Vaya a **Multi-Tienda → Generador de Reportes**.
2. Elija el tipo **"Gastos Diarios"**.
3. Filtre por la fecha del servicio.
4. Genere el reporte.
5. El servicio debe aparecer en la lista de gastos.

---

## Preguntas frecuentes

**¿Un servicio se puede anular?**
- Sí, dentro de las 24 horas siguientes.
- Después, requiere autorización del administrador.
- La anulación deja rastro en la auditoría.

**¿Cómo diferencio un servicio recurrente de uno puntual?**
- En la descripción, indíquelo claramente. Ej: *"Limpieza mensual de marzo"* vs *"Reparación de aire acondicionado"*.
- Para servicios recurrentes, puede configurar un **recordatorio** en el sistema (Configuración → Tareas programadas).

**¿Puedo pagar un servicio en cuotas?**
- Sí, pero tiene que registrar cada cuota como un servicio separado.
- Por ejemplo: 3 cuotas mensuales = 3 registros de servicio.
- En cada uno, escriba en la descripción: *"Cuota 1 de 3 del servicio X"*.

**¿El servicio afecta la caja?**
- Sí, si lo pagó en efectivo. El monto sale de la caja igual que una compra.
- Si lo pagó por transferencia, no afecta la caja pero sí la contabilidad.

**¿Puedo asociar un servicio a un cliente?**
- No normalmente. Los servicios se asocian a la tienda, no a clientes.
- Si es un servicio que un cliente pagó (ej: instalación en casa del cliente), puede registrarlo como una venta especial en lugar de un servicio recibido.

**¿Los servicios aparecen en el reporte de ganancias?**
- Sí, como gastos. Restan de la ganancia neta.
- Por eso es importante registrarlos: si no los registra, su reporte de ganancias será inflado y pagará más impuestos.

**¿Qué hago si el proveedor no da factura?**
- Pídasela siempre. Sin factura, no puede deducir el gasto en impuestos.
- Si el proveedor es informal y no tiene factura, regístrelo igual pero deje constancia en las notas.
- Considere cambiar a un proveedor que sí facture.
