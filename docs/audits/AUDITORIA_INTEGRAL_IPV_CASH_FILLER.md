# Auditoría Integral: Módulo IPV - Motor de Reglas y Matching

**Estado:** Finalizado
**Versión:** 1.0 (Enterprise Audit)
**Auditor:** Jules (Principal Software Engineer)

---

## 1. Evaluación Diagnóstica

### Score Global: **6.5 / 10** (Antes de Intervención Enterprise)

| Dimensión | Calificación | Observaciones |
| :--- | :--- | :--- |
| **Arquitectura** | 7/10 | Buena separación de responsabilidades con Web Workers, pero el pipeline de reglas es rígido. |
| **Escalabilidad** | 6/10 | El motor actual (v3.0) maneja bien volúmenes medios, pero la falta de reglas de cierre residual limita el auto-cuadre masivo. |
| **Robustez del Matching** | 5/10 | Alta dependencia de coincidencias exactas o manuales. Los residuos de centavos/pesos rompen el flujo. |
| **Trazabilidad Contable** | 8/10 | El modelo de pago compuesto (v3.0) es excelente para la integridad contable. |
| **Performance** | 7/10 | Ejecución eficiente en background. |
| **Mantenibilidad** | 6/10 | Las reglas están hardcodeadas en el motor o limitadas en configuración. |

---

## 2. Identificación de Riesgo Crítico: Eliminación de "Cash Filler"

La eliminación de la regla legacy `CASH_FILLER` en la transición a la v3.0, aunque necesaria para limpiar el modelo contable (evitar productos ficticios 'CASH'), generó un **vacío funcional** en el cierre de transacciones.

### Impacto Detectado:
1.  **Proliferación de Overpayments:** Transacciones que deberían estar cerradas con un ajuste mínimo de efectivo quedan marcadas como `OVERPAYMENT` (Sobrante de transferencia), lo cual es contablemente incorrecto si la intención era un pago mixto.
2.  **Descuadre en Transacciones Parciales:** Sin una regla que "fuerce" el match del último producto mediante inyección de efectivo, el sistema deja la transacción `PENDIENTE` o `PARCIAL`, requiriendo intervención humana para lo que antes era automático.
3.  **Dependencia del Comodín:** La regla `WILDCARDS` está asumiendo una carga de trabajo para la que no fue diseñada (completar huecos de valor), lo que diluye la precisión del inventario.

---

## 3. Evaluación Post-Refactor (Estado Proyectado)

Tras la reintroducción de la regla **"Cash Filler" Enterprise**, el sistema alcanzaría un score de **9.2 / 10**.

### Mejoras Esperadas:
*   **Regresiones Eliminadas:** Se recupera la capacidad de cierre automático del 100% de las transacciones con intención de pago mixto.
*   **Capacidades Críticas:** Se introduce gobernanza sobre el efectivo (límites diarios), algo que el modelo legacy no tenía.

---

## 4. Plan Estratégico de Mejora (Multicapa)

### A. Nivel Negocio
*   **Modelo de Conciliación:** Adoptar el cierre total como meta prioritaria.
*   **Gestión de Excepciones:** Flujo de aprobación para inyecciones que superen umbrales.
*   **Gobernanza:** Configuración centralizada de límites de efectivo por sucursal/entidad.

### B. Nivel Contable
*   **Integridad del Cuadre:** Mantener la invariante `ΣTransfer + ΣCash = Total Product`.
*   **Trazabilidad de Ajustes:** Registro detallado en `matching_logs` de cada peso inyectado.
*   **Reportes:** El reporte SC-3-01 debe reflejar el efectivo inyectado como "Venta en Efectivo (Ajuste de Cuadre)".

### C. Nivel Técnico (Prioridad Alta)
*   **Rediseño del Motor:**
    *   Pipeline determinístico: `HARD_REF -> EXACT_SUM -> CASH_FILL (Enterprise) -> WILDCARDS`.
    *   Idempotencia garantizada mediante hashes de reconciliación.
*   **Estrategia de Refactorización:**
    *   Uso de Feature Flags para habilitar/deshabilitar la regla.
    *   Tests de regresión basados en snapshots de resultados históricos.

---

## 5. Propuesta Técnica: Regla "Inyección de Efectivo" Enterprise

### Arquitectura de la Regla
La regla no genera un producto 'CASH', sino que selecciona un producto real del catálogo (marcado como elegible) y distribuye su costo entre la transferencia sobrante y una inyección de efectivo calculada.

### Parámetros Configurables:
```json
{
  "daily_cash_limit": 20000,
  "max_per_tx_threshold": 5000,
  "minimization_strategy": "NEAREST_ABOVE",
  "audit_flags": ["AUTO_INTERVENTION", "LIMIT_REACHED"]
}
```

### Pseudocódigo del Algoritmo de Selección Óptima:
```typescript
function applyCashFillerRule(remainingTransfer, dailyCashUsed) {
  if (dailyCashUsed >= CONFIG.daily_cash_limit) return SKIP;

  // Buscar el producto que minimice el excedente de efectivo
  const candidate = products
    .filter(p => p.isEligibleForCashFill && p.precio_cents > remainingTransfer)
    .sort((a, b) => (a.precio_cents - remainingTransfer) - (b.precio_cents - remainingTransfer))[0];

  if (candidate) {
    const cashNeeded = candidate.precio_cents - remainingTransfer;
    if (cashNeeded <= CONFIG.max_per_tx_threshold) {
      return {
        product: candidate,
        qty: 1,
        transfer: remainingTransfer,
        cash: cashNeeded
      };
    }
  }
  return FAIL;
}
```

---

## 6. Lista de Fallos Críticos a Corregir
1.  **Fallo #1:** El motor actual marca como `OVERPAYMENT` transacciones con diferencia < 500 centavos en lugar de intentar un match con efectivo.
2.  **Fallo #2:** Inexistencia de un acumulador de efectivo diario en el estado del motor para validar límites.
3.  **Fallo #3:** Falta de campo `isEligibleForCashFill` en la interfaz de Producto para evitar usar productos de alto valor o críticos en ajustes automáticos.

---