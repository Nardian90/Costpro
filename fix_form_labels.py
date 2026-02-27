import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetForm.tsx'
with open(path, 'r') as f:
    content = f.read()

# The TableCell in CostSheetForm.tsx already has data-label={col?.label}
# but the Table itself might need the class fix for scroll wrapper

search_str = '<Table>'
replace_str = '<Table className="sm:data-table">'

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Table class fixed in Form")

with open(path, 'w') as f:
    f.write(content)
