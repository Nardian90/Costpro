# Tutorial: Flujo Completo de Punto de Venta

Este tutorial guía paso a paso por el ciclo completo de una venta en CostPro, desde el acceso al terminal hasta el cierre de caja. Cubre todas las funcionalidades del módulo POS para que puedas procesar ventas de forma eficiente y precisa.

## Contenido

- [1. Acceder al Terminal de Venta](#1-acceder-al-terminal-de-venta)
- [2. Selección de Tienda](#2-selección-de-tienda)
- [3. Agregar Productos al Carrito](#3-agregar-productos-al-carrito)
  - [3.1 Búsqueda por Nombre o SKU](#31-búsqueda-por-nombre-o-sku)
  - [3.2 Escaneo de Código de Barras](#32-escaneo-de-código-de-barras)
  - [3.3 Catálogo Visual](#33-catálogo-visual)
- [4. Ajustar Cantidades](#4-ajustar-cantidades)
- [5. Revisión del Carrito](#5-revisión-del-carrito)
  - [Acciones disponibles en el carrito](#acciones-disponibles-en-el-carrito)
- [6. Procesar el Pago](#6-procesar-el-pago)
  - [6.1 Seleccionar el Método de Pago](#61-seleccionar-el-método-de-pago)
  - [6.2 Ingresar el Monto (Efectivo)](#62-ingresar-el-monto-efectivo)
  - [6.3 Pago Mixto](#63-pago-mixto)
  - [6.4 Confirmar la Transacción](#64-confirmar-la-transacción)
- [7. Post-Venta: Qué Sucede Automáticamente](#7-post-venta-qué-sucede-automáticamente)
  - [7.1 Generación de Comprobante](#71-generación-de-comprobante)
  - [7.2 Actualización Automática de Inventario](#72-actualización-automática-de-inventario)
  - [7.3 Registro en el Historial](#73-registro-en-el-historial)
- [8. Consultar el Historial de Ventas](#8-consultar-el-historial-de-ventas)
  - [Información disponible en el detalle](#información-disponible-en-el-detalle)
- [9. Cierre de Caja (Arqueo de Caja)](#9-cierre-de-caja-arqueo-de-caja)
- [10. Tabla Comparativa: Métodos de Pago](#10-tabla-comparativa-métodos-de-pago)
- [11. Resumen del Flujo Completo](#11-resumen-del-flujo-completo)

---

## 1. Acceder al Terminal de Venta

El punto de venta se encuentra dentro del módulo de gestión multi-tienda:

1. Abre el **menú lateral** de navegación
2. Despliega la sección **MULTI-TIENDA**
3. Selecciona **Punto de Venta**
4. Haz clic en **Terminal de Venta**

> 💡 **Tip**: Si necesitas cambiar de tienda rápidamente, utiliza el **selector de tienda** en la barra superior antes de iniciar la venta. Todas las transacciones quedarán registradas bajo la tienda seleccionada.

---

## 2. Selección de Tienda

Antes de procesar cualquier venta, verifica que estás operando en la tienda correcta:

- Revisa el **selector de tienda** ubicado en la **barra superior** de la interfaz
- Haz clic sobre él para desplegar el listado de tiendas disponibles
- Selecciona la tienda en la que estás operando físicamente

```
Barra Superior:  [ 🏪 Tienda Principal ▾ ]    [ 👤 Usuario ]    [ 🔔 ]
```

> ⚠️ **Importante**: Las ventas se registran contra el inventario de la tienda seleccionada. Un error en la selección de tienda afectará los niveles de stock de la ubicación incorrecta.

---

## 3. Agregar Productos al Carrito

CostPro ofrece **tres métodos** para agregar productos al carrito de venta:

### 3.1 Búsqueda por Nombre o SKU

Escribe directamente en la **barra de búsqueda** del terminal:

- **Por nombre**: escribe el nombre del producto (acepta búsqueda parcial)
- **Por SKU o código**: escribe el código interno del producto
- Los resultados se filtran en tiempo real mientras escribes

### 3.2 Escaneo de Código de Barras

Conecta un **lector de código de barras externo** (USB o Bluetooth) y escanea el producto:

- El sistema detecta automáticamente el código y agrega el producto al carrito
- No es necesario que el campo de búsqueda esté activo — el scanner envía el código como texto y el sistema lo procesa
- Compatible con códigos EAN-13, UPC-A, Code 128 y otros formatos estándar

### 3.3 Catálogo Visual

Navega por el catálogo visual de productos:

1. Haz clic en el ícono de **catálogo** o despliega el panel lateral de productos
2. Filtra por **categoría** para encontrar productos más rápido
3. Haz clic directamente sobre el producto deseado para agregarlo al carrito

### 3.4 Variantes de Producto

Algunos productos se registran en el sistema con **múltiples formatos de presentación** (unidad, paquete, caja, etc.), cada uno con su propia cantidad y precio. Estos se conocen como **variantes de producto**.

Cuando agregas un producto que tiene variantes al carrito, el sistema despliega un **modal de selección de formato** donde puedes elegir la presentación deseada:

- **Unidad**: presentación individual del producto
- **Paquete**: agrupación de varias unidades (ej. 6 unidades)
- **Caja**: agrupación mayor (ej. 24 unidades)

El sistema utiliza **factores de conversión** para ajustar automáticamente el stock. Por ejemplo, si vendes 1 caja de un producto cuyo factor de conversión es 24, el stock se reducirá en 24 unidades base.

> 💡 **Tip**: Combina métodos para máxima velocidad. Usa el scanner para productos frecuentes y la búsqueda por nombre para productos nuevos o poco comunes.

---

## 4. Ajustar Cantidades

Una vez que un producto está en el carrito, puedes modificar su cantidad de varias formas:

| Método | Cómo usarlo |
|--------|-------------|
| **Botones +/-** | Haz clic en `+` para incrementar o `-` para reducir la cantidad |
| **Entrada directa** | Haz clic sobre el número de cantidad y escribe el valor deseado |
| **Escaneo repetido** | Escanea el mismo código de barras varias veces para incrementar la cantidad en 1 |

El carrito se **actualiza en tiempo real** recalculando subtotales, totales y conteo de artículos.

---

## 5. Revisión del Carrito

Antes de procesar el pago, revisa el resumen del carrito:

- **Lista de productos**: nombre, precio unitario, cantidad y subtotal por línea
- **Conteo de artículos**: número total de unidades en el carrito
- **Subtotal**: suma de todos los subtotales antes de impuestos
- **Total**: monto final a cobrar (incluye impuestos aplicables)

### Acciones disponibles en el carrito

- **Eliminar producto**: haz clic en el ícono de eliminación junto al producto
- **Vaciar carrito**: usa la opción "Vaciar" para eliminar todos los productos
- **Poner en espera**: guarda la venta temporalmente para retomarla después

### Descuentos por Ítem

Además del descuento global aplicable a toda la venta, CostPro permite aplicar **descuentos individuales por cada línea de producto** en el carrito. Esta funcionalidad es útil cuando necesitas ofrecer un descuento en un artículo específico sin afectar el resto de la compra.

Para aplicar un descuento por ítem:

1. Haz clic en el ícono de **descuento** junto a la línea del producto deseado
2. Selecciona el tipo de descuento:
   - **Monto fijo**: ingresa una cantidad específica a descontar (ej. $50.00)
   - **Porcentaje**: ingresa el porcentaje de descuento (ej. 10%)
3. El sistema recalcula automáticamente el subtotal de esa línea y el total general de la venta

Los descuentos por ítem se reflejan individualmente en el comprobante de venta, permitiendo una auditoría clara de cada modificación de precio.

---

## 6. Procesar el Pago

Una vez que el carrito está completo, procede al cobro:

### 6.1 Seleccionar el Método de Pago

Haz clic en el botón **"Cobrar"** o **"Procesar Pago"** y selecciona el método:

| Método | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| **Efectivo** | Pago en billetes y monedas | Ventas en mostrador con efectivo |
| **Tarjeta** | Pago con tarjeta de crédito o débito | Clientes que pagan con tarjeta |
| **Transferencia** | Pago por transferencia bancaria | Ventas a cuentas corrientes o facturas |
| **Billetera Digital** | Pago mediante aplicaciones móviles (Yape, Plin, etc.) | Clientes que prefieren pagos digitales instantáneos |
| **Mixto** | Combinación de dos o más métodos de pago | Cuando el cliente desea pagar con varios medios |
| **Otro** | Método de pago no clasificado en las opciones anteriores | Pagos con vales, bonos, créditos internos u otros |

### 6.2 Ingresar el Monto (Efectivo)

Si seleccionas **efectivo**:

1. Ingresa el **monto recibido** del cliente
2. El sistema calcula automáticamente el **cambio** a devolver
3. Verifica que el monto ingresado sea suficiente para cubrir el total

```
Total a pagar:    $ 1,250.00
Monto recibido:   $ 1,500.00
───────────────────────────
Cambio:           $   250.00
```

### 6.3 Pago Mixto

Si seleccionas **mixto**:

1. Ingresa el **monto en efectivo** que entrega el cliente
2. El sistema calcula la **diferencia** que se cubrirá con tarjeta
3. Confirma ambos montos antes de procesar

### 6.4 Confirmar la Transacción

Revisa los datos y haz clic en **"Confirmar"** para finalizar la venta.

> ⚠️ **Importante**: Una vez confirmada la transacción, no se puede modificar. Si necesitas revertirla, debes generar una **nota de crédito** o realizar un ajuste de inventario por separado.

#### Auditoría de Precio Bajo Costo

Si al momento de confirmar la venta alguno de los productos del carrito tiene un **precio de venta inferior a su costo de adquisición**, el sistema activa una alerta de **auditoría de precio bajo costo**. Este mecanismo de seguridad previene ventas con margen negativo que puedan pasar desapercibidas.

Cuando se detecta esta condición:

1. Se despliega un **modal de advertencia** que lista los productos con precio debajo de costo
2. Para cada producto se muestra:
   - Precio de venta actual
   - Costo base del producto
   - Diferencia (pérdida) por unidad vendida
   - Impacto total en la transacción
3. El operador debe **confirmar explícitamente** la venta a precio bajo costo para continuar
4. El evento queda registrado en el **log de auditoría** con el usuario, fecha y motivo

> ⚠️ **Importante**: Esta alerta no bloquea la venta, pero requiere confirmación manual. Las ventas recurrentes bajo costo pueden indicar errores en la configuración de precios o requiren autorización gerencial según las políticas de tu negocio.

---

## 7. Post-Venta: Qué Sucede Automáticamente

Al confirmar una venta, CostPro ejecuta automáticamente tres procesos:

### 7.1 Generación de Comprobante

Se genera un **comprobante de venta** con:

- Número de transacción único
- Fecha y hora de la venta
- Detalle de productos vendidos
- Método de pago utilizado
- Montos y cambio (si aplica)

Puedes **imprimir** el comprobante o **enviarlo por correo electrónico** según la configuración.

#### Código QR de Verificación

Cada comprobante de venta generado incluye un **código QR único** que permite la verificación rápida y segura de la transacción. Al escanear este código:

- Se accede al resumen digital de la venta
- Se valida la autenticidad del comprobante
- Se muestran los datos clave: número de transacción, fecha, monto total y productos

Esto facilita la conciliación y evita la falsificación de comprobantes, tanto para el negocio como para los clientes.

### 7.2 Actualización Automática de Inventario

El stock de cada producto vendido se **reduce automáticamente** en la tienda donde se procesó la venta:

- El sistema descuenta la cantidad vendida del stock disponible
- Si un producto llega a su **stock mínimo**, se genera una alerta de reabastecimiento
- El movimiento queda registrado en el historial de trazabilidad de stock

### 7.3 Registro en el Historial

La transacción se almacena en el **Historial de Ventas** con todos sus detalles, incluyendo:

- Productos vendidos y cantidades
- Montos por método de pago
- Tienda y operador que procesó la venta
- Marca temporal exacta

---

## 8. Consultar el Historial de Ventas

Para revisar las ventas realizadas:

1. Navega a **MULTI-TIENDA > Punto de Venta > Historial de Ventas**
2. Utiliza los **filtros** para encontrar transacciones específicas:
   - **Por fecha**: selecciona un rango de fechas
   - **Por tienda**: filtra por la tienda de origen
   - **Por método de pago**: efectivo, tarjeta, transferencia, billetera digital, mixto u otro
   - **Por número de transacción**: busca una venta específica
3. Haz clic en cualquier venta para ver el **detalle completo**

### Información disponible en el detalle

- Lista de productos con cantidades y precios
- Desglose de pagos por método
- Información del operador
- Opciones para reimprimir comprobante o generar nota de crédito

### Anular una Transacción

Si necesitas cancelar o anular una venta ya procesada, el Historial de Ventas ofrece la opción de **anulación de transacción**:

1. Selecciona la venta que deseas anular desde el listado
2. Haz clic en **"Anular Venta"** (solo disponible para ventas del día en curso)
3. El sistema solicita un **motivo de anulación** (campo obligatorio)
4. Confirma la anulación

Al anular una transacción:

- El stock de los productos vendidos se **restaura automáticamente** en la tienda correspondiente
- Se genera un registro de anulación en el log de auditoría con el usuario y el motivo
- El comprobante original queda marcado como **anulado** y se genera un comprobante de anulación complementario
- Las ventas ya cerradas en un arqueo de caja no pueden anularse desde esta vista

### Cálculo de Impuestos (Modal de Desglose)

Desde el detalle de cualquier venta, puedes acceder al **modal de cálculo de impuestos** que muestra el desglose tributario completo:

- **Base imponible**: monto sujeto a impuestos antes de aplicar las tasas
- **IGV / Impuesto al valor agregado**: monto calculado según la tasa configurada
- **Otros impuestos aplicables**: tasas adicionales según la jurisdicción o tipo de producto
- **Total con impuestos**: suma final

Este desglose es especialmente útil para la elaboración de reportes fiscales y la conciliación con los sistemas contables.

### Exportar Historial de Ventas

El Historial de Ventas permite **exportar los registros** a formatos externos para su análisis o archivo:

1. Aplica los filtros deseados (fecha, tienda, método de pago, etc.)
2. Haz clic en el botón de **"Exportar"**
3. Selecciona el formato de salida:
   - **Excel (.xlsx)**: para análisis en hojas de cálculo y reportes personalizados
   - **PDF**: para archivo impreso o envío por correo electrónico
   - **CSV**: para integración con sistemas externos o herramientas de Business Intelligence

La exportación respeta los filtros activos, por lo que puedes generar reportes parciales (solo una tienda, solo un día, solo un método de pago, etc.) o reportes completos del período seleccionado.

> 💡 **Tip**: Exporta el historial de ventas periódicamente para mantener respaldos externos y facilitar las conciliaciones contables mensuales.

---

## 9. Cierre de Caja (Arqueo de Caja)

Al finalizar el turno o el día de operación, realiza el **cierre de caja** para conciliar los movimientos:

1. Navega a **MULTI-TIENDA > Punto de Venta > Arqueo de Caja**
2. El sistema muestra un resumen de:
   - **Ventas por método de pago**: total en efectivo, tarjeta, mixto y transferencia
   - **Fondo inicial de caja**: monto con el que se inició el turno
   - **Total esperado en caja**: fondo inicial + ventas en efectivo
3. Ingresa el **monto real en caja** que tienes físicamente
4. El sistema calcula la **diferencia** entre lo esperado y lo real:

```
Fondo inicial:          $ 5,000.00
+ Ventas en efectivo:   $ 12,350.00
= Total esperado:       $ 17,350.00
- Monto real en caja:   $ 17,340.00
───────────────────────────────────
Diferencia:             $     10.00  (sobrante / faltante)
```

5. Si hay diferencia, agrega un **comentario explicativo**
6. Confirma el cierre de caja

> ⚠️ **Importante**: Una vez cerrada la caja, no se pueden registrar nuevas ventas bajo ese turno. Asegúrate de haber procesado todas las ventas pendientes antes de cerrar.

---

## 10. Tabla Comparativa: Métodos de Pago

| Característica | Efectivo | Tarjeta | Transferencia | Billetera Digital | Mixto | Otro |
|---------------|----------|---------|---------------|-------------------|-------|------|
| **Cambio** | Sí (calculado automáticamente) | No aplica | No aplica | No aplica | Parcial (solo efectivo) | No aplica |
| **Desglose** | Monto recibido vs. cambio | Monto cargado | Referencia bancaria | Nro. de operación / voucher | Montos por cada medio | Descripción libre |
| **Conciliación** | Arqueo de caja físico | Liquidación bancaria | Conciliación bancaria | Estado de aplicación | Ambos métodos involucrados | Registro manual |
| **Velocidad** | Rápido | Rápido | Requiere confirmación | Inmediato | Requiere dos o más pasos | Variable |
| **Ideal para** | Ventas menores y mostrador | Clientes con tarjeta | Cuentas corrientes | Pagos digitales instantáneos | Pagos parciales | Vales, bonos, créditos internos |
| **Requiere dato extra** | Monto recibido | Número de aprobación | Nro. de referencia | Nro. de operación | Montos por cada medio | Descripción del medio |

---

## 11. Resumen del Flujo Completo

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Seleccionar  │────▶│   Agregar     │────▶│   Ajustar    │────▶│   Revisar    │
│   Tienda      │     │  Productos    │     │  Cantidades  │     │   Carrito    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                                                                    │
┌─────────────┐     ┌──────────────┐     ┌─────────────┐           ▼
│  Cerrar      │◀────│  Historial    │◀────│  Post-venta  │◀────┌──────────────┐
│  Caja        │     │  de Ventas    │     │  Automático  │     │  Procesar    │
└─────────────┘     └──────────────┘     └─────────────┘     │  Pago        │
                                                                └──────────────┘
```

> 💡 **Consejo final**: Practica el flujo completo con una venta de prueba (puedes revertirla después) para familiarizarte con cada paso. La velocidad mejora significativamente con el uso del escáner de códigos de barras y los atajos de teclado.
