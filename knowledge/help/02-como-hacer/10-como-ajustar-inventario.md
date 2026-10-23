# Cómo Hacer: Ajustar el Inventario

> **Necesita esto cuando**: el stock del sistema no coincide con el stock real — por un conteo, un producto dañado, un error de registro o una venta omitida — y necesita corregir las cantidades dejando constancia documentada del motivo.

## ¿Para qué sirve?

CostPro ofrece **dos mecanismos de ajuste**, y elegir el correcto evita errores:

1. **Ajustes Documentales** (OPERACIÓN → Almacén → Ajustes Documentales): un documento formal que corrige **varios productos a la vez**, comparando stock esperado vs. contado. Es el mecanismo que usa el **Inventario Físico** para volcar sus resultados.
2. **Ajuste rápido por producto** (desde la pestaña Stock Actual del Inventario): corrige **un solo producto** sumando o restando unidades al momento.

Ambos dejan rastro en el Kardex y en la auditoría. Ninguno se puede "borrar": se anulan o revierten.

## ¿Dónde encontrarlo?

- **Ajustes Documentales**: Inicio → **OPERACIÓN** → **Almacén** → **Ajustes Documentales**.
- **Ajuste rápido**: **OPERACIÓN → Almacén → Inventario** → pestaña **Stock Actual** → botón de ajuste del producto.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «ajuste» o «merma».

## Antes de comenzar

- Necesita rol admin, manager o encargado en la tienda.
- Tenga a mano el conteo físico o la evidencia de la diferencia.
- El motivo es **obligatorio** en ambos mecanismos.
- Las cantidades nunca quedan negativas: el mínimo es 0.

## Cómo crear un Ajuste Documental

1. Vaya a **OPERACIÓN → Almacén → Ajustes Documentales**.
2. Cree el documento y agregue los productos a corregir.
3. Para cada producto verá tres columnas: **Esperado** (el stock del sistema), **Contado** (el que usted ingresa) y **Diferencia** (calculada automáticamente, en rojo si resta y en verde si suma). Ingrese la **cantidad contada**, no la diferencia.
4. Escriba el **motivo** obligatorio del ajuste.
5. Revise los totales del documento (unidades y valor).
6. El documento se crea **En Proceso** (pendiente). Revíselo y aplíquelo:
   - **Confirmar y Aplicar**: el stock se corrige y el movimiento queda en el Kardex.
   - **Anular**: retira el documento sin efecto en stock.
7. Si un documento confirmado estuvo mal, puede **Revertir** (devuelve el stock al estado anterior) o **Duplicar** (crea uno nuevo con las mismas líneas).

### Motivos documentales

El sistema clasifica el motivo en 4 categorías oficiales, que también usa el Inventario Físico al volcar sus diferencias:

| Motivo | Cuándo usarlo |
|--------|--------------|
| **Faltante de conteo** (shrinkage) | El conteo dio menos que el sistema. |
| **Sobrante de conteo** (surplus) | El conteo dio más que el sistema. |
| **Producto dañado** | Mercancía averiada, vencida o inservible. |
| **Otro** | Cualquier otro caso; explíquelo en el motivo libre. |

## Cómo hacer un ajuste rápido de un producto

1. Vaya a **Inventario → Stock Actual** y busque el producto.
2. Abra el ajuste del producto y registre el cambio de unidades (± delta).
3. Si lo necesita, ajuste también el **costo unitario** para revalorizar el stock.
4. Elija el motivo entre las opciones rápidas: **Merma**, **Error de conteo**, **Venta omitida** o **Ajuste manual**.
5. Confirme la **fecha de operación** (por defecto hoy o su fecha de trabajo) y aplique.

El ajuste rápido es ideal para correcciones puntuales de una unidad o un paquete. Para conteos grandes o de toda la tienda, use Ajustes Documentales o el **Inventario Físico**.

## Estados y resultados

| Estado (documento) | Qué significa |
|--------------------|---------------|
| **En Proceso** | Creado pero no aplicado: no toca el stock. |
| **Confirmado** | Aplicado: el stock quedó corregido y el Kardex registra el movimiento. |
| **Revertido** | Un confirmado que se deshizo: el stock volvió a su valor previo. |
| **Anulado** | Retirado sin efecto. |

Los ajustes generados por el Inventario Físico llevan el badge **IF-…** del conteo que los originó.

## Restricciones importantes

- El motivo es obligatorio; sin motivo no se guarda.
- No hay cantidades negativas: si el sistema dice 3 y el conteo da 0, contado es 0 (diferencia −3).
- Un Ajuste Documental confirmado no se edita: se revierte o se duplica y se corrige.
- No existe autorización por umbral de unidades o importe: quien tiene el rol, puede ajustar; la auditoría registra quién y cuándo.
- Los ajustes afectan la **valorización del inventario** y aparecen en el reporte **Gastos/Costos por Día** cuando implican pérdidas.

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Ingresé la diferencia en lugar del contado | Confusión de columnas. | En Ajustes Documentales se ingresa la cantidad **contada total**; la diferencia la calcula el sistema. En el ajuste rápido sí se registra el delta (± unidades a corregir). |
| El stock quedó negativo | Intento de ajuste inválido. | El mínimo es 0; verifique el valor ingresado. |
| No veo el botón Confirmar | El documento está En Proceso y falta su acción, o su rol no lo permite. | Pida a admin/manager/encargado que confirme. |
| El ajuste no aparece en el Kardex | El documento sigue En Proceso. | Confírmelo para que genere movimiento. |

## Preguntas frecuentes

**¿Cuál es la diferencia con el Inventario Físico?**
El Inventario Físico (OPERACIÓN → Almacén → Inventario Físico) es el proceso formal de contar toda la tienda (o una categoría) con corte de inventario, hoja de conteo y conciliación. Al finalizar, genera automáticamente los Ajustes Documentales de faltantes y sobrantes. El ajuste manual es para correcciones sueltas entre conteos.

**¿Puedo transferir stock entre dos productos con un ajuste?**
No existe la "reclasificación" entre SKUs. Si un producto estaba mal registrado, ajuste ambos productos por separado con motivo "Otro" y explique.

**¿El ajuste corrige el costo del producto?**
El ajuste rápido le permite revalorizar el costo unitario. Los Ajustes Documentales corrigen cantidades y su valor se calcula al costo vigente.

**¿Quién puede ajustar?**
Admin, manager y encargado de la tienda. El rol warehouse ve el inventario pero el flujo de ajuste documental está reservado a la gestión.

## Información relacionada

- **Causas y motivos de ajuste** — referencia rápida de motivos válidos.
- **Cómo hacer un Inventario Físico** — el conteo formal que genera ajustes automáticos.
- **Cómo transferir stock entre tiendas** — si la diferencia es mercancía en tránsito entre tiendas.
- **Kardex y trazabilidad** — dónde quedan los movimientos del ajuste.
