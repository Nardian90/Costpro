# Bug Analysis: State Corruption in Expert Mode Accordions

## Problem Summary

**Issue**: Silent cross-section data corruption when editing sections in Expert Mode (consolidated view).

**Root Cause**: Index-based store path mismatch caused by singleton array pattern.

---

## Technical Analysis

### The Flawed Pattern

In `CostSheetView.tsx` (lines 484-502), each section is rendered inside an `ExpertModeAccordion` with a **singleton array**:

```tsx
{effectiveLayoutMode === "grid" ? (
    <CostSheetCardView
        sections={[section]}  // ← Singleton array
        calculatedValues={calculatedValues}
        annexes={data?.annexes || []}
        activeSubSectionId="all"
        setActiveSubSectionId={() => {}}
        hideHeader={true}
    />
) : (
    <CostSheetInteractiveTable
        sections={[section]}  // ← Singleton array
        calculatedValues={calculatedValues}
        annexes={data?.annexes || []}
        activeSubSectionId="all"
        setActiveSubSectionId={() => {}}
        hideHeader={true}
    />
)}
```

### How It Breaks

Both `CostSheetCardView` and `CostSheetInteractiveTable` iterate over their `sections` prop using `.map()`:

```tsx
// In CostSheetInteractiveTable.tsx (line 616)
return sections.map((section, sectionIndex) => {
    // ...
    return (
        <CostSheetRow
            key={row.id}
            row={row}
            level={0}
            index={rowIndex}
            numbering={`${sectionIndex + 1}.${rowIndex + 1}`}
            calculated={calculatedValues?.[row.id] || {} as CalculatedRowValue}
            calculatedValues={calculatedValues}
            path={['sections', sectionIndex, 'rows', rowIndex]}  // ← BUG HERE
            annexes={annexes}
            suggestions={suggestions}
        />
    );
});
```

**The Problem**: When `sections={[section]}` is passed, `sectionIndex` is **always 0** inside the child component, regardless of which actual section from `data.sections` is being displayed.

### Data Flow Corruption

When a user edits Section 3 (which is actually `data.sections[2]`):

1. `CostSheetView.tsx` passes `sections={[data.sections[2]]}` to the child
2. Child component iterates: `sections.map((section, sectionIndex) => ...)` → `sectionIndex = 0`
3. Row path becomes: `['sections', 0, 'rows', rowIndex]`
4. Store update writes to `data.sections[0].rows[rowIndex]` instead of `data.sections[2].rows[rowIndex]`

**Result**: Editing any section after the first silently corrupts `data.sections[0]`.

---

## Secondary Issue: Formula Handling in handleTotalSave

In `CostSheetInteractiveTable.tsx` (lines 136-146) and `CostSheetCardView.tsx` (lines 140-150):

```tsx
const handleTotalSave = (val: string) => {
    if (val.startsWith('=')) {
        handleValueChange('formula', val);
        handleValueChange('totalFormula', val);
    } else {
        handleValueChange('formula', null);
        handleValueChange('totalFormula', null);
        handleValueChange('total', parseFloat(val) || 0);  // ← Stores in transient field
    }
    setIsEditingTotal(false);
};
```

**Problems**:

1. **Non-formula inputs erase formulas**: Valid formula-like inputs without leading `=` (e.g., `ref('1')`, `AnexoI`) fall into the else branch, erasing formulas and often resolving to 0.

2. **Transient vs modeled fields**: Manual total edits write to `row.total`, but the calculator/engine computes fixed row totals from `value/valorHistorico`. This causes manual edits to stop affecting calculations.

---

## Solution

### Fix 1: Pass Absolute Section Index

Instead of passing singleton arrays, pass the **absolute index** of each section so child components can construct correct store paths.

**Option A**: Pass `globalSectionIndex` as a prop:

```tsx
// CostSheetView.tsx
{(data?.sections || []).map((section: CostSheetSection, globalIndex: number) => (
    <ExpertModeAccordion
        key={section.id}
        id={section.id}
        title={section.label || `Sección ${section.id}`}
        isExpanded={expertState.expandedSections.includes(section.id)}
        onToggle={() => expertState.toggleSection(section.id)}
        onHelp={() => expertState.setHelpContext(section.id)}
    >
        <LazyRender>
        {effectiveLayoutMode === "grid" ? (
            <CostSheetCardView
                sections={[section]}
                globalSectionIndex={globalIndex}  // ← NEW PROP
                calculatedValues={calculatedValues}
                annexes={data?.annexes || []}
                activeSubSectionId="all"
                setActiveSubSectionId={() => {}}
                hideHeader={true}
            />
        ) : (
            <CostSheetInteractiveTable
                sections={[section]}
                globalSectionIndex={globalIndex}  // ← NEW PROP
                calculatedValues={calculatedValues}
                annexes={data?.annexes || []}
                activeSubSectionId="all"
                setActiveSubSectionId={() => {}}
                hideHeader={true}
            />
        )}
        </LazyRender>
    </ExpertModeAccordion>
))}
```

Then in child components:

```tsx
// CostSheetInteractiveTable.tsx
interface CostSheetInteractiveTableProps {
  sections: CostSheetSection[];
  globalSectionIndex?: number;  // ← NEW
  // ... other props
}

// Inside the map:
sections.map((section, localIndex) => {
    const absoluteIndex = globalSectionIndex ?? localIndex;
    // ...
    path={['sections', absoluteIndex, 'rows', rowIndex]}
});
```

**Option B (Better)**: Pass the full `data.sections` array and filter by ID inside children, preserving correct indices.

### Fix 2: Improve Formula Detection

Update `handleTotalSave` to detect formulas more intelligently:

```tsx
const handleTotalSave = (val: string) => {
    const trimmedVal = val.trim();
    
    // Check for formula patterns (not just leading =)
    const isFormula = trimmedVal.startsWith('=') || 
                      trimmedVal.includes('ref(') || 
                      trimmedVal.includes('Anexo') ||
                      /^[A-Za-z]/.test(trimmedVal); // Alphanumeric references
    
    if (isFormula) {
        handleValueChange('formula', trimmedVal);
        handleValueChange('totalFormula', trimmedVal);
        handleValueChange('total', null); // Clear transient value
    } else {
        handleValueChange('formula', null);
        handleValueChange('totalFormula', null);
        handleValueChange('total', parseFloat(trimmedVal) || 0);
    }
    setIsEditingTotal(false);
};
```

---

## Files Affected

1. `src/components/views/terminal/views/cost_sheet/CostSheetView.tsx`
   - Lines 474-505: Section rendering loop
   
2. `src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx`
   - Lines 616-702: Section mapping and path construction
   - Lines 136-146: handleTotalSave logic
   
3. `src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx`
   - Lines 436-492: Section mapping and path construction
   - Lines 140-150: handleTotalSave logic

---

## Testing Recommendations

1. **Cross-section corruption test**:
   - Create a cost sheet with 3+ sections
   - Edit values in Section 2 and Section 3
   - Verify changes persist in correct sections, not Section 1

2. **Formula detection test**:
   - Enter `ref('1')` in total field (no leading =)
   - Verify formula is preserved, not erased
   - Enter `AnexoI` from suggestions
   - Verify it's treated as a formula reference

3. **Manual total override test**:
   - Enter a numeric value in total field
   - Verify it persists and affects calculations appropriately

---

## References

- PR #1214: https://github.com/Nardian90/Costpro/pull/1214/changes#diff-5f2a0e63c2e1d8bef8661012422252029fcf29c009c54fff854f792ba601016f
- Related files: `CostSheetView.tsx`, `CostSheetInteractiveTable.tsx`, `CostSheetCardView.tsx`
