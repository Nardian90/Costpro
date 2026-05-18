import re

with open('src/lib/export/pdf-generator.ts', 'r') as f:
    content = f.read()

# Fix the TS errors by casting pdfFormat to any in comparisons where it was narrowed
content = content.replace("pdfFormat !== 'simplificado'", "(pdfFormat as any) !== 'simplificado'")

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
