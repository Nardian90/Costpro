import sys
import re

content = open('src/components/views/terminal/views/cost_sheet/FormulaEditor.tsx').read()

# Fix DialogContent and add flex flex-col max-h-[90vh]
search_dialog = 'sm:max-w-[700px] z-[200] p-0 overflow-hidden rounded-2xl border-none shadow-2xl'
replace_dialog = 'sm:max-w-[700px] z-[200] p-0 overflow-hidden rounded-2xl border-none shadow-2xl flex flex-col max-h-[90vh]'

if search_dialog in content:
    content = content.replace(search_dialog, replace_dialog)
    print("Patched DialogContent")

# Add shrink-0 to header
if 'border-primary/10 shrink-0' not in content:
    content = content.replace(
        'border-primary/10">',
        'border-primary/10 shrink-0">'
    )
    print("Patched Header")

# Wrap middle div in ScrollArea
if '<ScrollArea className="flex-1 min-h-0">' not in content:
    content = content.replace(
        '<div className="p-6">',
        '<ScrollArea className="flex-1 min-h-0">\n            <div className="p-6">'
    )
    content = content.replace(
        '</div>\n\n          <div className="px-6 py-4 bg-muted/30',
        '</div>\n          </ScrollArea>\n\n          <div className="px-6 py-4 bg-muted/30'
    )
    print("Patched ScrollArea")

# Add shrink-0 to footer
if 'border-border shrink-0' not in content:
    content = content.replace(
        'border-border">',
        'border-border shrink-0">'
    )
    print("Patched Footer")

with open('src/components/views/terminal/views/cost_sheet/FormulaEditor.tsx', 'w') as f:
    f.write(content)
