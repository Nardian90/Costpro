# Motor de Cálculo de Fichas de Costo

**Módulo:** `src/lib/cost-engine/`
**Versión:** 5.7.x — Motor declarativo y determinista para fichas de costo industriales y comerciales.

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Características](#características)
- [Arquitectura del Módulo](#arquitectura-del-módulo)
- [Tipos Fundamentales](#tipos-fundamentales)
- [Formato FichaJSON](#formato-fichajson)
- [Modos de Cálculo](#modos-de-cálculo)
- [Flujo de Ejecución](#flujo-de-ejecución)
- [Algoritmo de Resolución de Ciclos](#algoritmo-de-resolución-de-ciclos)
- [Sistema de Auditoría](#sistema-de-auditoría)
- [Plantillas Disponibles](#plantillas-disponibles)
- [API del Motor](#api-del-motor)
- [Tests](#tests)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Limitaciones Conocidas](#limitaciones-conocidas)

---

## Descripción General

El motor de fichas de costo implementa un **solver declarativo** que toma una estructura JSON de configuración (`FichaJSON`) y produce valores calculados con trazabilidad completa. Está diseñado para el cálculo de costos de producción según la normativa contable cubana.

**Problema que resuelve:** Las fichas de costo industriales tienen dependencias complejas entre filas (una fila puede referenciar a otra, que a su vez referencia a la primera), requieren alta precisión decimal, y deben ser auditables para inspecciones regulatorias.

---

## Características

- **JSON-first:** Toda la configuración de la ficha se define en un único `FichaJSON`.
- **Alta precisión:** Usa [`decimal.js`](https://mikemcl.github.io/decimal.js/) para eliminar errores de punto flotante en aritmética monetaria.
- **Evaluación segura de fórmulas:** [`expr-eval`](https://github.com/silentmatt/expr-eval) con sandbox para evitar ejecución de código arbitrario.
- **Resolución de ciclos:** Solver iterativo con amortiguación (damping) para dependencias circulares inevitables.
- **Auditoría completa:** Cada paso del cálculo genera una entrada en el `AuditLog` con el valor anterior, nuevo, la fórmula y el motivo.
- **Validación semántica:** Detecta referencias inválidas, ciclos, y discrepancias de tipo antes del cálculo.
- **Reglas declarativas:** Permite sobrescribir comportamientos de cálculo basados en condiciones semánticas.

---

## Arquitectura del Módulo

```
src/lib/cost-engine/
├── index.ts            # Punto de entrada: función calculateCostSheet()
├── types.ts            # Tipos: FichaJSON, CostRow, CalculatedRow, etc.
├── schemas.ts          # Schemas Zod para validación de entrada
├── validations.ts      # Validaciones semánticas profundas
├── formula-utils.ts    # Traducción de fórmulas (español → sintaxis engine)
├── fixtures/           # Datos de prueba para tests
├── index.test.ts       # Tests de integración del motor completo
├── topo-sort.test.ts   # Tests del ordenamiento topológico
├── accuracy.test.ts    # Tests de precisión decimal
├── bidirectional.test.ts # Tests de dependencias bidireccionales
├── heuristic.test.ts   # Tests de heurísticas de resolución
├── smart-annex.test.ts # Tests de importación de anexos
└── user-json.test.ts   # Tests con fichas de usuario reales
```

---

## Tipos Fundamentales

### `FichaJSON`

Estructura de entrada del motor.

```typescript
interface FichaJSON {
  meta: {
    id: string;
    name: string;
    currency: string;       // "CUP", "USD", "MLC"
    decimals: number;       // Decimales de presentación (2 ó 4)
    quantity?: number;      // Cantidad de producción (para prorrateo)
    settings?: {
      maxIter?: number;     // Iteraciones máximas del solver (default: 100)
      damping?: number;     // Factor de amortiguación 0-1 (default: 0.5)
      allowFormulas?: boolean; // Permitir modo FORMULA (default: false)
    };
  };
  rows: CostRow[];          // Filas de la ficha
  anexos: Anexo[];          // Tablas de datos auxiliares
  rules?: CalculationRule[]; // Reglas declarativas opcionales
}
```

### `CostRow`

Cada fila de la ficha de costo.

```typescript
interface CostRow {
  id: string;                    // UUID único
  classification: string;        // Posición jerárquica: "1", "1.1", "1.1.2"
  type: RowSemanticType;         // COST | MARGIN | TAX | TOTAL | INFO
  label: string;                 // Descripción de la fila
  um?: string;                   // Unidad de medida
  valorHistorico?: number;       // Valor base del usuario
  formaCalculo: FormaCalculo;    // Modo de cálculo (ver sección siguiente)
  baseCalculo?: BaseRef;         // Referencia a anexo o fila padre
  coeficiente?: number;          // Para modos COEFICIENTE y PRORRATEO
  formula?: string;              // Expresión aritmética para modo FORMULA
}
```

### `CalculatedRow`

Resultado del motor para cada fila.

```typescript
interface CalculatedRow extends CostRow {
  total: number;        // Valor calculado final
  calculatedVH: number; // Valor histórico calculado
  baseTotal?: number;   // Valor base antes de aplicar coeficiente/fórmula
  audit: AuditEntry[];  // Trazabilidad del cálculo
}
```

### `CalculationResult`

Salida completa del motor.

```typescript
interface CalculationResult {
  fichaId: string;
  rows: CalculatedRow[];
  anexos: Anexo[];
  audits: AuditEntry[];
  validationErrors?: ValidationError[];
  summary: {
    totalCost: number;
    totalMargin: number;
    totalTax: number;
    grandTotal: number;
  };
  elapsedMs: number;
}
```

---

## Formato FichaJSON

### `meta`

```json
{
  "id": "ficha-pan-artesanal-v1",
  "name": "Ficha de Costo: Pan Artesanal 500g",
  "currency": "CUP",
  "decimals": 2,
  "quantity": 100,
  "settings": {
    "maxIter": 150,
    "damping": 0.4,
    "allowFormulas": true
  }
}
```

### `rows` — Estructura jerárquica

Las clasificaciones siguen una jerarquía decimal: `1`, `1.1`, `1.1.1`.

```json
{
  "rows": [
    {
      "id": "row-001",
      "classification": "1",
      "type": "COST",
      "label": "Materias Primas",
      "formaCalculo": "IMPORTAR_ANEXO",
      "baseCalculo": { "type": "ANEXO", "anexoId": "mp" }
    },
    {
      "id": "row-002",
      "classification": "2",
      "type": "COST",
      "label": "Mano de Obra",
      "formaCalculo": "FIJO",
      "valorHistorico": 850.00
    },
    {
      "id": "row-003",
      "classification": "3",
      "type": "MARGIN",
      "label": "Ganancia Planificada (10%)",
      "formaCalculo": "COEFICIENTE",
      "baseCalculo": { "type": "FILA", "classification": "1" },
      "coeficiente": 0.10
    }
  ]
}
```

### `anexos`

```json
{
  "anexos": [
    {
      "id": "mp",
      "name": "Materias Primas",
      "rows": [
        { "classification": "1.1", "description": "Harina", "um": "kg", "quantity": 0.6, "unitCost": 12.50, "importe": 7.50 },
        { "classification": "1.2", "description": "Sal",    "um": "g",  "quantity": 5,   "unitCost": 0.05,  "importe": 0.25 }
      ]
    }
  ]
}
```

---

## Modos de Cálculo

### `FIJO`

Valor directo tomado de `valorHistorico`. No hay cálculo.

```json
{ "formaCalculo": "FIJO", "valorHistorico": 850.00 }
```

---

### `IMPORTAR_ANEXO`

Suma todos los valores `importe` del anexo referenciado.

```json
{
  "formaCalculo": "IMPORTAR_ANEXO",
  "baseCalculo": { "type": "ANEXO", "anexoId": "mp" }
}
```

`total = SUM(anexo.rows[*].importe)`

---

### `COEFICIENTE`

Multiplica el valor de una fila base por el coeficiente.

```json
{
  "formaCalculo": "COEFICIENTE",
  "baseCalculo": { "type": "FILA", "classification": "1" },
  "coeficiente": 0.10
}
```

`total = fila["1"].total × 0.10`

---

### `PRORRATEO`

Distribuye un valor total proporcionalmente según el peso del anexo.

```json
{
  "formaCalculo": "PRORRATEO",
  "baseCalculo": { "type": "ANEXO", "anexoId": "indirects" },
  "coeficiente": 1.0
}
```

`total = base_total × (sum_anexo / total_global)`

Útil para distribuir gastos generales o indirectos entre múltiples productos.

---

### `FORMULA`

Evaluación de expresión aritmética. Solo disponible cuando `settings.allowFormulas = true`.

```json
{
  "formaCalculo": "FORMULA",
  "formula": "fila_1_1 + fila_2 * 0.15"
}
```

Las variables en la fórmula se mapean automáticamente a clasificaciones de filas mediante `formula-utils.ts`.

**Funciones soportadas:** `SUM`, `MAX`, `MIN`, `ABS`, `ROUND`, operadores `+ - * / ^ ( )`

**Seguridad:** Las expresiones se evalúan en un sandbox de `expr-eval` que solo expone las funciones listadas. No hay acceso al entorno global de JavaScript.

---

### `ANEXO`

Alias de `IMPORTAR_ANEXO` para compatibilidad con fichas legacy.

---

## Flujo de Ejecución

```
calculateCostSheet(ficha: FichaJSON): CalculationResult
          │
          ▼
1. Validación estructural (Zod schemas)
   └── Verifica tipos, campos requeridos, UUIDs
          │
          ▼
2. Validación semántica (validations.ts)
   ├── Detecta referencias a anexos inexistentes
   ├── Detecta clasificaciones duplicadas
   └── Verifica tipos semánticos de filas
          │
          ▼
3. Preprocesado de anexos
   └── Calcula SUM(importe) de cada anexo
          │
          ▼
4. Análisis de dependencias
   └── Construye grafo dirigido de dependencias entre filas
          │
          ▼
5. Detección de ciclos (DFS)
   └── Identifica ciclos, separa filas cíclicas y acíclicas
          │
          ▼
6. Ordenamiento topológico
   └── Kahn's algorithm para filas sin ciclos
          │
          ▼
7. Cálculo acíclico (orden topológico)
   └── Resuelve filas en orden: cada fila puede usar valores ya calculados
          │
          ▼
8. Solver iterativo para ciclos (damping)
   └── Iteraciones hasta convergencia (|delta| < epsilon)
          │
          ▼
9. Aplicar reglas declarativas (CalculationRule[])
   └── Override de valores según condiciones semánticas
          │
          ▼
10. Calcular summary
    └── totalCost + totalMargin + totalTax → grandTotal
          │
          ▼
CalculationResult {rows, summary, audits, elapsedMs}
```

---

## Algoritmo de Resolución de Ciclos

### ¿Por qué ciclos son válidos?

En contabilidad de costos, los prorrateos circulares son legítimos:
- Fila A (Costos Indirectos) = base + X% de Total
- Fila B (Total) = Suma de todo incluyendo A
- A depende de B, B depende de A → ciclo necesario

### Método de Amortiguación (Damping)

```
x_nueva = x_previa + damping × (valor_calculado - x_previa)
```

Con `damping = 0.5` (default), el algoritmo converge típicamente en 10-30 iteraciones para ciclos simples.

**Criterio de convergencia:** `|x_nueva - x_previa| < epsilon` para todas las filas cíclicas, donde `epsilon = 10^(-decimals - 2)`.

**Fallo:** Si no converge en `maxIter` iteraciones (default: 100), se reporta en `deepValidationErrors` con `code: 'CYCLE'`.

### Configuración del Solver

```json
{
  "meta": {
    "settings": {
      "maxIter": 150,    // Aumentar para sistemas muy complejos
      "damping": 0.3     // Menor damping = convergencia más lenta pero más estable
    }
  }
}
```

---

## Sistema de Auditoría

Cada operación del motor genera una entrada `AuditEntry`:

```typescript
interface AuditEntry {
  ts: string;          // ISO timestamp
  actor: string;       // Componente que realizó la acción
  note: string;        // Descripción legible
  type: 'INFO' | 'WARNING' | 'ERROR' | 'RULE_APPLIED' | 'CYCLE_DETECTED';
  rowId?: string;      // Fila afectada
  prev?: string;       // Valor anterior (como string para preservar precisión)
  now?: string;        // Valor nuevo
}
```

**Ejemplo de audit trail de una fila:**

```json
[
  { "actor": "engine", "type": "INFO", "note": "Inicio de cálculo IMPORTAR_ANEXO", "rowId": "row-001" },
  { "actor": "engine", "type": "INFO", "note": "Importado de anexo 'mp': SUM = 7.75", "prev": "0", "now": "7.75" },
  { "actor": "rule-engine", "type": "RULE_APPLIED", "note": "Regla 'adjust-by-quantity' aplicada: ×100", "prev": "7.75", "now": "775.00" }
]
```

---

## Plantillas Disponibles

El módulo incluye 10+ plantillas industriales en `src/lib/data/`:

| Plantilla | Sector | Descripción |
|-----------|--------|-------------|
| `pizza.json` | Gastronomía | Ficha de costo para pizza individual |
| `pastry.json` | Gastronomía | Pastelería y repostería |
| `juice.json` | Bebidas | Jugos envasados |
| `shoes.json` | Manufactura | Calzado artesanal |
| `furniture.json` | Manufactura | Muebles de madera |
| `industrial.json` | Industrial | Producción industrial genérica |
| `logistics.json` | Servicios | Empresa de logística |
| `consultancy.json` | Servicios | Consultoría profesional |
| `laundry.json` | Servicios | Lavandería industrial |
| `repair.json` | Servicios | Taller de reparaciones |
| `ice_cream.json` | Gastronomía | Helados artesanales |

Cargar una plantilla desde la UI: **Fichas de Costo > Nueva Ficha > Desde Plantilla**.

---

## API del Motor

### Función principal

```typescript
import { calculateCostSheet } from '@/lib/cost-engine';

const result = calculateCostSheet(fichaJSON);
// result: CalculationResult
```

### Validación standalone

```typescript
import { validateFichaDeep } from '@/lib/cost-engine/validations';

const errors = validateFichaDeep(fichaJSON);
// errors: ValidationError[]
```

### Traducción de fórmulas

```typescript
import { translateFormula } from '@/lib/cost-engine/formula-utils';

const engineFormula = translateFormula('fila_1_1 + fila_2 * 0.15', rows);
// engineFormula: expresión compatible con expr-eval
```

### Hook de React

```typescript
import { useCostEngine } from '@/hooks/logic/useCostEngine';

const { calculate, result, isCalculating, error } = useCostEngine();

// Ejecutar cálculo
await calculate(fichaJSON);
console.log(result.summary.grandTotal);
```

### API REST

```bash
# Calcular ficha
POST /api/cost-sheets/calculate
Content-Type: application/json
{ "ficha": { ...FichaJSON } }

# Exportar a PDF ministerial
POST /api/cost-sheets/export-pdf
{ "fichaId": "uuid" }

# Importar CSV/XLSX como anexo
POST /api/cost-sheets/import-anexo
Content-Type: multipart/form-data
```

---

## Tests

El módulo cuenta con suite de tests completa:

```bash
# Ejecutar todos los tests del motor
npx vitest src/lib/cost-engine/

# Test específico
npx vitest src/lib/cost-engine/accuracy.test.ts

# Con coverage
npx vitest src/lib/cost-engine/ --coverage
```

### Suites de tests

| Archivo | Qué prueba | Casos |
|---------|-----------|-------|
| `index.test.ts` | Integración completa del motor | Flujos end-to-end |
| `accuracy.test.ts` | Precisión decimal con `decimal.js` | Errores de punto flotante |
| `topo-sort.test.ts` | Ordenamiento topológico de dependencias | Grafos con y sin ciclos |
| `bidirectional.test.ts` | Dependencias circulares + damping | Convergencia del solver |
| `heuristic.test.ts` | Heurísticas de resolución automática | Casos edge del solver |
| `smart-annex.test.ts` | Importación y procesamiento de anexos | CSV, XLSX, formatos variados |
| `user-json.test.ts` | Fichas reales de usuarios | Regresión con datos históricos |

---

## Ejemplos de Uso

### Ejemplo mínimo: Ficha de dos filas

```typescript
import { calculateCostSheet } from '@/lib/cost-engine';

const result = calculateCostSheet({
  meta: { id: 'test', name: 'Test', currency: 'CUP', decimals: 2 },
  rows: [
    {
      id: 'r1', classification: '1', type: 'COST', label: 'Costos',
      formaCalculo: 'FIJO', valorHistorico: 100
    },
    {
      id: 'r2', classification: '2', type: 'MARGIN', label: 'Ganancia 10%',
      formaCalculo: 'COEFICIENTE',
      baseCalculo: { type: 'FILA', classification: '1' },
      coeficiente: 0.10
    }
  ],
  anexos: []
});

console.log(result.summary);
// { totalCost: 100, totalMargin: 10, totalTax: 0, grandTotal: 110 }
```

### Ejemplo con anexo

```typescript
const result = calculateCostSheet({
  meta: { id: 'test2', name: 'Con Anexo', currency: 'CUP', decimals: 2 },
  rows: [
    {
      id: 'r1', classification: '1', type: 'COST', label: 'Materias Primas',
      formaCalculo: 'IMPORTAR_ANEXO',
      baseCalculo: { type: 'ANEXO', anexoId: 'mp' }
    }
  ],
  anexos: [
    {
      id: 'mp',
      rows: [
        { classification: '1.1', importe: 50.00 },
        { classification: '1.2', importe: 25.00 }
      ]
    }
  ]
});

// result.rows[0].total → 75.00
```

---

## Limitaciones Conocidas

1. **Ciclos de grado alto:** El solver de damping puede no converger para sistemas con más de 10 filas cíclicas interdependientes. En estos casos, aumentar `maxIter` o reducir `damping`.

2. **Precisión de fórmulas:** Las expresiones en modo `FORMULA` usan `number` estándar de JavaScript internamente, aunque el resultado final se convierte a `decimal.js`. Para operaciones de alta precisión que cruzan múltiples fórmulas, preferir modos `COEFICIENTE` o `IMPORTAR_ANEXO`.

3. **Tamaño de fichas:** El motor ha sido probado con fichas de hasta 200 filas. Para fichas más grandes, el tiempo de cálculo puede superar 500ms. Considerar ejecutar en un Web Worker.

4. **Prorrateo circular:** El modo `PRORRATEO` con dependencia circular puede requerir más de 50 iteraciones. Configurar `maxIter >= 200` para estos casos.
