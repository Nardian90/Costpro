# Explicación: Sistema IPV (Índice de Precios y Variaciones)

Documentación completa del sistema IPV de CostPro: seguimiento de precios, análisis de variaciones, control de márgenes y procesamiento inteligente con IA.

---

## 1. ¿Qué Hace el Sistema IPV?

El sistema **IPV (Índice de Precios y Variaciones)** es el módulo analítico de CostPro encargado de:

- **Seguimiento de precios:** Registro histórico completo de precios de compra y venta por producto
- **Análisis de variaciones:** Detección y cuantificación de cambios de precio entre períodos
- **Control de márgenes:** Monitoreo del impacto de las variaciones de costo sobre los márgenes de ganancia
- **Auditoría de precios:** Trail completo de todos los cambios de precio con timestamp y usuario
- **Procesamiento inteligente:** Motor de reglas y simulación con IA para automatizar la categorización y detección de anomalías

> **💡 En resumen:** El IPV es el radar de CostPro. Mientras la ficha de costo define cómo se calcula el precio de un producto, el IPV monitorea cómo cambian esos precios en el tiempo y alerta cuando algo sale de lo normal.

---

## 2. Estructura de Módulos

El sistema IPV se organiza en **5 sub-grupos** funcionales:

```
SISTEMA IPV
├── 📊 Reportes y Extractos
│   ├── Analytics
│   ├── Reportes
│   ├── Recibos
│   ├── Transferencias
│   ├── QR
│   ├── Ingestión
│   └── Pivot
│
├── 💳 Operaciones
│   ├── Dashboard IPV
│   └── Transacciones
│
├── 📦 Catálogos
│   ├── Catálogo de Productos
│   └── Catálogo de Clientes
│
├── 🤖 Procesamiento IA
│   ├── Motor de Reglas
│   ├── Simulación
│   ├── Recibos Inteligentes
│   └── Desglose
│
└── ⚙️ Avanzado
    ├── Auditoría
    ├── Movimientos
    ├── Planificación
    ├── Errores
    ├── Reglas de Mapeo
    ├── MVT
    └── Mipyme
```

---

## 3. Reportes y Extractos

### Analytics (Analítica)

Dashboard interactivo con métricas clave del IPV:

- **Índice de precios general:** Evolución agregada del nivel de precios
- **Variación por categoría:** Cambios porcentuales agrupados por línea de producto
- **Top variaciones:** Productos con mayor cambio de precio (positivo y negativo)
- **Tendencias:** Gráficos de series temporales con detección de patrones estacionales

### Reportes (Informes Periódicos)

Generación de reportes programados o bajo demanda:

- **Reporte diario:** Resumen de variaciones del día
- **Reporte semanal:** Tendencias de la semana con comparativa
- **Reporte mensual:** Análisis consolidado con desglose por categoría
- **Reporte personalizado:** Filtros por fecha, categoría, proveedor, rango de variación

### Recibos (Comprobantes SC-204)

Vista previa y gestión de recibos con formato **SC-204**:

- Previsualización del comprobante antes de su emisión definitiva
- Historial de recibos emitidos con filtros de búsqueda
- Descarga en múltiples formatos

### Transferencias

Registro y seguimiento de transferencias de precios entre almacenes o tiendas:

- Origen y destino de la transferencia
- Productos involucrados y cantidades
- Precios aplicados en cada punto
- Estado de la transferencia (pendiente, confirmada, cancelada)

### QR

Generación y lectura de códigos QR vinculados a productos:

- Código QR por producto con precio actual
- Escaneo rápido para consulta de precio
- Vinculación con el catálogo de productos

### Ingestión (Carga Masiva)

Importación automatizada de datos de precios desde fuentes externas:

- Carga desde archivos CSV/Excel
- Importación desde APIs de proveedores
- Ingestión programada con intervalos configurables

### Pivot (Tablas Dinámicas)

Análisis multidimensional de datos de precios:

- Filas, columnas y valores configurables
- Agregaciones: suma, promedio, mínimo, máximo, conteo
- Filtros dinámicos por múltiples dimensiones
- Exportación a Excel

---

## 4. Operaciones

### Dashboard IPV

Panel principal del sistema con visión general del estado de precios:

```
┌──────────────────────────────────────────────────────┐
│                DASHBOARD IPV                          │
├──────────┬──────────┬──────────┬─────────────────────┤
│ Variación│ Alertas  │ Prod.    │ Última              │
│ Promedio │ Activas  │ Actuali. │ Actualización       │
│  +3.2%   │    5     │  1,247   │  Hace 2 min         │
├──────────┴──────────┴──────────┴─────────────────────┤
│                                                      │
│  📈 Índice de Precios (últimos 6 meses)              │
│  ╭──────────────────────────────────╮               │
│  │    105 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─     │               │
│  │    103 ─ ─ ─ ─╮                 │               │
│  │    101 ─ ─ ─╮ │                 │               │
│  │     99 ╭──╮ │ │                 │               │
│  │        │  │ │ │                 │               │
│  │  Ene  Feb Mar Abr May Jun       │               │
│  ╰──────────────────────────────────╯               │
│                                                      │
│  ⚠️ Top Alertas:                                     │
│  • Madera Roble: +15.2% (supera umbral 10%)          │
│  • Tornillos 2": Precio no actualizado en 30 días    │
│  • Pegamento: Anomalía detectada en última carga      │
└──────────────────────────────────────────────────────┘
```

### Transacciones

Procesamiento de transacciones bancarias vinculadas a movimientos de precios:

- **Importación de extractos bancarios:** Carga de archivos de estado de cuenta
- **Conciliación automática:** Matching entre transacciones bancarias y movimientos internos
- **Categorización:** Clasificación de transacciones por tipo (compra, venta, ajuste)
- **Historial:** Registro completo de todas las transacciones procesadas

---

## 5. Catálogos

### Catálogo de Productos

Registro maestro de productos con seguimiento de precios:

| Campo | Descripción |
|-------|-------------|
| **Código** | Identificador único del producto |
| **Nombre** | Descripción del producto |
| **Categoría** | Clasificación (jerárquica) |
| **Precio de compra actual** | Último precio registrado |
| **Precio de venta actual** | Precio al público vigente |
| **Historial de precios** | Lista cronológica de todos los cambios |
| **Última actualización** | Fecha del último cambio de precio |
| **Proveedor** | Proveedor principal del producto |

**Funcionalidades:**
- Búsqueda y filtros avanzados
- Historial completo de cambios de precio por producto
- Comparación de precio de compra vs venta
- Alertas de precio por producto

### Catálogo de Clientes

Registro de clientes con información de precios especiales:

- Datos de contacto del cliente
- Lista de precios asignada (si aplica descuentos especiales)
- Historial de transacciones por cliente
- Condiciones comerciales particulares

---

## 6. Procesamiento IA

El módulo de Procesamiento IA automatiza tareas de análisis y categorización utilizando reglas configurables e inteligencia artificial.

### Motor de Reglas

Sistema de reglas para clasificar y procesar automáticamente las variaciones de precio:

```
Ejemplo de regla:
┌──────────────────────────────────────────────┐
│ REGLA: "Alerta de aumento significativo"     │
├──────────────────────────────────────────────┤
│ SI  variación > 10%                          │
│ Y   categoría = "Materia Prima"              │
│ ENTONCES                                     │
│   → Generar alerta ALTA                      │
│   → Notificar al administrador               │
│   → Marcar para revisión en costos           │
└──────────────────────────────────────────────┘
```

**Características:**
- Reglas configurables con condiciones múltiples (AND/OR)
- Acciones automáticas: alertas, notificaciones, marcado, recálculo
- Priorización de reglas (orden de evaluación)
- Historial de ejecución de reglas

### Simulación

Motor de simulación de escenarios de precio:

- **Simulación de aumento:** ¿Qué pasa si el costo de madera sube un 15%?
- **Simulación de margen:** ¿Cuánto margen pierdo si ajusto el precio de venta?
- **Simulación de volumen:** ¿Cómo afecta un cambio de volumen al costo unitario?
- **Comparación de escenarios:** Visualización lado a lado de múltiples escenarios

> **💡 Tip:** Usa la simulación antes de aprobar un cambio de precio. Puedes evaluar el impacto en el margen bruto, el precio final y la competitividad sin modificar los datos reales.

### Recibos Inteligentes

Categorización automática de comprobantes y recibos:

- **Clasificación automática:** El sistema identifica el tipo de comprobante (factura, recibo, nota de crédito)
- **Extracción de datos:** Reconocimiento de montos, fechas, proveedores
- **Vinculación automática:** Asocia el comprobante con el producto y movimiento correspondiente
- **Validación:** Verifica coherencia entre el comprobante y los datos registrados

### Desglose (Breakdown)

Análisis de desglose de costos y precios:

- Descomposición del precio final en componentes (materia prima, mano de obra, GIF, etc.)
- Comparación de la estructura de costo entre productos
- Identificación de componentes con mayor peso porcentual
- Análisis de sensibilidad por componente

---

## 7. Avanzado

### Auditoría

Registro completo y trazable de todas las acciones del sistema IPV:

- **Quién:** Usuario que realizó la acción
- **Qué:** Tipo de acción (creación, modificación, eliminación)
- **Cuándo:** Timestamp preciso
- **Valor anterior:** Estado antes del cambio
- **Valor nuevo:** Estado después del cambio
- **Razón:** Motivo declarado por el usuario (opcional)

### Movimientos

Seguimiento de todos los movimientos de precio:

- Registro de cada cambio de precio con referencia al producto
- Identificación del origen del cambio (manual, importación, regla automática)
- Vinculación con transacciones asociadas
- Filtros por fecha, producto, tipo de movimiento

### Planificación

Herramienta de planificación financiera basada en tendencias de precio:

- Proyección de costos futuros basada en datos históricos
- Escenarios optimista, pesimista y neutro
- Presupuestos de compra estimados
- Comparación planificado vs real

### Errores

Gestión centralizada de errores del sistema IPV:

- Registro de errores de procesamiento
- Clasificación por severidad (crítico, advertencia, informativo)
- Estado de resolución (pendiente, en proceso, resuelto)
- Reintentos automáticos para errores recuperables

### Reglas de Mapeo

Configuración de mapeos entre datos externos y el sistema interno:

- Mapeo de cuentas bancarias a categorías
- Correspondencia entre códigos de proveedor y productos
- Traducción de formatos de importación
- Normalización de datos de múltiples fuentes

### MVT (Formato Oficial de Exportación)

Generación de archivos en formato **MVT** para reportes regulatorios oficiales:

- Exportación en el formato requerido por las autoridades fiscales
- Cumplimiento de estructura y validaciones oficiales
- Programación de exportaciones periódicas
- Historial de exportaciones realizadas

> **⚠️ Importante:** El formato MVT debe cumplir con las especificaciones regulatorias vigentes. Verifica que los datos estén correctos antes de exportar, ya que estos archivos se envían a entidades gubernamentales.

### Mipyme (Pequeñas Empresas)

Módulo especializado para transacciones de pequeñas empresas:

- Registro simplificado de transacciones
- Categorías de gasto adaptadas a mipymes
- Reportes simplificados para declaración fiscal
- Límites y umbrales configurables según normativa

---

## 8. Flujo de Datos

El siguiente diagrama muestra cómo fluyen los datos a través del sistema IPV:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FUENTES DE DATOS                              │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Manuales │  │ Archivos │  │ APIs de  │  │ Transacciones     │   │
│  │ (ingreso)│  │CSV/Excel │  │Proveedores│ │  Bancarias        │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │              │              │                  │              │
└───────┼──────────────┼──────────────┼──────────────────┼──────────────┘
        │              │              │                  │
        ▼              ▼              ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      INGESTIÓN DE DATOS                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Módulo de Ingestión: normalización, validación, deduplicación│   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      PROCESAMIENTO                                  │
│                                                                      │
│  ┌───────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │ Motor de      │    │ Recibos          │    │ Reglas de        │  │
│  │ Reglas        │───▶│ Inteligentes     │───▶│ Mapeo            │  │
│  │ (IA)          │    │ (Categorización) │    │ (Normalización)  │  │
│  └───────────────┘    └──────────────────┘    └──────────────────┘  │
│                               │                                      │
│                               ▼                                      │
│                    ┌──────────────────────┐                         │
│                    │  Catálogos Actualiz. │                         │
│                    │  (Productos, Clientes)│                         │
│                    └──────────┬───────────┘                         │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      ANÁLISIS Y CÁLCULO                             │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ Cálculo  │  │ Detección│  │ Simulación│  │ Desglose        │    │
│  │ Variación│  │ Anomalías│  │ Escenarios│  │ (Breakdown)     │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘    │
│       │              │              │              │                 │
│       ▼              ▼              ▼              ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               Cálculo de Índices y Métricas                   │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
┌─────────────────────────┐  ┌──────────────────────────────────────┐
│    ALERTAS Y NOTIFIC.   │  │         REPORTES Y EXPORTACIONES     │
│                         │  │                                      │
│ • Umbrales excedidos    │  │ • Analytics (dashboard)              │
│ • Precios desactualiz.  │  │ • Reportes periódicos               │
│ • Anomalías detectadas  │  │ • Tablas Pivot                      │
│ • Auditores notificados │  │ • Recibos (SC-204)                  │
│                         │  │ • MVT (exportación oficial)         │
│                         │  │ • Mipyme (declaración fiscal)       │
└─────────────────────────┘  └──────────────────────────────────────┘
```

---

## 9. Sistema de Alertas

El sistema de alertas monitorea continuamente los datos del IPV y genera notificaciones automáticas cuando se detectan situaciones que requieren atención.

### Tipos de Alertas

| Tipo de Alerta | Condición | Severidad |
|----------------|-----------|-----------|
| **Variación de precio** | El cambio porcentual supera el umbral configurado | Alta / Media |
| **Precio desactualizado** | Un producto no tiene actualización de precio en N días | Media |
| **Anomalía en datos** | El sistema detecta un valor atípico o inconsistente | Alta |
| **Margen comprometido** | El margen bruto cae por debajo del mínimo aceptable | Alta |
| **Error de ingestión** | Falla en la importación de datos desde una fuente | Media / Baja |
| **Regla disparada** | Una regla del motor de reglas se ejecutó automáticamente | Variable |

### Configuración de Umbrales

Los umbrales son configurables por categoría de producto:

```
Ejemplo de configuración:

Categoría: Materia Prima
├── Umbral de alerta:     10%  (var. positiva o negativa)
├── Umbral crítico:       20%
├── Días sin actualizar:  30
└── Margen mínimo:        25%

Categoría: Servicios Básicos
├── Umbral de alerta:     5%
├── Umbral crítico:       15%
├── Días sin actualizar:  60
└── Margen mínimo:        15%
```

### Canales de Notificación

- **Notificaciones in-app:** Alertas visuales dentro del Dashboard IPV
- **Correo electrónico:** Envío de alertas a los administradores configurados
- **Historial de alertas:** Registro completo de todas las alertas generadas con su estado (nueva, leída, resuelta)

### Ciclo de Vida de una Alerta

```
1. DETECCIÓN  → El sistema identifica una condición de alerta
2. GENERACIÓN → Se crea la alerta con severidad y detalles
3. NOTIFICACIÓN → Se notifica al usuario responsable
4. REVISIÓN   → El usuario revisa y analiza la situación
5. ACCIÓN     → Se toma una medida correctiva (ajustar precio, contactar proveedor)
6. RESOLUCIÓN → Se marca la alerta como resuelta
7. AUDITORÍA  → Queda registrada en el log de auditoría
```

> **💡 Tip:** Configura los umbrales de alerta de forma conservadora al inicio. Es mejor recibir unas alertas额外的que perder una variación importante. Puedes ajustar los umbrales gradualmente según la experiencia.
