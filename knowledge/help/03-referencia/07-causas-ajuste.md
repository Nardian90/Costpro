# Referencia: Motivos de Ajuste de Inventario

> **Use esta referencia** cuando vaya a hacer un ajuste de inventario y no sepa qué motivo registrar.

## Motivos documentales (Ajustes Documentales e Inventario Físico)

Los ajustes documentales —incluidos los que genera automáticamente el **Inventario Físico**— se clasifican en **4 motivos oficiales**:

| Motivo | Cuándo usarlo | Ejemplo |
|--------|--------------|---------|
| **Faltante de conteo** (shrinkage) | El conteo dio **menos** que el stock del sistema. | El sistema dice 50 y el conteo físico da 47. |
| **Sobrante de conteo** (surplus) | El conteo dio **más** que el stock del sistema. | El sistema dice 30 y el conteo físico da 33. |
| **Producto dañado** | Mercancía averiada, vencida o inservible que hay que retirar. | Una botella se rompió; un paquete de harina llegó mojado. |
| **Otro** | Cualquier caso no cubierto; se acompaña de un motivo en texto libre. | Error de digitación al recibir; consumo interno autorizado. |

Al crear un Ajuste Documental, usted escribe el motivo en texto libre (obligatorio) y el sistema lo clasifica en una de esas 4 categorías.

## Motivos del ajuste rápido (por producto)

El **ajuste rápido** desde la pestaña Stock Actual del Inventario ofrece estas opciones:

| Motivo | Cuándo usarlo |
|--------|--------------|
| **Merma** | El producto se dañó, venció o se perdió. |
| **Error de conteo** | Se registró mal una cantidad y se corrige al valor real. |
| **Venta omitida** | Salió mercancía sin registrarse la venta; se descuenta del stock. |
| **Ajuste manual** | Cualquier otra corrección autorizada por la gestión. |

## Reglas comunes a todos los ajustes

- El **motivo es obligatorio** siempre: no hay ajuste sin justificación.
- Los ajustes **no se editan ni se borran**: los documentos se anulan o revierten, y todo queda en la auditoría y en el Kardex.
- No hay autorización por umbral de unidades o importe: el control es por **rol** (admin, manager o encargado) y por **auditoría** posterior.
- Las devoluciones de clientes **no** se registran como ajuste: usan el módulo de **Devoluciones** (OPERACIÓN → Ventas → Opciones → Devoluciones), que repone el stock con su propio documento NC.
- Los errores de recepción se previenen al recibir; si la recepción ya se confirmó con error, corrija con un ajuste documental con motivo «Otro» y detalle en el texto.

## Preguntas frecuentes

**¿Existen los motivos "Robo confirmado" o "Reclasificación"?**
No. Para un faltante sospechoso use «Faltante de conteo» y explique el caso en el motivo libre; la auditoría registrará quién hizo el ajuste. Para separar un producto en otro SKU, ajuste ambos productos por separado con «Otro».

**¿Qué motivo uso si el conteo del Inventario Físico dio faltante?**
Ninguno manual: al conciliar el inventario físico, el sistema genera los ajustes de faltante y sobrante automáticamente, enlazados al conteo (badge IF-…).

**¿Dónde veo quién hizo un ajuste?**
En el historial del documento y en la Auditoría (visible para admin), junto con la fecha y el motivo.

## Información relacionada

- **Cómo ajustar el inventario** — guía paso a paso de ambos mecanismos.
- **Cómo hacer un Inventario Físico** — el conteo formal que genera ajustes automáticos.
- **Cómo procesar una devolución** — reposición de stock por devolución de cliente.
