import re

with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

# The error is in validateFicha at line 97 (approx)
# It should use formulaToUse instead of row.formula
# row.formula is nullable in the type definition, while formulaToUse is checked for truthiness.

old_block = """const formulaToUse = row.formula || (row as any).totalFormula;
    if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        try {
            const formulaStr = translateFormulaFromSpanish(formulaToUse.startsWith('=') ? formulaToUse.substring(1) : formulaToUse);"""

# I previously used formulaToUse in translateFormulaFromSpanish but maybe not everywhere in that block
# Let's check the actual file content first to be sure what's there now.
