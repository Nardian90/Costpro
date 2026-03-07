import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
with open(path, 'r') as f:
    content = f.read()

# Fix Row height
search_str = '<TableRow key={rowIndex} className="h-8 text-xs border-b border-border/30 hover:bg-primary/5 transition-colors group">'
replace_str = '<TableRow key={rowIndex} className="h-auto sm:h-8 text-xs border-b border-border/30 hover:bg-primary/5 transition-colors group">'

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Row height fixed")
else:
    print("Row height search string not found")

# Fix Table scroll wrapper interference with table-to-cards
search_str2 = 'className="table-scroll-wrapper relative"'
replace_str2 = 'className={cn("table-scroll-wrapper relative", layoutMode === "grid" && "sm:table-scroll-wrapper")}'

# The UI Table component already has table-scroll-wrapper.
# CostSheetAnnexEditor uses <Table> from @/components/ui/table

if search_str2 in content:
    content = content.replace(search_str2, replace_str2)
    print("Table scroll wrapper fixed")

with open(path, 'w') as f:
    f.write(content)
