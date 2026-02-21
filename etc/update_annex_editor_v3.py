import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Row class (height and density)
content = content.replace('<TableRow key={rowIndex} className="border-b border-border/30 hover:bg-primary/5 transition-colors group">',
                          '<TableRow key={rowIndex} className="h-8 text-xs border-b border-border/30 hover:bg-primary/5 transition-colors group">')

# Padding reduction in TableCells
content = content.replace('className="p-3 sm:p-4"', 'className="py-1 px-2"')

# Zero value logic inside the map
old_mapping = """                    {displayData.map((row: any, rowIndex: number) => ("""
new_mapping = """                    {displayData.map((row: any, rowIndex: number) => {
                        const isZero = (colKey: string) => Number(row[colKey]) === 0;
                        return ("""
content = content.replace(old_mapping, new_mapping)

# Add closing brace for the map logic
content = content.replace('                    ))}', '                    );})}')

# Conditional styling for zero values in formula columns
content = content.replace('px-3 py-2 font-mono text-right bg-primary/5 text-primary font-black min-w-[100px] border border-primary/10',
                          'px-2 py-1 font-mono text-right bg-primary/5 {isZero(col.key) ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black"} min-w-[100px] border border-primary/10')

# Need to use template literal for the class above
content = content.replace('className="neu-inset-sm px-2 py-1 font-mono text-right bg-primary/5 {isZero(col.key) ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black"} min-w-[100px] border border-primary/10"',
                          'className={cn("neu-inset-sm px-2 py-1 font-mono text-right bg-primary/5 min-w-[100px] border border-primary/10", isZero(col.key) ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")}')

# Update inputs for zero value
content = content.replace('typeof annexes[annexIndex].data[rowIndex][col.key] === \'string\' && annexes[annexIndex].data[rowIndex][col.key] !== \'\' && "border-primary/20 bg-primary/5"',
                          'typeof annexes[annexIndex].data[rowIndex][col.key] === \'string\' && annexes[annexIndex].data[rowIndex][col.key] !== \'\' && "border-primary/20 bg-primary/5", typeof row[col.key] === "number" && isZero(col.key) && "text-muted-foreground opacity-60 font-medium"')

# TableHead padding
content = content.replace('className={cn(\n                                    "font-black py-4 px-4', 'className={cn(\n                                    "font-black py-2 px-2')

with open(filepath, 'w') as f:
    f.write(content)
