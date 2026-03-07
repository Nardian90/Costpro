import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'r') as f:
    content = f.read()

# 1. Disable VH editing for parents
content = content.replace(
    'onClick={() => setIsEditingVH(true)}',
    'onClick={() => !hasChildren && setIsEditingVH(true)}'
)

# 2. Disable Total editing for parents
content = content.replace(
    'onClick={() => setIsEditingTotal(true)}',
    'onClick={() => !hasChildren && setIsEditingTotal(true)}'
)

# 3. Visual hint for non-editable fields (cursor)
content = content.replace(
    'cursor-pointer border-r border-border/10" onClick={() => !hasChildren && setIsEditingVH(true)}',
    'cn("border-r border-border/10", !hasChildren ? "cursor-pointer" : "cursor-not-allowed") + \'" onClick={() => !hasChildren && setIsEditingVH(true)}\''
)
# Wait, the above replace is a bit messy. Let's do it more carefully.

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'w') as f:
    f.write(content)
