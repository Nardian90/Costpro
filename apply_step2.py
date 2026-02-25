import re

with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

# Register valor() in validateFicha
content = content.replace(
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => val; // Dummy for validation",
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => val; // Dummy for validation\n  parser.functions.valor = (x: any) => x;"
)

# Use totalFormula in validateFicha
content = content.replace(
    "if (row.formaCalculo === 'FORMULA' && row.formula) {",
    "const formulaToUse = row.formula || (row as any).totalFormula;\n    if (row.formaCalculo === 'FORMULA' && formulaToUse) {"
)

# Use formulaToUse in translation and parsing
content = content.replace(
    "const formulaStr = translateFormulaFromSpanish(row.formula.startsWith('=') ? row.formula.substring(1) : row.formula);",
    "const formulaStr = translateFormulaFromSpanish(formulaToUse.startsWith('=') ? formulaToUse.substring(1) : formulaToUse);"
)

# Fix matchAll in validateFicha
content = re.sub(
    r"const (refMatches|vhMatches) = row\.formula\.matchAll",
    r"const \1 = formulaToUse.matchAll",
    content
)

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.write(content)
