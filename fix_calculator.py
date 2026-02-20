import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

old_regex = """        // ref('...') and vh('...') support in header
        expr = expr.replace(/\\b(ref|vh)\\(['"]([^'"]+)['"]\\)/g, (_, fn, __, search) => {"""

# Wait, the escaping in python strings is tricky. I'll use a simpler search.

old_line = """        expr = expr.replace(/\b(ref|vh)\(['"]([^'"]+)['"]\)/g, (_, fn, __, search) => {"""
new_line = """        expr = expr.replace(/\b(ref|vh)\(['"]([^'"]+)['"]\)/g, (_, fn, search) => {"""

if old_line in content:
    content = content.replace(old_line, new_line)
    with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
        f.write(content)
    print("Fixed calculator regex successfully")
else:
    print("Line not found")
