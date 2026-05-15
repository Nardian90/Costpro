import re
import os

def fix_file(path, search, replace):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    with open(path, 'r') as f:
        content = f.read()
    new_content = content.replace(search, replace)
    if new_content == content:
        # Try regex if literal match fails
        new_content = re.sub(search, replace, content)

    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Fixed {path}")

# 1. useCellEditor.ts
fix_file('src/hooks/logic/useCellEditor.ts',
         '(acc, s) => acc ?? findRowById(s.rows, rowId),',
         '(acc: CostSheetRow | null, s: CostSheetSection) => acc ?? findRowById(s.rows, rowId),')

# 2. CostSheetTemplateExplorer.test.tsx
fix_file('src/components/views/terminal/views/cost_sheet/__tests__/CostSheetTemplateExplorer.test.tsx',
         'import { CostSheetTemplateExplorer } from \'../CostSheetTemplateExplorer\';',
         'import CostSheetTemplateExplorer from \'../CostSheetTemplateExplorer\';')

# 3. CostSheetNarrative.tsx
fix_file('src/components/views/terminal/views/cost_sheet/CostSheetNarrative.tsx',
         '[header, calculatedHeader, hdr, metrics, sectionAnalysis, annexStatus, compliance, insights]);',
         '[header, calculatedHeader, hdr, metrics, sectionAnalysis, annexStatus, compliance, insights, compliancePct, complianceScore, complianceTotal]);')

# 4. CostSheetWizard.tsx
# This one is tricky with literal replace. Let's use a more robust way.
with open('src/components/views/terminal/views/cost_sheet/CostSheetWizard.tsx', 'r') as f:
    wizard_content = f.read()

if 'function FactoryDiagram' not in wizard_content:
    # Remove old one
    wizard_content = re.sub(r'// ── SVG Factory Diagram Component ──\n\s+const FactoryDiagram = \(\) => \(.*?\n\s+\);', '', wizard_content, flags=re.DOTALL)
    # Insert new one after PHASE_LABELS
    factory_diagram = """
// ── SVG Factory Diagram Component ──
function FactoryDiagram({ progress }: { progress: number }) {
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 960 280" className="w-full max-w-4xl mx-auto" style={{ minWidth: 640 }}>
        <defs>
          <linearGradient id="beltGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
            <stop offset="25%" stopColor="#f59e0b" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#ef4444" stopOpacity="0.6" />
            <stop offset="75%" stopColor="#06b6d4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6b7280" stopOpacity="0.6" />
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
          </filter>
        </defs>
        <rect x="20" y="140" width="920" height="20" rx="10" fill="#334155" />
        <rect x="20" y="142" width="920" height="16" rx="8" fill="url(#beltGrad)" />
        <rect x="40" y="148" width={Math.min((progress / 100) * 880, 880)} height="2" rx="1" fill="#10b981" fillOpacity="0.5" />
      </svg>
    </div>
  );
}
"""
    wizard_content = re.sub(r'(const PHASE_LABELS = \[.*?\];)', r'\1\n' + factory_diagram, wizard_content, flags=re.DOTALL)
    # Update usage
    wizard_content = wizard_content.replace('<FactoryDiagram />', '<FactoryDiagram progress={progress} />')
    with open('src/components/views/terminal/views/cost_sheet/CostSheetWizard.tsx', 'w') as f:
        f.write(wizard_content)
    print("Fixed CostSheetWizard.tsx")

# 5. cost-sheet-store.test.ts
fix_file('src/store/__tests__/cost-sheet-store.test.ts',
         'persist: (config: any) => config,',
         'persist: (config: any) => config,\n  createJSONStorage: (getStorage: any) => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),')

# 6. export-pdf.route.test.ts
fix_file('src/app/api/cost-sheets/__tests__/export-pdf.route.test.ts',
         'setDrawColor: vi.fn(),',
         'setDrawColor: vi.fn(),\n      setPage: vi.fn(),')
