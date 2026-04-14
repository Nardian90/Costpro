# Explicación: Motor de Cálculo de Costos

Documentación técnica del motor de cálculo de CostPro: arquitectura, métodos de cálculo, sistema de fórmulas, solver y validaciones.

---

## 1. Arquitectura General

El motor de cálculo de CostPro es el componente central que procesa las fichas de costo y determina el precio final de cada producto. Está diseñado con tres pilares fundamentales:

### Precisión Decimal

Todas las operaciones aritméticas utilizan **Decimal.js** para garantizar precisión exacta en cálculos financieros. Esto elimina los errores de punto flotante inherentes a JavaScript:

```
// Sin Decimal.js (JavaScript nativo)
0.1 + 0.2 = 0.30000000000000004  // ❌ Error de precisión

// Con Decimal.js
0.1 + 0.2 = 0.3                   // ✅ Precisión exacta
```

### Estructura de Árbol Recursivo

Las fichas de costo se organizan como un **árbol jerárquico** donde cada nodo (fila) puede contener nodos hijos:

```
Estructura de datos (Row):
{
  id: "1.2",
  label: "Madera de Roble",
  valorHistorico: 150.00,
  vhFormula: null,
  calculationMethod: "FIJO",
  formula: null,
  baseDeCalculoRef: null,
  children: [
    { id: "1.2.1", label: "Costo base", ... },
    { id: "1.2.2", label: "Transporte", ... }
  ]
}
```

El motor recorre el árbol **de forma recursiva**, calculando primero las filas hoja (sin hijos) y propagando los valores hacia arriba hasta las raíces.

### Anexos como Fuentes de Datos

Los **anexos** (I a X) son tablas de datos tabulares que alimentan las secciones de la ficha. Cada anexo tiene:

- **Columnas:** Definidas por el usuario con nombre y tipo
- **Filas de datos:** Registros individuales con valores por columna
- **Total calculado:** Suma automática de la columna de totales

---

## 2. Métodos de Cálculo

Cada fila de la ficha tiene un método de cálculo que determina cómo se obtiene su valor. Existen 6 métodos:

### FIJO (Valor Fijo)

El valor se ingresa manualmente y no depende de ningún cálculo.

```
Fila 1.1: Madera de Roble
├── calculationMethod: "FIJO"
├── valorHistorico: 150.00
└── Resultado: 150.00
```

**Características:**
- Valor estático ingresado por el usuario
- No se recalcula automáticamente
- Ideal para costos conocidos y estables

### FORMULA (Expresión Calculada)

El valor se obtiene evaluando una expresión que referencia otras filas.

```
Fila 13.1: Utilidad (30%)
├── calculationMethod: "FORMULA"
├── formula: "ref('12.1') * 0.30"
└── Resultado: Se recalcula cuando cambia la fila 12.1
```

**Características:**
- Usa `ref('id')` para referenciar valores calculados
- Usa `vh('id')` para referenciar valores históricos
- Soporta operadores aritméticos: `+`, `-`, `*`, `/`
- Se recalcula automáticamente en cascada

### PRORRATEO (Distribución Proporcional)

El valor del padre se distribuye entre las filas hijas de forma proporcional según una base de cálculo.

```
Fila 11: Costos Indirectos = $1,000
├── calculationMethod: "PRORRATEO"
├── Hijas:
│   ├── Fila 11.1: Sección A → base: 40% → $400
│   ├── Fila 11.2: Sección B → base: 35% → $350
│   └── Fila 11.3: Sección C → base: 25% → $250
└── Total distribuido: $1,000
```

**Características:**
- La suma de los prorrateos siempre iguala el valor del padre
- Las bases de prorrateo se configuran en las filas hijas
- Ideal para costos indirectos que deben repartirse

### ANEXO (Importar desde Anexo)

El valor de la fila se obtiene del total de un anexo tabular.

```
Fila 1: Materia Prima
├── calculationMethod: "ANEXO"
├── anexoRef: "I"
└── Resultado: Suma total de la columna "Costo Total" del Anexo I
```

**Características:**
- El sistema busca el anexo por su identificador (I a X)
- Suma automáticamente la columna designada como total
- Cualquier cambio en el anexo actualiza la fila vinculada

### IMPORTAR_ANEXO (Importar Datos Específicos)

Similar a ANEXO, pero permite importar valores específicos en lugar del total completo.

```
Fila 5.1: Energía Eléctrica
├── calculationMethod: "IMPORTAR_ANEXO"
├── anexoRef: "III"
├── columnRef: "Monto Energía"
└── Resultado: Valor de la columna "Monto Energía" del Anexo III
```

### COEFICIENTE (Factor Multiplicador)

Aplica un coeficiente multiplicador a un valor de referencia.

```
Fila 3.1: Ajuste por Merma
├── calculationMethod: "COEFICIENTE"
├── baseDeCalculoRef: "3"
├── coefficient: 1.05
└── Resultado: ref('3') * 1.05 (5% de merma)
```

---

## 3. Sintaxis de Fórmulas

Las fórmulas son expresiones textual que el motor evalúa para obtener valores calculados.

### Referencias

| Sintaxis | Descripción | Ejemplo | Resultado |
|----------|-------------|---------|-----------|
| `ref('id')` | Valor calculado de una fila | `ref('12.1')` | Valor calculado de la fila 12.1 |
| `vh('id')` | Valor histórico de una fila | `vh('2.1')` | Valor fijo ingresado en la fila 2.1 |

### Operadores Aritméticos

| Operador | Descripción | Ejemplo |
|----------|-------------|---------|
| `+` | Suma | `ref('1.1') + ref('1.2')` |
| `-` | Resta | `ref('3') - ref('4')` |
| `*` | Multiplicación | `ref('12.1') * 0.30` |
| `/` | División | `ref('13.2') / 0.9` |

### Precedencia de Operadores

Las fórmulas respetan la precedencia matemática estándar:

```
ref('13.2') / 0.9 * 0.1
= (ref('13.2') / 0.9) * 0.1
```

### Ejemplos Completos

```javascript
// Utilidad del 30% sobre costo total directo
"ref('12.1') * 0.30"

// Subtotal más utilidad
"ref('12.1') + ref('13.1')"

// Cálculo de IVA incluido (10%)
"ref('13.2') / 0.9 * 0.1"

// Precio final
"ref('13.2') + ref('13.3')"

// Combinación de ref y vh
"ref('1.1') * 1.10 + vh('2.1')"
```

---

## 4. Flujo de Costos Real

El flujo de costos define cómo se propaga el valor desde los costos directos hasta el precio final:

### Diagrama Completo

```
┌──────────────────────────────────────────────────────┐
│              COSTOS DIRECTOS (Filas 1-10)            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Fila 1:   Materia Prima                             │
│  ├── 1.1: Materias primas directas                  │
│  └── Método: ANEXO → Anexo I (Norma de Consumo)     │
│                                                      │
│  Fila 2:   Mano de Obra Directa                      │
│  ├── 2.1: Operarios                                  │
│  └── Método: ANEXO → Anexo II (Horas/Tarifa/Obreros)│
│                                                      │
│  Fila 3:   Materiales Indirectos                     │
│  Fila 4:   Combustible y Lubricantes                 │
│  Fila 5:   Servicios Básicos                         │
│  Fila 6:   Depreciación                              │
│  Fila 7:   Alquileres                                │
│  Fila 8:   Seguros                                   │
│  Fila 9:   Transporte                                │
│  Fila 10:  Otros Gastos Directos                     │
│                                                      │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  Suma filas 1-10
                       ▼
┌──────────────────────────────────────────────────────┐
│        COSTOS INDIRECTOS (Fila 11)                   │
│  Método: PRORRATEO                                   │
│  Distribución proporcional a secciones directas      │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  ref('12.1') = Σ(filas 1-10) + Fila 11
                       ▼
┌──────────────────────────────────────────────────────┐
│     COSTO TOTAL DIRECTO (Fila 12.1)                  │
│     = Suma(1..10) + Indirectos(11)                   │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  ref('12.1') * 0.30
                       ▼
┌──────────────────────────────────────────────────────┐
│     UTILIDAD (Fila 13.1)                             │
│     Fórmula:  ref('12.1') * 0.30                     │
│     Ejemplo:   $812.50 * 0.30 = $243.75              │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  ref('12.1') + ref('13.1')
                       ▼
┌──────────────────────────────────────────────────────┐
│     SUBTOTAL + UTILIDAD (Fila 13.2)                  │
│     Fórmula:  ref('12.1') + ref('13.1')              │
│     Ejemplo:   $812.50 + $243.75 = $1,056.25         │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  ref('13.2') / 0.9 * 0.1
                       ▼
┌──────────────────────────────────────────────────────┐
│     IMPUESTO IVA 10% (Fila 13.3)                     │
│     Fórmula:  ref('13.2') / 0.9 * 0.1                │
│     Ejemplo:   $1,056.25 / 0.9 * 0.1 = $117.36       │
│     Nota: Cálculo de IVA incluido en precio base     │
└──────────────────────┬───────────────────────────────┘
                       │
                       │  ref('13.2') + ref('13.3')
                       ▼
┌──────────────────────────────────────────────────────┐
│     PRECIO FINAL (Fila 14.1)                         │
│     Fórmula:  ref('13.2') + ref('13.3')              │
│     Ejemplo:   $1,056.25 + $117.36 = $1,173.61       │
└──────────────────────────────────────────────────────┘
```

### Ejemplo Numérico Completo

Supongamos los siguientes valores base:

| Fila | Concepto | Valor |
|------|----------|-------|
| 1-10 | Costos Directos (suma) | $750.00 |
| 11 | Costos Indirectos | $62.50 |
| **12.1** | **Costo Total Directo** | **$812.50** |
| **13.1** | **Utilidad (30%)** | **$243.75** |
| **13.2** | **Subtotal + Utilidad** | **$1,056.25** |
| **13.3** | **IVA (10%)** | **$117.36** |
| **14.1** | **Precio Final** | **$1,173.61** |

Cálculos paso a paso:

```
12.1 = $750.00 + $62.50             = $812.50
13.1 = $812.50 × 0.30               = $243.75
13.2 = $812.50 + $243.75            = $1,056.25
13.3 = $1,056.25 / 0.9 × 0.1        = $117.36
14.1 = $1,056.25 + $117.36          = $1,173.61
```

---

## 5. Sistema de Anexos

Los anexos son tablas de datos estructurados que alimentan las secciones de la ficha de costo.

### Estructura

```
Anexo I: Norma de Consumo
┌─────────────┬──────┬──────┬──────────────┬───────────────┬────────────┐
│ Descripción │ Cant │ Unid │ Norma Cons.  │ Precio Unit.  │ Costo Tot. │
├─────────────┼──────┼──────┼──────────────┼───────────────┼────────────┤
│ Roble       │ 2.5  │ m²   │ 2.50         │ $60.00        │ $150.00    │
│ Tornillos   │ 50   │ und  │ 50.00        │ $0.10         │ $5.00      │
│ Pegamento   │ 0.5  │ lt   │ 0.50         │ $12.00        │ $6.00      │
├─────────────┼──────┼──────┼──────────────┼───────────────┼────────────┤
│ TOTAL       │      │      │              │               │ $161.00    │
└─────────────┴──────┴──────┴──────────────┴───────────────┴────────────┘
```

### Anexo I: Norma de Consumo (Materiales)

- **Columnas típicas:** Descripción, Cantidad, Unidad, Norma de Consumo, Precio Unitario, Costo Total
- **Vinculación:** Fila 1 (Materia Prima) → ANEXO → Anexo I
- **Cálculo:** Suma de la columna Costo Total

### Anexo II: Mano de Obra

- **Columnas típicas:** Descripción, HORAS MENSUALES, TARIFA $/H, CANT. OBREROS, Costo Total
- **Vinculación:** Fila 2 (Mano de Obra Directa) → ANEXO → Anexo II
- **Cálculo:** `HORAS MENSUALES × TARIFA $/H × CANT. OBREROS`

### Anexos III a X

Los anexos adicionales se utilizan para otros tipos de costos según las necesidades del producto. Cada anexo sigue la misma estructura tabular con columnas y filas personalizables.

---

## 6. Coeficiente de Anexo

Solo los **Anexos I y II** soportan ajuste por coeficiente. Esta funcionalidad permite aplicar un factor multiplicador a los valores de una columna seleccionada.

### Cómo Funciona

1. El usuario activa el **coeficiente** en un anexo (I o II)
2. Selecciona la **columna objetivo** cuyos valores se multiplicarán (ej. Precio Unitario en Anexo I)
3. Define el **valor del coeficiente** (ej. `1.15` para un aumento del 15%)
4. El motor multiplica cada valor de la columna por el coeficiente antes de calcular los totales

### Ejemplo

```
Anexo I con coeficiente 1.15 en columna "Precio Unitario":

Antes:                          Después:
│ Precio Unit. │ Costo Total │  │ Precio Unit. │ Costo Total │
│ $60.00       │ $150.00     │  │ $69.00       │ $172.50     │
│ $0.10        │ $5.00       │  │ $0.115       │ $5.75       │
│ $12.00       │ $6.00       │  │ $13.80       │ $6.90       │
                                TOTAL:         $185.15
```

> **⚠️ Nota:** El coeficiente afecta exclusivamente a los valores de la columna seleccionada. Las demás columnas del anexo no se modifican.

---

## 7. Solver (Búsqueda de Objetivo / Goal Seek)

El Solver permite al usuario definir un **valor objetivo** para una fila y que el sistema calcule automáticamente el valor de otra variable para alcanzarlo.

### Algoritmo

El solver implementa **búsqueda binaria** con precisión **Decimal.js**:

```
function solve(targetRow, targetValue, variableRow, context) {
  let low = new Decimal(0);
  let high = new Decimal(targetValue);
  let mid, result;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    mid = low.plus(high).div(2);
    
    // Establecer el valor de la variable
    context.setRowValue(variableRow, mid);
    
    // Recalcular toda la ficha
    context.recalculate();
    
    // Obtener el resultado de la fila objetivo
    result = context.getRowValue(targetRow);
    
    // Verificar convergencia
    if (result.equals(targetValue, PRECISION)) {
      return mid;  // Solución encontrada
    }
    
    // Ajustar rango de búsqueda
    if (result.lessThan(targetValue)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  
  return mid;  // Mejor aproximación encontrada
}
```

### Características

- **Precisión:** Utiliza Decimal.js para evitar errores de punto flotante
- **Iteraciones:** Configurable (por defecto 100 iteraciones máximas)
- **Convergencia:** Se detiene cuando la diferencia es menor a la tolerancia configurada

### Ejemplo de Uso

```
Escenario:
  Objetivo:   Precio Final (14.1) = $2,000.00
  Variable:   Utilidad (13.1)
  
  Datos base:
  - Costo Total Directo (12.1) = $812.50
  - Impuesto IVA = 10%
  
  Proceso del Solver:
  ┌─────────────┬─────────────┬─────────────┬──────────────┬──────────┐
  │ Iteración   │ Utilidad    │ Subtotal    │ IVA          │ Precio F.│
  ├─────────────┼─────────────┼─────────────┼──────────────┼──────────┤
  │ 1           │ $1,000.00   │ $1,812.50   │ $201.39      │ $2,013.89│
  │ 2           │ $500.00     │ $1,312.50   │ $145.83      │ $1,458.33│
  │ 3           │ $750.00     │ $1,562.50   │ $173.61      │ $1,736.11│
  │ ...         │ ...         │ ...         │ ...          │ ...      │
  │ N           │ $1,187.65   │ $2,000.15   │ $222.24      │ $2,000.00│ ← ✅
  └─────────────┴─────────────┴─────────────┴──────────────┴──────────┘
  
  Resultado: Utilidad necesaria = $1,187.65
```

---

## 8. Sistema de Validación

El motor ejecuta **8 validaciones** automáticamente al calcular una ficha de costo. Cada error tiene un código identificador:

| Código | Nombre | Descripción | Ejemplo |
|--------|--------|-------------|---------|
| **CYCLE** | Referencia circular | Una fila depende de sí misma directa o indirectamente | `ref('13.1')` en la fila 13.1 |
| **MISSING_REF** | Referencia faltante | Una fórmula referencia un ID de fila que no existe | `ref('99.1')` cuando la fila 99 no existe |
| **SEMANTIC_DISCREPANCY** | Discrepancia semántica | La fórmula no tiene sentido semántico para el tipo de fila | División por cero o unidades incompatibles |
| **INVALID_FORMULA** | Fórmula inválida | Error de sintaxis en la expresión | `ref('12.1' * 0.3` (paréntesis desbalanceado) |
| **HARD_RULE_VIOLATION** | Violación de regla dura | Infringe una regla de negocio obligatoria | Utilidad negativa en un contexto que no lo permite |
| **TRIVIAL_FORMULA** | Fórmula trivial | La fórmula es redundante o innecesaria | `ref('1.1') * 1` o `ref('1.1') + 0` |
| **HIERARCHY** | Problema de jerarquía | Error en la estructura padre-hijo de las filas | Una fila hija referencia a su propio padre creando bucle |
| **EXTERNAL_LINK** | Enlace externo roto | Referencia a un dato externo no disponible | Referencia a un anexo eliminado o inaccesible |

### Auditoría de Validación

Cada cálculo genera un registro de auditoría que incluye:

- **Timestamp:** Fecha y hora del cálculo
- **Errores encontrados:** Lista de códigos de error con fila asociada
- **Valores calculados:** Resultado de cada fila
- **Duración:** Tiempo de ejecución del cálculo

Los errores se pueden revisar en el **modo de vista Auditoría**, donde cada error es clicable y navega directamente a la fila problemática.

---

## 9. Sistema VH (Valor Histórico)

El **Valor Histórico** es un sistema dual que permite mantener dos valores por fila:

### Valor Calculado vs Valor Histórico

| Concepto | Descripción | Referencia |
|----------|-------------|------------|
| **Valor Calculado** | Resultado del método de cálculo actual (fórmula, anexo, etc.) | `ref('id')` |
| **Valor Histórico** | Valor fijo ingresado manualmente, independiente del cálculo | `vh('id')` |

### Casos de Uso

1. **Preservar costos originales:** El usuario ingresa el costo real pagado (VH) mientras el sistema calcula el costo estimado (calculado)
2. **Comparativo:** Permite comparar el valor calculado actual contra el valor histórico previo
3. **Fórmulas híbridas:** Se pueden combinar ambos en una sola expresión

### Ejemplo de Fórmula con VH

```
// Costo ajustado: valor histórico + 10% de inflación estimada
vh('1.1') * 1.10

// Diferencia entre costo actual e histórico
ref('1.1') - vh('1.1')

// Promedio de ambos
(ref('1.1') + vh('1.1')) / 2
```

### Propiedades del VH

- Se almacena de forma independiente en el campo `valorHistorico` de cada fila
- No se sobrescribe por el cálculo automático
- Se puede establecer manualmente o importar desde un archivo JSON
- Se incluye en las exportaciones (PDF, Excel, JSON)
