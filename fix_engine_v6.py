import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Replace the broken helper with a clean one
new_helper = """  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Safer token-based replacement for numeric references
    const parts = translated.split(/([\\\\s\\\\+\\\\-\\\\*\\\\/\\\\(\\\\)\\\\,])/);
    const processed = parts.map(p => {
        const trimmed = p.trim();
        if (/^[\\\\d.]+$/.test(trimmed) && trimmed.length > 0) {
            if (rowsByClass.has(trimmed) || rowsById.has(trimmed)) {
                return `ref('${trimmed}')`;
            }
        }
        return p;
    });
    return processed.join('');
  };"""

# Wait, again with backslashes in Python... I'll use a plain string with escape characters handled.
# Actually I'll use a dedicated file and read it.

with open('helper.txt', 'w') as f:
    f.write("""  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Token-based replacement for numeric references
    return translated.split(/([\\s\\+\\-\\*/\\(\\),])/).map(p => {
        const trimmed = p.trim();
        if (/^[\\d.]+$/.test(trimmed) && trimmed.length > 0) {
            if (rowsByClass.has(trimmed) || rowsById.has(trimmed)) {
                return `ref('${trimmed}')`;
            }
        }
        return p;
    }).join('');
  };""")

with open('helper.txt', 'r') as f:
    helper_code = f.read()

# Find the start and end of the old helper
import re
pattern = re.compile(r'  const allRefs = .*?  \};', re.DOTALL)
content = pattern.sub(helper_code, content)

with open(file_path, 'w') as f:
    f.write(content)
