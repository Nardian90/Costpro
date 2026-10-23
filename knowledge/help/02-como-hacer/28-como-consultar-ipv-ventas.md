# Cómo Hacer: Consultar el IPV — Ingresos por Ventas

> **Necesita esto cuando**: necesita conciliar, por producto, las existencias iniciales y finales del período con los movimientos (ventas, vales, entradas, devoluciones, ajustes y transferencias) y conocer el importe vendido.

## ¿Para qué sirve?

**IPV — Ingresos por Ventas** es un **informe de solo lectura** que reconstruye, producto por producto, la conciliación de inventario e ingresos de un período: existencia inicial, movimientos clasificados, existencia final e importe vendido. Todo se calcula desde el registro de movimientos de stock (Kardex) y las líneas de venta.

> ⚠️ **En CostPro hay más de una cosa llamada «IPV»**:
> - Esta vista activa: **IPV — Ingresos por Ventas** (OPERACIÓN → Ventas) — el informe que documenta esta guía.
> - Un módulo **IPV** en la sección **EN DESARROLLO** (solo administradores): banco de trabajo experimental de conciliación bancaria. Vea «¿Qué es el IPV?» para ese módulo.
> - El nombre histórico **«Tabla IPV»** de la Tabla de Venta, que viene de este informe y no implica precios indexados.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Ventas** → **IPV — Ingresos por Ventas**.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «ipv», «ingresos por ventas», «existencias» o «conciliación de inventario».

## Antes de comenzar

- Roles con acceso: admin, manager, encargado y clerk (igual que el Reporte Entrega).
- El informe es **por tienda**: elija la tienda en el filtro. No existe modo consolidado multitienda.
- El informe **no se calcula solo**: configurar fechas no consulta nada hasta que pulse **Generar informe**.
- Los importes usan la **tasa histórica de cada venta** (CUP contable); el USD es informativo y nunca se suma con el CUP.

## Cómo generar el informe

1. Vaya a **OPERACIÓN → Ventas → IPV — Ingresos por Ventas**.
2. Elija **Tienda**, **Fecha inicial** y **Fecha final** (por defecto hoy). Los períodos rápidos rellenan las fechas: Hoy, Ayer, Últimos 7 días, Últimos 30 días, Mes actual, Mes anterior.
3. Pulse **Generar informe** (después pasa a llamarse **Actualizar informe**). El período no puede exceder **366 días**.
4. Revise el badge de estado: **Sin calcular** → **Al día**; si cambia tienda o fechas tras generar, pasará a **Resultados anteriores** con el aviso «Configuración modificada — estos resultados corresponden a … → …». Pulse **Actualizar informe** para recalcular.
5. Use **Buscar producto** (código o descripción) para acotar la tabla; el filtro también se aplica al PDF y al Excel.
6. Consulte las pestañas **Tabla IPV** y **Vista previa PDF**, y exporte con **Exportar PDF** / **Exportar Excel**.

## Qué significa cada columna

| Columna | De dónde sale |
|---------|---------------|
| **Código / Descripción** | SKU y nombre del producto (sin SKU, las primeras 8 posiciones del identificador). |
| **Existencia inicial** | Suma de todos los movimientos de stock anteriores a la fecha inicial. Si el producto no tiene ningún movimiento registrado, muestra **N/D** (no reconstruible), no cero. |
| **Cantidades vendidas** | Salidas por venta (incluye sus reversiones, que netean). |
| **Vales salidas** | Salidas por vales de salida y consumos de producción (sus reversiones netean). Sí descuentan stock. |
| **Entradas** | Compras y sus reversiones, carga inicial y entradas de producción. |
| **Devoluciones** | Entradas por devoluciones de clientes y sus reversiones. Es una **columna propia de cantidades**: no resta de «Cantidades vendidas». |
| **Ajustes** | Ajustes de inventario y anulaciones. |
| **Transferencias** | Neto de transferencias (salidas −, entradas +). |
| **Existencia final** | Calculada: existencia inicial + entradas + devoluciones − vendidas − vales ± ajustes ± transferencias. |
| **Ventas en importe (CUP)** | Total cobrado de las líneas de venta completadas del período, con la tasa histórica de cada venta, **menos** los importes devueltos. |
| **Ventas USD** | Informativo: suma de lo cobrado en USD. Nunca se suma con el CUP. |

La fila **Totales** cierra la tabla con la suma de cada columna.

## Estados y resultados (incidencias de conciliación)

Si el sistema detecta saldos que no puede reconstruir por completo, muestra el panel **«Incidencias de conciliación»** agrupado por tipo:

| Incidencia | Qué significa | Qué hace el informe |
|------------|---------------|---------------------|
| **PRE_LEDGER** | El stock actual no tiene movimientos registrados (carga inicial previa al ledger): la existencia histórica no es reconstruible. | Muestra **N/D**. No inventa ceros. |
| **RECONCILIATION** | El total reconstruido del ledger difiere de la existencia canónica actual (saldo histórico incompleto). | **Reportado, no ajustado.** |
| **UNMAPPED_TYPE** | Un tipo de movimiento no mapeado entró al total de Ajustes. | Reportado. |
| **PRICE_ANOMALY** | Un importe histórico ambiguo (registro antiguo) no pudo interpretarse con seguridad. | Reportado. |
| **SALE_WITHOUT_LEDGER** | Venta con importe pero sin movimiento de stock. | El importe se muestra; la columna de cantidades no la incluye. |
| **DEVOLUTION_WITHOUT_LEDGER** | Devolución con importe pero sin movimiento de stock. | El importe se descuenta; la columna Devoluciones no puede reflejarla. |

> ℹ️ **Las incidencias son informativas.** El informe **nunca ajusta inventario ni oculta diferencias**: el banner dice «no se ajustaron valores» y el PDF/Excel lo repiten («Diferencias reportadas tal cual — no ajustadas»). Corregir un desbalance corresponde a un proceso de inventario (ajustes documentales o inventario físico), no a este informe.

## Restricciones importantes

- La exactitud de la **existencia inicial** depende de que el ledger esté completo desde antes del período: si hubo carga inicial sin movimientos, verá la limitación en Incidencias.
- El período máximo es de **366 días** y la fecha inicial no puede ser posterior a la final.
- Los productos sin movimientos ni saldos en el período se **excluyen** del informe.
- Los importes CUP usan la tasa de cada venta (tasa de línea, de la venta o 1); los descuentos reflejan la línea bruta cobrada.
- El informe es solo lectura: no crea movimientos, ajustes ni registros.

## Errores frecuentes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| «Selecciona una tienda.» | No hay tienda elegida. | Elija la tienda en el filtro. |
| «La fecha inicial no puede ser posterior a la final.» | Rango invertido. | Corrija las fechas; el botón permanece bloqueado mientras el rango sea inválido. |
| «El período no puede exceder 366 días.» | Rango demasiado amplio. | Divida la consulta en períodos menores. |
| «No se pudo generar el IPV.» | Error del servidor al consultar. | Reintente; si persiste, reduzca el período o avise a soporte. |
| Veo «N/D» en existencia inicial | El producto no tiene movimientos registrados (carga previa al ledger). | Revise la incidencia PRE_LEDGER del producto; el dato histórico no es reconstruible. |
| Aparece una incidencia RECONCILIATION | Diferencia entre ledger reconstruido y existencia actual. | Es informativa: el informe no ajusta. Si requiere corrección, hágalo por inventario físico o ajustes documentales. |
| El Excel/PDF no muestran el producto que busco | El filtro «Buscar producto» está activo. | Límpielo antes de exportar (el filtro se aplica a las exportaciones). |

## Preguntas frecuentes

**¿Las devoluciones restan de las ventas?**
En **cantidades**, no: tienen columna propia. En **importe**, sí: «Ventas en importe (CUP)» ya es bruta menos devoluciones; no se descuenta dos veces.

**¿Los vales de salida descuentan existencias?**
Sí: entran en la columna «Vales salidas» y restan en la existencia final. Un vale revertido netea a cero.

**¿Este informe ajusta el inventario?**
No. Es solo lectura y las diferencias se **reportan, no ajustan**. Para corregir stock use Ajustes Documentales o un Inventario Físico.

**¿Puedo ver varias tiendas juntas?**
No: el informe es por tienda. Genérelo tienda por tienda.

**¿Por qué la existencia final no coincide con el stock actual?**
La existencia final se calcula para el rango consultado; el stock actual incluye todo lo ocurrido después de la fecha final. Genere el informe hasta hoy para comparar.

**¿Qué incluye el Excel?**
Tres hojas: **IPV** (tabla completa con totales), **Incidencias** (con el detalle por producto) y **Nota metodológica** (fórmula de conciliación, fuentes y reglas de inclusión).

## Información relacionada

- **¿Qué es el IPV?** — el módulo experimental de conciliación bancaria (EN DESARROLLO; distinto de esta vista).
- **Catálogo de Ventas** — de dónde viene el nombre histórico «Tabla IPV».
- **Gestión del Inventario** — Kardex y trazabilidad de los movimientos que este informe clasifica.
- **Cómo hacer un inventario físico** — el proceso formal para corregir desbalances de stock.
- **Cómo emitir un vale de salida** — las salidas que aparecen en la columna «Vales salidas».
