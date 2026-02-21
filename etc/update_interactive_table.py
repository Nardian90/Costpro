import sys
import re

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Update TableHeader
old_header = """                                <TableRow className="hover:bg-transparent border-none">
                                    <TableHead className="w-12 px-2 py-2 text-center font-black uppercase tracking-widest border-r border-border/10">No.</TableHead>
                                    <TableHead className="px-2 py-2 text-left font-black uppercase tracking-widest min-w-[250px] border-r border-border/10">Concepto</TableHead>
                                    <TableHead className="px-2 py-2 text-right font-black uppercase tracking-widest w-28 border-r border-border/10">Valor Histórico</TableHead>
                                    <TableHead className="px-2 py-2 text-right font-black uppercase tracking-widest w-32 border-r border-border/10">Total</TableHead>
                                    <TableHead className="px-2 py-2 text-center font-black uppercase tracking-widest w-12 hidden sm:table-cell">Ayuda</TableHead>
                                </TableRow>"""

new_header = """                                <TableRow className="hover:bg-transparent border-none h-8 text-xs">
                                    <TableHead className="w-[60px] px-2 py-1 text-center font-black uppercase tracking-widest border-r border-border/10">No.</TableHead>
                                    <TableHead className="px-2 py-1 text-left font-black uppercase tracking-widest border-r border-border/10">Concepto</TableHead>
                                    <TableHead className="w-[140px] px-2 py-1 text-right font-black uppercase tracking-widest border-r border-border/10">Valor Histórico</TableHead>
                                    <TableHead className="w-[120px] px-2 py-1 text-right font-black uppercase tracking-widest border-r border-border/10">Total</TableHead>
                                    <TableHead className="w-[80px] px-2 py-1 text-center font-black uppercase tracking-widest hidden sm:table-cell">Ayuda</TableHead>
                                </TableRow>"""

content = content.replace(old_header, new_header)

# Update CostSheetRow component
# 1. Row class (height and padding)
content = content.replace('      <TableRow className={cn(', '      <TableRow className={cn(\n        "h-8 text-xs",')

# 2. TableCells widths and paddings
content = content.replace('<TableCell className="w-12 px-2 py-1.5 text-center', '<TableCell className="w-[60px] px-2 py-1 text-center')
content = content.replace('<TableCell style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-1.5 font-medium text-[13px] text-foreground min-w-[250px]', '<TableCell style={{ paddingLeft: `${level * 16 + 8}px` }} className="px-2 py-1 font-medium text-foreground')
content = content.replace('<TableCell className="px-2 py-1 text-right w-28 cursor-pointer', '<TableCell className="px-2 py-1 text-right w-[140px] cursor-pointer')
content = content.replace('text-primary w-32 cursor-pointer', 'text-primary w-[120px] cursor-pointer')
content = content.replace('<TableCell className="px-2 py-1 text-center w-12 hidden sm:table-cell">', '<TableCell className="px-2 py-1 text-center w-[80px] hidden sm:table-cell">')

# 3. Concepto text size
content = content.replace('text-[13px]', 'text-xs')

# 4. Zero value logic and validation icon hiding
# I need to find where Total is rendered.

total_render_pattern = r'\{isEditingTotal \? \(.*?\n          \) : \(\n            <div className="flex items-center justify-end gap-2 group-hover:scale-105 transition-transform origin-right">'
match = re.search(total_render_pattern, content, re.DOTALL)
if match:
    # Insert zero value check
    insert_point = content.find('const hasEngineWarnings', 0, match.start())
    if insert_point != -1:
        # Find next line after infoErrors
        line_end = content.find('\n', content.find('hasEngineWarnings', insert_point))
        content = content[:line_end+1] + "  const isZero = Number(safeCalculated.total) === 0;\n" + content[line_end+1:]

# Update validation status icon rendering to check for !isZero
content = content.replace('{criticalErrors.length > 0 ? (', '{(criticalErrors.length > 0 && !isZero) ? (')
content = content.replace(') : (warningErrors.length > 0 || hasEngineWarnings) ? (', ') : (warningErrors.length > 0 || hasEngineWarnings) && !isZero ? (')
content = content.replace(') : infoErrors.length > 0 ? (', ') : (infoErrors.length > 0 && !isZero) ? (')
content = content.replace(') : isResultRow ? (', ') : (isResultRow && !isZero) ? (')

# Update Total value styling
content = content.replace('<span className={cn(row.formula && "underline decoration-dotted decoration-primary/30")}>',
                          '<span className={cn(row.formula && "underline decoration-dotted decoration-primary/30", isZero ? "text-muted-foreground opacity-60 font-medium" : "text-primary font-black")}>')

# Soften section headers
old_section_header = """                    <div className="flex items-center justify-between py-1.5 px-4 bg-muted/30 border-y border-border/50">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-primary rounded-full" />"""
new_section_header = """                    <div className="flex items-center justify-between py-1 px-4 bg-emerald-500/5 border-y border-border/20 border-l-2 border-emerald-500/40">
                        <div className="flex items-center gap-3">
                            <div className="w-1 h-4 bg-emerald-500/40 rounded-full" />"""
content = content.replace(old_section_header, new_section_header)

# Reduced font for section label
content = content.replace('className="h-8 text-sm font-black', 'className="h-7 text-xs font-black')

with open(filepath, 'w') as f:
    f.write(content)
