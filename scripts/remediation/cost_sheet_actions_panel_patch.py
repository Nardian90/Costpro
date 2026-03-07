import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetActionsPanel.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace primary color with neon green
content = content.replace('text-primary', 'text-[#00FF00]')
content = content.replace('bg-primary/10', 'bg-[#00FF00]/10')
content = content.replace('hover:bg-primary/5', 'hover:bg-[#00FF00]/5')
content = content.replace('hover:text-primary', 'hover:text-[#00FF00]')
content = content.replace('group-hover:text-primary', 'group-hover:text-[#00FF00]')
content = content.replace('border-primary/10', 'border-[#00FF00]/10')

# Specific cases for headers and icons
content = content.replace('text-muted-foreground', 'text-[#00FF00]')

with open(file_path, 'w') as f:
    f.write(content)
