import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Row density
content = content.replace('<tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">',
                          '<tr key={rowIndex} className="h-8 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">')
content = content.replace('className={cn(\n                            "p-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap"',
                          'className={cn(\n                            "py-0.5 px-2 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap"')

# Zero value logic
old_body = """                  {annex.data.length > 0 ? annex.data.map((row, rowIndex) => ("""
new_body = """                  {annex.data.length > 0 ? annex.data.map((row, rowIndex) => {
                    const isZero = (val: any) => Number(val) === 0;
                    return ("""
content = content.replace(old_body, new_body)
content = content.replace('                    )) : (', '                    );}) : (')

# Styling
content = content.replace('className={col.formula ? "font-black text-primary" : "font-medium"}',
                          'className={cn(col.formula ? "text-primary font-black" : "font-medium text-slate-700", typeof row[col.key] === "number" && isZero(row[col.key]) && "text-muted-foreground opacity-60 font-medium")}')

with open(filepath, 'w') as f:
    f.write(content)
