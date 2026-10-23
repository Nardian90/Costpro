# Explicación: ¿Qué es el IPV?

> **Lea esto cuando**: Quiere entender el módulo **IPV** de la sección **EN DESARROLLO** (conciliación bancaria experimental, solo administradores).

> ⚠️ **Atención: en CostPro hay dos vistas con las siglas IPV.** La activa es **«IPV — Ingresos por Ventas»** (OPERACIÓN → Ventas): un informe de ingresos por producto con conciliación de inventario. Este documento describe la **otra**: el módulo **IPV** de la sección **EN DESARROLLO** (visible **solo para administradores**), un banco de trabajo experimental de conciliación de transferencias bancarias que **no forma parte del flujo principal del producto**. También existe el nombre histórico «Tabla IPV» de la Tabla de Venta, que viene del informe de ingresos y no implica precios indexados.

## La pregunta básica: ¿cómo sé si los precios están subiendo?

Todos sabemos que "las cosas están más caras", pero ¿cómo medirlo de forma precisa? Si el pan costaba 1 peso en enero y cuesta 1.20 en junio, subió 20%. Pero si el azúcar bajó de 2 a 1.80, bajó 10%. ¿Cómo combinar todas estas variaciones en un solo número?

Eso es exactamente lo que hace un **índice de precios**: toma una canasta de productos representativos, la sigue en el tiempo, y calcula un número que representa la variación promedio.

## ¿Qué es el IPV en CostPro?

![Vista IPV con el índice de precios y la conciliación de transferencias bancarias](/help/capturas/ipv-conciliacion.webp "Figura 1. IPV — índice de precios y conciliación de transferencias")

En CostPro, el **IPV** (módulo experimental, registrado como «Índice de Precios de Venta») es un banco de trabajo de conciliación que apunta a:

1. **Conciliar** los extractos bancarios con los productos y ventas registradas.
2. **Calcular métricas** de sus ingresos y transferencias.
3. **Simular escenarios** de emparejamiento antes de confirmar.
4. **Exportar MVT** para el contador.

> ℹ️ **Estado real**: es un módulo **experimental en desarrollo** (sección EN DESARROLLO, roles admin). No construya su operación diaria sobre él: la conciliación de inventario e ingresos del producto es la vista activa **IPV — Ingresos por Ventas**.

## ¿Por qué es importante para su negocio?

### 1. Para conciliar con el banco
Cuando el banco le manda el extracto mensual, los depósitos que aparecen deben coincidir con lo que usted registró. Si no coinciden, hay un problema (ventas sin registrar, depósitos mal identificados, etc.). El módulo IPV aplica reglas de emparejamiento para ayudar a conciliar.

### 2. Para auditoría interna
Si un día detecta que sus ingresos no cuadran con lo que debería, el IPV le permite rastrear dónde está la diferencia: ¿una venta sin registrar? ¿un depósito no identificado? ¿un error de cálculo?

## Las reglas de matching (emparejamiento)

El motor del IPV aplica reglas para intentar emparejar automáticamente las transacciones bancarias con productos del catálogo (por código y precio). Las reglas implementadas hoy:

| Regla | Qué hace |
|-------|----------|
| **HARD_REF** | Busca el código de producto en la referencia/observación del movimiento bancario. |
| **EXACT_SUM** | Empareja cuando un conjunto de productos suma exactamente el monto del movimiento. |
| **TOLERANCE** | Empareja si la diferencia es menor a una tolerancia configurable (ej: ±5 pesos). |
| **CASH_FILL** | Asigna un producto cuyo precio cubra el remanente del movimiento («Inyección de Efectivo»). |
| **WILDCARDS** | Usa patrones con comodines en las descripciones bancarias. |
| **AUTO_SUPPLY** | Asigna productos para agotar un sobrepago, priorizando stock bajo («Auto-Suplencia»). |
| **STOCK_LIMIT** | Limita la cantidad asignada al stock disponible. |

Otras reglas del diseño (GOAL_WITH_TOLERANCE, PRICE_FLEX) aún no están activas en el motor.

> 💡 **Para personas mayores**: No necesita entender estas reglas en detalle. El sistema las aplica automáticamente. Solo sepa que existen y que es un módulo experimental.

## El flujo de trabajo típico del IPV

### 1. Importar el extracto bancario
- El banco le manda un archivo (CSV o BANDEC).
- Usted lo importa al sistema: *IPV → Ingesta de Extracto*.
- El sistema procesa todas las transacciones.

### 2. Catálogo de transacciones
- Cada transacción bancaria queda en un "catálogo".
- Se puede clasificar: venta, gasto, transferencia interna, etc.

### 3. Reglas de matching
- El sistema aplica las 9 reglas automáticamente.
- Empareja tantas transacciones como pueda.

### 4. Conciliación manual
- Las transacciones que no se emparejaron automáticamente quedan "pendientes".
- Usted las revisa una por una y las empareja manualmente, o las marca como "no identificadas".

### 5. Simulación de escenarios
- Antes de cerrar el mes, puede simular: *"¿Qué pasa si cambio la tolerancia de 5 a 10 pesos?"*
- El sistema recalculate y muestra el nuevo resultado.

### 6. Generación de reportes
- Reporte de conciliación: qué se emparejó y qué no.
- Balance de comprobación pivot: vista resumida.
- Exportación MVT: para que el contador lo importe en su software.

## ¿Quién usa el IPV?

Es un módulo **experimental restringido a administradores** (sección EN DESARROLLO). Está pensado para explorar la conciliación bancaria; no forma parte de la operación diaria de cajeros, encargados ni otros roles.

## ¿El IPV es obligatorio?

No. Es un módulo experimental y opcional. Puede operar CostPro sin usarlo.

## Preguntas frecuentes

**¿El IPV es lo mismo que el IPC (Índice de Precios al Consumidor)?**
- No. El IPC lo calcula el gobierno con una canasta representativa nacional.
- El módulo IPV de CostPro no calcula un índice de precios: es una herramienta de conciliación de transferencias bancarias (en desarrollo experimental).

**¿Cada cuánto debo hacer conciliación?**
- El módulo está en desarrollo: no forma parte hoy del cierre mensual obligatorio del producto.

**¿El IPV reemplaza al contador?**
- No. Reemplaza el trabajo manual de conciliación, pero el contador sigue siendo necesario para:
  - Interpretar los reportes.
  - Tomar decisiones contables (provisiones, amortizaciones, etc.).
  - Firmar los estados financieros.
  - Presentar las declaraciones fiscales.

**¿Qué es el MVT?**
- Formato de exportación de movimientos del módulo experimental, pensado para entregar al contador.

**¿El IPV trabaja con cualquier banco?**
- Acepta CSV genérico y tiene un parser específico para BANDEC (Cuba). El soporte de otros bancos depende del mapeo de columnas del módulo experimental.

**¿Es difícil aprender a usar el IPV?**
- Es el módulo más complejo de CostPro y está **en desarrollo**: úselo para explorar, no como proceso crítico del negocio.
- Para el informe activo de ingresos, vea *Cómo consultar el IPV — Ingresos por Ventas* en la sección Cómo Hacer.
