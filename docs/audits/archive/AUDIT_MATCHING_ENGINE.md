# Auditoría Técnica: Motor de Matching IPV

**Fecha:** 2026-03-14
**Auditor:** Jules (AI Assistant)
**Estado:** Finalizado

---

## 1. Verificación de Generación Automática de Reglas

**Hallazgo:** El motor **genera internamente** ajustes dinámicos que funcionan como reglas heurísticas, pero existe un desacoplamiento visual significativo.

- **Ajustes detectados en el código (`engine.ts`):**
  - **`PRICE_FLEX` (PASS 3):** Ajusta automáticamente el precio de un producto si no hay match exacto. Bloquea este precio en `dailyAdjustedPrices` para mantener coherencia en el mismo día.
  - **`TOLERANCE` (PASS 5):** Permite un descuadre controlado (`cuadre_cents`) que se registra en la línea pero no se destaca en la UI de transacciones.
  - **`CASH_FILL` (PASS 6):** Crea líneas de "Efectivo" para cuadrar el saldo restante, usando productos comodín como "disfraz".
  - **Descomposición Recursiva:** El motor descompone automáticamente paquetes (Caja -> Paquete -> Unidad) para satisfacer la demanda de stock sin intervención del usuario.

**Evaluación de sincronización Motor vs UI: 4/10**
- *Crítica:* El motor es inteligente y resolutivo, pero la UI es "muda". El usuario no sabe si una transacción se cuadró por `EXACT_SUM` o porque el motor aplicó un `CASH_FILL` automático. Esto reduce la auditabilidad por parte del humano.

---

## 2. Auditoría de Cumplimiento de Reglas Críticas

### 2.1. No stock negativo
- **Cumplimiento:** **SÍ**.
- **Detalle:** El motor implementa `useStockLimit`. Antes de asignar un producto, verifica el stock real y el virtual (calculado recursivamente desde ancestros). Si el stock es 0 y no hay nada que descomponer, el motor descarta el producto.
- **Puntuación:** 9/10

### 2.2. Coincidencia exacta prioritaria
- **Cumplimiento:** **SÍ**.
- **Detalle:** El motor ejecuta el `PASS 2 (EXACT_SUM)` antes de cualquier regla de flexibilidad o tolerancia.
- **Puntuación:** 10/10

### 2.3. Margen permisible de precio
- **Cumplimiento:** **SÍ (Técnico) / NO (Configurable)**.
- **Detalle:** La lógica existe, pero los límites (10 centavos o 20%) están hardcodeados como fallbacks en el código si no vienen en `meta`. El usuario no tiene un lugar en la UI para ajustar estos parámetros globales de la regla `PRICE_FLEX`.
- **Puntuación:** 7/10

### 2.4. Cobertura con efectivo
- **Cumplimiento:** **SÍ**.
- **Detalle:** Implementado como `CASH_FILL (PASS 6)`, actuando como el último eslabón de la cadena.
- **Puntuación:** 10/10

**Evaluación general del cumplimiento del motor: 9/10**

---

## 3. Prioridad de Configuración del Usuario

**Hallazgo:** La jerarquía se respeta correctamente mediante el ordenamiento de `this.rules` por el campo `prioridad`.

1. **Prioridad 1 (Usuario):** Si el usuario pone `STOCK_LIMIT` con prioridad 1, el motor lo aplica antes que nada.
2. **Prioridad N (Sistema):** El motor recorre el array de reglas activas secuencialmente.

**Caso Crítico: "No permitir stock negativo"**
- Si la regla `STOCK_LIMIT` está activa, el motor prefiere dejar la transacción como `PENDIENTE` o `PARCIAL` antes que usar un producto sin existencias. Esto cumple con la directiva de seguridad de inventario.

---

## 4. Evaluación Técnica (MD)

| Criterio | Puntuación | Comentario |
| :--- | :--- | :--- |
| **Cumplimiento de Reglas** | 9/10 | El motor es robusto y fiel a las reglas de negocio. |
| **Sincronización Motor vs UI** | 4/10 | Falta transparencia. El motor decide pero no informa el "por qué". |
| **Arquitectura de Descomposición** | 10/10 | La lógica recursiva de ancestros es excelente y previene errores manuales. |
| **Auditabilidad** | 5/10 | Difícil de auditar sin entrar en la base de datos o usar la Simulación. |

### Lista de inconsistencias:
1. El motor registra logs de ejecución en un array pero **nunca los persiste** ni los envía a la UI en el flujo real (solo en simulación).
2. Las descomposiciones automáticas ocurren pero no hay un indicador visual en la fila de la transacción de que esa venta provocó un movimiento de almacén.
3. El `fail_reason` es genérico ("FALTA STOCK VIRTUAL") y no especifica de qué producto falta stock en una combinación compleja.

---

## 5. Mejora Recomendada: Rule Registry

Para garantizar la transparencia, se propone implementar un **"Rule Registry"**:

1. **Persistencia de Trazas:** Añadir un campo `execution_trace` (JSON) en la tabla `bank_statements`.
2. **Sincronización:** El motor debe devolver el array `logs` al finalizar cada transacción, y el componente `IPVView` debe guardarlo en la transacción correspondiente.
3. **UI - Inspector de Matching:** En la `TransactionTable`, al hacer click en el estado de una transacción, abrir un popover con el trace:
   - *[PASS 1] Fallido: No se encontraron códigos en observaciones.*
   - *[PASS 2] Fallido: Sin combinación exacta con stock disponible.*
   - *[PASS 3] Éxito: Ajustado precio de "Refresco" (+0.05) para cuadrar.*
4. **Indicadores de Acción:** Añadir iconos pequeños en la tabla:
   - 📦 (Producto descompuesto automáticamente)
   - ⚖️ (Precio ajustado por Price Flex)
   - 🪙 (Completado con Efectivo / Cash Fill)

---
