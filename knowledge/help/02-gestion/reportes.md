# Guía del Generador de Reportes

CostPro incluye un sistema integral de generación de reportes que permite analizar, auditar y exportar datos operativos de la empresa. El Generador de Reportes ofrece **11 tipos de reportes** que cubren todas las áreas funcionales del sistema, desde ventas e inventario hasta auditoría y cierres de caja.

## Acceso al Generador de Reportes

Para acceder al Generador de Reportes, navega a la siguiente ruta:

```
MULTI-TIENDA > Dashboard KPI > Generador de Reportes
```

El Generador se abre como un panel lateral que permite configurar y previsualizar reportes sin abandonar la vista actual. Los datos generados corresponden siempre a la **tienda activa** seleccionada en la barra superior.

> **Nota:** Los roles `admin` y `manager` pueden generar reportes de cualquier tienda. Los roles `encargado` y `clerk` solo acceden a reportes de su tienda asignada.

## Panel de Configuración

El panel de configuración es el primer paso para generar un reporte. Presenta los siguientes controles:

### Selección de Tipo de Reporte

Un menú desplegable permite elegir entre los 11 tipos de reporte disponibles. Cada tipo carga automáticamente las columnas y métricas relevantes para ese reporte.

### Filtros de Rango de Fechas

Todos los reportes admiten filtrado por rango de fechas:

| Filtro | Descripción |
|--------|-------------|
| **Fecha inicio** | Fecha inicial del período a analizar (inclusive) |
| **Fecha fin** | Fecha final del período a analizar (inclusive) |
| **Hoy** | Atajo para filtrar solo el día actual |
| **Esta semana** | Atajo para filtrar la semana en curso (lunes a domingo) |
| **Este mes** | Atajo para filtrar el mes calendario actual |

Los atajos de fecha se aplican automáticamente y actualizan ambos campos de fecha.

### Selección de Columnas

Dependiendo del tipo de reporte seleccionado, se muestra un selector de columnas que permite incluir o excluir campos específicos del resultado. Las columnas marcadas por defecto son las recomendadas para cada tipo de reporte.

### Opciones de Formato

El formato de salida determina la disposición visual del reporte:

| Formato | Tamaño | Uso recomendado |
|---------|--------|-----------------|
| **A4** | 210 × 297 mm | Impresión estándar en Europa y Latinoamérica |
| **Carta** | 216 × 279 mm | Impresión estándar en Estados Unidos y Canadá |
| **Legal** | 216 × 356 mm | Documentos legales y reportes con muchas columnas |

## Catálogo de Tipos de Reporte

La siguiente tabla detalla los 11 tipos de reporte disponibles en el sistema:

| Tipo de Reporte | Identificador | Descripción | Métricas Clave | Fuentes de Datos |
|----------------|---------------|-------------|----------------|------------------|
| **Ventas** | `sales` | Resumen de todas las transacciones de venta registradas en el período | Total vendido, cantidad de transacciones, ticket promedio, método de pago | `sales`, `sale_items` |
| **Ganancias** | `profit` | Análisis de margen de ganancia por venta y por producto | Ingresos brutos, costos asociados, margen bruto, margen porcentual | `sales`, `products` |
| **Inventario** | `inventory` | Estado actual del inventario con niveles de stock y valoración | Stock disponible, valor en inventario, productos con bajo stock, categorías | `products`, `inventory` |
| **Kardex** | `kardex` | Movimiento detallado de entradas y salidas por producto | Entradas, salidas, saldo actual, tipo de movimiento, fecha | `inventory_movements`, `products` |
| **Compras** | `purchases` | Registro de adquisiciones y recepciones de mercancía | Total comprado, proveedor, cantidad recibida, precio unitario | `purchases`, `receptions` |
| **Auditoría** | `audit` | Registro de acciones realizadas en el sistema por usuarios | Usuario, acción, módulo, fecha/hora, dirección IP, detalles del cambio | `audit_logs` |
| **Ficha de Costo** | `cost_sheet` | Resumen de fichas de costeo con cálculos y métodos | Costo total, método de cálculo, secciones, estado de auditoría | `cost_sheets`, `cost_items` |
| **Ingresos Diarios** | `daily_income` | Desglose de ingresos por día dentro del período seleccionado | Ingreso total por día, número de ventas, métodos de pago predominantes | `sales` |
| **Egresos Diarios** | `daily_expenses` | Desglose de egresos y gastos operativos por día | Egreso total por día, conceptos de gasto, frecuencia | `expenses` |
| **Transferencias** | `transfer` | Registro de transferencias de inventario entre tiendas | Origen, destino, productos transferidos, cantidades, estado | `transfers`, `transfer_items` |
| **Caja** | `cash` | Detalle de cierres de caja y arqueos | Efectivo inicial, ventas del período, efectivo final, diferencia | `cash_closures` |

## Vista Previa del Reporte

Tras configurar los parámetros y hacer clic en **Generar**, el sistema renderiza una vista previa del reporte directamente en el navegador. La vista previa incluye:

- **Encabezado:** Logo de la tienda, nombre de la empresa, fecha de generación y título del reporte.
- **Cuerpo:** Tabla con los datos filtrados según la configuración seleccionada.
- **Pie de página:** Número de páginas, generación automática de código de identificación del reporte.

> **Tip:** La vista previa utiliza renderizado PDF embebido, lo que garantiza que lo que ves en pantalla es exactamente lo que se imprimirá o descargará.

## Exportación del Reporte

Una vez satisfecho con la vista previa, el reporte puede exportarse en formato **PDF** mediante el botón de descarga. El archivo PDF generado conserva:

- El formato de página seleccionado (A4, Carta, Legal)
- Las columnas elegidas en la configuración
- Los filtros de fecha aplicados
- El logo y datos de la tienda activa

El archivo se descarga automáticamente al navegador con un nombre que incluye el tipo de reporte, la tienda y la fecha de generación.

## Registro de Auditoría

Cada reporte generado queda registrado en el sistema de auditoría. Para consultar el historial de reportes generados:

1. Accede al **AuditLogsModal** desde la barra superior o desde CONFIGURACIÓN.
2. Filtra por acción `report_generated` para ver todos los reportes emitidos.
3. Cada registro incluye: usuario que generó el reporte, tipo de reporte, parámetros de configuración, fecha/hora de generación.

> **Importante:** El registro de auditoría no puede ser modificado ni eliminado por ningún usuario, garantizando la trazabilidad completa de los reportes emitidos.

## Consejos para una Generación Óptima

- **Rangos amplios:** Para reportes con períodos superiores a un año, considera reducir las columnas para mejorar la legibilidad.
- **Kardex por producto:** El reporte Kardex puede generar un volumen alto de datos. Utiliza filtros de fecha cortos (semana o mes) para obtener resultados manejables.
- **Inventario:** El reporte de Inventario refleja el estado actual y no requiere rango de fechas, aunque puedes comparar con instantáneas anteriores.
- **Auditoría:** Evita rangos superiores a 30 días para el reporte de Auditoría, ya que registra cada acción individual del sistema.

## Mejores Prácticas por Tipo de Reporte

| Tipo de Reporte | Caso de Uso Recomendado | Frecuencia Sugerida |
|----------------|------------------------|---------------------|
| **Ventas** | Análisis de desempeño comercial por período | Diaria o semanal |
| **Ganancias** | Evaluación de márgenes y rentabilidad por producto | Mensual |
| **Inventario** | Revisión de niveles de stock y valoración | Semanal |
| **Kardex** | Investigación de discrepancias de stock por producto | Según necesidad |
| **Compras** | Control de adquisiciones y evaluación de proveedores | Mensual |
| **Auditoría** | Revisión de actividad de usuarios y cambios en el sistema | Mensual o trimestral |
| **Ficha de Costo** | Análisis de costos de producción y定价 | Al actualizar fichas |
| **Ingresos Diarios** | Flujo de caja y proyecciones de ingresos | Diaria |
| **Egresos Diarios** | Control de gastos operativos | Diaria o semanal |
| **Transferencias** | Seguimiento de movimientos entre sucursales | Semanal |
| **Caja** | Conciliación de cierres de caja y arqueos | Al finalizar cada turno |

> **Nota:** Los reportes de Ventas y Ganancias se complementan entre sí. Se recomienda generar ambos para obtener una visión completa: Ventas para entender el volumen comercial y Ganancias para evaluar la rentabilidad neta de las operaciones.
