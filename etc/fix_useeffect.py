import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "  useEffect(() => {" in line:
        new_lines.append(line)
        idx = lines.index(line)
        if "    let expr = '';" in lines[idx+1] and "    try {" in lines[idx+2] and "        expr = trimmed.substring(1);" in lines[idx+3]:
            # This is the mess. Skip the next 3 lines.
            skip = 3
            continue

    if skip > 0:
        skip -= 1
        continue

    new_lines.append(line)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.writelines(new_lines)
print("Fixed useEffect mess")
