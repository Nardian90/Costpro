import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Define smartTranslate inside calculateFicha
# Insert it after the calculatedRows map initialization
insertion_point = "const parser = new Parser();"
smart_translate_code = """
  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Token-based replacement for numeric references (e.g. 1.1.1)
    // We split by operators and whitespace to find individual tokens
    return translated.split(/([\\s\\+\\-\\*/\\(\\),])/).map(p => {
        const trimmed = p.trim();
        // If it looks like a numeric reference and matches a known row
        if (/^[\\d.]+$/.test(trimmed) && trimmed.length > 0) {
            if (rowsByClass.has(trimmed) || rowsById.has(trimmed)) {
                return `ref('${trimmed}')`;
            }
        }
        return p;
    }).join('');
  };
"""

content = content.replace(insertion_point, smart_translate_code + "\n  " + insertion_point)

with open(file_path, 'w') as f:
    f.write(content)
