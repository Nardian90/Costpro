# Cómo Hacer: Usar la Tasa de Cambio

> **Necesita esto cuando**: vende o compra en divisas (USD, EUR, MLC) y necesita que CostPro convierta correctamente a CUP, o cuando quiere analizar el comportamiento del tipo de cambio antes de fijar precios.

## ¿Para qué sirve?

CostPro tiene **dos piezas distintas** que no debe confundir:

1. **Tasas de la tienda** — las que **trabajan**: convierten precios y pagos en el punto de venta. Cada tienda define sus propias tasas USD, EUR y MLC.
2. **Inteligencia Cambiaria** — la que **informa**: un módulo analítico con la tasa oficial del Banco Central de Cuba (BCC) y fuentes informales, con histórico, variaciones e impacto en precios. **No modifica las tasas de su tienda**: es una referencia para decidir.

## ¿Dónde encontrarlo?

- **Tasas de la tienda**: dentro del POS, botón **Tasas** del carrito; y al iniciar el día de negocio, el sistema le pedirá confirmarlas.
- **Inteligencia Cambiaria**: Inicio → **ANÁLISIS** → **Inteligencia Cambiaria**.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «tasa», «cambio» o «divisa».

## Antes de comenzar

- Ver las tasas: cualquier usuario de la tienda. Editarlas: roles de gestión (admin/manager/encargado).
- Monedas operativas: **CUP, USD, EUR y MLC**. En filas de pago por Transferencia Exterior solo se usan USD/EUR.
- La Inteligencia Cambiaria necesita conexión a internet; las tasas de la tienda funcionan también en modo offline con el último valor confirmado.

## Cómo actualizar las tasas de su tienda

1. Abra el **POS** (OPERACIÓN → Ventas → Vender).
2. En el carrito, pulse el botón **Tasas**.
3. Edite los valores de USD, EUR y MLC respecto a CUP.
4. Guarde. Las nuevas tasas aplican a las operaciones que haga desde ese momento.

**Confirmación diaria**: al abrir el carrito cada **día de negocio**, el sistema le pregunta si las tasas vigentes siguen siendo válidas. Confírmelas o actualícelas antes de vender. Si cambia las tasas a mitad del día, el sistema vuelve a preguntar. Cada venta guarda la tasa con la que se cobró: cambiar la tasa no recalcula ventas anteriores.

## Cómo se usa la tasa al vender

- Cada producto del carrito puede tener su **moneda** y su **tasa** de conversión.
- En pagos por **Transferencia Exterior** (USD/EUR), el sistema convierte el monto automáticamente a CUP con la tasa correspondiente.
- Si un cobro combina monedas o paga de más/de menos, el checkout lo marca como **incidencia de pago** antes de confirmar.

## Cómo aprovechar la Inteligencia Cambiaria

1. Vaya a **ANÁLISIS → Inteligencia Cambiaria**.
2. Navegue por sus pestañas:
   - **Dashboard**: panorama actual de la tasa.
   - **Histórico**: evolución de la tasa en 7, 30 o 90 días.
   - **Variaciones**: cuánto y cómo cambió la tasa.
   - **Impacto Precios / Mi Producto**: cómo afecta a su catálogo.
   - **Alertas**: avisos informativos de cambios significativos.
   - **Simulador**: estime efectos de escenarios de tasa.
3. (Solo administrador) En **Configuración** puede cargar tasas masivamente desde Excel y actualizar la base de datos oficial con el histórico de la BCC.

**Uso recomendado**: consulte la Inteligencia Cambiaria en la mañana, decida la tasa del día con su equipo y fíjela en **Tasas** del POS. Ese es el único mecanismo por el que una tasa entra en las ventas.

## Restricciones importantes

- La Inteligencia Cambiaria **no aplica** tasas automáticas a la tienda: es informativa.
- Las tasas de tienda son **por tienda**, no globales: cada tienda confirma la suya.
- Las operaciones quedan con la **tasa del momento** de la venta; el sistema no recalcula el pasado.
- No existe "congelar tasa" ni "aplicar tasa recomendada": la tasa se edita y confirma manualmente.

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Me pide confirmar las tasas cada día | Es el flujo esperado del día de negocio. | Confirme o edite y continúe; tomará un segundo. |
| Un cobro en USD no suma lo esperado en CUP | La tasa del ítem quedó con un valor viejo. | Revise la tasa del ítem en el carrito o actualice las tasas de tienda. |
| No puedo editar tasas | Su rol no es de gestión. | Pida a un admin/manager/encargado que las actualice. |
| La tasa oficial no se actualiza | Falta conexión o la actualización de la BCC no se ha ejecutado. | Un administrador puede actualizar la base desde la pestaña Configuración. |

## Preguntas frecuentes

**¿CostPro toma la tasa oficial automáticamente para vender?**
No. La oficial está en la Inteligencia Cambiaria como referencia. La que vale para ventas es la **tasa de su tienda**, confirmada manualmente.

**¿Puedo tener una tasa distinta por producto?**
Sí: cada ítem del carrito admite moneda y tasa propias, además de la tasa general de la tienda.

**¿Qué pasa si vendo con una tasa equivocada?**
La venta queda registrada con esa tasa. Corrija la tasa de tienda para las siguientes ventas; para corregir la venta ya registrada, use la reversión administrativa desde el Historial de Ventas si su rol lo permite.

**¿Qué fuentes usa la Inteligencia Cambiaria?**
La tasa oficial del BCC y referencias informales publicadas, con su histórico. En Configuración (admin) se alimenta la base de datos oficial.

## Información relacionada

- **Métodos de pago y monedas del POS** — cómo se combinan efectivo, transferencias y divisas.
- **Cómo hacer una venta (tutorial)** — el flujo completo del POS.
- **Inteligencia Cambiaria** (ANÁLISIS) — histórico y simulador de tasas.
