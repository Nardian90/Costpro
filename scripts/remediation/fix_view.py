import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'r') as f:
    content = f.read()

old_block = """    // Evaluate header formulas for final save as requested by user
    const exportData = {
        ...data,
        header: {
            ...data.header,
            ...(calculatedHeader || {})
        }
    };
    // Export data maintaining formula integrity in the header
    // We include a calculation snapshot for offline reference without destroying the dynamic nature of the sheet
    const exportData = {
        ...data,
        metadata: {
            ...data?.metadata,
            exportedAt: new Date().toISOString(),
            integrity: "full",
            calculationSnapshot: {
                header: calculatedHeader,
                values: calculatedValues
            }
        }
    };"""

new_block = """    // Export data maintaining formula integrity in the header
    // We include a calculation snapshot for offline reference without destroying the dynamic nature of the sheet
    const exportData = {
        ...data,
        metadata: {
            ...data?.metadata,
            exportedAt: new Date().toISOString(),
            integrity: "full",
            calculationSnapshot: {
                header: calculatedHeader,
                values: calculatedValues
            }
        }
    };"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
        f.write(content)
    print("Fixed successfully")
else:
    print("Block not found")
