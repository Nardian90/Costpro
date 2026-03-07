import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx'
with open(path, 'r') as f:
    content = f.read()

search_str = '                            <td key={`${rowIndex}-${col.key}`} className={cn('
replace_str = '                            <td key={`${rowIndex}-${col.key}`} data-label={col.label || col.title || col.key} className={cn('

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Search string not found")
