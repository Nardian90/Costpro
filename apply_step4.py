import re

with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

# Fallback mechanism and Enforcement
# We need to find the specific block in computeRowTotal
pattern = r"const ruleOverride = activeRules\[0\];\s+let formulaToUse = row\.formula;\s+let formaCalculoToUse = row\.formaCalculo;\s+const isParent = ficha\.rows\.some\(r => r\.parentId === row\.id\);\s+if \(!formulaToUse && isParent && \(formaCalculoToUse === 'FORMULA' || formaCalculoToUse === 'IMPORTAR_ANEXO'\)\) \{"

# Replacement that enforces sum(children) for ALL parents
replacement = """const ruleOverride = activeRules[0];
    let formulaToUse = row.formula || (row as any).totalFormula;
    let formaCalculoToUse = row.formaCalculo;
    const isParent = ficha.rows.some(r => r.parentId === row.id);
    if (isParent) {"""

content = re.sub(pattern, replacement, content)

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.write(content)
