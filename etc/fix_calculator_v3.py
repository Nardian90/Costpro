import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue

    # Check for evaluateAnnexExpression evaluation logic
    if "if (!/^[0-9.+\-*/() ]+$/.test(expr)) {" in line and i + 4 < len(lines) and "return new Function" in lines[i+4]:
        new_lines.append("    // Advanced arithmetic evaluation with expr-eval\n")
        new_lines.append("    const parser = new Parser();\n")
        new_lines.append("    parser.functions.REDONDEO = (val: number, decimals: number = 2) => {\n")
        new_lines.append("        return new Decimal(val).toDecimalPlaces(decimals).toNumber();\n")
        new_lines.append("    };\n")
        new_lines.append("    parser.functions.round = parser.functions.REDONDEO;\n")
        new_lines.append("    return parser.evaluate(expr);\n")
        skip = 5
        continue

    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)
print("Updated evaluateAnnexExpression successfully")
