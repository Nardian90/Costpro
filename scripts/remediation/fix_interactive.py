import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx'
with open(path, 'r') as f:
    content = f.read()

# Fix Row height
search_str = '"h-8 text-xs",'
replace_str = '"h-auto sm:h-8 text-xs",'

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Row height fixed")
else:
    print("Row height search string not found")

with open(path, 'w') as f:
    f.write(content)
