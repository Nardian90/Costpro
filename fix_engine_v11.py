file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Replace all smartTranslate(x) with translateFormulaFromSpanish(x)
content = content.replace("smartTranslate(", "translateFormulaFromSpanish(")

# Remove any definition of smartTranslate
import re
content = re.sub(r'  const smartTranslate = \(formula: string\) => \{.*?  \};', '', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
