import sys

content = open('src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx').read()

search_line = 'const costPercent = totalPrice > 0 ? (totalCost / totalPrice) * 100 : 0;'
insert_line = 'const markupPercent = totalCost > 0 ? (utility / totalCost) * 100 : 0;'

if search_line in content and insert_line not in content:
    new_content = content.replace(search_line, search_line + '\n  ' + insert_line)
    with open('src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully patched")
else:
    print("Search line not found or already patched")
