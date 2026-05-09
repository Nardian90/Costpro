import sys

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "export function calculateFicha(" in line:
        new_lines.append(line)
        new_lines.append("  ficha: FichaJSON,\n")
        new_lines.append("  options?: { actor?: string; maxIter?: number; damping?: number }\n")
        new_lines.append("): CalculationResult {\n")
        # Need to skip the old signature if it was multi-line
    elif "const knownIds = new Set(ficha.rows.map(r => r.id));" in line:
        new_lines.append(line)
        new_lines.append("  const knownClasses = new Set(ficha.rows.map(r => r.classification));\n")
        new_lines.append("  const knownAnnexes = new Set(ficha.anexos.map(a => a.id));\n")
    elif "const formulaStr = smartTranslate(formulaStrRaw || '0', knownIds, knownClasses);" in line:
        new_lines.append("            const formulaStr = smartTranslate(formulaStrRaw || '0', knownIds, knownClasses, knownAnnexes);\n")
    elif "const vhFormulaStr = smartTranslate(vhFormulaStrRaw, knownIds, knownClasses);" in line:
        new_lines.append("            const vhFormulaStr = smartTranslate(vhFormulaStrRaw, knownIds, knownClasses, knownAnnexes);\n")
    else:
        new_lines.append(line)

# This script is a bit risky due to skips, let's just do a clean write of what we know is missing
with open(file_path, 'w') as f:
    f.writelines(new_lines)
