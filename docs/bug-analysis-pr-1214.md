# Análisis de Bugs - PR #1214

## 1. Corrupción de Datos por Indexación de Secciones
### Causa Raíz
En `CostSheetView.tsx`, cuando el usuario está en modo experto, las secciones se renderizan individualmente dentro de acordeones:

```tsx
(data?.sections || []).map((section: CostSheetSection) => (
  <ExpertModeAccordion ...>
    <CostSheetInteractiveTable sections={[section]} ... />
  </ExpertModeAccordion>
))
```

El componente `CostSheetInteractiveTable` (y `CostSheetCardView`) itera sobre el prop `sections` y usa el índice del bucle como `sectionIndex`. Al recibir un array con un solo elemento, `sectionIndex` siempre es 0.
Sin embargo, las actualizaciones al store de Zustand usan rutas basadas en este índice:
```tsx
path={['sections', sectionIndex, 'rows', rowIndex]}
```
Esto causa que cualquier edición en cualquier sección termine sobreescribiendo los datos de la primera sección (`sections[0]`).

### Solución
Pasar el índice real de la sección desde el mapa principal o permitir que el componente reciba un desplazamiento de índice (`sectionStartIndex`). Dado el diseño actual, es mejor que los componentes de tabla/card acepten un prop `sectionIndexOverride` o que se pase el índice original.

---

## 2. Lógica de Guardado de Totales y Fórmulas
### Causa Raíz
La función `handleTotalSave` tiene una lógica simplista:

```tsx
const handleTotalSave = (val: string) => {
  if (val.startsWith('=')) {
      // Trata como fórmula
  } else {
      // Trata como número (parseFloat)
      handleValueChange('total', parseFloat(val) || 0);
  }
};
```

**Problemas:**
1. **Shorthands rotos:** Referencias como `AnexoI` o `ref('1')` no empiezan con `=` pero son fórmulas válidas. Al no empezar con `=`, `parseFloat` las convierte en `NaN` (que se vuelve 0) y borra las fórmulas existentes.
2. **Persistencia de valores fijos:** Al escribir un número directamente en `total`, el motor de cálculo (que se dispara reactivamente) puede recalcular la fila basándose en su `valorHistorico` o fórmulas, sobreescribiendo el cambio manual del usuario.

### Solución
1. Mejorar la detección de fórmulas: Si el valor no es puramente numérico (o es un shorthand conocido), tratarlo como fórmula.
2. Para valores numéricos fijos:
   - Actualizar `valorHistorico` con el nuevo valor.
   - Establecer `calculationMethod` a `'FIJO'` para informar al motor que no debe recalcular este total.
   - Limpiar `formula` y `totalFormula`.

## 3. Inconsistencia de Esquema (Zod vs TypeScript)
### Causa Raíz
Se identificó que el uso de `calculationMethod: 'FIJO'` para persistir cambios manuales rompe la validación de Zod en `src/validation/schemas.ts`, ya que solo acepta `["Prorrateo", "ValorFijo", "FORMULA", "ANEXO"]`. La interfaz de TypeScript en `src/types/cost-sheet.ts` es mucho más permisiva, lo que causa fallos silenciosos al recargar datos guardados.

### Solución
Utilizar `'ValorFijo'` como el método de cálculo estándar para entradas numéricas manuales, alineándose con el esquema de validación existente y garantizando que las fichas editadas sigan siendo cargables.
