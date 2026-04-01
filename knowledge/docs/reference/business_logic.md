# Referencia de Lógica de Negocio (PRO)

Este documento sirve como base para la documentación contextual integrada en la vista de Salud. Define el propósito operativo de los componentes clave de CostPro.

## Núcleo de Costos
- **CostSheetWizard**: Facilita la creación estandarizada de fichas de costo. Automatiza la aplicación de la Resolución 12/2007 para asegurar que todos los cálculos de precios cumplan con la normativa legal vigente.
- **FormulaEditor**: Permite la personalización de algoritmos de formación de precios. Es la herramienta para directivos para ajustar márgenes de contribución y coeficientes de gastos indirectos sin intervención técnica.

## Gestión de Ingresos (IPV)
- **BankIngestion**: Punto de entrada para la digitalización de la economía. Transforma estados de cuenta bancarios en registros contables, eliminando errores manuales en la conciliación de pagos QR y transferencias.
- **IncomeReceiptSection**: Garantiza la transparencia fiscal. Genera el Modelo SC-3-01, documento legal indispensable para la declaración de ingresos ante las autoridades pertinentes.

## Control de Inventario
- **InventoryAdjustmentModal**: Controla las desviaciones de inventario. Cada ajuste requiere una justificación que se audita automáticamente para prevenir mermas no autorizadas o fraudes.
- **CatalogTable**: El cerebro de los productos. Centraliza el costo unitario y el precio de venta sugerido, asegurando que todos los puntos de venta operen con márgenes unificados.

## Gobernanza y Salud
- **SystemHealthView**: El panel de control ejecutivo. Traduce métricas técnicas complejas en un Índice de Salud (SHI) que permite a los dueños de negocio entender la estabilidad y seguridad de su inversión tecnológica.
- **AuditSummary**: El "ojo que todo lo ve". Registra cada cambio sensible en el sistema, permitiendo reconstruir eventos en caso de discrepancias operativas o auditorías de seguridad.
