import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx'
with open(path, 'r') as f:
    content = f.read()

# Add data-label to TableCells
replacements = [
    ('<TableCell className="w-[60px]', '<TableCell data-label="No." className="w-[60px]'),
    ('<TableCell style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-0.5 font-medium text-foreground', '<TableCell data-label="Concepto" style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-0.5 font-medium text-foreground'),
    ('<TableCell className="px-2 py-0.5 text-center w-[80px] border-r border-border/10 italic text-muted-foreground/80 font-mono text-[10px]">', '<TableCell data-label="UM" className="px-2 py-0.5 text-center w-[80px] border-r border-border/10 italic text-muted-foreground/80 font-mono text-[10px]">'),
    ('<TableCell className={cn("px-2 py-0.5 text-right w-[140px] border-r border-border/10"', '<TableCell data-label="Valor Histórico" className={cn("px-2 py-0.5 text-right w-[140px] border-r border-border/10"'),
    ('<TableCell\n          className={cn(\n            "px-2 py-0.5 text-right w-[120px] font-mono font-black text-sm",', '<TableCell data-label="Total"\n          className={cn(\n            "px-2 py-0.5 text-right w-[120px] font-mono font-black text-sm",'),
]

for old, new in replacements:
    content = content.replace(old, new)

# Fix remaining h-8 in interactive table
content = content.replace('TableRow className="hover:bg-transparent border-none h-8 text-xs"', 'TableRow className="hover:bg-transparent border-none h-auto sm:h-8 text-xs"')

with open(path, 'w') as f:
    f.write(content)
