import sys

file_path = 'src/lib/ipv/engine.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the results array type in reconcileAll
content = content.replace(
    'const results = [];',
    'const results: any[] = [];'
)

with open(file_path, 'w') as f:
    f.write(content)
