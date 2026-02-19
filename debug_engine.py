import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add a console.log in smartTranslate
content = content.replace(
    "translated = translated.replace(regex, `ref('${r}')`);",
    "const prev = translated; translated = translated.replace(regex, `ref('${r}')`); if (prev !== translated) console.log(`SmartRef: ${prev} -> ${translated}`);"
)

with open(file_path, 'w') as f:
    f.write(content)
