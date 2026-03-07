import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'r') as f:
    content = f.read()

old_block = """    const exportData = {
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
    };

    document.body.appendChild(downloadAnchorNode);"""

new_block = """    const exportData = {
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
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);

    // Use calculated code for filename if available
    const filename = `ficha-${calculatedHeader?.code || data?.header?.code || 'export'}.json`;
    downloadAnchorNode.setAttribute("download", filename);

    document.body.appendChild(downloadAnchorNode);"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
        f.write(content)
    print("Fixed successfully")
else:
    print("Block not found")
