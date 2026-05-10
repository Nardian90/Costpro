# ESTRATEGIA: Refactorización de la Capa Puente (Bridge Layer) - CostPro

## 1. Visión General
El objetivo es transformar el flujo de conversión de datos desde la UI/Plantilla hacia el motor de cálculo en una **tubería (pipeline) de transformación pura, determinista y trazable**.

Actualmente, la lógica está dispersa y contiene ambigüedades (heurísticas) que intentan adivinar la intención del usuario. El nuevo flujo se basará en **Clasificación Explícita**.

## 2. El Nuevo Flujo (Pipeline)

La transformación de una fila de la UI a una `CostRow` del motor seguirá estos pasos:

1.  **Normalización de Entrada**: Unificar alias de campos (`baseRef`, `base_ref`, `is_percent`, etc.) en un objeto de entrada estandarizado.
2.  **Clasificación de Intención (Formula Classifier)**: Determinar si la fila es un Valor Fijo, una Referencia a Anexo, una Suma Automática de Hijos, o una Fórmula Matemática.
3.  **Resolución de Referencias (Base Resolver)**: Resolver a qué apunta el `baseRef` (Anexo o Fila) de forma inequívoca.
4.  **Aplicación de Capas de Negocio (Middlewares)**:
    -   *Capa de Indirectos*: Aplicar coeficientes de gastos indirectos si la fila está afectada.
    -   *Capa de Auditoría*: Registrar por qué se eligió cada método de cálculo.
5.  **Generación de Salida**: Producir la `CostRow` final.

---

## 3. Arquitectura de Componentes

### A. El Clasificador (`formula-classifier.ts`)
Es un componente puro que no conoce el estado de la ficha. Solo analiza strings.

**Reglas de Oro:**
-   **Anexo Shorthand**: `AnexoI`, `AnexoII`, etc., SIEMPRE se clasifican como `ANEXO_REF`.
-   **Suma Automática**: Patrones como `sum(children)` o `SUMA(hijos)` se estandarizan.
-   **Precedencia**: El clasificador tiene un orden de evaluación estricto para evitar falsos positivos en fórmulas matemáticas complejas.

### B. El Mapeador Unificado (`shared-mapping.ts`)
Se eliminan las discrepancias entre `mapper.ts` y `shared-mapping.ts`. Se crea una única fuente de verdad para la construcción de filas (`buildEngineRows`).

### C. Trazabilidad (Debuggability)
Cada `CostRow` incluirá en su `metadata`:
-   `intent`: El tipo detectado por el clasificador.
-   `originalFormula`: La fórmula antes de ser procesada/traducida.
-   `mappingWarnings`: Alertas si hubo ambigüedad (ej. un `baseRef` que no se encontró).

---

## 4. Implementación Detallada (Estructura Sugerida)

### Nuevo Archivo: `src/lib/cost-engine/pipeline/row-transformer.ts`
Dividir la función gigante `buildEngineRows` en funciones pequeñas y testeadas:

```typescript
interface RowContext {
  template: CostSheetData;
  vhSums: Record<string, number>;
  indirectConfig: IndirectConfig;
}

export function transformRow(uiRow: CostSheetRow, ctx: RowContext): CostRow {
  const normalized = normalizeRowFields(uiRow);
  const intent = classifyFormula(normalized.formula);
  const baseCalculo = resolveBaseRef(normalized.baseRef, ctx.template);

  let formaCalculo = determineFormaCalculo(normalized, intent, baseCalculo);
  let finalFormula = processFormula(normalized.formula, intent, ctx);

  // Aplicar indirectos si aplica
  if (shouldApplyIndirects(normalized, ctx)) {
    finalFormula = applyIndirectLogic(finalFormula, ctx.indirectConfig);
    formaCalculo = 'FORMULA';
  }

  return {
    ...baseFields,
    formaCalculo,
    baseCalculo,
    formula: finalFormula,
    metadata: {
      intent: intent.kind,
      original: uiRow.totalFormula || uiRow.formula
    }
  };
}
```

---

## 5. Plan de Ejecución Seguro

1.  **Aislamiento**: Crear la nueva lógica en una carpeta `pipeline/` para no romper lo existente mientras se desarrolla.
2.  **Test-Driven Development (TDD)**:
    -   Escribir tests para cada caso de borde (`AnexoI` como fórmula vs como referencia).
    -   Verificar que el `baseRef` de los templates (ej. Lavar) se mapea correctamente.
3.  **Swapping**: Una vez que los tests de la nueva tubería pasen el 100% de los casos de los tests antiguos (`shared-mapping.test.ts`), redirigir las exportaciones de `shared-mapping.ts` a la nueva tubería.
4.  **Eliminación de Código Muerto**: Borrar `mapper.ts` (si es redundante) o refactorizarlo para que use el nuevo transformador.

---

## 6. Por qué esta estrategia es mejor
1.  **Previsibilidad**: Ya no hay `if (formula) formaCalculo = 'FORMULA'` genéricos. Ahora hay un `switch(intent.kind)`.
2.  **Mantenibilidad**: Si aparece un nuevo tipo de fórmula (ej. una integración con IA), solo hay que añadir un caso al `classifier` y un handler al `transformer`.
3.  **Facilidad de Debug**: Al ver la `FichaJSON` resultante, sabrás exactamente por qué una fila se calculó de cierta forma gracias a la metadata de intención.

## Actualización: Refactorización Completada Exitosamente

Se ha implementado el Clasificador de Fórmulas (`formula-classifier.ts`) y se han refactorizado tanto `shared-mapping.ts` como `mapper.ts`.

### Logros:
1.  **Eliminación de Ambigüedad**: Las fórmulas como "AnexoI" ya no se confunden con expresiones matemáticas.
2.  **Soporte Multicampo**: Se unificó la lectura de `baseRef`, `base_ref` y `baseDeCalculoRef`.
3.  **Consistencia Cliente-Servidor**: Ambos flujos comparten ahora la misma lógica de clasificación.
4.  **Cobertura de Tests**: Se añadieron tests específicos para el clasificador y para los casos de borde en el mapeo compartido.
