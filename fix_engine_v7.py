import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Simplify smartTranslate to debug
new_helper = """  const smartTranslate = (formula: string) => {
    try {
        return translateFormulaFromSpanish(formula);
    } catch (e) {
        return formula;
    }
  };"""

pattern = re.compile(r'  const smartTranslate = \(formula: string\) => \{.*?  \};', re.DOTALL)
content = pattern.sub(new_helper, content)

with open(file_path, 'w') as f:
    f.write(content)
