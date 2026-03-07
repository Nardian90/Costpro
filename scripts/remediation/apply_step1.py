with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "if (row.formaCalculo === 'FORMULA' && row.formula) {",
    "const formulaToUse = row.formula || (row as any).totalFormula;\n  if (row.formaCalculo === 'FORMULA' && formulaToUse) {"
)
content = content.replace(
    "extractFromFormula(row.formula);",
    "extractFromFormula(formulaToUse);"
)

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.write(content)
