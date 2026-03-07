# Mapa Arquitectónico Vivo

| Nombre | Ruta | Tipo | Estado Salud | Dependencias | Última Auditoría |
| ------ | ---- | ---- | ------------ | ------------ | ---------------- |
| AcademyView | src/components/views/terminal/views/academy/AcademyView.tsx | view | Óptimo | MasteryDashboard, CostProLoader, Flashcard, button | 2026-03-07 |
| AuditLogsView | src/components/views/terminal/views/audit/AuditLogsView.tsx | view | Óptimo | tabs, useAuditLogsView, AuditTableView, StateRenderer, AuditTimeline | 2026-03-07 |
| AuditTableView | src/components/views/terminal/views/audit/AuditTableView.tsx | view | Óptimo | AuditEventIcon, cn | 2026-03-07 |
| CashClosureView | src/components/views/terminal/views/cash_closure/CashClosureView.tsx | view | Bueno | ActionMenu, cn | 2026-03-07 |
| CatalogView | src/components/views/terminal/views/catalog/CatalogView.tsx | view | Bueno | ProductImage, QueryInspector, CatalogModals, ActionMenu, ViewSwitcher | 2026-03-07 |
| ConcentricDashboardRing | src/components/views/terminal/views/dashboard/ConcentricDashboardRing.tsx | view | Óptimo | cn | 2026-03-07 |
| CostSheetAuditView | src/components/views/terminal/views/cost_sheet/CostSheetAuditView.tsx | view | Óptimo | calculateCostSheetHealth, CostSheetAuditLog, badge, scroll-area, card | 2026-03-07 |
| CostSheetCardView | src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx | view | Bueno | input, LazyRender, CircularProgress, CostSheetSectionActionsPanel, button | 2026-03-07 |
| CostSheetView | src/components/views/terminal/views/cost_sheet/CostSheetView.tsx | view | Advertencia | CostSheetQuickMode, ViewSwitcher, CostSheetNarrative, CostSheetMassiveGenerator, CostSheetInteractiveTable | 2026-03-07 |
| DashboardView | src/components/views/terminal/views/dashboard/DashboardView.tsx | view | Óptimo | calendar, StateRenderer, toggle-group, useDashboardView, popover | 2026-03-07 |
| ExecutiveKpiCards | src/components/views/terminal/views/dashboard/ExecutiveKpiCards.tsx | view | Óptimo | cn | 2026-03-07 |
| HelpView | src/components/views/terminal/views/help/HelpView.tsx | view | Bueno | KidsOnboarding, StickyCartFlowDiagram, InventoryAdjustmentFlowDiagram, OfflineSyncDiagram, CostFlowDiagram | 2026-03-07 |
| IPVReportView | src/components/views/terminal/views/ipv/IPVReportView.tsx | view | Advertencia | BaseModal, IPVPreviewModal, LoadingOverlay, input, tooltip | 2026-03-07 |
| IPVView | src/components/views/terminal/views/ipv/IPVView.tsx | view | Advertencia | TransactionBreakdown, MatchingRulesEditor, CatalogTable, IPVDatabase, MatchingEngine | 2026-03-07 |
| InventoryAdjustmentsView | src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx | view | Óptimo | SearchBar, QueryInspector, ActionMenu, cn | 2026-03-07 |
| InventoryCardView | src/components/views/terminal/views/inventory/InventoryCardView.tsx | view | Óptimo | CostProLoader, PrimaryButton, cn | 2026-03-07 |
| InventoryCountCard | src/components/views/terminal/views/inventory_count/InventoryCountCardView.tsx | view | Óptimo | InventoryCountView, cn | 2026-03-07 |
| InventoryCountTableView | src/components/views/terminal/views/inventory_count/InventoryCountTableView.tsx | view | Óptimo | InventoryCountView, cn | 2026-03-07 |
| InventoryCountView | src/components/views/terminal/views/inventory_count/InventoryCountView.tsx | view | Bueno | InventoryCountTableView, SearchBar, SecurityScrollContainer, InventoryCountCard, QueryInspector | 2026-03-07 |
| InventoryTableView | src/components/views/terminal/views/inventory/InventoryTableView.tsx | view | Óptimo | CostProLoader, cn, ProductImage | 2026-03-07 |
| InventoryView | src/components/views/terminal/views/inventory/InventoryView.tsx | view | Óptimo | SearchBar, InventoryCardView, StateRenderer, QueryInspector, ActionMenu | 2026-03-07 |
| LegalView | src/components/views/terminal/views/legal/LegalView.tsx | view | Óptimo | LegalConsultant, supabase, LegalModelForm, cn | 2026-03-07 |
| ManualReconciliationView | src/components/views/terminal/views/ipv/ManualReconciliationView.tsx | view | Bueno | input, extractCommission, badge, scroll-area, IPVDatabase | 2026-03-07 |
| NewsView | src/components/views/terminal/views/rss/NewsView.tsx | view | Óptimo | StateRenderer, cn | 2026-03-07 |
| POSTableView | src/components/views/terminal/views/pos/POSTableView.tsx | view | Óptimo | cn, ProductImage | 2026-03-07 |
| POSView | src/components/views/terminal/views/pos/POSView.tsx | view | Bueno | BaseModal, SearchBar, StateRenderer, SpeedDial, QueryInspector | 2026-03-07 |
| PivotStatementView | src/components/views/terminal/views/ipv/PivotStatementView.tsx | view | Bueno | IPVDatabase, card, button, table, cn | 2026-03-07 |
| ProductReceptionView | src/components/views/terminal/views/inventory/ProductReceptionView.tsx | view | Bueno | SecurityScrollContainer, BaseModal, ActionMenu, supabase, PrimaryButton | 2026-03-07 |
| RSSManagementView | src/components/views/terminal/views/rss/RSSManagementView.tsx | view | Óptimo | StateRenderer, cn | 2026-03-07 |
| RecentCostSheets | src/components/views/terminal/views/dashboard/RecentCostSheets.tsx | view | Óptimo | cn | 2026-03-07 |
| ReceptionsHistoryView | src/components/views/terminal/views/receptions/ReceptionsHistoryView.tsx | view | Óptimo | SearchBar, useReceptionsHistoryView, StateRenderer, QueryInspector, skeleton | 2026-03-07 |
| ReportsView | src/components/views/terminal/views/reports/ReportsView.tsx | view | Óptimo | AuditLogsModal, ReportConfigPanel, ActionMenu, ReportPreview, CostProLoader | 2026-03-07 |
| RolesManagementView | src/components/views/terminal/views/users/RolesManagementView.tsx | view | Óptimo | SearchBar, BaseModal, RoleForm, ActionMenu, cn | 2026-03-07 |
| SalesHistoryView | src/components/views/terminal/views/sales/SalesHistoryView.tsx | view | Óptimo | SearchBar, StateRenderer, TaxCalculationModal, useSalesHistoryView, TransactionDetailsModal | 2026-03-07 |
| SettingsView | src/components/views/terminal/views/settings/SettingsView.tsx | view | Bueno | supabase, cn | 2026-03-07 |
| StockHistoryView | src/components/views/terminal/views/stock_history/StockHistoryView.tsx | view | Óptimo | SearchBar, QueryInspector, ActionMenu, cn | 2026-03-07 |
| StoresManagementView | src/components/views/terminal/views/stores/StoresManagementView.tsx | view | Óptimo | SearchBar, StoreModals, ActionMenu, useStoresView, cn | 2026-03-07 |
| SystemHealthView | src/components/views/terminal/views/health/SystemHealthView.tsx | view | Bueno | ReleaseGateStatus, ApplicationMetrics, InfrastructureMetrics, ReleaseGatePdfExporter, dropdown-menu | 2026-03-07 |
| TransferQRReportView | src/components/views/terminal/views/ipv/TransferQRReportView.tsx | view | Bueno | label, input, badge, IPVDatabase, supabase | 2026-03-07 |
| TransferenciasView | src/components/views/terminal/views/transfers/TransferenciasView.tsx | view | Óptimo | StateRenderer, ActionMenu, TransferDetailsModal, CreateTransferModal, cn | 2026-03-07 |
| UsersManagementView | src/components/views/terminal/views/users/UsersManagementView.tsx | view | Óptimo | SearchBar, select, ActionMenu, button, switch | 2026-03-07 |
| useDashboardView | src/components/views/terminal/views/dashboard/useDashboardView.ts | view | Óptimo |  | 2026-03-07 |
| ActionMenu | src/components/ui/ActionMenu.tsx | component | Bueno | tooltip, cn | 2026-03-07 |
| ApplicationMetrics | src/components/views/terminal/views/health/ApplicationMetrics.tsx | component | Óptimo | cn | 2026-03-07 |
| ArchitectureAuditTable | src/components/views/terminal/views/health/ArchitectureAuditTable.tsx | component | Óptimo | input, badge, table, cn | 2026-03-07 |
| AuditEventCard | src/components/views/terminal/views/audit/AuditEventCard.tsx | component | Bueno | AuditEventMeta, AuditEventIcon, cn | 2026-03-07 |
| AuditEventIcon | src/components/views/terminal/views/audit/AuditEventIcon.tsx | component | Óptimo | cn | 2026-03-07 |
| AuditEventMeta | src/components/views/terminal/views/audit/AuditEventMeta.tsx | component | Óptimo | cn | 2026-03-07 |
| AuditFilters | src/components/views/terminal/views/audit/AuditFilters.tsx | component | Óptimo | AuditEventIcon, cn | 2026-03-07 |
| AuditLogsModal | src/components/views/terminal/views/reports/AuditLogsModal.tsx | component | Óptimo | dialog, StateRenderer, skeleton, AuditTimeline | 2026-03-07 |
| AuditSummary | src/components/views/terminal/views/health/AuditSummary.tsx | component | Óptimo |  | 2026-03-07 |
| AuditTimeline | src/components/views/terminal/views/audit/AuditTimeline.tsx | component | Óptimo | AuditEventCard, cn | 2026-03-07 |
| AutomationWorkflowDiagram | src/components/auth/diagrams/AutomationWorkflowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| BankIngestion | src/components/views/terminal/views/ipv/BankIngestion.tsx | component | Bueno | BaseModal, extractCommission, IPVDatabase, badge, MatchingEngine | 2026-03-07 |
| BarcodeScanner | src/components/modals/BarcodeScanner.tsx | component | Óptimo | BaseModal, PrimaryButton | 2026-03-07 |
| BaseModal | src/components/ui/BaseModal.tsx | component | Óptimo | dialog, cn | 2026-03-07 |
| CashFlowDiagram | src/components/views/terminal/views/help/help/CashFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| CatalogModals | src/components/views/terminal/views/catalog/CatalogModals.tsx | component | Bueno | PrimaryButton, ProductImage, BaseModal, cn | 2026-03-07 |
| CatalogTable | src/components/views/terminal/views/ipv/CatalogTable.tsx | component | Advertencia | label, BaseModal, input, tooltip, extractCommission | 2026-03-07 |
| ChatBot | src/components/ui/ChatBot.tsx | component | Bueno | cn | 2026-03-07 |
| CircularProgress | src/components/views/terminal/views/cost_sheet/CircularProgress.tsx | component | Óptimo | cn | 2026-03-07 |
| CostFlowDiagram | src/components/views/terminal/views/help/help/CostFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| CostProLoader | src/components/ui/CostProLoader.tsx | component | Óptimo | cn | 2026-03-07 |
| CostProLogo | src/components/CostProLogo.tsx | component | Óptimo |  | 2026-03-07 |
| CostSheetActionsPanel | src/components/views/terminal/views/cost_sheet/CostSheetActionsPanel.tsx | component | Bueno | CostSheetModeDropdown, ViewSwitcher, button, cn | 2026-03-07 |
| CostSheetAnnexEditor | src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx | component | Bueno | ProductInventoryPicker, input, ViewSwitcher, button, table | 2026-03-07 |
| CostSheetAnnexes | src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx | component | Óptimo | cn | 2026-03-07 |
| CostSheetAuditLog | src/components/views/terminal/views/cost_sheet/CostSheetAuditLog.tsx | component | Óptimo | types, badge, scroll-area, card, cn | 2026-03-07 |
| CostSheetBanner | src/components/views/terminal/views/cost_sheet/CostSheetBanner.tsx | component | Óptimo | CostSheetModeDropdown, ThemeToggle, button | 2026-03-07 |
| CostSheetBody | src/components/views/terminal/views/cost_sheet/CostSheetBody.tsx | component | Óptimo | cn | 2026-03-07 |
| CostSheetBottomNav | src/components/views/terminal/views/cost_sheet/CostSheetBottomNav.tsx | component | Óptimo | dropdown-menu, cn | 2026-03-07 |
| CostSheetCalculator | src/components/views/terminal/views/cost_sheet/CostSheetCalculator.tsx | component | Bueno | cn | 2026-03-07 |
| CostSheetExportModal | src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx | component | Óptimo | label, dialog, checkbox, scroll-area, button | 2026-03-07 |
| CostSheetFCDropdown | src/components/views/terminal/views/cost_sheet/CostSheetFCDropdown.tsx | component | Óptimo | dropdown-menu, cn | 2026-03-07 |
| CostSheetForm | src/components/views/terminal/views/cost_sheet/CostSheetForm.tsx | component | Bueno | label, input, button, table, cn | 2026-03-07 |
| CostSheetFormulaGuide | src/components/views/terminal/views/cost_sheet/CostSheetFormulaGuide.tsx | component | Óptimo | accordion | 2026-03-07 |
| CostSheetGenerateDropdown | src/components/views/terminal/views/cost_sheet/CostSheetGenerateDropdown.tsx | component | Óptimo | dropdown-menu | 2026-03-07 |
| CostSheetHeader | src/components/views/terminal/views/cost_sheet/CostSheetHeader.tsx | component | Óptimo | cn | 2026-03-07 |
| CostSheetHeaderEditor | src/components/views/terminal/views/cost_sheet/CostSheetHeaderEditor.tsx | component | Óptimo | input, label, card, cn | 2026-03-07 |
| CostSheetHelpDropdown | src/components/views/terminal/views/cost_sheet/CostSheetHelpDropdown.tsx | component | Óptimo | dropdown-menu | 2026-03-07 |
| CostSheetHelpPanel | src/components/views/terminal/views/cost_sheet/CostSheetHelpPanel.tsx | component | Óptimo | cn, CostSheetFormulaGuide | 2026-03-07 |
| CostSheetInteractiveTable | src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx | component | Advertencia | template, input, select, LazyRender, CostSheetSectionActionsPanel | 2026-03-07 |
| CostSheetMassiveGenerator | src/components/views/terminal/views/cost_sheet/CostSheetMassiveGenerator.tsx | component | Advertencia | tabs, label, dialog, checkbox, types | 2026-03-07 |
| CostSheetMasterRing | src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx | component | Óptimo | slider, cn | 2026-03-07 |
| CostSheetModeDropdown | src/components/views/terminal/views/cost_sheet/CostSheetModeDropdown.tsx | component | Óptimo | dropdown-menu, cn | 2026-03-07 |
| CostSheetNarrative | src/components/views/terminal/views/cost_sheet/CostSheetNarrative.tsx | component | Óptimo | cn | 2026-03-07 |
| CostSheetNav | src/components/views/terminal/views/cost_sheet/CostSheetNav.tsx | component | Óptimo | CostSheetModeDropdown, CostSheetGenerateDropdown, CostSheetHelpDropdown, ActionMenu, CostSheetFCDropdown | 2026-03-07 |
| CostSheetOptionsDropdown | src/components/views/terminal/views/cost_sheet/CostSheetOptionsDropdown.tsx | component | Óptimo | dropdown-menu | 2026-03-07 |
| CostSheetPreview | src/components/views/terminal/views/cost_sheet/CostSheetPreview.tsx | component | Óptimo | SecurityScrollContainer, CostSheetSignature, CostSheetBody, CostSheetHeader, CostSheetAnnexes | 2026-03-07 |
| CostSheetQuickMode | src/components/views/terminal/views/cost_sheet/CostSheetQuickMode.tsx | component | Óptimo | input, select, button | 2026-03-07 |
| CostSheetSectionActionsPanel | src/components/views/terminal/views/cost_sheet/CostSheetSectionActionsPanel.tsx | component | Óptimo | sheet, button, cn | 2026-03-07 |
| CostSheetSidePanel | src/components/views/terminal/views/cost_sheet/CostSheetSidePanel.tsx | component | Bueno | CostSheetCalculator, DarianEditor, cn | 2026-03-07 |
| CostSheetSidebarNav | src/components/views/terminal/views/cost_sheet/CostSheetSidebarNav.tsx | component | Óptimo | sheet, button, cn | 2026-03-07 |
| CostSheetSignature | src/components/views/terminal/views/cost_sheet/CostSheetSignature.tsx | component | Óptimo |  | 2026-03-07 |
| CostSheetSignatureEditor | src/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor.tsx | component | Óptimo | input | 2026-03-07 |
| CostSheetSummary | src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx | component | Bueno | slider, CostSheetMasterRing, HealthBattery, cn | 2026-03-07 |
| CostSheetTemplateExplorer | src/components/views/terminal/views/cost_sheet/CostSheetTemplateExplorer.tsx | component | Advertencia | template, input, supabase, button, cn | 2026-03-07 |
| CostSheetWizard | src/components/views/terminal/views/cost_sheet/CostSheetWizard.tsx | component | Óptimo | CostSheetSignatureEditor, CostSheetHeaderEditor, button, CostSheetAnnexEditor, progress | 2026-03-07 |
| CreateProductModal | src/components/modals/CreateProductModal.tsx | component | Óptimo | BaseModal, PrimaryButton | 2026-03-07 |
| CreateTransferModal | src/components/views/terminal/views/transfers/CreateTransferModal.tsx | component | Óptimo | BaseModal, cn | 2026-03-07 |
| CyberShell | src/components/ui/CyberShell.tsx | component | Óptimo |  | 2026-03-07 |
| DarianDiagram | src/components/views/terminal/views/help/help/DarianDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| DarianEditor | src/components/views/terminal/views/cost_sheet/DarianEditor.tsx | component | Bueno | cn | 2026-03-07 |
| DataDecryption | src/components/ui/DataDecryption.tsx | component | Óptimo |  | 2026-03-07 |
| DetailedRelationshipGraph | src/components/views/terminal/views/health/DetailedRelationshipGraph.tsx | component | Óptimo | badge, cn | 2026-03-07 |
| ExecutiveDemoView | src/components/views/executive-demo/ExecutiveDemoView.tsx | component | Óptimo | badge, DEMO_DATASET, CostProLoader, card, button | 2026-03-07 |
| Flashcard | src/components/views/terminal/views/academy/Flashcard.tsx | component | Óptimo | card, button, cn | 2026-03-07 |
| FloatingCalculator | src/components/ui/FloatingCalculator.tsx | component | Bueno | cn | 2026-03-07 |
| FormulaBuilder | src/components/views/terminal/views/cost_sheet/FormulaBuilder.tsx | component | Bueno | tabs, HorizontalScroll, scroll-area, cn | 2026-03-07 |
| FormulaEditor | src/components/views/terminal/views/cost_sheet/FormulaEditor.tsx | component | Óptimo | FormulaBuilder, dialog, badge, popover, cn | 2026-03-07 |
| GlobalSessionManager | src/components/GlobalSessionManager.tsx | component | Óptimo |  | 2026-03-07 |
| Header | src/components/views/terminal/Header.tsx | component | Bueno | SyncStatusBadge, ThemeToggle, dropdown-menu, popover, SyncConflictModal | 2026-03-07 |
| HealthAgentLogs | src/components/views/terminal/views/health/HealthAgentLogs.tsx | component | Óptimo | card, badge, cn | 2026-03-07 |
| HealthBattery | src/components/views/terminal/views/cost_sheet/HealthBattery.tsx | component | Óptimo | cn | 2026-03-07 |
| HealthStatusHeader | src/components/views/terminal/views/health/HealthStatusHeader.tsx | component | Óptimo | cn | 2026-03-07 |
| HorizontalScroll | src/components/ui/HorizontalScroll.tsx | component | Óptimo | cn | 2026-03-07 |
| IPVControlPanel | src/components/views/terminal/views/ipv/IPVControlPanel.tsx | component | Óptimo | tooltip, badge, IPVDatabase, backup, card | 2026-03-07 |
| IPVHelpDialog | src/components/views/terminal/views/ipv/IPVHelpDialog.tsx | component | Óptimo | dialog, tooltip, badge, scroll-area, button | 2026-03-07 |
| IPVInstitutionalDashboard | src/components/views/terminal/views/ipv/IPVInstitutionalDashboard.tsx | component | Óptimo | calculateIPVMetrics, badge, IPVDatabase, card, button | 2026-03-07 |
| IPVPreviewModal | src/components/views/terminal/views/ipv/IPVPreviewModal.tsx | component | Óptimo | label, dialog, checkbox, badge, IPVDatabase | 2026-03-07 |
| IPVReportsDropdown | src/components/views/terminal/views/ipv/IPVReportsDropdown.tsx | component | Óptimo | dropdown-menu, button, cn | 2026-03-07 |
| IPVRightSidebar | src/components/views/terminal/views/ipv/IPVRightSidebar.tsx | component | Óptimo | tooltip, button | 2026-03-07 |
| IncomeReceiptPreview | src/components/views/terminal/views/ipv/IncomeReceiptPreview.tsx | component | Óptimo | card, cn | 2026-03-07 |
| IncomeReceiptSection | src/components/views/terminal/views/ipv/IncomeReceiptSection.tsx | component | Bueno | input, badge, IPVDatabase, numeroALetras, IncomeReceiptPreview | 2026-03-07 |
| InfrastructureMetrics | src/components/views/terminal/views/health/InfrastructureMetrics.tsx | component | Óptimo | progress, cn | 2026-03-07 |
| IngestionErrorsTable | src/components/views/terminal/views/ipv/IngestionErrorsTable.tsx | component | Óptimo | input, extractCommission, IPVDatabase, badge, MatchingEngine | 2026-03-07 |
| IntelligentThemeHandler | src/components/IntelligentThemeHandler.tsx | component | Óptimo |  | 2026-03-07 |
| InventoryAdjustmentFlowDiagram | src/components/views/terminal/views/help/help/InventoryAdjustmentFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| InventoryAdjustmentModal | src/components/views/terminal/views/inventory/InventoryAdjustmentModal.tsx | component | Óptimo | calcularAjusteInventario, drawer, cn | 2026-03-07 |
| InventoryFlowDiagram | src/components/views/terminal/views/help/help/InventoryFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| IpvFlowDiagram | src/components/views/terminal/views/help/help/IpvFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| KidsOnboarding | src/components/views/terminal/views/help/help/KidsOnboarding.tsx | component | Óptimo |  | 2026-03-07 |
| LazyRender | src/components/ui/LazyRender.tsx | component | Óptimo |  | 2026-03-07 |
| LegalConsultant | src/components/views/terminal/views/legal/LegalConsultant.tsx | component | Óptimo | cn | 2026-03-07 |
| LegalModelForm | src/components/views/terminal/views/legal/LegalModelForm.tsx | component | Óptimo | LegalPdfExporter, supabase, numeroALetras, cn | 2026-03-07 |
| LegalPdfExporter | src/components/views/terminal/views/legal/LegalPdfExporter.ts | component | Óptimo |  | 2026-03-07 |
| LoadingOverlay | src/components/ui/LoadingOverlay.tsx | component | Óptimo | CostProLoader | 2026-03-07 |
| LoginForm | src/components/auth/LoginForm.tsx | component | Óptimo | logger, RegisterForm, input, safeNavigate, supabase | 2026-03-07 |
| MasteryDashboard | src/components/views/terminal/views/academy/MasteryDashboard.tsx | component | Óptimo | progress, supabase, card | 2026-03-07 |
| MatchingRulesEditor | src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx | component | Bueno | label, input, IPVDatabase, card, button | 2026-03-07 |
| MatchingSimulation | src/components/views/terminal/views/ipv/MatchingSimulation.tsx | component | Bueno | input, badge, IPVDatabase, MatchingEngine, card | 2026-03-07 |
| MobileFlowDiagram | src/components/views/terminal/views/help/help/MobileFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| MobilePosDiagram | src/components/views/terminal/views/help/help/MobilePosDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| MobileSafeContainer | src/components/ui/MobileSafeContainer.tsx | component | Óptimo | cn | 2026-03-07 |
| OfflineSyncDiagram | src/components/views/terminal/views/help/help/OfflineSyncDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| POSCart | src/components/views/terminal/views/pos/POSCart.tsx | component | Bueno | BaseModal, ProductImage, CostProLoader, PrimaryButton, cn | 2026-03-07 |
| PWAInstallModal | src/components/ui/PWAInstallModal.tsx | component | Óptimo | dialog, cn | 2026-03-07 |
| Portal | src/components/ui/Portal.tsx | component | Óptimo |  | 2026-03-07 |
| PriceSelectorModal | src/components/modals/PriceSelectorModal.tsx | component | Óptimo | BaseModal, PrimaryButton, cn | 2026-03-07 |
| PrimaryButton | src/components/ui/atomic/index.tsx | component | Bueno | HorizontalScroll, cn, ProductImage | 2026-03-07 |
| ProductImage | src/components/ui/ProductImage.tsx | component | Óptimo | cn | 2026-03-07 |
| ProductInventoryPicker | src/components/views/terminal/views/cost_sheet/ProductInventoryPicker.tsx | component | Óptimo | SearchBar, BaseModal, skeleton, PrimaryButton, table | 2026-03-07 |
| QueryInspector | src/components/ui/QueryInspector.tsx | component | Óptimo | cn | 2026-03-07 |
| QueryProvider | src/components/providers/QueryProvider.tsx | component | Óptimo |  | 2026-03-07 |
| QuickModeMassiveDiagram | src/components/views/terminal/views/help/help/QuickModeMassiveDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| ReceptionDetailsModal | src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx | component | Óptimo | BaseModal, skeleton, cn | 2026-03-07 |
| RegisterForm | src/components/auth/RegisterForm.tsx | component | Óptimo | input, logger, supabase | 2026-03-07 |
| ReleaseGateStatus | src/components/views/terminal/views/health/ReleaseGateStatus.tsx | component | Óptimo | cn | 2026-03-07 |
| ReportConfigPanel | src/components/views/terminal/views/reports/ReportConfigPanel.tsx | component | Óptimo | label, input, checkbox, select, card | 2026-03-07 |
| ReportPreview | src/components/views/terminal/views/reports/ReportPreview.tsx | component | Óptimo | CostProLoader, card | 2026-03-07 |
| RoleForm | src/components/views/terminal/views/users/RoleForm.tsx | component | Óptimo | cn | 2026-03-07 |
| RolesDiagram | src/components/views/terminal/views/help/help/RolesDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| SalesFlowDiagram | src/components/views/terminal/views/help/help/SalesFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| ScrollToTop | src/components/ui/ScrollToTop.tsx | component | Óptimo | cn | 2026-03-07 |
| SearchBar | src/components/ui/SearchBar.tsx | component | Óptimo | cn | 2026-03-07 |
| SecurityFlowDiagram | src/components/views/terminal/views/help/help/SecurityFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| SecurityMetrics | src/components/views/terminal/views/health/SecurityMetrics.tsx | component | Óptimo | cn | 2026-03-07 |
| SecurityScrollContainer | src/components/ui/SecurityScrollContainer.tsx | component | Óptimo | cn | 2026-03-07 |
| ServiceWorkerRegister | src/components/ServiceWorkerRegister.tsx | component | Óptimo |  | 2026-03-07 |
| Sidebar | src/components/views/terminal/Sidebar.tsx | component | Bueno | cn, CostProLogo | 2026-03-07 |
| SpeedDial | src/components/ui/SpeedDial.tsx | component | Óptimo | Portal, cn | 2026-03-07 |
| SpeedScaleDiagram | src/components/auth/diagrams/SpeedScaleDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| SplashScreen | src/components/SplashScreen.tsx | component | Óptimo | CostProLogo | 2026-03-07 |
| StateRenderer | src/components/ui/StateRenderer.tsx | component | Óptimo | CostProLoader | 2026-03-07 |
| StickyCartFlowDiagram | src/components/views/terminal/views/help/help/StickyCartFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| StickyCartSummary | src/components/views/terminal/views/pos/StickyCartSummary.tsx | component | Óptimo | cn | 2026-03-07 |
| StoreModals | src/components/views/terminal/views/stores/StoreModals.tsx | component | Bueno | label, BaseModal, input, useStoresView, supabase | 2026-03-07 |
| StoreSkuDiagram | src/components/views/terminal/views/help/help/StoreSkuDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| SyncConflictModal | src/components/modals/SyncConflictModal.tsx | component | Óptimo | BaseModal, offlineStorage, PrimaryButton, SyncProvider | 2026-03-07 |
| SyncProvider | src/components/providers/SyncProvider.tsx | component | Óptimo |  | 2026-03-07 |
| SyncStatusBadge | src/components/ui/SyncStatusBadge.tsx | component | Óptimo | SyncProvider, cn | 2026-03-07 |
| SystemDependencyGraph | src/components/views/terminal/views/health/SystemDependencyGraph.tsx | component | Óptimo |  | 2026-03-07 |
| TaxCalculationModal | src/components/views/terminal/views/sales/TaxCalculationModal.tsx | component | Óptimo | dialog, cn | 2026-03-07 |
| TerminalShell | src/components/views/TerminalShell.tsx | component | Bueno | Header, ChatBot, MobileSafeContainer, CostProLoader, Sidebar | 2026-03-07 |
| ThemeProvider | src/components/theme-provider.tsx | component | Óptimo |  | 2026-03-07 |
| ThemeToggle | src/components/ThemeToggle.tsx | component | Óptimo | dropdown-menu, cn | 2026-03-07 |
| Toaster | src/components/ui/toaster.tsx | component | Óptimo | toast | 2026-03-07 |
| TransactionBreakdown | src/components/views/terminal/views/ipv/TransactionBreakdown.tsx | component | Bueno | dialog, input, badge, IPVDatabase, button | 2026-03-07 |
| TransactionDetailsModal | src/components/views/terminal/views/sales/TransactionDetailsModal.tsx | component | Bueno | BaseModal, badge, supabase, table, cn | 2026-03-07 |
| TransactionTable | src/components/views/terminal/views/ipv/TransactionTable.tsx | component | Advertencia | label, BaseModal, dialog, input, checkbox | 2026-03-07 |
| TransferDetailsModal | src/components/views/terminal/views/transfers/TransferDetailsModal.tsx | component | Óptimo | BaseModal, StateRenderer, cn | 2026-03-07 |
| UpgradeModal | src/components/modals/UpgradeModal.tsx | component | Óptimo | BaseModal, button | 2026-03-07 |
| UserFlowDiagram | src/components/views/terminal/views/help/help/UserFlowDiagram.tsx | component | Óptimo |  | 2026-03-07 |
| UserForm | src/components/views/terminal/views/users/UserForm.tsx | component | Bueno | cn | 2026-03-07 |
| UserFormModal | src/components/views/terminal/views/users/UserFormModal.tsx | component | Óptimo | UserForm, BaseModal | 2026-03-07 |
| ViewNavigator | src/components/views/terminal/views/health/ViewNavigator.tsx | component | Óptimo |  | 2026-03-07 |
| ViewSwitcher | src/components/ui/ViewSwitcher.tsx | component | Óptimo | cn | 2026-03-07 |
| WelcomeLandingView | src/components/auth/WelcomeLandingView.tsx | component | Bueno | ThemeToggle, AutomationWorkflowDiagram, CostProLogo, PWAInstallModal, SpeedScaleDiagram | 2026-03-07 |
| accordion | src/components/ui/accordion.tsx | component | Óptimo | cn | 2026-03-07 |
| alert | src/components/ui/alert.tsx | component | Óptimo | cn | 2026-03-07 |
| alert-dialog | src/components/ui/alert-dialog.tsx | component | Óptimo | button, cn | 2026-03-07 |
| aspect-ratio | src/components/ui/aspect-ratio.tsx | component | Óptimo |  | 2026-03-07 |
| avatar | src/components/ui/avatar.tsx | component | Óptimo | cn | 2026-03-07 |
| badge | src/components/ui/badge.tsx | component | Óptimo | cn | 2026-03-07 |
| breadcrumb | src/components/ui/breadcrumb.tsx | component | Óptimo | cn | 2026-03-07 |
| button | src/components/ui/button.tsx | component | Óptimo | cn | 2026-03-07 |
| calendar | src/components/ui/calendar.tsx | component | Óptimo | button, cn | 2026-03-07 |
| card | src/components/ui/card.tsx | component | Óptimo | cn | 2026-03-07 |
| carousel | src/components/ui/carousel.tsx | component | Óptimo | button, cn | 2026-03-07 |
| chart | src/components/ui/chart.tsx | component | Bueno | cn | 2026-03-07 |
| checkbox | src/components/ui/checkbox.tsx | component | Óptimo | cn | 2026-03-07 |
| collapsible | src/components/ui/collapsible.tsx | component | Óptimo |  | 2026-03-07 |
| command | src/components/ui/command.tsx | component | Óptimo | dialog, cn | 2026-03-07 |
| context-menu | src/components/ui/context-menu.tsx | component | Óptimo | cn | 2026-03-07 |
| dialog | src/components/ui/dialog.tsx | component | Óptimo | cn | 2026-03-07 |
| drawer | src/components/ui/drawer.tsx | component | Óptimo | cn | 2026-03-07 |
| dropdown-menu | src/components/ui/dropdown-menu.tsx | component | Óptimo | cn | 2026-03-07 |
| form | src/components/ui/form.tsx | component | Óptimo | label, cn | 2026-03-07 |
| hover-card | src/components/ui/hover-card.tsx | component | Óptimo | cn | 2026-03-07 |
| input | src/components/ui/input.tsx | component | Óptimo | cn | 2026-03-07 |
| input-otp | src/components/ui/input-otp.tsx | component | Óptimo | cn | 2026-03-07 |
| label | src/components/ui/label.tsx | component | Óptimo | cn | 2026-03-07 |
| menubar | src/components/ui/menubar.tsx | component | Óptimo | cn | 2026-03-07 |
| navigation-menu | src/components/ui/navigation-menu.tsx | component | Óptimo | cn | 2026-03-07 |
| pagination | src/components/ui/pagination.tsx | component | Óptimo | button, cn | 2026-03-07 |
| popover | src/components/ui/popover.tsx | component | Óptimo | cn | 2026-03-07 |
| progress | src/components/ui/progress.tsx | component | Óptimo | cn | 2026-03-07 |
| radio-group | src/components/ui/radio-group.tsx | component | Óptimo | cn | 2026-03-07 |
| resizable | src/components/ui/resizable.tsx | component | Óptimo | cn | 2026-03-07 |
| scroll-area | src/components/ui/scroll-area.tsx | component | Óptimo | cn | 2026-03-07 |
| select | src/components/ui/select.tsx | component | Óptimo | cn | 2026-03-07 |
| separator | src/components/ui/separator.tsx | component | Óptimo | cn | 2026-03-07 |
| sheet | src/components/ui/sheet.tsx | component | Óptimo | cn | 2026-03-07 |
| sidebar | src/components/ui/sidebar.tsx | component | Bueno | separator, input, tooltip, skeleton, sheet | 2026-03-07 |
| skeleton | src/components/ui/skeleton.tsx | component | Óptimo | cn | 2026-03-07 |
| slider | src/components/ui/slider.tsx | component | Óptimo | cn | 2026-03-07 |
| sonner | src/components/ui/sonner.tsx | component | Óptimo |  | 2026-03-07 |
| switch | src/components/ui/switch.tsx | component | Óptimo | cn | 2026-03-07 |
| table | src/components/ui/table.tsx | component | Óptimo | cn | 2026-03-07 |
| tabs | src/components/ui/tabs.tsx | component | Óptimo | cn | 2026-03-07 |
| textarea | src/components/ui/textarea.tsx | component | Óptimo | cn | 2026-03-07 |
| toast | src/components/ui/toast.tsx | component | Óptimo | cn | 2026-03-07 |
| toggle | src/components/ui/toggle.tsx | component | Óptimo | cn | 2026-03-07 |
| toggle-group | src/components/ui/toggle-group.tsx | component | Óptimo | toggle, cn | 2026-03-07 |
| tooltip | src/components/ui/tooltip.tsx | component | Óptimo | cn | 2026-03-07 |
| useAuditLogsView | src/components/views/terminal/views/audit/useAuditLogsView.ts | component | Óptimo |  | 2026-03-07 |
| usePOSView | src/components/views/terminal/views/pos/usePOSView.ts | component | Bueno | logger, cn | 2026-03-07 |
| useReceptionsHistoryView | src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts | component | Óptimo |  | 2026-03-07 |
| useSalesHistoryView | src/components/views/terminal/views/sales/useSalesHistoryView.ts | component | Óptimo |  | 2026-03-07 |
| useStoresView | src/components/views/terminal/views/stores/useStoresView.ts | component | Óptimo | logger | 2026-03-07 |
| useUsersView | src/components/views/terminal/views/users/useUsersView.ts | component | Bueno | UserForm, getAllowedRoles, supabase | 2026-03-07 |
| DEMO_DATASET | src/lib/data/demo-products.ts | utility | Óptimo |  | 2026-03-07 |
| DeepSeekAdapter | src/lib/ai/adapters/deepseek-adapter.ts | utility | Óptimo | OpenAICompatibleAdapter | 2026-03-07 |
| FallbackAdapter | src/lib/ai/adapters/fallback-adapter.ts | utility | Óptimo | types | 2026-03-07 |
| GPTAdapter | src/lib/ai/adapters/gpt-adapter.ts | utility | Óptimo | OpenAICompatibleAdapter | 2026-03-07 |
| GeminiAdapter | src/lib/ai/adapters/gemini-adapter.ts | utility | Bueno | types | 2026-03-07 |
| HEALTH_THRESHOLDS | src/lib/observability/health-engine.ts | utility | Óptimo |  | 2026-03-07 |
| IPVDatabase | src/lib/dexie.ts | utility | Óptimo |  | 2026-03-07 |
| KimiAdapter | src/lib/ai/adapters/kimi-adapter.ts | utility | Óptimo | OpenAICompatibleAdapter | 2026-03-07 |
| MRI_WEIGHTS | src/lib/release_gate/mri-engine.ts | utility | Óptimo |  | 2026-03-07 |
| MatchingEngine | src/lib/ipv/engine.ts | utility | Bueno | IPVDatabase | 2026-03-07 |
| OpenAICompatibleAdapter | src/lib/ai/adapters/openai-compatible-adapter.ts | utility | Óptimo | types | 2026-03-07 |
| QwenAdapter | src/lib/ai/adapters/qwen-adapter.ts | utility | Óptimo | types | 2026-03-07 |
| ReleaseGatePdfExporter | src/lib/release_gate/ReleaseGatePdfExporter.ts | utility | Bueno |  | 2026-03-07 |
| RowSemanticTypeSchema | src/lib/cost-engine/schemas.ts | utility | Óptimo |  | 2026-03-07 |
| TOOLS | src/lib/ai/tools/definitions.ts | utility | Óptimo | types | 2026-03-07 |
| auth | src/lib/auth.ts | utility | Óptimo | supabase | 2026-03-07 |
| backup | src/lib/ipv/backup.ts | utility | Óptimo |  | 2026-03-07 |
| bandecParser | src/lib/ipv/bandecParser.ts | utility | Óptimo | MatchingEngine, extractCommission, IPVDatabase | 2026-03-07 |
| calcularAjusteInventario | src/lib/inventory-logic.ts | utility | Óptimo |  | 2026-03-07 |
| calculateCostSheetHealth | src/lib/cost-engine/validations.ts | utility | Bueno |  | 2026-03-07 |
| calculateIPVMetrics | src/lib/ipv/calculations.ts | utility | Óptimo | IPVDatabase, parseObservations | 2026-03-07 |
| calculatePriceEffectiveness | src/lib/ipv/intelligence.ts | utility | Óptimo | IPVDatabase | 2026-03-07 |
| calculateSM2 | src/lib/academy/sm2.ts | utility | Óptimo |  | 2026-03-07 |
| cn | src/lib/utils.ts | utility | Óptimo | supabase | 2026-03-07 |
| extractCommission | src/lib/ipv/utils.ts | utility | Bueno | IPVDatabase | 2026-03-07 |
| extractDependencies | src/lib/cost-engine/index.ts | utility | Bueno | types, translateFormulaFromSpanish | 2026-03-07 |
| formatPostgrestUrlToSql | src/lib/query-inspector-utils.ts | utility | Óptimo |  | 2026-03-07 |
| getAllowedRoles | src/lib/roles.ts | utility | Óptimo |  | 2026-03-07 |
| getLLMProvider | src/lib/ai/orchestrator.ts | utility | Óptimo | GeminiAdapter, KimiAdapter, types, GPTAdapter, QwenAdapter | 2026-03-07 |
| handleError | src/lib/errorHandler.ts | utility | Óptimo | logger | 2026-03-07 |
| health-alerts | src/lib/observability/health-alerts.ts | utility | Óptimo | HEALTH_THRESHOLDS, supabase | 2026-03-07 |
| logger | src/lib/logger.ts | utility | Óptimo |  | 2026-03-07 |
| matching.worker | src/lib/ipv/matching.worker.ts | utility | Óptimo | MatchingEngine | 2026-03-07 |
| numeroALetras | src/lib/utils/number-to-words-es.ts | utility | Óptimo |  | 2026-03-07 |
| offlineStorage | src/lib/sync/offline-storage.ts | utility | Óptimo |  | 2026-03-07 |
| parseObservations | src/lib/ipv/parser.ts | utility | Óptimo |  | 2026-03-07 |
| pdf-export | src/lib/utils/pdf-export.ts | utility | Óptimo |  | 2026-03-07 |
| plan-utils | src/lib/plan-utils.ts | utility | Óptimo |  | 2026-03-07 |
| prisma | src/lib/db.ts | utility | Óptimo |  | 2026-03-07 |
| rpc-validator | src/lib/rpc-validator.ts | utility | Óptimo |  | 2026-03-07 |
| safeNavigate | src/lib/navigation.ts | utility | Óptimo |  | 2026-03-07 |
| supabase | src/lib/supabaseClient.ts | utility | Óptimo |  | 2026-03-07 |
| system-health | src/lib/observability/system-health.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-industrial.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-pizza.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-furniture.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-lavar.ts | utility | Bueno |  | 2026-03-07 |
| template | src/lib/data/template-shoes.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-icecream.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-repair.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/costpro-reinicio.ts | utility | Bueno |  | 2026-03-07 |
| template | src/lib/data/template-consultancy.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/costpro-ejemplo.ts | utility | Bueno |  | 2026-03-07 |
| template | src/lib/data/template-logistics.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-pastry.ts | utility | Óptimo |  | 2026-03-07 |
| template | src/lib/data/template-juice.ts | utility | Óptimo |  | 2026-03-07 |
| toolHandlers | src/lib/ai/tools/registry.ts | utility | Óptimo | system-health, TOOLS | 2026-03-07 |
| translateFormulaFromSpanish | src/lib/cost-engine/formula-utils.ts | utility | Óptimo |  | 2026-03-07 |
| types | src/lib/cost-engine/types.ts | utility | Bueno |  | 2026-03-07 |
| types | src/lib/ai/types.ts | utility | Óptimo |  | 2026-03-07 |
