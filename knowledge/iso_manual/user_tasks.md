# Tareas del Usuario

Guía rápida de funcionalidades principales y sus propósitos:

## Conciliación de Inventario (Control de Inventario y Ventas)
**Propósito:** Asegurar que cada peso recibido en el banco corresponda a una salida de inventario válida.

**Acciones clave:**
- Importar extracto bancario en BankIngestion
- Verificar catálogo en CatalogTable
- Ejecutar MatchingEngine para cruzar datos
- Revisar resultados en MatchingAuditView

## Gestión de Fichas de Costo
**Propósito:** Calcular con precisión el costo de producción y establecer precios competitivos.

**Acciones clave:**
- Crear nueva ficha de costo
- Agregar insumos y mano de obra
- Calcular márgenes y precios sugeridos
- Generar reportes y anexos

## Gestión de Productos y Precios
**Propósito:** Mantener un catálogo actualizado para la automatización del matching.

**Acciones clave:**
- Crear o importar productos
- Definir variaciones permitidas
- Organizar por grupos y subgrupos

## Conteo y Ajuste de Inventario
**Propósito:** Mantener la integridad de los datos de stock físico contra el sistema.

**Acciones clave:**
- Realizar conteo físico de productos
- Registrar diferencias en el sistema
- Ajustar niveles de stock

## Punto de Venta (POS)
**Propósito:** Agilizar las ventas directas y el registro de ingresos.

**Acciones clave:**
- Escanear productos
- Gestionar carrito de compras
- Procesar pagos y generar facturas

## Aprendizaje y Capacitación (Academy)
**Propósito:** Capacitar a los usuarios en el uso del sistema y conceptos contables mediante repetición espaciada.

**Acciones clave:**
- Acceder al módulo Academy
- Seleccionar categoría de estudio
- Realizar sesiones de repaso con Flashcards
- Monitorear progreso en Mastery Panel de Control

## Gestión de Billetera y Notificaciones (Billetera Digital)
**Propósito:** Centralizar y analizar el flujo de caja proveniente de notificaciones bancarias digitales.

**Acciones clave:**
- Importar mensajes de texto o archivos de banco
- Visualizar registros crudos en la pestaña BD
- Analizar métricas financieras en Analytics Panel de Control

## SystemHealthView
**Propósito:** Interfaz para gestionar SystemHealthView.

## SettingsView
**Propósito:** Interfaz para gestionar SettingsView.

**Acciones clave:**
- handleAddKey
- handleDeleteKey
- handleToggleKeyStatus
- handleUpdateKey

## Panel de Control
**Propósito:** Interfaz para gestionar Panel de ControlView.

**Acciones clave:**
- Calendar

## usePanel de Control
**Propósito:** Interfaz para gestionar usePanel de ControlView.ts.

## ConcentricPanel de ControlRing
**Propósito:** Interfaz para gestionar ConcentricPanel de ControlRing.

## ExecutiveKpiCards
**Propósito:** Interfaz para gestionar ExecutiveKpiCards.

## RecentCostSheets
**Propósito:** Interfaz para gestionar RecentCostSheets.

**Acciones clave:**
- handleSelect

## ReportsView
**Propósito:** Interfaz para gestionar ReportsView.

**Acciones clave:**
- handleExportExcel
- handleGenerate
- handleSave

## StoresManagementView
**Propósito:** Interfaz para gestionar StoresManagementView.

## TransferenciasView
**Propósito:** Interfaz para gestionar TransferenciasView.

## HelpView
**Propósito:** Interfaz para gestionar HelpView.

**Acciones clave:**
- Calendar

## CashClosureView
**Propósito:** Interfaz para gestionar CashClosureView.

**Acciones clave:**
- handleProcessClosure
- handleRefresh

## SalesHistoryView
**Propósito:** Interfaz para gestionar SalesHistoryView.

## ReceptionsHistoryView
**Propósito:** Interfaz para gestionar ReceptionsHistoryView.

**Acciones clave:**
- handleDelete
- handleEdit
- Calendar

## StockHistoryView
**Propósito:** Interfaz para gestionar StockHistoryView.

**Acciones clave:**
- onDateRangeChange
- onRefresh
- onSearchChange
- Calendar

## WikiView
**Propósito:** Interfaz para gestionar WikiView.

## AuditTableView
**Propósito:** Interfaz para gestionar AuditTableView.

## AuditLogsView
**Propósito:** Interfaz para gestionar AuditLogsView.

**Acciones clave:**
- handleExportPdf

## UsersManagementView
**Propósito:** Interfaz para gestionar UsersManagementView.

**Acciones clave:**
- Select
- Switch

## RolesManagementView
**Propósito:** Interfaz para gestionar RolesManagementView.

**Acciones clave:**
- handleCreate
- handleDelete
- handleEdit
- handleSubmit

## RSSManagementView
**Propósito:** Interfaz para gestionar RSSManagementView.

**Acciones clave:**
- handleAddFeed
- handleAddKeyword
- handleDeleteFeed
- handleRemoveKeyword
- handleToggleFeed

## NewsView
**Propósito:** Interfaz para gestionar NewsView.

## LegalView
**Propósito:** Interfaz para gestionar LegalView.
