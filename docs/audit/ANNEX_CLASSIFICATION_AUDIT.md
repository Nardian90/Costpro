# Auditoría de Clasificación en Anexos

## Estado Inicial (Antes)

La columna **Clasificación** en la vista de edición de Anexos (específicamente en Otros Gastos) presenta sugerencias de IDs que no coinciden con la estructura literal de las secciones de la Ficha de Costo.

### Problemas detectados:
1. **Generación de IDs Inválidos:** La lógica actual en `CostSheetAnnexEditor.tsx` añade automáticamente un sufijo `.1` (ej. `3.2.1`) a las sugerencias, lo cual puede no existir en la estructura real.
2. **Desconexión con Secciones Literales:** En lugar de mostrar los IDs exactos de la sección que alimenta al anexo (ej. `3.1.1`, `3.1.2`), sugiere valores basados en una numeración secuencial forzada.
3. **Mapeo de Otros Gastos:** Para el Anexo IV (Otros Gastos), la sugerencia no está extrayendo correctamente los hijos de la Sección 3 según el orden y ID definidos en el template.

### Ejemplo de error reportado:
- **Esperado:** `3.1.2` (que existe en la sección de Otros Gastos).
- **Actual:** `3.2.1` (ID generado incorrectamente por la lógica de sugerencias).

## Cambios Propuestos (Después)

1. **Eliminar sufijos automáticos:** Se removerá la adición de `.1` en las sugerencias de la Estrategia 1.
2. **Priorizar Estructura Real:** La Estrategia 2 se ajustará para que las sugerencias de IDs sean extraídas directamente de las filas (`rows`) de la sección correspondiente sin alteraciones.
3. **Ajuste de Referencias:** Asegurar que si el Anexo es IV, las sugerencias provengan de la Sección 3 completa respetando sus IDs literales.


## Resultado Final

La implementación se ha corregido para que la columna **Clasificación** en los anexos sugiera exactamente los IDs que existen en las secciones correspondientes de la ficha de costo.

### Resultados:
1. **IDs Reales:** Al editar el Anexo IV (Otros Gastos), el sistema ahora sugiere `3.1`, `3.1.1`, `3.1.2`, etc., tal cual aparecen en la Sección 3 del catálogo.
2. **Sin Sufijos:** Se eliminó la generación de IDs como `3.2.1` que causaba confusión al no existir en la estructura principal.
3. **Orden y Limpieza:** Las sugerencias aparecen ordenadas numéricamente y sin duplicados, facilitando la selección al usuario.

**Evaluación de Calidad:**
- **Integridad:** Se mantiene la relación lógica entre el anexo y la sección de costo sin forzar estructuras inexistentes.
- **Usabilidad:** Al ser solo una sugerencia, el usuario mantiene la flexibilidad pero con datos de referencia correctos y literales.

## Nota sobre el Despliegue (Render)

Durante el proceso de despliegue inicial en Render, se detectó una falta de sincronización en el archivo de bloqueo (`bun.lock`) debido a dependencias agregadas durante el desarrollo (`decimal.js`). Se ha procedido a regenerar y verificar el build en modo producción localmente para asegurar que el despliegue final sea exitoso.
