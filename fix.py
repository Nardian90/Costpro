import sys
content = open('src/app/api/cost-sheets/export-pdf/route.ts').read()
old = 'replace(/[\\/\\?%*:|"<>]/g' # This matches what's currently there (approximately)
# We want: .replace(/[\\\/\\?%*:|"<>]/g, '-')
# Actually, let's just target the line
import re
content = re.sub(r'const safeFilename = .*?\.replace\(.*?\);',
                 'const safeFilename = `ficha-${evalCode}-${evalName}.pdf`.replace(/[\\\\/\\\\?%*:|"<>]/g, \'-\');',
                 content)
open('src/app/api/cost-sheets/export-pdf/route.ts', 'w').write(content)

content = open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx').read()
content = re.sub(r'const safeBaseName = .*?\.replace\(.*?\);',
                 'const safeBaseName = `${evalCode}-${evalName}`.replace(/[\\\\/\\\\?%*:|"<>]/g, \'-\');',
                 content)
open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w').write(content)
