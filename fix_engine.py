import re

with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

# 1. extractDependencies: handle totalFormula
content = content.replace(
    "if (row.formaCalculo === 'FORMULA' && row.formula) {",
    "const formulaToUse = row.formula || (row as any).totalFormula;\n  if (row.formaCalculo === 'FORMULA' && formulaToUse) {"
)
# Use a specific replace for the call to avoid global mess
content = content.replace(
    "    extractFromFormula(row.formula);",
    "    extractFromFormula(formulaToUse);"
)

# 2. validateFicha: register valor() and handle totalFormula
content = content.replace(
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => val; // Dummy for validation",
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => val; // Dummy for validation\n  parser.functions.valor = (x: any) => x;"
)

# Use totalFormula in validateFicha - be very specific
old_validate_formula = """    if (row.formaCalculo === 'FORMULA' && row.formula) {
        try {
            const formulaStr = translateFormulaFromSpanish(row.formula.startsWith('=') ? row.formula.substring(1) : row.formula);"""

new_validate_formula = """const formulaToUse = row.formula || (row as any).totalFormula;
    if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        try {
            const formulaStr = translateFormulaFromSpanish(formulaToUse.startsWith('=') ? formulaToUse.substring(1) : formulaToUse);"""

content = content.replace(old_validate_formula, new_validate_formula)

# Fix matchAll in validateFicha
content = content.replace("row.formula.matchAll", "formulaToUse.matchAll")

# 3. calculateFicha: register valor()
content = content.replace(
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => {",
    "parser.functions.valor = (x: any) => x;\n  parser.functions.REDONDEO = (val: number, decimals: number = 2) => {"
)

# 4. computeRowTotal: enforce sum(children) for parents and handle totalFormula
old_compute = """    const ruleOverride = activeRules[0];
    let formulaToUse = row.formula;
    let formaCalculoToUse = row.formaCalculo;

    const isParent = ficha.rows.some(r => r.parentId === row.id);
    if (!formulaToUse && isParent && (formaCalculoToUse === 'FORMULA' || formaCalculoToUse === 'IMPORTAR_ANEXO')) {
        formulaToUse = 'sum(children)';
        formaCalculoToUse = 'FORMULA';
    }"""

new_compute = """const ruleOverride = activeRules[0];
    let formulaToUse = row.formula || (row as any).totalFormula;
    let formaCalculoToUse = row.formaCalculo;

    const isParent = ficha.rows.some(r => r.parentId === row.id);
    if (isParent) {
        formulaToUse = 'sum(children)';
        formaCalculoToUse = 'FORMULA';
    }"""

content = content.replace(old_compute, new_compute)

# 5. Iterative loop: enforce sum(children) for VH in parents
old_vh_eval = """      // Calculate VH if formula exists
      if (row.vhFormula) {
        try {
            const vhFormulaStrRaw = row.vhFormula.trim().startsWith('=')
              ? row.vhFormula.trim().substring(1)
              : row.vhFormula;"""

new_vh_eval = """      // Calculate VH if formula exists
      const isParentRow = ficha.rows.some(r => r.parentId === row.id);
      const vhFormulaToUse = isParentRow ? 'sum(children)' : row.vhFormula;
      if (vhFormulaToUse) {
        try {
            const vhFormulaStrRaw = vhFormulaToUse.trim().startsWith('=')
              ? vhFormulaToUse.trim().substring(1)
              : vhFormulaToUse;"""

content = content.replace(old_vh_eval, new_vh_eval)

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.write(content)
