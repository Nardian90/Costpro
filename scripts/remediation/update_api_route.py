import os

filepath = 'src/app/api/cost-sheets/export-pdf/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update timestamp format
content = content.replace(
    'const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");',
    'const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");'
)

# 2. Resilient translation in annexes
content = content.replace(
    'head: [headers.map(h => translate(h).toUpperCase())]',
    'head: [headers.map(h => translate(h.toLowerCase()).toUpperCase())]'
)

with open(filepath, 'w') as f:
    f.write(content)
