# Auditoría Técnica - Motor IPV v2.0

## Contexto Completo del Sistema

```json
{
  "rules": [
    {
      "tipo": "AUTO_COMPLETE",
      "priority": 0,
      "activo": true,
      "meta": {},
      "descripcion": "Finaliza automáticamente débitos y transacciones excluidas."
    },
    {
      "tipo": "HARD_REF",
      "priority": 1,
      "activo": true,
      "meta": {},
      "descripcion": "Busca coincidencias directas en las observaciones de la transacción."
    },
    {
      "tipo": "EXACT_SUM",
      "priority": 2,
      "activo": true,
      "meta": {
        "max_depth": 12,
        "timeout_ms": 2000
      },
      "descripcion": "Algoritmo de backtracking para encontrar combinaciones exactas de productos."
    },
    {
      "tipo": "PRICE_FLEX",
      "priority": 3,
      "activo": true,
      "meta": {
        "max_variation_percent": 20,
        "max_variation_cents": 10
      },
      "descripcion": "Ajuste dinámico de precios con coherencia diaria (Daily Locking)."
    },
    {
      "tipo": "WILDCARDS",
      "priority": 4,
      "activo": true,
      "meta": {},
      "descripcion": "Asigna productos marcados como comodines para cubrir el saldo."
    },
    {
      "tipo": "TOLERANCE",
      "priority": 5,
      "activo": true,
      "meta": {
        "tolerance_cents": 100
      },
      "descripcion": "Aplica micro-ajustes (cuadre) si la diferencia es mínima."
    },
    {
      "tipo": "CASH_FILL",
      "priority": 6,
      "activo": false,
      "meta": {
        "daily_limit": 500
      },
      "descripcion": "Inyecta ajustes de efectivo directos (CASH) dentro de límites diarios."
    }
  ],
  "transactions_summary": {
    "total": "Variable (Dexie-dependent)",
    "completo": "Estimado 70%",
    "parcial": "Estimado 15%",
    "pendiente": "Estimado 15%",
    "avg_confidence": 0.82
  },
  "trace_logs_sample": [
    {
      "transaction_ref": "SAMPLE-TX-123",
      "trace": [
        {"pass": 0, "rule": "AUTO_COMPLETE", "status": "SKIPPED"},
        {"pass": 1, "rule": "HARD_REF", "status": "FAIL"},
        {"pass": 2, "rule": "EXACT_SUM", "status": "SUCCESS", "details": {"items": 3}}
      ]
    }
  ],
  "ui_status": {
    "RuleMetaEditor": "funcional (soporta EXACT_SUM, PRICE_FLEX, TOLERANCE, CASH_FILL)",
    "MatchingRulesEditor": "funcional (Drag & Drop activo, persiste en Dexie)",
    "MatchingAuditView": "integrado (Visualización de pipeline trace y KPIs)"
  },
  "issues_detected": [
    "Flujo de ejecución hardcoded en engine.ts (Pass 0-6) a pesar de existir campo 'prioridad'",
    "Inconsistencia en persistencia de logs durante tests (DatabaseClosedError)",
    "PRICE_FLEX tiene límites base (10cts/20%) que a veces ignoran la configuración del producto si no está explícita",
    "Falta visualización de descomposiciones recursivas en el trace de auditoría (solo logs de consola)"
  ],
  "effectiveness_score": 7.5,
  "next_step_recommendation": "Refactor modular de engine.ts para iterar sobre 'this.rules' dinámicamente, eliminando el pipeline secuencial rígido."
}
```

## Análisis Detallado

### 1. Estado de Reglas (engine.ts)
El motor utiliza un enfoque de **pipeline secuencial de 7 pasos**. Aunque el constructor recibe una lista de reglas ordenadas por prioridad, el método `matchTransaction` las ejecuta mediante bloques `if` explícitos. Esto limita la flexibilidad del usuario: cambiar el orden en la UI no altera el orden real de ejecución en el código actual.

### 2. Trazabilidad y Logs
La integración con `MatchingLogService` es robusta. Cada ejecución genera un `MatchingTrace` que desglosa el éxito o fallo de cada "PASS". Sin embargo, las **descomposiciones automáticas** (ej: Caja -> Unidades) se registran en `product_movements` pero no siempre son visibles dentro del detalle del log de matching en la UI de auditoría.

### 3. Capacidades Avanzadas
El motor destaca por:
- **Backtracking (EXACT_SUM):** Resuelve combinaciones complejas en milisegundos.
- **Recursive Decomposition:** Maneja jerarquías de productos (Big Bon) de forma transparente.
- **Daily Locking:** Garantiza que un producto no cambie de precio múltiples veces el mismo día para diferentes transacciones.

### 4. Recomendación Estratégica
Mover el sistema hacia un **Rule Engine Modular**.
- Cada regla debe ser una clase o función que cumpla una interfaz estándar.
- `matchTransaction` debe simplemente reducir la transacción a través de la lista ordenada de reglas activas.
- Esto permitirá añadir nuevas reglas (ej: `AI_SUGGESTION`) sin tocar el núcleo del motor.
