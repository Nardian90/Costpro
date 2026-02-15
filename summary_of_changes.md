# Summary of Changes

## PDF Export Improvements
- **Filename**: Now uses evaluated header values (code and name) instead of raw formulas. Implemented sanitized filenames using regex.
- **Styling**:
    - Parent rows (with children) are now bold.
    - Rows containing "costo" or "venta" are bold.
    - Rows containing "venta" are colored red for emphasis.
- **Consolidation**: Annexes always start on a new page in consolidated mode.
- **Utility Note**: Added a togglable "Nota de Utilidad" in the PDF that explains the ratio between Precio (13.1) and Costo (12.1).

## UI Enhancements
- **Export Modal**: Added a new switch to toggle the "Utility Note" in the PDF export.
- **Utility Slider**:
    - Added a horizontal slider (1% - 100%) in the `CostSheetSummary` view (below the circular chart).
    - The slider dynamically updates the formula for the "Utilidad" row (ID '13') in the store.
    - Added a color-coded feedback box below the slider that provides financial context:
        - 20-30%: Normal products.
        - 12-20%: Wholesale / High rotation.
        - < 12%: Risk of loss due to taxes.
        - > 30%: Potential stagnant stock / Abusive pricing warning.

## Technical Details
- Modified `src/app/api/cost-sheets/export-pdf/route.ts` (API).
- Modified `src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx` (UI).
- Modified `src/components/views/terminal/views/cost_sheet/CostSheetView.tsx` (Integration).
- Modified `src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx` (Features).
