# Task 3-E / 3-F Work Record

## Agent: Main Agent
## Status: COMPLETED

## Summary
Replaced all 7 raw `<img>` tags with Next.js `<Image>` component and configured bundle analyzer.

## Files Modified (9 total)

### img → Image replacements (7 files):
1. `src/components/ui/atomic/index.tsx` — ProductImage component, added width/height props
2. `src/components/views/terminal/views/ipv/IncomeReceiptPreview.tsx` — Receipt logo (64×64)
3. `src/components/views/terminal/views/ipv/SC204Preview.tsx` — SC204 logo (48×48)
4. `src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx` — Export logo (48×48)
5. `src/components/views/terminal/views/stores/StoreModals.tsx` — Store logo preview (80×80)
6. `src/components/views/terminal/views/stores/StoresManagementView.tsx` — Store grid (56×56)
7. `src/components/views/terminal/views/receptions/ReceptionDetailsModal.tsx` — Product image (40×40)

### Config changes (2 files):
8. `next.config.ts` — remotePatterns (Supabase + Google), optimizePackageImports (lodash/d3/xlsx), bundle analyzer
9. `package.json` — Added `analyze` and `analyze:win` scripts, `@next/bundle-analyzer` devDep

## Verification
- Zero raw `<img` tags remaining in src/**/*.tsx
- Dev server compiles with optimizePackageImports experiment
- Zero new lint errors from changes
