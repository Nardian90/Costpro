# Explicación: Por Qué la Tasa es "Inteligente"

> **Lea esto cuando**: Quiere entender qué hace que la tasa de cambio en CostPro sea "inteligente" y por qué eso le ahorra dinero.

## El problema de la tasa de cambio manual

En Cuba (y otros países con doble moneda), la tasa de cambio **cambia todos los días**. A veces varias veces al día. Si usted tiene un negocio que:

- Compra mercancía en USD (dólares).
- Vende en CUP (pesos cubanos).

Entonces necesita saber **qué tasa aplicar** cada vez que:

- Registra una recepción de mercancía en USD.
- Calcula el precio de venta en CUP.
- Genera un reporte consolidado.
- Paga comisiones a trabajadores.

Si usted usa **una tasa fija** (ej: 300 CUP por USD siempre), va a tener dos problemas:

### Problema 1: Perder dinero
Si la tasa real sube a 350 y usted sigue usando 300, está vendiendo barato. Cada venta le hace perder dinero sin darse cuenta.

### Problema 2: Cobrar de más
Si la tasa real baja a 250 y usted sigue usando 300, está cobrando caro. Los clientes se van a la competencia y usted pierde ventas.

En ambos casos, **el problema es no saber cuál es la tasa real de hoy**.

## ¿Qué hace la tasa "inteligente"?

CostPro soluciona este problema con una **tasa inteligente** que:

### 1. Consulta automáticamente varias fuentes
Cada mañana (o cuando usted lo pida), el sistema consulta:

- **Banco Central** (BCC): la tasa oficial.
- **Mercado informal** (CADEC informal): la tasa que se usa en la calle.
- **Bancos comerciales**: las tasas de compra y venta de los principales bancos.
- **Fuentes internacionales** (si aplica): XE, OANDA, etc.

### 2. Calcula un promedio ponderado
No usa una sola fuente. Hace un promedio inteligente:
- Da más peso a las fuentes más confiables.
- Excluye valores atípicos (si una fuente dice 1000 y las otras dicen 300, descarta el 1000).
- Genera una **tasa recomendada** que es la más realista.

### 3. Le avisa si hay cambios significativos
Si la tasa cambió más de un 5% desde ayer, le manda una notificación:
- *"La tasa de USD subió 7% hoy. Revise sus precios."*

Así usted puede decidir si ajusta sus precios o no.

### 4. Mantiene el historial
Cada tasa aplicada queda registrada con:
- Fecha y hora.
- Valor aplicado.
- Fuente (oficial, mercado, recomendada, personalizada).
- Usuario que la aplicó.
- Motivo (si fue personalizada).

Esto es importante para auditoría y para el contador.

### 5. Aplica la tasa automáticamente a las operaciones
Una vez que usted acepta la tasa recomendada, todas las operaciones de ese día usan esa tasa:
- Recepciones de mercancía en USD se convierten a CUP automáticamente.
- Los reportes consolidados convierten todo a una sola moneda.
- Los precios de venta se calculan con la tasa actualizada.

## ¿Por qué es mejor que la tasa manual?

| Aspecto | Tasa manual | Tasa inteligente |
|---------|-------------|------------------|
| **Actualización** | Cuando se acuerda | Automática cada día |
| **Fuentes** | Una sola | Varias, con promedio |
| **Historial** | Anotado en un cuaderno | Automático y permanente |
| **Alertas** | Ninguna | Cambios significativos |
| **Errores** | Frecuentes | Casi nulos |
| **Tiempo invertido** | 10 minutos al día | 0 minutos |
| **Confiabilidad** | Depende de la memoria | Garantizada por el sistema |

## ¿Cómo se usa en la práctica?

### Escenario típico de una tienda

**Lunes 8:00 AM**
- El encargado entra a CostPro.
- Va a Multi-Tienda → Inteligencia Cambiaria.
- Hace clic en "Actualizar tasa ahora".
- El sistema consulta las fuentes y muestra:
  - Tasa oficial: 280 CUP/USD
  - Tasa mercado informal: 320 CUP/USD
  - **Tasa recomendada: 305 CUP/USD**
- Hace clic en "Aplicar tasa recomendada".
- Listo. Todas las operaciones del lunes usarán 305.

**Lunes 10:00 AM**
- Llega un camión del proveedor con mercancía en USD.
- El encargado registra la recepción.
- La factura dice: 100 USD.
- El sistema convierte automáticamente: 100 USD × 305 CUP/USD = 30,500 CUP.
- La recepción queda registrada en CUP para los reportes.

**Lunes 3:00 PM**
- Un cliente quiere comprar un producto que cuesta 10 USD.
- El sistema calcula: 10 USD × 305 CUP/USD = 3,050 CUP.
- El cliente paga en CUP.

**Martes 8:00 AM**
- El sistema actualiza la tasa automáticamente (si está configurado).
- Nueva tasa: 308 CUP/USD.
- Las operaciones del martes usan 308.

## ¿Qué pasa si la tasa cambia mucho en el día?

A veces la tasa cambia varias veces en el día. ¿Cuál aplicar?

### Opción A: Tasa del día (recomendado)
- Una tasa por día.
- Todas las operaciones del día usan la misma.
- Es más sencillo para cuadrar al final del día.
- Diferencias pequeñas son aceptables.

### Opción B: Tasa por operación (avanzado)
- Cada operación usa la tasa del momento exacto.
- Más preciso pero más complejo.
- Útil solo si las tasas cambian mucho en el día (ej: 10% en horas).

CostPro permite ambas. Por defecto usa la opción A.

## ¿Y si quiero usar una tasa diferente?

A veces usted quiere usar una tasa diferente a la recomendada. Por ejemplo:

- Tiene un acuerdo con el proveedor de usar tasa fija de 300 todo el mes.
- Recibió un pago en USD y quiere usar la tasa del día del pago, no la de hoy.

En esos casos, use **"Aplicar tasa personalizada"**:

1. Escriba el valor numérico.
2. Escriba un motivo (obligatorio).
3. Haga clic en "Aplicar".

El sistema registra esta tasa como "Personalizada" y la diferencia queda visible en los reportes.

> ⚠️ **Importante**: Las tasas personalizadas se usan con moderación. Si todos los días usa tasa personalizada,algo está mal. Debería confiar más en la tasa inteligente.

## Preguntas frecuentes

**¿La tasa inteligente es 100% precisa?**
- No, ninguna tasa lo es. Pero es **mucho más precisa** que una tasa fija o que consultar una sola fuente.
- El margen de error es menor al 2% en condiciones normales.

**¿Qué pasa si el Internet está caído y no puede consultar las fuentes?**
- El sistema usa la última tasa conocida.
- Le avisa que la tasa no está actualizada.
- Cuando vuelve el Internet, actualiza automáticamente.

**¿Puedo bloquear la tasa para que nadie la cambie?**
- Sí. El admin puede bloquear la tasa con una fecha de liberación.
- Útil cuando hay un acuerdo contractual de tasa fija.

**¿La tasa inteligente funciona para cualquier moneda?**
- Sí, para las monedas más comunes (USD, EUR, MLC, CUP).
- Para monedas exóticas, puede que algunas fuentes no estén disponibles.

**¿La tasa inteligente cobra dinero?**
- No. Es una característica incluida en CostPro.
- Las fuentes que consulta son públicas y gratuitas.

**¿Puedo agregar mis propias fuentes?**
- Sí, en Configuración → Fuentes de tasa de cambio.
- Por ejemplo, si tiene un acuerdo con un proveedor que le da una tasa especial.

**¿Qué tasa usa el sistema para los reportes de ganancias?**
- La tasa activa al momento de generar el reporte.
- Si la tasa cambió durante el mes, los valores del inicio del mes se convierten con la tasa de ese día.
- El reporte muestra qué tasa se usó en cada operación.
