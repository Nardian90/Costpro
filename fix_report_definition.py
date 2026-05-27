import os

with open('src/types/index.ts', 'r') as f:
    content = f.read()

if 'format?:' not in content and 'ReportDefinition' in content:
    content = content.replace(
        'columns: string[];',
        'columns: string[];\n  format?: "a4" | "letter" | "legal";'
    )

with open('src/types/index.ts', 'w') as f:
    f.write(content)
