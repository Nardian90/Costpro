import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "    try {" in line:
        # Check if it's evaluateHeaderExpression by looking ahead a bit
        idx = lines.index(line)
        if idx + 1 < len(lines) and "let expr = trimmed.substring(1);" in lines[idx+1]:
             new_lines.append("    let expr = '';\n")
             new_lines.append("    try {\n")
             new_lines.append("        expr = trimmed.substring(1);\n")
             continue
    if "let expr = trimmed.substring(1);" in line:
        continue # handled above

    # Same for evaluateAnnexExpression
    if "try {" in line and "let expr = trimmed;" in lines[lines.index(line)+1]:
         new_lines.append("    let expr = '';\n")
         new_lines.append("    try {\n")
         new_lines.append("        expr = trimmed;\n")
         continue
    if "let expr = trimmed;" in line:
        continue

    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)

print("Fixed scope successfully")
