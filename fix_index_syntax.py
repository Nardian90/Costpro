import sys

with open('src/lib/cost-engine/index.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
redondeo_block = []
in_wrong_place = False

for line in lines:
    if "parser.functions.REDONDEO = (val: number, decimals: number = 2) => {" in line:
        in_wrong_place = True
        redondeo_block.append(line)
        continue

    if in_wrong_place:
        redondeo_block.append(line)
        if "  };" in line:
            in_wrong_place = False
        continue

    new_lines.append(line)

    if "const parser = new Parser();" in line and len(redondeo_block) > 0:
        new_lines.extend(redondeo_block)
        redondeo_block = []

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.writelines(new_lines)

print("Fixed index.ts syntax")
