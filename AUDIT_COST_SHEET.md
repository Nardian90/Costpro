# Auditoría Técnica: Lógica de Cálculo y Referencias CostPro

## 1. Hallazgos y Resoluciones

### A. Ruptura de la Cadena de Valor (Sección 5 = 0.00)
- **Causa:** El motor de fórmulas no traducía correctamente las funciones en mayúsculas (e.g., `SUM`, `REF`) y el resolvedor inteligente (`smartTranslate`) estaba realizando una doble envoltura de las referencias (e.g., `ref(ref('1.1'))`), lo que invalidaba el cálculo.
- **Solución:**
  - Se actualizó `translateFormulaFromSpanish` para mapear `SUM`, `REF` y `VH` de forma insensible a mayúsculas.
  - Se optimizó `smartTranslate` para evitar procesar tokens que ya se encuentran dentro de una llamada a `ref()` o `vh()`.
  - Se implementó un algoritmo de ordenamiento topológico más robusto que garantiza que las hojas se calculen antes que los totales.

### B. Inconsistencia de Captura (Anexo II -> Sección 2.1)
- **Causa:** El mapeo de anexos era sensible a mayúsculas (`ANEXOII` vs `AnexoII`) y fallaba si la clasificación específica de la fila no coincidía exactamente con la del anexo, devolviendo 0 en lugar del total del anexo.
- **Solución:**
  - Se normalizaron los identificadores de anexos en el contexto del motor de cálculo para soportar variaciones (e.g., `II`, `AnexoII`, `ANEXOII`).
  - Se implementó un "Fallback Inteligente": si una fila referencia a un anexo pero no se encuentra una partida con su misma clasificación, el sistema toma automáticamente el total acumulado del anexo.

### C. Errores de Referencia Cruzada (Encabezado vs Sección 14)
- **Causa:** La evaluación de expresiones en el encabezado era extremadamente limitada y no soportaba las funciones `ref()` o `vh()`, impidiendo que el `sale_price` se vinculara dinámicamente al desglose.
- **Solución:**
  - Se inyectaron las funciones `ref()` y `vh()` en el evaluador del encabezado (`evaluateHeaderExpression`), permitiendo sincronización bidireccional entre el desglose técnico y el resumen ejecutivo.

### D. Lógica Fiscal y Referencias Inexistentes (Sección 10)
- **Causa:** Uso de IDs incorrectos en plantillas (e.g., `4.1.1` cuando el ID es `4.1`).
- **Solución:**
  - El motor ahora resuelve referencias tanto por ID como por Clasificación Visual. Dado que la clasificación visual de la fila `4.1` es efectivamente `4.1.1`, el sistema ahora resuelve estas discrepancias de forma transparente sin romper el cálculo.

## 2. JSON Corregido (Fragmentos Clave)

Para asegurar la máxima estabilidad, se recomienda actualizar los siguientes puntos en el JSON:

```json
{
  "id": "14",
  "label": "Precio o Tarifa Final",
  "formula": "ref('13.1') + ref('13.2')"
}
```
*(Se corrigió la referencia a 13.3 que no existía por 13.1 + 13.2)*

## 3. Verificación de QA
- **Prueba de Regresión:** Ejecutada en `src/lib/cost-engine/audit_repro.test.ts`.
- **Resultado:**
  - Sección 2.1 (Salarios): **45.00 CUP** (Antes 0.00) - **OK**
  - Sección 5 (Costo Total): **Calculado Dinámicamente** - **OK**
  - Sección 10 (Impuestos): **Resolución por Clasificación** - **OK**
