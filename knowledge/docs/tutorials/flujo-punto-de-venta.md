# Tutorial: Flujo Completo de Punto de Venta

Este tutorial guía paso a paso por el ciclo completo de una venta en CostPro, desde el acceso al terminal hasta el cierre de caja. Cubre todas las funcionalidades del módulo POS para que puedas procesar ventas de forma eficiente y precisa.

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

---

## 6. Procesar el Pago

Una vez que el carrito está completo, procede al cobro:

### 6.1 Seleccionar el Método de Pago

Haz clic en el botón **"Cobrar"** o **"Procesar Pago"** y selecciona el método:

| Método | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| **Efectivo** | Pago en billetes y monedas | Ventas en mostrador con efectivo |
| **Tarjeta** | Pago con tarjeta de crédito o débito | Clientes que pagan con tarjeta |
| **Mixto** | Combinación de efectivo y tarjeta | Cuando el cliente desea pagar con ambos medios |
| **Transferencia** | Pago por transferencia bancaria | Ventas a cuentas corrientes o facturas |

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
   - **Por método de pago**: efectivo, tarjeta, mixto o transferencia
   - **Por número de transacción**: busca una venta específica
3. Haz clic en cualquier venta para ver el **detalle completo**

### Información disponible en el detalle

- Lista de productos con cantidades y precios
- Desglose de pagos por método
- Información del operador
- Opciones para reimprimir comprobante o generar nota de crédito

> 💡 **Tip**: Exporta el historial de ventas a formato Excel o PDF para reportes externos o conciliaciones contables.

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

## Tabla Comparativa: Métodos de Pago

| Característica | Efectivo | Tarjeta | Mixto | Transferencia |
|---------------|----------|---------|-------|---------------|
| **Cambio** | Sí (calculado automáticamente) | No aplica | Parcial (solo efectivo) | No aplica |
| **Desglose** | Monto recibido vs. cambio | Monto cargado | Monto efectivo + tarjeta | Referencia bancaria |
| **Conciliación** | Arqueo de caja físico | Liquidación bancaria | Ambos métodos | Conciliación bancaria |
| **Velocidad** | Rápido | Rápido | Requiere dos pasos | Requiere confirmación |
| **Ideal para** | Ventas menores y mostrador | Clientes con tarjeta | Pagos parciales | Cuentas corrientes |
| **Requiere dato extra** | Monto recibido | Número de aprobación | Montos por medio | Nro. de referencia |

---

## Resumen del Flujo Completo

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
