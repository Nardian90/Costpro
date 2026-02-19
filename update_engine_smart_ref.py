import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Define smartTranslate helper inside calculateFicha
# We'll place it after the rowsByClass and rowsById maps are initialized.

insertion_point = "annexSumMap.forEach((classMap, anexoId) => {"
helper_logic = """
  const allRefs = [...Array.from(rowsByClass.keys()), ...Array.from(rowsById.keys())]
    .filter(k => k && k.length > 0)
    .sort((a, b) => b.length - a.length);

  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    allRefs.forEach(r => {
        if (!/^[\\d.]+$/.test(r)) return;
        const escaped = r.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        try {
            const regex = new RegExp(`(?<!ref\\\\(['"]|vh\\\\(['"]|['"])\\\\b${escaped}\\\\b(?!['"])`, 'g');
            translated = translated.replace(regex, `ref('${r}')`);
        } catch (e) {}
    });
    return translated;
  };
"""

# Wait, the regex above has too many backslashes for Python string.
# Let's use a simpler way to write it in the file.

# Actually, I'll just use a direct string replacement for where translateFormulaFromSpanish is called.

content = content.replace(
    "const formulaStr = translateFormulaFromSpanish(formulaStrRaw || '0');",
    "const formulaStr = smartTranslate(formulaStrRaw || '0');"
)
content = content.replace(
    "const vhFormulaStr = translateFormulaFromSpanish(vhFormulaStrRaw);",
    "const vhFormulaStr = smartTranslate(vhFormulaStrRaw);"
)

# Insert the helper
content = content.replace(
    "const annexTotals = new Map<string, number>();",
    helper_logic + "\n  const annexTotals = new Map<string, number>();"
)

with open(file_path, 'w') as f:
    f.write(content)
