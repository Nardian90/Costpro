import sys

# Robust fix for evaluateHeaderExpression
with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip_until_catch = False
for line in lines:
    if "return parser.evaluate(expr);" in line and "evaluateHeaderExpression" in "".join(new_lines[-100:]):
        new_lines.append(line)
        new_lines.append("    } catch (e) {\n")
        new_lines.append("        return expr;\n")
        new_lines.append("    }\n")
        new_lines.append("};\n")
        skip_until_catch = True
        continue

    if skip_until_catch:
        if "export const useCostSheetCalculator" in line:
            new_lines.append("\n")
            new_lines.append(line)
            skip_until_catch = False
        continue

    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)

print("Fixed header eval syntax")
