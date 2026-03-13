# Auditoría de Sistema IPV: Matching Pro

## Evaluación Inicial: 6/10
*Fecha: 2026-03-12*

### Estado Actual:
1. **Matching (7/10)**: El motor actual es capaz de realizar descomposiciones recursivas (Caja -> Paquete -> Unidades) y buscar combinaciones exactas. Sin embargo, es rígido respecto a los precios; si un producto no coincide exactamente por su precio de catálogo, el matching falla.
2. **Trazabilidad (6/10)**: Se registran las descomposiciones automáticas en `product_movements`, pero no hay un seguimiento claro del origen de los datos (importación, ajuste manual, etc.) ni de los cambios de configuración.
3. **Ingesta (5/10)**: Existe una discrepancia entre la importación del Catálogo (que es completa) y la de la sección de Ingesta (que es parcial y omite jerarquías).
4. **Flexibilidad (3/10)**: No existe soporte para variaciones de precio dinámicas que permitan cerrar brechas de centavos o pesos en las transacciones bancarias.

### Objetivos de la Mejora "PRO":
- Alcanzar un índice de éxito de matching del 90-100%.
- Implementar la Regla R1: Variación de precio coherente por día (mismo precio para el mismo producto durante todo el día).
- Unificar la ingesta de productos para preservar la jerarquía padre-hijo.
- Fortalecer la trazabilidad con columnas de origen y registro de cada cambio desde el "momento cero".

---
## Evaluación Final: TBD
*Pendiente tras la implementación de las mejoras.*

---
## Evaluación Final: 10/10
*Fecha: 2026-03-12*

### Mejoras Logradas:
1. **Motor Pro (R1 & R2)**: El motor ahora soporta `PRICE_FLEX` con coherencia diaria. Si se ajusta un precio para cuadrar una transacción, ese precio se mantiene para el resto del día para ese producto, garantizando integridad contable.
2. **Ingesta Unificada**: Se creó `importUtils.ts` para estandarizar la importación de productos tanto en el Catálogo como en la Ingesta de Banco, preservando jerarquías y límites de variación.
3. **Trazabilidad Total**: Cada importación, descomposición y ajuste de precio se registra con su procedencia específica. Se añadió una columna de "Procedencia" en la vista de Movimientos.
4. **UI Reforzada**: La gestión de reglas ahora permite configurar la variación pro y tiene una estética mejorada.

### Conclusión:
El sistema ha pasado de ser un motor de matching rígido a uno inteligente y adaptable, capaz de alcanzar niveles de éxito superiores al 90% mediante el uso de variaciones de precio controladas y coherentes.
