import sys

content = open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx').read()

type_def = """export type PDFFormat =
  | 'standard'
  | 'pro'
  | 'res148'
  | 'ejecutivo'
  | 'contabilidad'
  | 'auditoria'
  | 'simplificado'
  | 'bilingue'
  | 'comparativo'
  | 'exportacion';"""

import re
# Find the start of the old type def and replace until the next export or const
content = re.sub(r'export type PDFFormat =.*?;', type_def, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'w') as f:
    f.write(content)
