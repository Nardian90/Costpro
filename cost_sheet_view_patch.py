import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'const speedDialActions: SpeedDialAction[] = [' in line:
        new_lines.append(line)
        new_lines.append('    {\n')
        new_lines.append('      id: "reset",\n')
        new_lines.append('      label: "Limpiar Ficha",\n')
        new_lines.append('      icon: Trash2,\n')
        new_lines.append('      onClick: () => {\n')
        new_lines.append('          if (confirm("¿Estás seguro de que deseas limpiar todos los datos de la ficha?")) {\n')
        new_lines.append('              // Logic to reset the sheet data could go here\n')
        new_lines.append('              toast.success("Ficha reiniciada");\n')
        new_lines.append('          }\n')
        new_lines.append('      },\n')
        new_lines.append('      category: "Acción",\n')
        new_lines.append('      variant: "destructive"\n')
        new_lines.append('    },\n')
        skip = True
        continue
    if skip:
        if 'id: "ai-chat",' in line:
            new_lines.append(line)
            continue
        if 'variant: "primary"' in line and i > 0 and 'id: "ai-chat"' in lines[i-5]:
             # We want to keep it visible, but the user said "color del texto sea igual q calculadora"
             # Calculadora has no variant (default).
             # But SpeedDial.tsx styles 'primary' and 'success' with neon green now.
             # If I remove variant: "primary", it will use 'default' which is bg-card text-[#00FF00].
             continue
        if '];' in line and skip:
            new_lines.append(line)
            skip = False
            continue
        if skip:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
