# Procedimientos Paso a Paso

## Cómo gestionar Conciliación de Inventario (Control de Inventario y Ventas)
Asegurar que cada peso recibido en el banco corresponda a una salida de inventario válida.

### Pasos:
1. Importar extracto bancario en BankIngestion
2. Verificar catálogo en CatalogTable
3. Ejecutar MatchingEngine para cruzar datos
4. Revisar resultados en MatchingAuditView

## Cómo gestionar Gestión de Fichas de Costo
Calcular con precisión el costo de producción y establecer precios competitivos.

### Pasos:
1. Crear nueva ficha de costo
2. Agregar insumos y mano de obra
3. Calcular márgenes y precios sugeridos
4. Generar reportes y anexos

## Cómo gestionar Gestión de Productos y Precios
Mantener un catálogo actualizado para la automatización del matching.

### Pasos:
1. Crear o importar productos
2. Definir variaciones permitidas
3. Organizar por grupos y subgrupos

## Cómo gestionar Conteo y Ajuste de Inventario
Mantener la integridad de los datos de stock físico contra el sistema.

### Pasos:
1. Realizar conteo físico de productos
2. Registrar diferencias en el sistema
3. Ajustar niveles de stock

## Cómo gestionar Punto de Venta (POS)
Agilizar las ventas directas y el registro de ingresos.

### Pasos:
1. Escanear productos
2. Gestionar carrito de compras
3. Procesar pagos y generar facturas

## Cómo gestionar Aprendizaje y Capacitación (Academy)
Capacitar a los usuarios en el uso del sistema y conceptos contables mediante repetición espaciada.

### Pasos:
1. Acceder al módulo Academy
2. Seleccionar categoría de estudio
3. Realizar sesiones de repaso con Flashcards
4. Monitorear progreso en Mastery Panel de Control

## Cómo gestionar Gestión de Billetera y Notificaciones (Billetera Digital)
Centralizar y analizar el flujo de caja proveniente de notificaciones bancarias digitales.

### Pasos:
1. Importar mensajes de texto o archivos de banco
2. Visualizar registros crudos en la pestaña BD
3. Analizar métricas financieras en Analytics Panel de Control

## Cómo gestionar SettingsView
Interfaz para gestionar SettingsView.

### Pasos:
1. handleAddKey
2. handleDeleteKey
3. handleToggleKeyStatus
4. handleUpdateKey

## Cómo gestionar Panel de ControlView
Interfaz para gestionar Panel de ControlView.

### Pasos:
1. Calendar

## Cómo gestionar RecentCostSheets
Interfaz para gestionar RecentCostSheets.

### Pasos:
1. handleSelect

## Cómo gestionar ReportsView
Interfaz para gestionar ReportsView.

### Pasos:
1. handleExportExcel
2. handleGenerate
3. handleSave

## Cómo gestionar HelpView
Interfaz para gestionar HelpView.

### Pasos:
1. Calendar

## Cómo gestionar CashClosureView
Interfaz para gestionar CashClosureView.

### Pasos:
1. handleProcessClosure
2. handleRefresh

## Cómo gestionar ReceptionsHistoryView
Interfaz para gestionar ReceptionsHistoryView.

### Pasos:
1. handleDelete
2. handleEdit
3. Calendar

## Cómo gestionar StockHistoryView
Interfaz para gestionar StockHistoryView.

### Pasos:
1. onDateRangeChange
2. onRefresh
3. onSearchChange
4. Calendar

## Cómo gestionar AuditLogsView
Interfaz para gestionar AuditLogsView.

### Pasos:
1. handleExportPdf

## Cómo gestionar UsersManagementView
Interfaz para gestionar UsersManagementView.

### Pasos:
1. Select
2. Switch

## Cómo gestionar RolesManagementView
Interfaz para gestionar RolesManagementView.

### Pasos:
1. handleCreate
2. handleDelete
3. handleEdit
4. handleSubmit

## Cómo gestionar RSSManagementView
Interfaz para gestionar RSSManagementView.

### Pasos:
1. handleAddFeed
2. handleAddKeyword
3. handleDeleteFeed
4. handleRemoveKeyword
5. handleToggleFeed
