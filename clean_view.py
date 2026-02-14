import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'r') as f:
    content = f.read()

# I want to revert handleQuickGenerate to a clean version with the new logic
new_code = """  const handleQuickGenerate = React.useCallback((rows: any[]) => {
    if (rows.length > 1) {
        setQuickModeProducts(rows.map(r => ({
            name: r.product,
            sku: `QM-${r.id}`,
            unit_of_measure: r.um,
            price: r.cost,
            quantity: r.quantity
        })));
        setActiveSection("massive-gen");
        setViewMode("expert");
        toast.info(`Iniciando generación masiva para ${rows.length} productos`);
        return;
    }"""

import re
pattern = r"const handleQuickGenerate = React\.useCallback\(\(rows: any\[\]\) => \{.*?return;\n    \}"
# Match the whole if block
new_content = re.sub(pattern, new_code, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
    f.write(new_content)
