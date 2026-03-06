# Mapa Arquitectónico Vivo

| Nombre | Ruta | Tipo | Estado Salud | Dependencias | Última Auditoría |
| ------ | ---- | ---- | ------------ | ------------ | ---------------- |
| ActionMenu | src/components/ui/ActionMenu.tsx | component | Óptimo | utils | 2026-03-06 |
| ApplicationMetrics | src/components/views/terminal/views/health/ApplicationMetrics.tsx | component | Óptimo | utils | 2026-03-06 |
| AuditEventCard | src/components/views/terminal/views/audit/AuditEventCard.tsx | component | Óptimo | types, AuditEventIcon, AuditEventMeta, utils | 2026-03-06 |
| AuditEventIcon | src/components/views/terminal/views/audit/AuditEventIcon.tsx | component | Óptimo | utils | 2026-03-06 |
| AuditEventMeta | src/components/views/terminal/views/audit/AuditEventMeta.tsx | component | Advertencia | utils | 2026-03-06 |
| AuditFilters | src/components/views/terminal/views/audit/AuditFilters.tsx | component | Óptimo | utils, AuditEventIcon | 2026-03-06 |
| AuditLogsModal | src/components/views/terminal/views/reports/AuditLogsModal.tsx | component | Óptimo | useAuditLogs, AuditTimeline, StateRenderer, skeleton | 2026-03-06 |
| AuditTimeline | src/components/views/terminal/views/audit/AuditTimeline.tsx | component | Óptimo | types, AuditEventCard, utils | 2026-03-06 |
| AutomationWorkflowDiagram | src/components/auth/diagrams/AutomationWorkflowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| BankIngestion | src/components/views/terminal/views/ipv/BankIngestion.tsx | component | Óptimo | BaseModal, dexie, engine, bandecParser, utils | 2026-03-06 |
| BarcodeScanner | src/components/modals/BarcodeScanner.tsx | component | Óptimo | BaseModal, atomic | 2026-03-06 |
| BaseModal | src/components/ui/BaseModal.tsx | component | Óptimo | utils | 2026-03-06 |
| CashFlowDiagram | src/components/views/terminal/views/help/help/CashFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| CatalogModals | src/components/views/terminal/views/catalog/CatalogModals.tsx | component | Óptimo | BaseModal, ProductImage, atomic, utils, types | 2026-03-06 |
| CatalogTable | src/components/views/terminal/views/ipv/CatalogTable.tsx | component | Advertencia | dexie, badge, BaseModal, button, card | 2026-03-06 |
| ChatBot | src/components/ui/ChatBot.tsx | component | Advertencia | store, utils, user-service | 2026-03-06 |
| CircularProgress | src/components/views/terminal/views/cost_sheet/CircularProgress.tsx | component | Óptimo | utils | 2026-03-06 |
| CostFlowDiagram | src/components/views/terminal/views/help/help/CostFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| CostProLoader | src/components/ui/CostProLoader.tsx | component | Óptimo | utils | 2026-03-06 |
| CostProLogo | src/components/CostProLogo.tsx | component | Óptimo |  | 2026-03-06 |
| CostSheetActionsPanel | src/components/views/terminal/views/cost_sheet/CostSheetActionsPanel.tsx | component | Óptimo | utils, button, ViewSwitcher, CostSheetModeDropdown | 2026-03-06 |
| CostSheetAnnexEditor | src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx | component | Óptimo | cost-sheet-store, useCostSheetCalculator, input, table, button | 2026-03-06 |
| CostSheetAnnexes | src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx | component | Óptimo | utils, cost-sheet | 2026-03-06 |
| CostSheetAuditLog | src/components/views/terminal/views/cost_sheet/CostSheetAuditLog.tsx | component | Óptimo | card, badge, scroll-area, types, utils | 2026-03-06 |
| CostSheetBanner | src/components/views/terminal/views/cost_sheet/CostSheetBanner.tsx | component | Óptimo | store, button, ThemeToggle, CostSheetModeDropdown | 2026-03-06 |
| CostSheetBody | src/components/views/terminal/views/cost_sheet/CostSheetBody.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetBottomNav | src/components/views/terminal/views/cost_sheet/CostSheetBottomNav.tsx | component | Óptimo | utils, store | 2026-03-06 |
| CostSheetCalculator | src/components/views/terminal/views/cost_sheet/CostSheetCalculator.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetExportModal | src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx | component | Óptimo | button, checkbox, switch, label, scroll-area | 2026-03-06 |
| CostSheetFCDropdown | src/components/views/terminal/views/cost_sheet/CostSheetFCDropdown.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetForm | src/components/views/terminal/views/cost_sheet/CostSheetForm.tsx | component | Óptimo | cost-sheet-store, input, label, table, button | 2026-03-06 |
| CostSheetFormulaGuide | src/components/views/terminal/views/cost_sheet/CostSheetFormulaGuide.tsx | component | Óptimo |  | 2026-03-06 |
| CostSheetGenerateDropdown | src/components/views/terminal/views/cost_sheet/CostSheetGenerateDropdown.tsx | component | Óptimo |  | 2026-03-06 |
| CostSheetHeader | src/components/views/terminal/views/cost_sheet/CostSheetHeader.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetHeaderEditor | src/components/views/terminal/views/cost_sheet/CostSheetHeaderEditor.tsx | component | Óptimo | cost-sheet-store, card, input, label, utils | 2026-03-06 |
| CostSheetHelpDropdown | src/components/views/terminal/views/cost_sheet/CostSheetHelpDropdown.tsx | component | Óptimo |  | 2026-03-06 |
| CostSheetHelpPanel | src/components/views/terminal/views/cost_sheet/CostSheetHelpPanel.tsx | component | Óptimo | utils, CostSheetFormulaGuide | 2026-03-06 |
| CostSheetInteractiveTable | src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx | component | Advertencia | LazyRender, cost-sheet-store, popover, select, input | 2026-03-06 |
| CostSheetMassiveGenerator | src/components/views/terminal/views/cost_sheet/CostSheetMassiveGenerator.tsx | component | Advertencia | button, progress, tabs, utils, cost-sheet-store | 2026-03-06 |
| CostSheetMasterRing | src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx | component | Óptimo | utils, slider | 2026-03-06 |
| CostSheetModeDropdown | src/components/views/terminal/views/cost_sheet/CostSheetModeDropdown.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetNarrative | src/components/views/terminal/views/cost_sheet/CostSheetNarrative.tsx | component | Óptimo | utils | 2026-03-06 |
| CostSheetNav | src/components/views/terminal/views/cost_sheet/CostSheetNav.tsx | component | Óptimo | utils, ActionMenu, CostSheetFCDropdown, CostSheetModeDropdown, CostSheetOptionsDropdown | 2026-03-06 |
| CostSheetOptionsDropdown | src/components/views/terminal/views/cost_sheet/CostSheetOptionsDropdown.tsx | component | Óptimo | store | 2026-03-06 |
| CostSheetPreview | src/components/views/terminal/views/cost_sheet/CostSheetPreview.tsx | component | Óptimo | CostSheetHeader, CostSheetBody, CostSheetAnnexes, CostSheetSignature, SecurityScrollContainer | 2026-03-06 |
| CostSheetQuickMode | src/components/views/terminal/views/cost_sheet/CostSheetQuickMode.tsx | component | Óptimo | button, input | 2026-03-06 |
| CostSheetSectionActionsPanel | src/components/views/terminal/views/cost_sheet/CostSheetSectionActionsPanel.tsx | component | Advertencia | utils, button | 2026-03-06 |
| CostSheetSidePanel | src/components/views/terminal/views/cost_sheet/CostSheetSidePanel.tsx | component | Óptimo | utils, DarianEditor, CostSheetCalculator, useMobile | 2026-03-06 |
| CostSheetSidebarNav | src/components/views/terminal/views/cost_sheet/CostSheetSidebarNav.tsx | component | Óptimo | utils, store, button, cost-sheet-store | 2026-03-06 |
| CostSheetSignature | src/components/views/terminal/views/cost_sheet/CostSheetSignature.tsx | component | Óptimo |  | 2026-03-06 |
| CostSheetSignatureEditor | src/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor.tsx | component | Óptimo | cost-sheet-store, input | 2026-03-06 |
| CostSheetSummary | src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx | component | Óptimo | utils, cost-sheet, cost-sheet-store, slider, HealthBattery | 2026-03-06 |
| CostSheetTemplateExplorer | src/components/views/terminal/views/cost_sheet/CostSheetTemplateExplorer.tsx | component | Óptimo | utils, button, input, store, supabaseClient | 2026-03-06 |
| CostSheetWizard | src/components/views/terminal/views/cost_sheet/CostSheetWizard.tsx | component | Advertencia | button, CostSheetHeaderEditor, CostSheetAnnexEditor, CostSheetInteractiveTable, CostSheetSignatureEditor | 2026-03-06 |
| CreateProductModal | src/components/modals/CreateProductModal.tsx | component | Advertencia | BaseModal, atomic, store, useProducts | 2026-03-06 |
| CreateTransferModal | src/components/views/terminal/views/transfers/CreateTransferModal.tsx | component | Advertencia | store, BaseModal, useInventory, useTransfers, useDebounce | 2026-03-06 |
| CyberShell | src/components/ui/CyberShell.tsx | component | Óptimo |  | 2026-03-06 |
| DarianDiagram | src/components/views/terminal/views/help/help/DarianDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| DarianEditor | src/components/views/terminal/views/cost_sheet/DarianEditor.tsx | component | Óptimo | utils, store | 2026-03-06 |
| DataDecryption | src/components/ui/DataDecryption.tsx | component | Óptimo |  | 2026-03-06 |
| ExecutiveDemoView | src/components/views/executive-demo/ExecutiveDemoView.tsx | component | Advertencia | button, progress, badge, card, demo-products | 2026-03-06 |
| Flashcard | src/components/views/terminal/views/academy/Flashcard.tsx | component | Óptimo | card, button, utils, useAcademyStore | 2026-03-06 |
| FloatingCalculator | src/components/ui/FloatingCalculator.tsx | component | Óptimo | utils, store | 2026-03-06 |
| FormulaBuilder | src/components/views/terminal/views/cost_sheet/FormulaBuilder.tsx | component | Óptimo | utils, scroll-area, HorizontalScroll | 2026-03-06 |
| FormulaEditor | src/components/views/terminal/views/cost_sheet/FormulaEditor.tsx | component | Óptimo | utils, badge, FormulaBuilder | 2026-03-06 |
| GlobalSessionManager | src/components/GlobalSessionManager.tsx | component | Óptimo | useSessionManager, session-store | 2026-03-06 |
| Header | src/components/views/terminal/Header.tsx | component | Óptimo | utils, ThemeToggle, store, user, useTerminalNavigation | 2026-03-06 |
| HealthAgentLogs | src/components/views/terminal/views/health/HealthAgentLogs.tsx | component | Óptimo | supabaseClient, system-health, card, badge, utils | 2026-03-06 |
| HealthBattery | src/components/views/terminal/views/cost_sheet/HealthBattery.tsx | component | Óptimo | utils | 2026-03-06 |
| HealthStatusHeader | src/components/views/terminal/views/health/HealthStatusHeader.tsx | component | Óptimo | utils | 2026-03-06 |
| HorizontalScroll | src/components/ui/HorizontalScroll.tsx | component | Óptimo | utils | 2026-03-06 |
| IPVControlPanel | src/components/views/terminal/views/ipv/IPVControlPanel.tsx | component | Óptimo | card, button, badge, tooltip, backup | 2026-03-06 |
| IPVHelpDialog | src/components/views/terminal/views/ipv/IPVHelpDialog.tsx | component | Óptimo | button, badge, scroll-area | 2026-03-06 |
| IPVInstitutionalDashboard | src/components/views/terminal/views/ipv/IPVInstitutionalDashboard.tsx | component | Óptimo | card, dexie, utils, button, badge | 2026-03-06 |
| IPVPreviewModal | src/components/views/terminal/views/ipv/IPVPreviewModal.tsx | component | Óptimo | table, badge, button, checkbox, label | 2026-03-06 |
| IPVReportsDropdown | src/components/views/terminal/views/ipv/IPVReportsDropdown.tsx | component | Óptimo | button, utils | 2026-03-06 |
| IPVRightSidebar | src/components/views/terminal/views/ipv/IPVRightSidebar.tsx | component | Advertencia | button | 2026-03-06 |
| IncomeReceiptPreview | src/components/views/terminal/views/ipv/IncomeReceiptPreview.tsx | component | Óptimo | card, utils | 2026-03-06 |
| IncomeReceiptSection | src/components/views/terminal/views/ipv/IncomeReceiptSection.tsx | component | Óptimo | dexie, card, button, input, badge | 2026-03-06 |
| InfrastructureMetrics | src/components/views/terminal/views/health/InfrastructureMetrics.tsx | component | Óptimo | utils, progress | 2026-03-06 |
| IngestionErrorsTable | src/components/views/terminal/views/ipv/IngestionErrorsTable.tsx | component | Advertencia | dexie, badge, button, input, utils | 2026-03-06 |
| IntelligentThemeHandler | src/components/IntelligentThemeHandler.tsx | component | Óptimo | store | 2026-03-06 |
| InventoryAdjustmentFlowDiagram | src/components/views/terminal/views/help/help/InventoryAdjustmentFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| InventoryAdjustmentModal | src/components/views/terminal/views/inventory/InventoryAdjustmentModal.tsx | component | Óptimo | types, inventory-logic, utils, useMobile | 2026-03-06 |
| InventoryFlowDiagram | src/components/views/terminal/views/help/help/InventoryFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| IpvFlowDiagram | src/components/views/terminal/views/help/help/IpvFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| KidsOnboarding | src/components/views/terminal/views/help/help/KidsOnboarding.tsx | component | Óptimo |  | 2026-03-06 |
| LazyRender | src/components/ui/LazyRender.tsx | component | Óptimo |  | 2026-03-06 |
| LegalConsultant | src/components/views/terminal/views/legal/LegalConsultant.tsx | component | Óptimo | utils | 2026-03-06 |
| LegalModelForm | src/components/views/terminal/views/legal/LegalModelForm.tsx | component | Óptimo | store, supabaseClient, utils, LegalPdfExporter, number-to-words-es | 2026-03-06 |
| LegalPdfExporter | src/components/views/terminal/views/legal/LegalPdfExporter.ts | component | Óptimo |  | 2026-03-06 |
| LoadingOverlay | src/components/ui/LoadingOverlay.tsx | component | Óptimo | CostProLoader | 2026-03-06 |
| LoginForm | src/components/auth/LoginForm.tsx | component | Óptimo | store, supabaseClient, RegisterForm, input, logger | 2026-03-06 |
| MasteryDashboard | src/components/views/terminal/views/academy/MasteryDashboard.tsx | component | Óptimo | supabaseClient, store, card, progress | 2026-03-06 |
| MatchingRulesEditor | src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx | component | Óptimo | dexie, button, card, switch, label | 2026-03-06 |
| MatchingSimulation | src/components/views/terminal/views/ipv/MatchingSimulation.tsx | component | Óptimo | dexie, engine, button, input, card | 2026-03-06 |
| MobileFlowDiagram | src/components/views/terminal/views/help/help/MobileFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| MobilePosDiagram | src/components/views/terminal/views/help/help/MobilePosDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| MobileSafeContainer | src/components/ui/MobileSafeContainer.tsx | component | Óptimo | utils | 2026-03-06 |
| OfflineSyncDiagram | src/components/views/terminal/views/help/help/OfflineSyncDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| POSCart | src/components/views/terminal/views/pos/POSCart.tsx | component | Advertencia | CostProLoader, ProductImage, utils, types, useMobile | 2026-03-06 |
| PWAInstallModal | src/components/ui/PWAInstallModal.tsx | component | Óptimo | utils | 2026-03-06 |
| Portal | src/components/ui/Portal.tsx | component | Óptimo |  | 2026-03-06 |
| PriceSelectorModal | src/components/modals/PriceSelectorModal.tsx | component | Advertencia | BaseModal, atomic, utils, types | 2026-03-06 |
| ProductImage | src/components/ui/ProductImage.tsx | component | Óptimo | utils | 2026-03-06 |
| ProductInventoryPicker | src/components/views/terminal/views/cost_sheet/ProductInventoryPicker.tsx | component | Advertencia | BaseModal, useProducts, SearchBar, table, skeleton | 2026-03-06 |
| QueryInspector | src/components/ui/QueryInspector.tsx | component | Óptimo | store, utils | 2026-03-06 |
| QueryProvider | src/components/providers/QueryProvider.tsx | component | Óptimo |  | 2026-03-06 |
| QuickModeMassiveDiagram | src/components/views/terminal/views/help/help/QuickModeMassiveDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| ReceptionDetailsModal | src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx | component | Advertencia | BaseModal, types, skeleton, utils | 2026-03-06 |
| RegisterForm | src/components/auth/RegisterForm.tsx | component | Óptimo | supabaseClient, logger, input | 2026-03-06 |
| ReleaseGateStatus | src/components/views/terminal/views/health/ReleaseGateStatus.tsx | component | Óptimo | utils | 2026-03-06 |
| ReportConfigPanel | src/components/views/terminal/views/reports/ReportConfigPanel.tsx | component | Óptimo | card, input, label, select, checkbox | 2026-03-06 |
| ReportPreview | src/components/views/terminal/views/reports/ReportPreview.tsx | component | Óptimo | card, types, reports, store, CostProLoader | 2026-03-06 |
| RoleForm | src/components/views/terminal/views/users/RoleForm.tsx | component | Óptimo | utils, types | 2026-03-06 |
| RolesDiagram | src/components/views/terminal/views/help/help/RolesDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| SalesFlowDiagram | src/components/views/terminal/views/help/help/SalesFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| ScrollToTop | src/components/ui/ScrollToTop.tsx | component | Óptimo | utils | 2026-03-06 |
| SearchBar | src/components/ui/SearchBar.tsx | component | Advertencia | utils | 2026-03-06 |
| SecurityFlowDiagram | src/components/views/terminal/views/help/help/SecurityFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| SecurityMetrics | src/components/views/terminal/views/health/SecurityMetrics.tsx | component | Óptimo | utils | 2026-03-06 |
| SecurityScrollContainer | src/components/ui/SecurityScrollContainer.tsx | component | Óptimo | utils | 2026-03-06 |
| ServiceWorkerRegister | src/components/ServiceWorkerRegister.tsx | component | Óptimo |  | 2026-03-06 |
| Sidebar | src/components/views/terminal/Sidebar.tsx | component | Óptimo | utils, CostProLogo, store, useTerminalNavigation | 2026-03-06 |
| SpeedDial | src/components/ui/SpeedDial.tsx | component | Óptimo | utils, Portal | 2026-03-06 |
| SpeedScaleDiagram | src/components/auth/diagrams/SpeedScaleDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| SplashScreen | src/components/SplashScreen.tsx | component | Óptimo | CostProLogo | 2026-03-06 |
| StateRenderer | src/components/ui/StateRenderer.tsx | component | Óptimo | CostProLoader | 2026-03-06 |
| StickyCartFlowDiagram | src/components/views/terminal/views/help/help/StickyCartFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| StickyCartSummary | src/components/views/terminal/views/pos/StickyCartSummary.tsx | component | Óptimo | utils | 2026-03-06 |
| StoreModals | src/components/views/terminal/views/stores/StoreModals.tsx | component | Óptimo | BaseModal, button, input, label, types | 2026-03-06 |
| StoreSkuDiagram | src/components/views/terminal/views/help/help/StoreSkuDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| SyncConflictModal | src/components/modals/SyncConflictModal.tsx | component | Advertencia | BaseModal, atomic, offline-storage, SyncProvider | 2026-03-06 |
| SyncProvider | src/components/providers/SyncProvider.tsx | component | Óptimo | useSync | 2026-03-06 |
| SyncStatusBadge | src/components/ui/SyncStatusBadge.tsx | component | Óptimo | SyncProvider, utils | 2026-03-06 |
| TaxCalculationModal | src/components/views/terminal/views/sales/TaxCalculationModal.tsx | component | Advertencia | utils, types, useTaxes, store | 2026-03-06 |
| TerminalShell | src/components/views/TerminalShell.tsx | component | Advertencia | store, Sidebar, Header, useTerminalNavigation, useMobile | 2026-03-06 |
| ThemeToggle | src/components/ThemeToggle.tsx | component | Óptimo | store, utils | 2026-03-06 |
| TransactionBreakdown | src/components/views/terminal/views/ipv/TransactionBreakdown.tsx | component | Óptimo | dexie, table, badge, input, button | 2026-03-06 |
| TransactionDetailsModal | src/components/views/terminal/views/sales/TransactionDetailsModal.tsx | component | Advertencia | BaseModal, table, badge, utils, types | 2026-03-06 |
| TransactionTable | src/components/views/terminal/views/ipv/TransactionTable.tsx | component | Óptimo | BaseModal, dexie, badge, button, card | 2026-03-06 |
| TransferDetailsModal | src/components/views/terminal/views/transfers/TransferDetailsModal.tsx | component | Advertencia | store, BaseModal, useTransfers, StateRenderer, utils | 2026-03-06 |
| UpgradeModal | src/components/modals/UpgradeModal.tsx | component | Óptimo | BaseModal, button | 2026-03-06 |
| UserFlowDiagram | src/components/views/terminal/views/help/help/UserFlowDiagram.tsx | component | Óptimo |  | 2026-03-06 |
| UserForm | src/components/views/terminal/views/users/UserForm.tsx | component | Óptimo | utils, user, types | 2026-03-06 |
| UserFormModal | src/components/views/terminal/views/users/UserFormModal.tsx | component | Óptimo | BaseModal, UserForm, user, types | 2026-03-06 |
| ViewSwitcher | src/components/ui/ViewSwitcher.tsx | component | Óptimo | utils | 2026-03-06 |
| WelcomeLandingView | src/components/auth/WelcomeLandingView.tsx | component | Advertencia | CostProLogo, ThemeToggle, AutomationWorkflowDiagram, SpeedScaleDiagram, usePWA | 2026-03-06 |
| accordion | src/components/ui/accordion.tsx | component | Óptimo | utils | 2026-03-06 |
| alert | src/components/ui/alert.tsx | component | Óptimo | utils | 2026-03-06 |
| alert-dialog | src/components/ui/alert-dialog.tsx | component | Óptimo | utils, button | 2026-03-06 |
| aspect-ratio | src/components/ui/aspect-ratio.tsx | component | Óptimo |  | 2026-03-06 |
| avatar | src/components/ui/avatar.tsx | component | Óptimo | utils | 2026-03-06 |
| badge | src/components/ui/badge.tsx | component | Óptimo | utils | 2026-03-06 |
| breadcrumb | src/components/ui/breadcrumb.tsx | component | Óptimo | utils | 2026-03-06 |
| button | src/components/ui/button.tsx | component | Óptimo | utils | 2026-03-06 |
| calendar | src/components/ui/calendar.tsx | component | Óptimo | utils, button | 2026-03-06 |
| card | src/components/ui/card.tsx | component | Óptimo | utils | 2026-03-06 |
| carousel | src/components/ui/carousel.tsx | component | Óptimo | utils, button | 2026-03-06 |
| chart | src/components/ui/chart.tsx | component | Óptimo | utils | 2026-03-06 |
| checkbox | src/components/ui/checkbox.tsx | component | Óptimo | utils | 2026-03-06 |
| collapsible | src/components/ui/collapsible.tsx | component | Óptimo |  | 2026-03-06 |
| command | src/components/ui/command.tsx | component | Óptimo | utils | 2026-03-06 |
| context-menu | src/components/ui/context-menu.tsx | component | Óptimo | utils | 2026-03-06 |
| dialog | src/components/ui/dialog.tsx | component | Óptimo | utils | 2026-03-06 |
| drawer | src/components/ui/drawer.tsx | component | Óptimo | utils | 2026-03-06 |
| dropdown-menu | src/components/ui/dropdown-menu.tsx | component | Óptimo | utils | 2026-03-06 |
| form | src/components/ui/form.tsx | component | Óptimo | utils, label | 2026-03-06 |
| hover-card | src/components/ui/hover-card.tsx | component | Óptimo | utils | 2026-03-06 |
| index | src/components/ui/atomic/index.tsx | component | Óptimo | utils, ProductImage, HorizontalScroll, types | 2026-03-06 |
| input | src/components/ui/input.tsx | component | Óptimo | utils | 2026-03-06 |
| input-otp | src/components/ui/input-otp.tsx | component | Óptimo | utils | 2026-03-06 |
| label | src/components/ui/label.tsx | component | Óptimo | utils | 2026-03-06 |
| menubar | src/components/ui/menubar.tsx | component | Óptimo | utils | 2026-03-06 |
| navigation-menu | src/components/ui/navigation-menu.tsx | component | Óptimo | utils | 2026-03-06 |
| pagination | src/components/ui/pagination.tsx | component | Óptimo | utils, button | 2026-03-06 |
| popover | src/components/ui/popover.tsx | component | Óptimo | utils | 2026-03-06 |
| progress | src/components/ui/progress.tsx | component | Óptimo | utils | 2026-03-06 |
| radio-group | src/components/ui/radio-group.tsx | component | Óptimo | utils | 2026-03-06 |
| resizable | src/components/ui/resizable.tsx | component | Óptimo | utils | 2026-03-06 |
| scroll-area | src/components/ui/scroll-area.tsx | component | Óptimo | utils | 2026-03-06 |
| select | src/components/ui/select.tsx | component | Óptimo | utils | 2026-03-06 |
| separator | src/components/ui/separator.tsx | component | Óptimo | utils | 2026-03-06 |
| sheet | src/components/ui/sheet.tsx | component | Óptimo | utils | 2026-03-06 |
| sidebar | src/components/ui/sidebar.tsx | component | Advertencia | useMobile, utils, button, input, separator | 2026-03-06 |
| skeleton | src/components/ui/skeleton.tsx | component | Óptimo | utils | 2026-03-06 |
| slider | src/components/ui/slider.tsx | component | Óptimo | utils | 2026-03-06 |
| sonner | src/components/ui/sonner.tsx | component | Óptimo |  | 2026-03-06 |
| switch | src/components/ui/switch.tsx | component | Óptimo | utils | 2026-03-06 |
| table | src/components/ui/table.tsx | component | Óptimo | utils | 2026-03-06 |
| tabs | src/components/ui/tabs.tsx | component | Óptimo | utils | 2026-03-06 |
| textarea | src/components/ui/textarea.tsx | component | Óptimo | utils | 2026-03-06 |
| theme-provider | src/components/theme-provider.tsx | component | Óptimo |  | 2026-03-06 |
| toast | src/components/ui/toast.tsx | component | Óptimo | utils | 2026-03-06 |
| toaster | src/components/ui/toaster.tsx | component | Óptimo | useToast | 2026-03-06 |
| toggle | src/components/ui/toggle.tsx | component | Óptimo | utils | 2026-03-06 |
| toggle-group | src/components/ui/toggle-group.tsx | component | Óptimo | utils, toggle | 2026-03-06 |
| tooltip | src/components/ui/tooltip.tsx | component | Óptimo | utils | 2026-03-06 |
| useAuditLogsView | src/components/views/terminal/views/audit/useAuditLogsView.ts | component | Óptimo | useAuditLogs, useDebounce | 2026-03-06 |
| usePOSView | src/components/views/terminal/views/pos/usePOSView.ts | component | Óptimo | logger, utils, store, useProducts, useTransactions | 2026-03-06 |
| useReceptionsHistoryView | src/components/views/terminal/views/receptions/useReceptionsHistoryView.ts | component | Óptimo | store, useReceptions, types, useDocumentActions | 2026-03-06 |
| useSalesHistoryView | src/components/views/terminal/views/sales/useSalesHistoryView.ts | component | Óptimo | store, useTransactions, types, useDocumentActions | 2026-03-06 |
| useStoresView | src/components/views/terminal/views/stores/useStoresView.ts | component | Óptimo | store, useStores, types, logger, store-service | 2026-03-06 |
| useUsersView | src/components/views/terminal/views/users/useUsersView.ts | component | Óptimo | store, useUsers, useStores, UserForm, user | 2026-03-06 |
| base | src/hooks/api/base.ts | hook | Óptimo | supabaseClient, logger, store, query-inspector-utils | 2026-03-06 |
| useAuditLogs | src/hooks/api/useAuditLogs.ts | hook | Óptimo | supabaseClient, rpc-validator, schemas, base | 2026-03-06 |
| useCashClosures | src/hooks/api/useCashClosures.ts | hook | Óptimo | cash-service, types, base | 2026-03-06 |
| useCatalogModals | src/hooks/ui/useCatalogModals.ts | hook | Óptimo |  | 2026-03-06 |
| useCostEngine | src/hooks/logic/useCostEngine.ts | hook | Óptimo | types | 2026-03-06 |
| useCostSheetCalculator | src/hooks/logic/useCostSheetCalculator.ts | hook | Advertencia | cost-engine, types, validations | 2026-03-06 |
| useCostSheets | src/hooks/api/useCostSheets.ts | hook | Óptimo | supabaseClient | 2026-03-06 |
| useDashboard | src/hooks/api/useDashboard.ts | hook | Óptimo | supabaseClient, schemas, rpc-validator, base, types | 2026-03-06 |
| useDebounce | src/hooks/ui/useDebounce.ts | hook | Óptimo |  | 2026-03-06 |
| useDocumentActions | src/hooks/api/useDocumentActions.ts | hook | Óptimo | supabaseClient, store, base | 2026-03-06 |
| useInventory | src/hooks/api/useInventory.ts | hook | Óptimo | supabaseClient, schemas, rpc-validator, base, SyncProvider | 2026-03-06 |
| useMobile | src/hooks/ui/useMobile.ts | hook | Óptimo |  | 2026-03-06 |
| usePOSProducts | src/hooks/logic/usePOSProducts.ts | hook | Óptimo | types | 2026-03-06 |
| usePWA | src/hooks/ui/usePWA.ts | hook | Óptimo |  | 2026-03-06 |
| useProducts | src/hooks/api/useProducts.ts | hook | Óptimo | supabaseClient, schemas, rpc-validator, utils, base | 2026-03-06 |
| useRSS | src/hooks/api/useRSS.ts | hook | Óptimo | rss-service, types | 2026-03-06 |
| useReceptions | src/hooks/api/useReceptions.ts | hook | Óptimo | supabaseClient, rpc-validator, schemas, base | 2026-03-06 |
| useRoles | src/hooks/api/useRoles.ts | hook | Óptimo | supabaseClient, logger, base, types | 2026-03-06 |
| useSessionManager | src/hooks/logic/useSessionManager.ts | hook | Óptimo | store, session-store, supabaseClient, navigation, user | 2026-03-06 |
| useStockMovements | src/hooks/api/useStockMovements.ts | hook | Óptimo | supabaseClient, base, rpc-validator, schemas | 2026-03-06 |
| useStores | src/hooks/api/useStores.ts | hook | Óptimo | supabaseClient, logger, schemas, rpc-validator, base | 2026-03-06 |
| useSync | src/hooks/useSync.ts | hook | Óptimo | offline-storage, schemas, store | 2026-03-06 |
| useTaxes | src/hooks/api/useTaxes.ts | hook | Óptimo | supabaseClient, schemas, rpc-validator, base, types | 2026-03-06 |
| useTerminalNavigation | src/hooks/ui/useTerminalNavigation.ts | hook | Óptimo | types, user, roles | 2026-03-06 |
| useToast | src/hooks/ui/useToast.ts | hook | Óptimo |  | 2026-03-06 |
| useTransactions | src/hooks/api/useTransactions.ts | hook | Óptimo | supabaseClient, rpc-validator, base, SyncProvider | 2026-03-06 |
| useTransfers | src/hooks/api/useTransfers.ts | hook | Óptimo | transfer-service, SyncProvider, base | 2026-03-06 |
| useUsers | src/hooks/api/useUsers.ts | hook | Óptimo | supabaseClient, logger, base, rpc-validator, schemas | 2026-03-06 |
| audit-service | src/services/audit-service.ts | service | Óptimo | supabaseClient | 2026-03-06 |
| bot-service | src/services/bot-service.ts | service | Óptimo | orchestrator, types, definitions, registry, viewRegistry | 2026-03-06 |
| cash-service | src/services/cash-service.ts | service | Óptimo | supabaseClient, types, schemas | 2026-03-06 |
| catalog-service | src/services/catalog-service.ts | service | Óptimo | types, supabaseClient, import-service, schemas | 2026-03-06 |
| excel-service | src/services/excel-service.ts | service | Óptimo | cost-sheet | 2026-03-06 |
| export-service | src/services/export-service.ts | service | Óptimo |  | 2026-03-06 |
| import-service | src/services/import-service.ts | service | Óptimo |  | 2026-03-06 |
| report-service | src/services/report-service.ts | service | Óptimo | supabaseClient, types | 2026-03-06 |
| rss-service | src/services/rss-service.ts | service | Óptimo | supabaseClient, types | 2026-03-06 |
| store-service | src/services/store-service.ts | service | Óptimo | supabaseClient, logger, types | 2026-03-06 |
| transfer-service | src/services/transfer-service.ts | service | Óptimo | supabaseClient, types, rpc-validator | 2026-03-06 |
| usage-service | src/services/usage-service.ts | service | Óptimo | supabaseClient | 2026-03-06 |
| user-service | src/services/user-service.ts | service | Óptimo | supabaseClient, logger, types, schemas, rpc-validator | 2026-03-06 |
| ReleaseGatePdfExporter | src/lib/release_gate/ReleaseGatePdfExporter.ts | utility | Óptimo |  | 2026-03-06 |
| auth | src/lib/auth.ts | utility | Óptimo | supabaseClient | 2026-03-06 |
| backup | src/lib/ipv/backup.ts | utility | Óptimo |  | 2026-03-06 |
| bandecParser | src/lib/ipv/bandecParser.ts | utility | Óptimo | dexie, engine, utils | 2026-03-06 |
| calculations | src/lib/ipv/calculations.ts | utility | Óptimo | dexie, parser | 2026-03-06 |
| costpro-ejemplo | src/lib/data/costpro-ejemplo.ts | utility | Advertencia | cost-sheet | 2026-03-06 |
| costpro-reinicio | src/lib/data/costpro-reinicio.ts | utility | Advertencia |  | 2026-03-06 |
| db | src/lib/db.ts | utility | Óptimo |  | 2026-03-06 |
| deepseek-adapter | src/lib/ai/adapters/deepseek-adapter.ts | utility | Óptimo | openai-compatible-adapter | 2026-03-06 |
| definitions | src/lib/ai/tools/definitions.ts | utility | Óptimo | types | 2026-03-06 |
| demo-products | src/lib/data/demo-products.ts | utility | Óptimo |  | 2026-03-06 |
| dexie | src/lib/dexie.ts | utility | Óptimo |  | 2026-03-06 |
| engine | src/lib/ipv/engine.ts | utility | Advertencia |  | 2026-03-06 |
| errorHandler | src/lib/errorHandler.ts | utility | Óptimo | logger | 2026-03-06 |
| fallback-adapter | src/lib/ai/adapters/fallback-adapter.ts | utility | Óptimo | types | 2026-03-06 |
| formula-utils | src/lib/cost-engine/formula-utils.ts | utility | Óptimo |  | 2026-03-06 |
| gemini-adapter | src/lib/ai/adapters/gemini-adapter.ts | utility | Óptimo | types | 2026-03-06 |
| gpt-adapter | src/lib/ai/adapters/gpt-adapter.ts | utility | Óptimo | openai-compatible-adapter | 2026-03-06 |
| health-alerts | src/lib/observability/health-alerts.ts | utility | Óptimo | supabaseClient, health-engine | 2026-03-06 |
| health-engine | src/lib/observability/health-engine.ts | utility | Óptimo |  | 2026-03-06 |
| index | src/lib/cost-engine/index.ts | utility | Advertencia | formula-utils | 2026-03-06 |
| intelligence | src/lib/ipv/intelligence.ts | utility | Óptimo | dexie | 2026-03-06 |
| inventory-logic | src/lib/inventory-logic.ts | utility | Óptimo |  | 2026-03-06 |
| kimi-adapter | src/lib/ai/adapters/kimi-adapter.ts | utility | Óptimo | openai-compatible-adapter | 2026-03-06 |
| logger | src/lib/logger.ts | utility | Óptimo |  | 2026-03-06 |
| matching.worker | src/lib/ipv/matching.worker.ts | utility | Óptimo | engine | 2026-03-06 |
| mri-engine | src/lib/release_gate/mri-engine.ts | utility | Óptimo |  | 2026-03-06 |
| navigation | src/lib/navigation.ts | utility | Óptimo |  | 2026-03-06 |
| number-to-words-es | src/lib/utils/number-to-words-es.ts | utility | Óptimo |  | 2026-03-06 |
| offline-storage | src/lib/sync/offline-storage.ts | utility | Óptimo | schemas | 2026-03-06 |
| openai-compatible-adapter | src/lib/ai/adapters/openai-compatible-adapter.ts | utility | Óptimo | types | 2026-03-06 |
| orchestrator | src/lib/ai/orchestrator.ts | utility | Óptimo | types, gemini-adapter, gpt-adapter, qwen-adapter, deepseek-adapter | 2026-03-06 |
| parser | src/lib/ipv/parser.ts | utility | Óptimo |  | 2026-03-06 |
| pdf-export | src/lib/utils/pdf-export.ts | utility | Óptimo | types | 2026-03-06 |
| plan-utils | src/lib/plan-utils.ts | utility | Óptimo | usage-service, user | 2026-03-06 |
| query-inspector-utils | src/lib/query-inspector-utils.ts | utility | Óptimo |  | 2026-03-06 |
| qwen-adapter | src/lib/ai/adapters/qwen-adapter.ts | utility | Óptimo | types | 2026-03-06 |
| registry | src/lib/ai/tools/registry.ts | utility | Óptimo | viewRegistry, definitions, system-health | 2026-03-06 |
| roles | src/lib/roles.ts | utility | Óptimo | types | 2026-03-06 |
| rpc-validator | src/lib/rpc-validator.ts | utility | Óptimo |  | 2026-03-06 |
| schemas | src/lib/cost-engine/schemas.ts | utility | Óptimo |  | 2026-03-06 |
| sm2 | src/lib/academy/sm2.ts | utility | Óptimo |  | 2026-03-06 |
| supabaseClient | src/lib/supabaseClient.ts | utility | Óptimo |  | 2026-03-06 |
| system-health | src/lib/observability/system-health.ts | utility | Óptimo |  | 2026-03-06 |
| template-consultancy | src/lib/data/template-consultancy.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-furniture | src/lib/data/template-furniture.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-icecream | src/lib/data/template-icecream.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-industrial | src/lib/data/template-industrial.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-juice | src/lib/data/template-juice.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-lavar | src/lib/data/template-lavar.ts | utility | Advertencia |  | 2026-03-06 |
| template-logistics | src/lib/data/template-logistics.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-pastry | src/lib/data/template-pastry.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-pizza | src/lib/data/template-pizza.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-repair | src/lib/data/template-repair.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| template-shoes | src/lib/data/template-shoes.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| types | src/lib/cost-engine/types.ts | utility | Óptimo |  | 2026-03-06 |
| types | src/lib/ai/types.ts | utility | Óptimo |  | 2026-03-06 |
| utils | src/lib/utils.ts | utility | Óptimo | supabaseClient, types | 2026-03-06 |
| utils | src/lib/ipv/utils.ts | utility | Óptimo | dexie | 2026-03-06 |
| validations | src/lib/cost-engine/validations.ts | utility | Óptimo | cost-sheet | 2026-03-06 |
| AcademyView | src/components/views/terminal/views/academy/AcademyView.tsx | view | Óptimo | useAcademyStore, store, Flashcard, MasteryDashboard, button | 2026-03-06 |
| AuditLogsView | src/components/views/terminal/views/audit/AuditLogsView.tsx | view | Óptimo | AuditFilters, AuditTimeline, AuditTableView, AuditEventIcon, StateRenderer | 2026-03-06 |
| AuditTableView | src/components/views/terminal/views/audit/AuditTableView.tsx | view | Óptimo | schemas, AuditEventIcon, utils | 2026-03-06 |
| CashClosureView | src/components/views/terminal/views/cash_closure/CashClosureView.tsx | view | Óptimo | utils, ActionMenu, useCashClosures, store | 2026-03-06 |
| CatalogView | src/components/views/terminal/views/catalog/CatalogView.tsx | view | Óptimo | store, useProducts, CostProLoader, ActionMenu, useMobile | 2026-03-06 |
| ConcentricDashboardRing | src/components/views/terminal/views/dashboard/ConcentricDashboardRing.tsx | view | Óptimo | utils | 2026-03-06 |
| CostSheetAuditView | src/components/views/terminal/views/cost_sheet/CostSheetAuditView.tsx | view | Óptimo | card, badge, scroll-area, utils, CostSheetAuditLog | 2026-03-06 |
| CostSheetCardView | src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx | view | Advertencia | LazyRender, excel-service, utils, cost-sheet-store, cost-sheet | 2026-03-06 |
| CostSheetView | src/components/views/terminal/views/cost_sheet/CostSheetView.tsx | view | Advertencia | DarianEditor, LazyRender, cost-sheet-store, useCostSheetCalculator, CostSheetNav | 2026-03-06 |
| DashboardView | src/components/views/terminal/views/dashboard/DashboardView.tsx | view | Óptimo | utils, store, useProducts, StateRenderer, types | 2026-03-06 |
| ExecutiveKpiCards | src/components/views/terminal/views/dashboard/ExecutiveKpiCards.tsx | view | Óptimo | utils | 2026-03-06 |
| HelpView | src/components/views/terminal/views/help/HelpView.tsx | view | Advertencia | utils, button, badge, CostFlowDiagram, QuickModeMassiveDiagram | 2026-03-06 |
| IPVReportView | src/components/views/terminal/views/ipv/IPVReportView.tsx | view | Advertencia | BaseModal, dexie, button, badge, input | 2026-03-06 |
| IPVView | src/components/views/terminal/views/ipv/IPVView.tsx | view | Advertencia | dexie, card, tabs, button, badge | 2026-03-06 |
| InventoryAdjustmentsView | src/components/views/terminal/views/inventory/InventoryAdjustmentsView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, QueryInspector, useStockMovements | 2026-03-06 |
| InventoryCardView | src/components/views/terminal/views/inventory/InventoryCardView.tsx | view | Óptimo | types, utils, CostProLoader, atomic | 2026-03-06 |
| InventoryCountCardView | src/components/views/terminal/views/inventory_count/InventoryCountCardView.tsx | view | Óptimo | types, utils, InventoryCountView | 2026-03-06 |
| InventoryCountTableView | src/components/views/terminal/views/inventory_count/InventoryCountTableView.tsx | view | Óptimo | types, utils, InventoryCountView | 2026-03-06 |
| InventoryCountView | src/components/views/terminal/views/inventory_count/InventoryCountView.tsx | view | Óptimo | store, types, ActionMenu, SearchBar, QueryInspector | 2026-03-06 |
| InventoryTableView | src/components/views/terminal/views/inventory/InventoryTableView.tsx | view | Óptimo | types, utils, CostProLoader, ProductImage | 2026-03-06 |
| InventoryView | src/components/views/terminal/views/inventory/InventoryView.tsx | view | Óptimo | store, useInventory, InventoryCardView, InventoryTableView, ProductReceptionView | 2026-03-06 |
| LegalView | src/components/views/terminal/views/legal/LegalView.tsx | view | Óptimo | utils, supabaseClient, LegalConsultant, LegalModelForm | 2026-03-06 |
| ManualReconciliationView | src/components/views/terminal/views/ipv/ManualReconciliationView.tsx | view | Advertencia | button, dexie, utils, badge, scroll-area | 2026-03-06 |
| NewsView | src/components/views/terminal/views/rss/NewsView.tsx | view | Óptimo | utils, useRSS, StateRenderer, types | 2026-03-06 |
| POSTableView | src/components/views/terminal/views/pos/POSTableView.tsx | view | Óptimo | types, utils, ProductImage | 2026-03-06 |
| POSView | src/components/views/terminal/views/pos/POSView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, atomic, POSTableView | 2026-03-06 |
| PivotStatementView | src/components/views/terminal/views/ipv/PivotStatementView.tsx | view | Advertencia | dexie, card, button, utils | 2026-03-06 |
| ProductReceptionView | src/components/views/terminal/views/inventory/ProductReceptionView.tsx | view | Advertencia | supabaseClient, store, types, useInventory, useDebounce | 2026-03-06 |
| RSSManagementView | src/components/views/terminal/views/rss/RSSManagementView.tsx | view | Advertencia | utils, useRSS, StateRenderer | 2026-03-06 |
| RecentCostSheets | src/components/views/terminal/views/dashboard/RecentCostSheets.tsx | view | Óptimo | useCostSheets, utils, store, cost-sheet-store | 2026-03-06 |
| ReceptionsHistoryView | src/components/views/terminal/views/receptions/ReceptionsHistoryView.tsx | view | Óptimo | utils, SearchBar, QueryInspector, StateRenderer, skeleton | 2026-03-06 |
| ReportsView | src/components/views/terminal/views/reports/ReportsView.tsx | view | Óptimo | card, button, ActionMenu, CostProLoader, store | 2026-03-06 |
| RolesManagementView | src/components/views/terminal/views/users/RolesManagementView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, useRoles, BaseModal | 2026-03-06 |
| SalesHistoryView | src/components/views/terminal/views/sales/SalesHistoryView.tsx | view | Óptimo | utils, SearchBar, StateRenderer, skeleton, useSalesHistoryView | 2026-03-06 |
| SettingsView | src/components/views/terminal/views/settings/SettingsView.tsx | view | Óptimo | utils, useTaxes, store, supabaseClient | 2026-03-06 |
| StockHistoryView | src/components/views/terminal/views/stock_history/StockHistoryView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, QueryInspector, useStockMovements | 2026-03-06 |
| StoresManagementView | src/components/views/terminal/views/stores/StoresManagementView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, useStoresView, StoreModals | 2026-03-06 |
| SystemHealthView | src/components/views/terminal/views/health/SystemHealthView.tsx | view | Óptimo | utils, HealthStatusHeader, InfrastructureMetrics, ApplicationMetrics, SecurityMetrics | 2026-03-06 |
| TransferQRReportView | src/components/views/terminal/views/ipv/TransferQRReportView.tsx | view | Óptimo | supabaseClient, store, dexie, card, badge | 2026-03-06 |
| TransferenciasView | src/components/views/terminal/views/transfers/TransferenciasView.tsx | view | Óptimo | store, useTransfers, ActionMenu, StateRenderer, utils | 2026-03-06 |
| UsersManagementView | src/components/views/terminal/views/users/UsersManagementView.tsx | view | Óptimo | utils, SearchBar, ActionMenu, button, switch | 2026-03-06 |
| useDashboardView | src/components/views/terminal/views/dashboard/useDashboardView.ts | view | Óptimo | store, useDashboard | 2026-03-06 |
