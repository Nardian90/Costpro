import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'r') as f:
    content = f.read()

# Fix the duplicate PDFFormat type definition
# It currently looks like:
# export type PDFFormat =
#   | 'standard'
#   ...
#   | 'exportacion';
#   | 'standard'
#   ...
#   | 'exportacion';

pattern = r"(export type PDFFormat = \n(\s*\| '.*?' \n)+?  \| 'exportacion';\n)(\s*\| '.*?' \n)+?  \| 'exportacion';\n"
content = re.sub(pattern, r"\1", content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'w') as f:
    f.write(content)
