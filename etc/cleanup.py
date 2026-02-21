import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "let expr = '';" in line or 'let expr = "";' in line:
        if len(new_lines) > 0 and ("let expr =" in new_lines[-1]):
            continue # skip duplicate
    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)
print("Cleaned up duplicates")
