# CostPro Enterprise — Worklog

---

Task ID: 16
Agent: Main Agent (Z.ai)
Task: Migración Vitest 4.x — Reparar 261 tests fallidos → 676/676 pasando

Work Log:
- Diagnosticado: `bun test` (runner nativo bun 1.3.12) NO soporta Vitest 4.x features
- Solución: usar `bun run test` (vitest 4.1.5 con jsdom completo)
- Fix 35 archivos: vi.mocked, vi.stubGlobal, importOriginal, vi.hoisted, vi.spyOn
- Verificación: **676/676 tests, 153/153 archivos, 0 failures**

Stage Summary:
- Comando correcto: `bun run test` (NO `bun test`)
- APIs Vitest 4.x migradas: vi.mocked→as any, vi.stubGlobal→vi.spyOn, importOriginal→vi.importActual
- APIs preservadas: vi.hoisted, vi.spyOn, vi.importActual, vi.fn

SHA-256 Registry (35 archivos):
```
7d5f7209 src/__tests__/setup.tsx
4d77f895 src/__tests__/integration/pos-sale-flow.test.ts
bc27d364 src/components/ui/__tests__/CommandPalette.test.tsx
7d79ae39 src/hooks/ui/__tests__/useExpertModeState.test.ts
d9a20ba9 src/hooks/ui/__tests__/usePWA.test.ts
af552d4 src/services/__tests__/user-service.test.ts
6443244 src/services/__tests__/catalog-service.test.ts
c72312b src/services/__tests__/cash-service.test.ts
1aab74d src/services/__tests__/transfer-service.test.ts
dc75042 src/services/__tests__/usage-service.test.ts
91568d4 src/services/__tests__/store-service.test.ts
80a0779 src/services/bot-service.test.ts
80237c4 src/app/api/rss/__tests__/route.test.ts
4efebe7 src/app/api/help-docs/__tests__/route.test.ts
bffd040 src/app/api/bot/__tests__/chat.route.test.ts
60ddb14 src/app/api/cost-sheets/__tests__/save.route.test.ts
eb010ee src/app/api/cost-sheets/__tests__/calculate.route.test.ts
fc28102 src/app/api/cost-sheets/import-json/__tests__/route.test.ts
fd1d411 src/app/api/cost-sheets/ai/__tests__/chat.route.test.ts
8d528ed src/app/api/logs/__tests__/route.test.ts
559fd9d src/app/api/reports/__tests__/generate.route.test.ts
9d7aa52 src/app/api/inventory/__tests__/adjust.route.test.ts
52717aa src/app/api/inventory/__tests__/route.test.ts
9c74477 src/app/api/inventory/adjustments/__tests__/route.test.ts
3d252a9 src/app/api/inventory/products/__tests__/route.test.ts
01aabfd src/components/views/terminal/views/dashboard/__tests__/MultiStoreDashboardView.test.tsx
6a0c0d0 src/components/views/terminal/views/stores/__tests__/StoresManagementView.test.tsx
49411a9 src/components/views/terminal/views/pos/__tests__/POSView.test.tsx
c840caa src/components/views/terminal/views/inventory/__tests__/InventoryView.test.tsx
e6732db src/components/views/terminal/views/transfers/__tests__/TransferenciasView.test.tsx
e2eea99 src/components/views/terminal/views/transfers/__tests__/CreateTransferModal.test.tsx
5d77b4b src/components/views/terminal/views/audit/__tests__/AuditGlobalView.test.tsx
b6a19a6 src/components/views/terminal/views/cost_sheet/__tests__/CostSheetComparisonTable.test.tsx
```

---

Task ID: 17
Agent: Main Agent (Z.ai)
Task: Auditoría y fix de Modo Asistido + Lectura Narrativa en módulo de costos

Work Log:
- Audit completo de 22 archivos involucrados en Modo Asistido y Lectura Narrativa
- **BUG CRÍTICO ENCONTRADO**: Dual viewMode state desincronizado
  - `useCostSheetActions` tenía su propio `viewMode` (actualizado por sidebar/effects)
  - `useCostSheetViewState` tenía otro `viewMode` (usado para renderizado condicional)
  - Sidebar → `activeSection='view-assisted'` → `actions.viewMode='assisted'` PERO `viewState.viewMode` seguía 'expert'
  - **Resultado**: `<CostSheetWizard>` y `<CostSheetNarrative>` NUNCA se renderizaban
- **Fix aplicado**:
  - Exportar `viewMode`, `isEditing`, `setIsEditing` desde `useCostSheetActions`
  - En `CostSheetView.tsx`, usar `actionsViewMode` como source of truth (alias `viewMode`)
  - Eliminar `setViewMode('expert')` redundante del botón "Ir al Editor"
- **CostSheetBanner**: Restaurar `CostSheetModeDropdown` (importado pero nunca renderizado)
- Verificación: tsc 0 errores en src/, lint limpio

Stage Summary:
- BUG FIX: Modo Asistido y Lectura Narrativa ahora renderizan correctamente
- Root cause: Dos estados `viewMode` independientes sin sincronización
- Source of truth unificado: `useCostSheetActions.viewMode`
- `CostSheetModeDropdown` ahora visible en el banner de ficha de costo

SHA-256 Registry (3 archivos):
```
509ab157 src/hooks/logic/useCostSheetActions.ts
118ee496 src/components/views/terminal/views/cost_sheet/CostSheetView.tsx
6d937706 src/components/views/terminal/views/cost_sheet/CostSheetBanner.tsx
```
