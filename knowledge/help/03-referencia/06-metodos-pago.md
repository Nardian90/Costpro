# Referencia: Métodos de Pago del POS

> **Use esta referencia** cuando necesite recordar los métodos de pago disponibles, las monedas aceptadas, o cómo funcionan los ajustes (descuentos y recargos) por método.

## Resumen rápido

CostPro soporta **3 métodos de pago** (efectivo, transferencia, Zelle) que pueden combinarse en un mismo carrito con **4 monedas distintas** (CUP, USD, EUR, MLC). Cada item del carrito puede tener **múltiples filas de pago** del mismo método en distintas monedas, con ajustes (descuento o recargo) independientes por fila.

---

## Los 3 métodos de pago

| Método | Ícono | Cuándo usarlo | ¿Da cambio? | ¿Afecta caja física? |
|--------|-------|---------------|-------------|----------------------|
| **Efectivo** | 💵 | Cliente paga con billetes y monedas (CUP, USD, EUR, MLC) | Sí | Sí, suma el monto recibido |
| **Transferencia** | 📱 | Cliente hace transferencia bancaria nacional | No | No, va al banco |
| **Zelle** | 💳 | Cliente envía dinero desde el extranjero vía Zelle | No | No, va al banco extranjero |

> **Nota histórica**: Antes se ofrecía "Tarjeta" y "Mixto" como métodos separados. Ahora **Mixto** no es un método: es simplemente usar 2 o más métodos en el mismo carrito. Y **Tarjeta** se reemplazó por **Transferencia** o **Zelle** según el origen del dinero.

---

## Las 4 monedas aceptadas

Cada fila de pago puede estar en una moneda distinta. El sistema convierte automáticamente todo a CUP para el consolidado usando la tasa de cambio configurada en la tienda.

| Moneda | Uso típico | Tasa de cambio |
|--------|------------|----------------|
| **CUP** | Pesos cubanos, moneda base | 1 (siempre) |
| **USD** | Dólares estadounidenses (Zelle, efectivo en divisas) | Configurable en Tasa Inteligente |
| **EUR** | Euros (efectivo en divisas) | Configurable en Tasa Inteligente |
| **MLC** | Moneda Libremente Convertible (tarjetas magnéticas cubanas) | Configurable en Tasa Inteligente |

> **Tasa Inteligente**: El sistema recuerda la última tasa usada y sugiere automatizarla. Vea `02-como-hacer/12-como-usar-tasa-cambio.md` para más detalle.

---

## Modelo de filas de pago (multi-fila)

### ¿Qué es una fila de pago?

Cada item del carrito tiene una lista de **filas de pago**. Cada fila representa un pago individual con:

- **Método** (efectivo / transferencia / Zelle)
- **Monto** (cuánto se paga en esa fila)
- **Moneda** (CUP / USD / EUR / MLC)
- **Ajuste** (ninguno / porcentaje / fijo, puede ser descuento o recargo)

### ¿Por qué múltiples filas?

Imagine esta venta:
- Producto A: $1,000 CUP
- Cliente paga $500 CUP en efectivo + $5 USD en efectivo (tasa 200) + $500 CUP por transferencia

Aquí el item "Producto A" necesita **3 filas de pago**:
1. Efectivo CUP $500 (sin ajuste)
2. Efectivo USD $5 (sin ajuste, equivale a $1,000 CUP)
3. Transferencia CUP $500 (sin ajuste)

Antes del modelo multi-fila, esto era imposible porque solo había un campo `cash_paid` por item. Ahora puede haber N filas de efectivo en distintas monedas.

### Operaciones disponibles en cada fila

- **➕ Agregar Pago**: añade una nueva fila vacía (por defecto efectivo CUP $0)
- **⧉ Duplicar**: clona una fila existente (útil para repetir la misma configuración)
- **✕ Eliminar**: elimina una fila (mínimo 1 fila siempre, no se puede quedar en 0)

---

## Ajustes por método: descuentos y recargos

### ¿Qué es un ajuste?

Un **ajuste** modifica el monto esperado para ese método de pago. Puede ser:

- **Descuento**: el cliente paga MENOS del subtotal (ej: -10% por pago en efectivo)
- **Recargo**: el cliente paga MÁS del subtotal (ej: +5% por pago con Zelle)

> **Convención de signos**: en el sistema interno, un valor **positivo** es recargo y un valor **negativo** es descuento. En la interfaz solo ve "Descuento" o "Recargo" con el valor absoluto.

### Tipos de ajuste

| Tipo | Cómo se calcula | Ejemplo |
|------|-----------------|---------|
| **Porcentaje (%)** | Se aplica al subtotal del item | 10% sobre $1,000 = $100 de ajuste |
| **Fijo ($)** | Monto absoluto en una moneda específica | $50 USD de descuento |

### Casos de uso típicos

| Caso | Configuración |
|------|---------------|
| "10% off por pago en efectivo CUP" | Efectivo CUP, descuento 10% |
| "Recargo 5% por Zelle (cubre comisión)" | Zelle USD, recargo 5% |
| "Descuento de $20 CUP por transferencia" | Transferencia CUP, descuento fijo $20 |
| "Precio especial en USD sin ajuste" | Efectivo USD, sin ajuste |

### Consolidación visible en el tab Pago

En el panel de checkout verá:

- **Descuento total**: suma de todos los ajustes negativos (descuentos) consolidados
- **Recargo total**: suma de todos los ajustes positivos (recargos) consolidados
- **Consolidado por moneda**: cuánto se recibió en CUP, USD, EUR, MLC (sumando todas las filas)
- **Esperado**: total que debería haberse recibido según los ajustes activos
- **Estado de cuadre**:
  - ✓ **Cuadrado** (verde): lo recibido coincide con lo esperado
  - ↑ **Sobrepago** (ámbar): se recibió más de lo esperado
  - ↓ **Falta** (rojo): falta dinero por cobrar

---

## Ejemplos prácticos

### Ejemplo 1: Venta simple en efectivo CUP

- Producto: $1,000 CUP
- 1 fila: Efectivo CUP $1,000 (sin ajuste)
- Consolidado: $1,000 CUP ✓ Cuadrado

### Ejemplo 2: Venta con descuento por efectivo (10% off)

- Producto: $1,000 CUP
- 1 fila: Efectivo CUP $900 con descuento 10%
- Esperado: $900 CUP
- Consolidado: $900 CUP ✓ Cuadrado

### Ejemplo 3: Venta con recargo por Zelle (5%)

- Producto: $1,000 CUP
- 1 fila: Zelle USD $5.25 con recargo 5% (tasa 200)
- Esperado: $1,050 CUP = $5.25 USD
- Consolidado: $5.25 USD = $1,050 CUP ✓ Cuadrado

### Ejemplo 4: Pago mixto multi-moneda sin ajuste

- Producto: $2,000 CUP
- 2 filas:
  - Efectivo CUP $1,000
  - Efectivo USD $5 (tasa 200 = $1,000 CUP)
- Consolidado: $1,000 CUP + $5 USD = $2,000 CUP ✓ Cuadrado

### Ejemplo 5: Anticipo + saldo

- Producto: $5,000 CUP
- 1ª visita: 1 fila Efectivo CUP $2,000 (saldo pendiente: $3,000)
- 2ª visita: 1 fila Transferencia CUP $3,000
- Al final: $5,000 CUP ✓ Cuadrado

---

## Preguntas frecuentes

**¿Puedo tener 2 efectivos en monedas distintas para el mismo item?**
- Sí. Agregue 2 filas de pago, una en CUP y otra en USD (o EUR/MLC). Cada una con su monto y ajuste independiente.

**¿El descuento se aplica al subtotal o al total del carrito?**
- El descuento se aplica **al subtotal del item** donde está configurado. Si quiere un descuento global, configúrelo en cada item o use el descuento global del carrito (campo `discount` en el CartState).

**¿Qué pasa si el cliente paga de más?**
- El sistema lo marca como **Sobrepago** (badge ámbar) pero permite completar la venta. El cajero debería verificar con el cliente si quiere cambio o si es propina.

**¿Qué pasa si el cliente paga de menos?**
- El sistema lo marca como **Falta** (badge rojo). La venta **no se puede completar** hasta que el total recibido iguale o supere al esperado.

**¿Puedo cobrar el mismo item en 3 métodos distintos?**
- Sí. Agregue 3 filas: efectivo, transferencia y Zelle. Cada una con su monto. El sistema consolida automáticamente.

**¿La tasa de cambio se guarda por item o por venta?**
- Por item. Cada item del carrito tiene su propia `currency` y `exchange_rate`. Esto permite tener items con precios en distintas monedas en el mismo carrito (útil cuando se compran productos a proveedores en distintas divisas).

**¿El cambio se calcula automáticamente?**
- Sí, en el método Efectivo el sistema calcula el cambio a devolver al cliente según el monto recibido.

**¿Puedo anular un pago después de confirmar la venta?**
- No directamente. Debe anular la venta completa y volver a hacerla. La anulación queda registrada en auditoría.

**¿Los ajustes se imprimen en el recibo?**
- Sí. El recibo muestra el desglose: subtotal, descuentos, recargos, total por método y total final.

**¿Qué método de pago usan más los clientes?**
- Depende del país y del negocio. En Cuba, efectivo CUP y transferencia son los más comunes. En zonas turísticas, Zelle y USD. Vea el reporte de ventas filtrado por método para ver su proporción real.

---

## Casos especiales y errores comunes

### "El consolidado no cuadra pero yo cobré bien"

Causa probable: olvidó configurar la **tasa de cambio** del item. Si el item está en USD pero la tasa es 1, el sistema cuenta $1 USD = $1 CUP, generando descuadre.

Solución: en el item, edite la moneda y la tasa de cambio antes de cobrar.

### "El cliente pagó en EUR pero el sistema lo cuenta como USD"

Causa probable: la fila de pago tiene `currency: 'USD'` cuando debería ser `'EUR'`. Seleccione la moneda correcta en el dropdown de la fila.

### "Apliqué descuento pero el total no baja"

Causa probable: el ajuste se configuró como **recargo** (positivo) en vez de **descuento** (negativo). Verifique el signo en el campo "Ajuste" de la fila de pago.

### "No puedo eliminar la última fila de pago"

Esto es intencional: cada item debe tener al menos 1 fila de pago. Si quiere quitar todas las filas, elimine el item del carrito.
