import sys

file_path = 'src/services/bot-service.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'JSON.parse(toolCall.function.arguments)' in line:
        indent = line[:line.find('JSON.parse')]
        new_lines.append(f"{indent}/* BUG-05 FIX */ (() => {{\n")
        new_lines.append(f"{indent}  try {{ return JSON.parse(toolCall.function.arguments); }}\n")
        new_lines.append(f"{indent}  catch (e) {{\n")
        new_lines.append(f"{indent}    console.error('[BotService] JSON.parse failed:', e, toolCall.function.arguments);\n")
        new_lines.append(f"{indent}    return {{}};\n")
        new_lines.append(f"{indent}  }}\n")
        new_lines.append(f"{indent}}})(),\n")
    else:
        new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
