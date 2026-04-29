# Implementation Details: Parallel Cost Scenarios v4.0

## Architecture
- **Data Model:** Scenarios are stored within the `CostSheetData` JSON under the `scenarios` array (max 3). They share the same section/row structure but have independent values (`valorHistorico`, `totalFormula`, etc.).
- **State Management:** A dedicated `useScenarioStore` (Zustand) manages UI state (active IDs, comparison mode) and provides CRUD operations for scenario data, synchronized with the main `CostSheetStore`.
- **Calculation Engine:** The `useScenarioCalculator` hook executes multiple instances of the base cost engine in parallel using fixed slots to comply with React Hook rules.

## Key Components
- **CostSheetComparisonTable:** A horizontal, high-density table with sticky identity columns. It calculates deltas and percentages in real-time.
- **ExpertModeAccordion:** Enhanced with completion progress bars and validation status indicators.
- **CostSheetProblemsPanel:** A VSCode-style validation overlay that groups errors and warnings, providing deep-links to the affected rows.

## Quality Standards
- **Keyboard Shortcuts:** Alt+E (expand), Alt+C (compare), Alt+1-9 (navigate), Ctrl+S (save).
- **Autosave:** Background snapshots every 90s with a 15-version history buffer.
- **Accessibility:** WCAG AA compliant ARIA attributes and focus management.
- **Performance:** Memoized calculation slots to prevent redundant evaluations.

## Export
- **PDF Export:** Supports individual scenario selection or a landscape-oriented comparison report.
