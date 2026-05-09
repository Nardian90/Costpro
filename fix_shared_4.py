import sys

file_path = 'src/lib/cost-engine/shared-mapping.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Fix the Anexo fallback in shared-mapping.ts too
    if 'return String(total);' in line and i > 0 and 'if (rowClass) {' in lines[i-15:i]:
         # Find the line that looks like: return rowClass ? '0' : String(total);
         # I might have made it complicated in my previous script.
         pass
    new_lines.append(line)

# Let's just use a simple string replace for the line I know is there
content = "".join(lines)
content = content.replace("return rowClass ? '0' : String(total);", "return '0';")

with open(file_path, 'w') as f:
    f.write(content)
