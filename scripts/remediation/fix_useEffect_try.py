import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "  useEffect(() => {" in line:
        new_lines.append(line)
        idx = lines.index(line)
        if "    try {" not in lines[idx+1]:
            new_lines.append("    try {\n")
        continue
    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)
print("Restored useEffect try")
