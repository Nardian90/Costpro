# Referencia de Interfaces

## SystemHealthView
**Ruta:** `src/components/views/terminal/views/health/SystemHealthView.tsx`

**Salidas esperadas:** Card List

## WalletView
**Ruta:** `src/components/views/terminal/views/wallet/WalletView.tsx`

**Acciones disponibles:** handleImport

**Salidas esperadas:** Card List, Chart, Table

## CatalogView
**Ruta:** `src/components/views/terminal/views/catalog/CatalogView.tsx`

**Acciones disponibles:** handleAddVariant, handleDeleteProduct, handleDeleteVariant, handleImportFileChange, handlePrintLabel, handleToggleActive, handleUpdateImage, handleUpdateProduct

**Salidas esperadas:** Card List, Table

## SettingsView
**Ruta:** `src/components/views/terminal/views/settings/SettingsView.tsx`

**Acciones disponibles:** handleAddKey, handleDeleteKey, handleToggleKeyStatus, handleUpdateKey

## DashboardView
**Ruta:** `src/components/views/terminal/views/dashboard/DashboardView.tsx`

**Salidas esperadas:** Card List, Summary Panel

## useDashboardView
**Ruta:** `src/components/views/terminal/views/dashboard/useDashboardView.ts`

## ConcentricDashboardRing
**Ruta:** `src/components/views/terminal/views/dashboard/ConcentricDashboardRing.tsx`

## ExecutiveKpiCards
**Ruta:** `src/components/views/terminal/views/dashboard/ExecutiveKpiCards.tsx`

**Salidas esperadas:** Card List

## RecentCostSheets
**Ruta:** `src/components/views/terminal/views/dashboard/RecentCostSheets.tsx`

**Acciones disponibles:** handleSelect

## ReportsView
**Ruta:** `src/components/views/terminal/views/reports/ReportsView.tsx`

**Acciones disponibles:** handleExportExcel, handleGenerate, handleSave

**Salidas esperadas:** Card List

## StoresManagementView
**Ruta:** `src/components/views/terminal/views/stores/StoresManagementView.tsx`

## AcademyView
**Ruta:** `src/components/views/terminal/views/academy/AcademyView.tsx`

**Acciones disponibles:** handleGenerate, handleScore

**Salidas esperadas:** Card List, Chart

## TransferenciasView
**Ruta:** `src/components/views/terminal/views/transfers/TransferenciasView.tsx`

## HelpView
**Ruta:** `src/components/views/terminal/views/help/HelpView.tsx`

**Salidas esperadas:** Card List

## InventoryCardView
**Ruta:** `src/components/views/terminal/views/inventory/InventoryCardView.tsx`

**Salidas esperadas:** Card List

## InventoryAdjustmentsView
**Ruta:** `src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx`

**Acciones disponibles:** onRefresh

## ProductReceptionView
**Ruta:** `src/components/views/terminal/views/inventory/ProductReceptionView.tsx`

**Acciones disponibles:** handleExport, handleFileChange, handleImportClick

**Salidas esperadas:** Summary Panel, Table

## InventoryTableView
**Ruta:** `src/components/views/terminal/views/inventory/InventoryTableView.tsx`

**Salidas esperadas:** Table

## InventoryView
**Ruta:** `src/components/views/terminal/views/inventory/InventoryView.tsx`

**Acciones disponibles:** handleAdjustProduct, handleCategoryChange, handleConfirmAdjustment

**Salidas esperadas:** Card List, Table

## CashClosureView
**Ruta:** `src/components/views/terminal/views/cash_closure/CashClosureView.tsx`

**Acciones disponibles:** handleProcessClosure, handleRefresh

**Salidas esperadas:** Card List, Table

## SalesHistoryView
**Ruta:** `src/components/views/terminal/views/sales/SalesHistoryView.tsx`

**Salidas esperadas:** Card List, Table

## ReceptionsHistoryView
**Ruta:** `src/components/views/terminal/views/receptions/ReceptionsHistoryView.tsx`

**Acciones disponibles:** handleDelete, handleEdit

**Salidas esperadas:** Table

## StockHistoryView
**Ruta:** `src/components/views/terminal/views/stock_history/StockHistoryView.tsx`

**Acciones disponibles:** onDateRangeChange, onRefresh, onSearchChange

## IPVView
**Ruta:** `src/components/views/terminal/views/ipv/IPVView.tsx`

**Acciones disponibles:** handleForceMatch, handleGlobalRecalculate, handleImportBackup, handleRunMatching

**Salidas esperadas:** Card List, Chart, Table

## MovementsView
**Ruta:** `src/components/views/terminal/views/ipv/MovementsView.tsx`

**Salidas esperadas:** Card List, Table

## IPVReportView
**Ruta:** `src/components/views/terminal/views/ipv/IPVReportView.tsx`

**Acciones disponibles:** handleAnularReport, handleCloseReport, handleDeleteReport, handleRefreshReport

**Salidas esperadas:** Summary Panel, Table

## MatchingAuditView
**Ruta:** `src/components/views/terminal/views/ipv/MatchingAuditView.tsx`

**Salidas esperadas:** Card List, Chart, Table

## TransferQRReportView
**Ruta:** `src/components/views/terminal/views/ipv/TransferQRReportView.tsx`

**Acciones disponibles:** handleExportPDF, handleUpdateRow

**Salidas esperadas:** Card List, Table

## ManualReconciliationView
**Ruta:** `src/components/views/terminal/views/ipv/ManualReconciliationView.tsx`

**Acciones disponibles:** handleSave

## PivotStatementView
**Ruta:** `src/components/views/terminal/views/ipv/PivotStatementView.tsx`

**Salidas esperadas:** Card List, Table

## InventoryCountTableView
**Ruta:** `src/components/views/terminal/views/inventory_count/InventoryCountTableView.tsx`

**Salidas esperadas:** Table

## InventoryCountCardView
**Ruta:** `src/components/views/terminal/views/inventory_count/InventoryCountCardView.tsx`

**Salidas esperadas:** Card List

## InventoryCountView
**Ruta:** `src/components/views/terminal/views/inventory_count/InventoryCountView.tsx`

**Salidas esperadas:** Card List, Table

## WikiView
**Ruta:** `src/components/views/terminal/views/wiki/WikiView.tsx`

## POSTableView
**Ruta:** `src/components/views/terminal/views/pos/POSTableView.tsx`

**Salidas esperadas:** Table

## POSView
**Ruta:** `src/components/views/terminal/views/pos/POSView.tsx`

**Acciones disponibles:** handleClearCart, handleScan, onAddToCart

**Salidas esperadas:** Card List, Summary Panel, Table

## AuditTableView
**Ruta:** `src/components/views/terminal/views/audit/AuditTableView.tsx`

**Salidas esperadas:** Table

## AuditLogsView
**Ruta:** `src/components/views/terminal/views/audit/AuditLogsView.tsx`

**Acciones disponibles:** handleExportPdf

**Salidas esperadas:** Table

## CostSheetAuditView
**Ruta:** `src/components/views/terminal/views/cost_sheet/CostSheetAuditView.tsx`

**Salidas esperadas:** Card List, Summary Panel

## CostSheetView
**Ruta:** `src/components/views/terminal/views/cost_sheet/CostSheetView.tsx`

**Acciones disponibles:** handleBottomAction, handleExportExcel, handleExportJSON, handleExportPDF, handleImportJSON, handleQuickGenerate, handleSetActiveSection, handleSetViewMode, onOpenAnnexes, onOpenSections

**Salidas esperadas:** Card List, Chart, Summary Panel, Table

## CostSheetCardView
**Ruta:** `src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx`

**Acciones disponibles:** handleImportSectionExcel, handleToggle, handleTotalSave, handleVHSave, handleValueChange

**Salidas esperadas:** Card List, Summary Panel

## UsersManagementView
**Ruta:** `src/components/views/terminal/views/users/UsersManagementView.tsx`

**Salidas esperadas:** Table

## RolesManagementView
**Ruta:** `src/components/views/terminal/views/users/RolesManagementView.tsx`

**Acciones disponibles:** handleCreate, handleDelete, handleEdit, handleSubmit

**Salidas esperadas:** Table

## RSSManagementView
**Ruta:** `src/components/views/terminal/views/rss/RSSManagementView.tsx`

**Acciones disponibles:** handleAddFeed, handleAddKeyword, handleDeleteFeed, handleRemoveKeyword, handleToggleFeed

## NewsView
**Ruta:** `src/components/views/terminal/views/rss/NewsView.tsx`

**Salidas esperadas:** Card List

## LegalView
**Ruta:** `src/components/views/terminal/views/legal/LegalView.tsx`
