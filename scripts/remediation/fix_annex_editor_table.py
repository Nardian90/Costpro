import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
with open(path, 'r') as f:
    content = f.read()

search_str = '<Table>'
replace_str = '<Table className={cn(layoutMode === "grid" && "sm:data-table")}>'

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Table class fixed")
else:
    print("Table search string not found")

with open(path, 'w') as f:
    f.write(content)
