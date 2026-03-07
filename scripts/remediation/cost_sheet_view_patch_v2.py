import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
has_confirmation_state = False
for line in lines:
    if 'const [confirmation, setConfirmation] = useState' in line:
        has_confirmation_state = True
        break

for i, line in enumerate(lines):
    if 'const [activeSection' in line and not has_confirmation_state:
        new_lines.append(line)
        new_lines.append("  const [confirmation, setConfirmation] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; variant?: 'default' | 'destructive' }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });\n")
        new_lines.append("  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {\n")
        new_lines.append("    setConfirmation({ isOpen: true, title, message, onConfirm, variant });\n")
        new_lines.append("  };\n")
        continue

    if 'id: "reset",' in line:
        new_lines.append(line)
        new_lines.append('      label: "Limpiar Ficha",\n')
        new_lines.append('      icon: Trash2,\n')
        new_lines.append('      onClick: () => {\n')
        new_lines.append('          askConfirmation("¿Estás seguro?", "¿Deseas limpiar todos los datos de la ficha? Esta acción no se puede deshacer.", () => {\n')
        new_lines.append('              // Logic to reset\n')
        new_lines.append('              toast.success("Ficha reiniciada");\n')
        new_lines.append('          }, "destructive");\n')
        new_lines.append('      },\n')
        new_lines.append('      category: "Acción",\n')
        new_lines.append('      variant: "destructive"\n')
        new_lines.append('    },\n')
        # Skip the next few lines that we added in the first patch
        continue

    # Skip lines until 'id: "ai-chat"'
    if i > 0 and 'id: "reset",' in lines[i-1] and 'label: "Limpiar Ficha",' in line:
        continue
    if i > 1 and 'id: "reset",' in lines[i-2] and 'icon: Trash2,' in line:
        continue
    if i > 2 and 'id: "reset",' in lines[i-3] and 'onClick: () => {' in line:
        continue
    if i > 3 and 'id: "reset",' in lines[i-4] and 'if (confirm(' in line:
        continue
    if i > 4 and 'id: "reset",' in lines[i-5] and '// Logic' in line:
        continue
    if i > 5 and 'id: "reset",' in lines[i-6] and 'toast.success' in line:
        continue
    if i > 6 and 'id: "reset",' in lines[i-7] and '}' in line:
        continue
    if i > 7 and 'id: "reset",' in lines[i-8] and '},' in line:
        continue
    if i > 8 and 'id: "reset",' in lines[i-9] and 'category:' in line:
        continue
    if i > 9 and 'id: "reset",' in lines[i-10] and 'variant: "destructive"' in line:
        continue
    if i > 10 and 'id: "reset",' in lines[i-11] and '},' in line:
        continue

    new_lines.append(line)

# Add BaseModal at the bottom
if 'import { BaseModal } from "@/components/ui/BaseModal";' not in "".join(new_lines):
    new_lines.insert(20, 'import { BaseModal } from "@/components/ui/BaseModal";\n')

# Append BaseModal component before the last closing brace of the component if possible,
# but simpler to just find the last </div> before the final return or similar.
# Let's just find the SpeedDial and add it after.
for i, line in enumerate(new_lines):
    if '<SpeedDial actions={speedDialActions} />' in line:
        new_lines[i] = line + """
      <BaseModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        title={confirmation.title}
        description={confirmation.message}
        onConfirm={() => {
          confirmation.onConfirm();
          setConfirmation({ ...confirmation, isOpen: false });
        }}
        variant={confirmation.variant}
      />
"""

with open(file_path, 'w') as f:
    f.writelines(new_lines)
