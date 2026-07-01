# Explicación: ¿Qué es el IPV?

> **Lea esto cuando**: Quiere entender qué es el IPV (Índice de Precios y Variaciones), para qué sirve y cómo se relaciona con su negocio.

## La pregunta básica: ¿cómo sé si los precios están subiendo?

Todos sabemos que "las cosas están más caras", pero ¿cómo medirlo de forma precisa? Si el pan costaba 1 peso en enero y cuesta 1.20 en junio, subió 20%. Pero si el azúcar bajó de 2 a 1.80, bajó 10%. ¿Cómo combinar todas estas variaciones en un solo número?

Eso es exactamente lo que hace un **índice de precios**: toma una canasta de productos代表性, la sigue en el tiempo, y calcula un número que representa la variación promedio.

## ¿Qué es el IPV en CostPro?

En CostPro, el **IPV (Índice de Precios y Variaciones)** es un módulo avanzado que permite:

1. **Calcular el índice** de precios de su negocio.
2. **Comparar** sus precios con índices oficiales (Banco Central, ONEI, etc.).
3. **Conciliar** los extractos bancarios con las ventas registradas.
4. **Simular escenarios**: *"¿Qué pasa si subo todos los precios 5%?"*
5. **Generar reportes** para el contador y para la auditoría fiscal.

## ¿Por qué es importante para su negocio?

### 1. Para ajustar precios inteligentemente
Si el IPV general subió 8% en el trimestre, probablemente sus costos también subieron. Si no ajusta sus precios, está perdiendo margen. El IPV le da una **señal objetiva** de cuándo y cuánto ajustar.

### 2. Para conciliar con el banco
Cuando el banco le manda el extracto mensual, los depósitos que aparecen deben coincidir con las ventas que usted registró. Si no coinciden, hay un problema (ventas sin registrar, depósitos mal identificados, etc.). El módulo IPV hace esta conciliación **automáticamente** con 9 reglas diferentes.

### 3. Para reportes fiscales
En muchos países, las autoridades fiscales piden reportes de variación de precios. El IPV de CostPro genera estos reportes en el formato que piden.

### 4. Para auditoría interna
Si un día detecta que sus ingresos no cuadran con lo que debería, el IPV le permite rastrear dónde está la diferencia: ¿una venta sin registrar? ¿un depósito no identificado? ¿un error de cálculo?

## Las 9 reglas de matching (emparejamiento)

El módulo IPV usa 9 reglas diferentes para intentar emparejar automáticamente las transacciones bancarias con las ventas registradas:

| # | Regla | Qué hace |
|---|-------|----------|
| 1 | **HARD_REF** | Empareja por número de referencia exacto (ej: venta V-2024-0315-001 → depósito con referencia "V-2024-0315-001"). |
| 2 | **EXACT_SUM** | Empareja cuando una suma de ventas coincide con un depósito (ej: 3 ventas de 100, 200 y 300 → un depósito de 600). |
| 3 | **TOLERANCE** | Empareja si la diferencia es menor a una tolerancia configurable (ej: ±5 pesos). |
| 4 | **CASH_FILL** | Empareja depósitos en efectivo con ventas en efectivo del mismo día. |
| 5 | **PRICE_FLEX** | Empareja si los montos coinciden dentro de un rango de precio flexible (para clientes que pagan con descuentos). |
| 6 | **WILDCARDS** | Usa patrones con comodines en las descripciones bancarias. |
| 7 | **GOAL_WITH_TOLERANCE** | Busca combinaciones de ventas que sumen un monto específico, dentro de una tolerancia. |
| 8 | **STOCK_LIMIT** | Verifica que el stock vendido concuerde con el stock que salió de inventario. |
| 9 | **AUTO_SUPPLY** | Empareja depósitos automáticos (ej: pago de servicios recurrentes). |

> 💡 **Para personas mayores**: No necesita entender estas 9 reglas en detalle. El sistema las aplica automáticamente. Solo sepa que existen y que el sistema hace el trabajo duro por usted.

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

No todos los usuarios necesitan el IPV. Es un módulo **avanzado**, pensado para:

- **Contadores**: para cerrar el mes y generar reportes.
- **Administradores**: para auditar y tomar decisiones.
- **Auditores externos**: para verificar la consistencia de los datos.

Los cajeros y encargados normalmente no lo usan.

## ¿El IPV es obligatorio?

No. Es un módulo opcional. Puede operar CostPro sin usarlo. Pero si su negocio:

- Tiene muchas ventas por transferencia o tarjeta.
- Necesita reportes fiscales detallados.
- Quiere detectar fraudes o errores bancarios.
- Tiene más de 100 transacciones bancarias al mes.

→ Entonces el IPV le va a ahorrar muchas horas de trabajo manual.

## Preguntas frecuentes

**¿El IPV es lo mismo que el IPC (Índice de Precios al Consumidor)?**
- No exactamente. El IPC lo calcula el gobierno con una canasta representativa nacional.
- El IPV en CostPro es **su propio índice**, basado en sus productos y sus ventas.
- Pero puede compararse con el IPC oficial para ver si su negocio está alineado con la economía general.

**¿Cada cuánto debo hacer conciliación?**
- Mensualmente, al cierre del mes.
- Empresas grandes: semanalmente.
- Empresas pequeñas con pocas transacciones: mensual es suficiente.

**¿Qué pasa si no concilio un mes?**
- No pasa nada grave. Pero se acumula el trabajo para el mes siguiente.
- Las transacciones no conciliadas se arrastran.
- Recomendado: no deje pasar más de 2 meses sin conciliar.

**¿El IPV reemplaza al contador?**
- No. Reemplaza el trabajo manual de conciliación, pero el contador sigue siendo necesario para:
  - Interpretar los reportes.
  - Tomar decisiones contables (provisiones, amortizaciones, etc.).
  - Firmar los estados financieros.
  - Presentar las declaraciones fiscales.

**¿Qué es el MVT?**
- Movement Transaction. Formato estándar de exportación contable.
- Es un archivo que contiene todos los movimientos del período en formato estructurado.
- El contador lo importa en su software contable (QuickBooks, SAP, etc.).

**¿El IPV trabaja con cualquier banco?**
- Acepta CSV genérico (cualquier banco que exporte en CSV).
- Tiene formatos específicos para BANDEC (Cuba) y otros bancos cubanos.
- Para otros bancos, configure el mapeo de columnas una vez y queda guardado.

**¿Es difícil aprender a usar el IPV?**
- Sí, tiene curva de aprendizaje. Es el módulo más complejo de CostPro.
- Pero está documentado: lea *Cómo usar el IPV* en la sección de How-To.
- Y el asistente IA Darian puede ayudarle paso a paso.
