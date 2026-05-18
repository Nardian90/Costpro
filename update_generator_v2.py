import re

with open('src/lib/export/pdf-generator.ts', 'r') as f:
    content = f.read()

# Fix header formula resolution
# Before: const header = { ... };
# After: const header = { ... }; for (const key in header) { if (typeof header[key] === 'string' && header[key].startsWith('=')) { header[key] = calculatedHeader?.[key] ?? header[key]; } }

formula_fix = """  const header = {
    ...(sheetData?.header || {}),
    ...(calculatedHeader || {}),
    ...(calculationResult?.metadata?.header || {})
  };

  // Resolve formulas in header fields
  Object.keys(header).forEach(key => {
    const val = header[key];
    if (typeof val === 'string' && val.startsWith('=')) {
      // If it's a formula, try to get the resolved value from calculatedHeader
      if (calculatedHeader && calculatedHeader[key] !== undefined) {
        header[key] = calculatedHeader[key];
      }
    }
  });"""

content = re.sub(r'const header = \{.*?\};', formula_fix, content, flags=re.DOTALL)

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
