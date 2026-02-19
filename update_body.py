import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetBody.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Row density
content = content.replace('<tr className={cn(', '<tr className={cn(\n                "h-8 text-xs",')
content = content.replace('className="p-3"', 'className="py-0.5 px-2"')

# Zero value logic
old_render = "const calc = calculatedValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0, coeficiente: 0 };"
new_render = old_render + "\n      const isZero = Number(calc.total) === 0;"
content = content.replace(old_render, new_render)

# Total styling
content = content.replace('hasChildren ? "text-slate-900 dark:text-white" : "text-primary"',
                          'hasChildren ? "text-slate-900 dark:text-white" : (isZero ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")')

# Header softening
content = content.replace('<tr className="bg-slate-100 dark:bg-slate-950/80">',
                          '<tr className="bg-emerald-500/5 border-l-2 border-emerald-500/40">')

with open(filepath, 'w') as f:
    f.write(content)
