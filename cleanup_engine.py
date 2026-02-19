import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Remove the first occurrence of smartTranslate definition
# It starts at line 238 according to grep
lines = content.split('\n')
start = 237 # 0-indexed
end = -1
for i in range(start, len(lines)):
    if '};' in lines[i]:
        end = i
        break

if end != -1:
    new_lines = lines[:start] + lines[end+1:]
    with open(file_path, 'w') as f:
        f.write('\n'.join(new_lines))
    print("Cleaned up double declaration.")
else:
    print("Failed to find end of first declaration.")
