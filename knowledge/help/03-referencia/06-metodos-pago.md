# Referencia: Métodos de Pago del POS

> **Use esta tabla** cuando un cliente quiera pagar y no sepa qué opción elegir.

## Los 4 métodos de pago

| Método | Cuándo usarlo | ¿Da cambio? | ¿Requiere autorización? |
|--------|---------------|-------------|--------------------------|
| **Efectivo** | Cliente paga con billetes y monedas | Sí | No |
| **Tarjeta** | Cliente paga con tarjeta de débito o crédito | No | No |
| **Transferencia** | Cliente hace transferencia desde su banco | No | No |
| **Mixto** | Cliente paga parte en efectivo y parte con tarjeta | Solo del efectivo | No |

## Detalle de cada método

### 1. Efectivo
- **Cómo se registra**: Escriba cuánto dinero le entregó el cliente. El sistema calcula el cambio.
- **Afecta la caja**: Sí, suma el monto recibido.
- **Afecta el arqueo**: Sí, el efectivo debe cuadrar al cierre.
- **Ventaja**: Inmediato, sin comisiones.
- **Desventaja**: Riesgo de robo, billetes falsos, errores de cambio.

### 2. Tarjeta
- **Cómo se registra**: Solo confirme el monto. El sistema bancario procesa aparte.
- **Afecta la caja**: No directamente. El dinero entra al banco, no a la caja física.
- **Afecta el arqueo**: Sí, como "ventas con tarjeta" (cuenta separada).
- **Ventaja**: Sin riesgo de robo, sin necesidad de cambio.
- **Desventaja**: Requiere POS bancario. Comisión bancaria (típicamente 2-4%).

### 3. Transferencia
- **Cómo se registra**: Confirme el monto. El cliente hace la transferencia desde su app bancaria.
- **Afecta la caja**: No.
- **Afecta el arqueo**: Sí, como "ventas por transferencia".
- **Ventaja**: Sin comisión (en la mayoría de los bancos). Sin riesgo de robo.
- **Desventaja**: Requiere que el cliente tenga banca móvil. Tarda en confirmar (varios minutos).

### 4. Mixto
- **Cómo se registra**: Escriba cuánto pagó en efectivo y el sistema calcula cuánto falta para completar con tarjeta.
- **Afecta la caja**: Solo la parte en efectivo.
- **Afecta el arqueo**: Se desglosa entre efectivo y tarjeta.
- **Ventaja**: Flexible para clientes que no tienen efectivo suficiente.
- **Desventaja**: Más lento. Requiere dos operaciones.

## Ejemplos prácticos

### Ejemplo 1: Venta de 250 pesos, cliente paga en efectivo
1. Cobro total: 250 CUP.
2. Método: Efectivo.
3. Cliente entrega: 300 CUP.
4. Cambio: 50 CUP.
5. Caja física: +250 CUP.

### Ejemplo 2: Venta de 250 pesos, cliente paga con tarjeta
1. Cobro total: 250 CUP.
2. Método: Tarjeta.
3. Cliente pasa la tarjeta en el POS bancario.
4. No hay cambio.
5. Caja física: 0 CUP. Cuenta bancaria: +250 CUP (menos comisión).

### Ejemplo 3: Venta de 250 pesos, cliente paga 100 en efectivo y 150 con tarjeta
1. Cobro total: 250 CUP.
2. Método: Mixto.
3. Efectivo: 100 CUP.
4. Tarjeta: 150 CUP.
5. Caja física: +100 CUP. Cuenta bancaria: +150 CUP (menos comisión).

## Preguntas frecuentes

**¿Qué hago si el cliente quiere pagar con dos tarjetas diferentes?**
- Use "Mixto" y registre ambas partes como "tarjeta".
- El sistema no distingue entre dos tarjetas, pero el monto total cuadra.

**¿Puedo usar "Transferencia" para pagos en USD desde el extranjero?**
- Sí. Seleccione "Transferencia" y luego elija la moneda USD.
- Aplique la tasa de cambio del día.

**¿El sistema imprime un recibo diferente según el método de pago?**
- No. El recibo es el mismo. Solo cambia la línea que indica el método.

**¿Qué pasa si el cliente paga con tarjeta y después quiere anular la venta?**
- La anulación en CostPro es inmediata, pero el reembolso en la tarjeta **depende del banco**.
- Llame al banco para procesar el reembolso. Puede tardar varios días.

**¿Cómo se si una transferencia realmente llegó?**
- No hay forma automática. CostPro confía en que usted verificó.
- Recomendado: pídale al cliente que le muestre el comprobante de transferencia antes de confirmar la venta.

**¿El cambio se calcula automáticamente?**
- Sí. En el método Efectivo, escriba cuánto recibió y el sistema calcula el cambio.

**¿Puedo redondear el cambio?**
- Sí, hay una opción "Redondear al peso más cercano" en Configuración → POS.
- Útil para evitar dar vueltas con centavos.

**¿Qué método de pago usan más los clientes?**
- Depende del país y del negocio. En Cuba, efectivo y transferencia son los más comunes. En zonas turísticas, tarjeta.
- Vea el reporte de ventas filtrado por método para ver su proporción real.
