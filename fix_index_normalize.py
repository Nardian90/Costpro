import sys

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "const safeDecimal = (val: any) => {" in line:
        # Find the end of this function
        pass # We'll just insert it after the function

# Actually easier to just find the spot after safeDecimal
content = "".join(lines)
insertion = "\nconst normalize = (s: string) => s.replace(/\\s+/g, '').toLowerCase();\n"
if "const safeDecimal" in content and "const normalize =" not in content:
    pos = content.find("};", content.find("const safeDecimal")) + 2
    content = content[:pos] + insertion + content[pos:]

# Remove local normalize definitions that might conflict or were incomplete
content = content.replace("        const normalize = (s: string) => s.replace(/\\s+/g, '').toLowerCase();\n", "")

with open(file_path, 'w') as f:
    f.write(content)
