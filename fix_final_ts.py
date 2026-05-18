import re

with open('src/lib/export/pdf-generator.ts', 'r') as f:
    content = f.read()

# Fix the TS error by casting to any or removing the unreachable check
content = content.replace("if (pdfFormat !== 'simplificado' && pdfFormat !== 'ejecutivo')", "if ((pdfFormat as any) !== 'simplificado' && pdfFormat !== 'ejecutivo')")

# Fix the indigo variable if it still exists
content = content.replace("[75, 0, indigo]", "[75, 0, 130]")

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
