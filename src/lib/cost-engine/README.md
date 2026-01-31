# Motor de Cálculo de Ficha de Costo (Declarativo & JSON-first)

Este módulo implementa un motor de cálculo determinista, auditable y de alta precisión para fichas de costo industriales y comerciales.

## Características Principales

- **JSON-first**: Toda la configuración de la ficha (filas, anexos, reglas) se define en un único archivo JSON.
- **Alta Precisión**: Uso de `decimal.js` para evitar errores de coma flotante en operaciones monetarias.
- **Reglas Declarativas**: Permite aplicar reglas globales o por categoría de forma desacoplada de las filas.
- **Auditoría Explicable**: Cada paso del cálculo genera una entrada en la bitácora indicando el motivo, la fórmula y el cambio de valor.
- **Resolución de Ciclos**: Implementa un solver iterativo con amortiguación (damping) para manejar dependencias circulares.
- **Validación Semántica**: Verifica la integridad de las referencias y tipos de datos antes del cálculo.

## Estructura del `ficha.json`

### `meta`
Contiene metadatos como moneda, decimales y configuración del motor (`allowFormulas`, `maxIter`, `damping`).

### `rows`
Listado de filas de costo. Campos clave:
- `classification`: Identificador jerárquico (ej: "1.1").
- `type`: `COST` | `MARGIN` | `TAX` | `TOTAL` | `INFO`.
- `formaCalculo`: `FIJO`, `IMPORTAR_ANEXO`, `PRORRATEO`, `COEFICIENTE`, `FORMULA`.
- `baseCalculo`: Referencia a un anexo o a otra fila por su clasificación.

### `anexos`
Datos brutos agrupados que alimentan las filas de costo.

### `rules`
Reglas globales que pueden sobrescribir comportamientos basados en condiciones semánticas.

## API Endpoints

- `POST /api/cost-sheets/calculate`: Ejecuta el motor sobre una ficha JSON.
- `POST /api/cost-sheets/import-json`: Valida la estructura de una plantilla.
- `POST /api/cost-sheets/import-anexo`: Procesa archivos CSV/XLSX para anexos.
- `POST /api/cost-sheets/export-pdf`: Genera un PDF ministerial basado en los resultados.

## Desarrollo y Tests

Para ejecutar las pruebas unitarias:
```bash
npx vitest src/lib/cost-engine/index.test.ts
```
