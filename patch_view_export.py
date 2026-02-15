import sys

content = open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx').read()

import re

pattern = r'const handleExportJSON = React.useCallback\(\(\) => \{.*?\}, \[data\]\);'
replacement = """const handleExportJSON = React.useCallback(() => {
    if (isBlocked) {
        toast.warning("Exportando con advertencias: La ficha contiene errores críticos de validación.");
    }

    // Evaluate header formulas for final save as requested by user
    const exportData = {
        ...data,
        header: {
            ...data.header,
            ...(calculatedHeader || {})
        }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);

    // Use calculated code for filename if available
    const filename = `ficha-${calculatedHeader?.code || data?.header?.code || 'export'}.json`;
    downloadAnchorNode.setAttribute("download", filename);

    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("JSON exportado correctamente");
  }, [data, calculatedHeader, isBlocked]);"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content != content:
    with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully patched")
else:
    print("Pattern not found")
