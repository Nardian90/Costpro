# Cómo Crear una Ficha de Costo Completa

Guía paso a paso para construir una ficha de costo desde cero, incluyendo estructura de secciones, fórmulas, anexos y exportación.

---

## 1. Iniciar una Nueva Ficha de Costo

### Desde el Explorador de Plantillas

1. Navega a **COSTOS > Plantillas** en el menú lateral
2. Explora las plantillas disponibles por categoría
3. Selecciona una plantilla base o usa la **plantilla predeterminada**

### Desde la Vista de Fichas

1. Navega a **COSTOS > Fichas de Costo**
2. Haz clic en **Crear Nueva Ficha**
3. El sistema genera una ficha con la estructura estándar de 16 secciones (filas 1 a 16) con filas hijas predefinidas

> **💡 Tip:** Usa plantillas para productos con estructura de costo repetible. Puedes clonar una ficha existente y modificar los valores.

---

## 2. Completar el Encabezado

El encabezado contiene los datos generales del producto. Completa los siguientes campos:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Código** | Identificador único del producto | `PRD-2024-001` |
| **Nombre del producto** | Descripción del producto | `Mesa de Roble 120x80` |
| **Fecha** | Fecha de elaboración de la ficha | `2024-01-15` |
| **Cantidad** | Cantidad de unidades a producir | `50` |
| **Moneda** | Moneda de la ficha | `USD` / `BOB` |
| **Categoría** | Clasificación del producto | `Muebles > Mesas` |
| **Tipo** | Tipo de producto o servicio | `Producto Terminado` |
| **Unidad** | Unidad de medida | `unidad`, `metro`, `kg` |

> **⚠️ Importante:** La cantidad afecta el prorrateo de costos indirectos. Asegúrate de ingresar la cantidad correcta antes de calcular.

---

## 3. Construir la Estructura de Secciones

La ficha de costo tiene una **estructura de árbol** donde cada sección (filas 1 a 16) puede contener **filas hijas**.

### Estructura del Árbol

```
Fila 1: Materia Prima
├── Fila 1.1: Madera Roble
├── Fila 1.2: Tornillos
└── Fila 1.3: Pegamento
Fila 2: Mano de Obra Directa
├── Fila 2.1: Carpintero
└── Fila 2.2: Ayudante
...
```

### Operaciones con Filas

- **Agregar fila:** Haz clic en el botón `+` junto a la sección padre
- **Agregar sub-fila:** Haz clic en `+` dentro de una fila existente para crear una hija
- **Editar etiqueta:** Haz clic en el texto de la etiqueta de la fila para modificarla
- **Eliminar fila:** Haz clic en el icono de papelera junto a la fila

> **💡 Tip:** Las filas hijas se suman automáticamente para obtener el total de la fila padre, según el método de cálculo configurado.

---

## 4. Ingresar Costos

Cada fila puede recibir costos de dos maneras:

### Valor Histórico (Valor Fijo)

Ingresa directamente un monto numérico en la columna **Valor Histórico**. Este es un valor estático que no cambia con los cálculos.

- Haz clic en la celda de Valor Histórico de la fila
- Escribe el monto (ej. `150.00`)
- Presiona `Enter` para confirmar

### Fórmulas

Utiliza expresiones que se recalculan automáticamente cuando cambian los valores de referencia.

- Selecciona el método de cálculo **FORMULA** en la fila
- Escribe la fórmula en el campo correspondiente

Ver la [tabla de referencia de fórmulas](#7-tabla-de-referencia-de-fórmulas) más abajo para la sintaxis completa.

---

## 5. Configurar Métodos de Cálculo

Cada fila tiene un **método de cálculo** que determina cómo se obtiene su valor:

| Método | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| **FIJO** | Valor fijo ingresado manualmente | Costos puntuales, valores known |
| **FORMULA** | Expresión con `ref()` y `vh()` | Filas derivadas como utilidad, impuestos, precio final |
| **PRORRATEO** | Distribución proporcional entre filas hijas | Costos indirectos que se reparten |
| **ANEXO** | Importa el total de un anexo tabular | Costos de materiales (Anexo I) o mano de obra (Anexo II) |
| **IMPORTAR_ANEXO** | Importa datos específicos de un anexo | Cuando necesitas traer datos parciales de un anexo |
| **COEFICIENTE** | Aplica un coeficiente multiplicador | Ajustes por factor de corrección |

### Cómo Configurar

1. Selecciona la fila que deseas configurar
2. En el panel de propiedades, elige el **Método de Cálculo** del menú desplegable
3. Según el método, completa los campos adicionales:
   - **FORMULA:** Ingresa la expresión en el campo de fórmula
   - **ANEXO:** Selecciona el anexo de origen (I a X)
   - **PRORRATEO:** Define las bases de prorrateo para las filas hijas

---

## 6. Configurar Anexos

Los anexos son **tablas de datos tabulares** (Anexo I a Anexo X) que alimentan secciones de la ficha de costo.

### Crear un Anexo

1. Navega a la sección de **Anexos** en la ficha de costo
2. Haz clic en **Agregar Anexo**
3. Define las **columnas** del anexo:
   - **Anexo I (Norma de Consumo):** Columnas típicas: `Descripción`, `Cantidad`, `Unidad`, `Norma de Consumo`, `Precio Unitario`, `Costo Total`
   - **Anexo II (Mano de Obra):** Columnas típicas: `Descripción`, `Horas Mensuales`, `Tarifa $/H`, `Cant. Obreros`, `Costo Total`

### Agregar Datos al Anexo

1. Haz clic en la primera celda vacía de la tabla
2. Ingresa los datos columna por columna
3. Usa `Tab` para moverte entre celdas
4. Agrega filas nuevas con el botón `+` al final de la tabla

### Vincular un Anexo a una Sección

1. Selecciona la fila de la sección principal (ej. Fila 1: Materia Prima)
2. Configura el método de cálculo como **ANEXO**
3. Selecciona el anexo de origen (ej. **Anexo I**)
4. El sistema importará automáticamente el total del anexo como valor de la fila

### Coeficiente de Anexo

Solo los **Anexos I y II** soportan ajuste por coeficiente:

1. Activa el **coeficiente** en el anexo
2. Selecciona la columna cuyos valores se multiplicarán
3. Ingresa el factor de coeficiente
4. Los valores de la columna seleccionada se multiplicarán automáticamente

> **⚠️ Importante:** El coeficiente es acumulativo. Si el coeficiente es `1.15`, todos los valores de la columna aumentarán un 15%.

---

## 7. Tabla de Referencia de Fórmulas

### Sintaxis

| Elemento | Sintaxis | Descripción |
|----------|----------|-------------|
| Referencia a valor calculado | `ref('1.1')` | Obtiene el valor calculado de la fila 1.1 |
| Referencia a valor histórico | `vh('2.1')` | Obtiene el valor histórico de la fila 2.1 |
| Multiplicación | `ref('1') * 0.30` | Multiplica el valor por 0.30 |
| División | `ref('13.2') / 0.9` | Divide el valor entre 0.9 |
| Suma | `ref('12.1') + ref('13.1')` | Suma dos referencias |
| Operaciones compuestas | `ref('13.2') / 0.9 * 0.1` | División y multiplicación encadenadas |

### Fórmulas Típicas de la Ficha

| Fila | Concepto | Fórmula | Descripción |
|------|----------|---------|-------------|
| 13.1 | Utilidad (30%) | `ref('12.1') * 0.30` | 30% sobre el costo total directo |
| 13.2 | Subtotal + Utilidad | `ref('12.1') + ref('13.1')` | Suma costo total y utilidad |
| 13.3 | Impuesto IVA (10%) | `ref('13.2') / 0.9 * 0.1` | Calcula el 10% de IVA incluido |
| 14.1 | Precio Final | `ref('13.2') + ref('13.3')` | Subtotal más impuesto |

---

## 8. Flujo de Costos

El flujo de costos sigue una estructura jerárquica predefinida:

```
┌─────────────────────────────────────────────────┐
│           COSTOS DIRECTOS (Filas 1-10)          │
│                                                 │
│  Fila 1:   Materia Prima        (Anexo I)       │
│  Fila 2:   Mano de Obra Directa (Anexo II)      │
│  Fila 3:   Materiales Indirectos                │
│  Fila 4:   Combustible y Lubricantes            │
│  Fila 5:   Servicios Básicos                    │
│  Fila 6:   Depreciación                         │
│  Fila 7:   Alquileres                           │
│  Fila 8:   Seguros                              │
│  Fila 9:   Transporte                           │
│  Fila 10:  Otros Gastos Directos                │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│        COSTOS INDIRECTOS (Fila 11)              │
│  Gastos administrativos y de venta prorrateados │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│    COSTO TOTAL DIRECTO (Fila 12)                │
│    = Suma(filas 1-10) + Fila 11                │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│    UTILIDAD (Fila 13.1)                         │
│    = ref('12.1') * 0.30                         │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│    SUBTOTAL + UTILIDAD (Fila 13.2)              │
│    = ref('12.1') + ref('13.1')                  │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│    IMPUESTO IVA (Fila 13.3)                     │
│    = ref('13.2') / 0.9 * 0.1                    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│    PRECIO FINAL (Fila 14.1)                     │
│    = ref('13.2') + ref('13.3')                  │
└─────────────────────────────────────────────────┘
```

---

## 9. Usar el Solver (Tablero KPIs)

El **Solver** (búsqueda de objetivo) te permite definir un precio meta y que el sistema calcule automáticamente el valor de una variable para alcanzarlo.

### Cómo Funciona

1. Navega al **Tablero KPIs** de la ficha de costo
2. Selecciona la **fila objetivo** (ej. `14.1 - Precio Final`)
3. Ingresa el **valor deseado** (ej. `$2,000.00`)
4. Selecciona la **variable a ajustar** (ej. `13.1 - Utilidad`)
5. Haz clic en **Calcular**

El solver utiliza un algoritmo de **búsqueda binaria con precisión Decimal.js** para encontrar el valor exacto de la variable.

### Ejemplo Práctico

```
Objetivo:  Precio Final (14.1) = $2,000.00
Variable:  Utilidad (13.1)

Resultado del Solver:
  → Utilidad = $1,187.65
  → Subtotal (13.2) = $1,817.65
  → IVA (13.3) = $182.35
  → Precio Final (14.1) = $2,000.00 ✓
```

> **💡 Tip:** El solver es ideal para fijar precios de venta competitivos. En lugar de calcular la utilidad manualmente, define el precio que el mercado acepta y deja que el sistema determine el margen resultante.

---

## 10. Revisar en Modo Auditoría

Antes de guardar o exportar, verifica que la ficha no tenga errores:

1. Cambia al **modo de vista Auditoría** usando el selector de vistas
2. El sistema ejecuta automáticamente las 8 validaciones
3. Revisa los errores detectados:

| Código de Error | Descripción |
|-----------------|-------------|
| **CYCLE** | Referencia circular detectada entre filas |
| **MISSING_REF** | Una fórmula referencia una fila inexistente |
| **SEMANTIC_DISCREPANCY** | Inconsistencia semántica en la fórmula |
| **INVALID_FORMULA** | Error de sintaxis en la fórmula |
| **HARD_RULE_VIOLATION** | Violación de una regla de negocio obligatoria |
| **TRIVIAL_FORMULA** | La fórmula es redundante (ej. `ref('1.1') * 1`) |
| **HIERARCHY** | Problema en la jerarquía de filas |
| **EXTERNAL_LINK** | Referencia a un dato externo no disponible |

4. Haz clic en cada error para navegar a la fila problemática
5. Corrige los errores y vuelve a ejecutar la auditoría

---

## 11. Modos de Vista Disponibles

CostPro ofrece 5 modos de visualización:

| Modo | Descripción |
|------|-------------|
| **Experto** | Muestra toda la información en línea (fórmulas, valores, errores) |
| **Asistido** | Wizard paso a paso para guiar la creación |
| **Lectura Narrativa** | Presenta la ficha como un documento narrativo |
| **Vistazo** | Vista de solo lectura simplificada |
| **Auditoría** | Enfocado en revisión de errores y validaciones |

---

## 12. Guardar y Exportar

### Guardar la Ficha

- Haz clic en **Guardar** en la barra superior
- La ficha se guarda automáticamente en el servidor via `POST /api/cost-sheets/save`

### Exportar

| Formato | Método | Ruta API |
|---------|--------|----------|
| **JSON** | Importar/Exportar estructura completa | `/api/cost-sheets/import-json` |
| **Excel** | Exportar como hoja de cálculo | `/api/cost-sheets/export-pdf` |
| **PDF** | Exportar como documento PDF | `/api/cost-sheets/export-pdf` |

### Importar una Ficha Existente

1. Haz clic en **Importar** en la vista de fichas
2. Selecciona un archivo JSON previamente exportado
3. El sistema reconstruye la ficha completa con todas sus secciones, anexos y fórmulas

> **💡 Tip:** El asistente de IA **Darian** puede ayudarte con preguntas sobre tu ficha de costo. Accede al chat desde el panel lateral y pregunta sobre fórmulas, estructura o cálculos.
