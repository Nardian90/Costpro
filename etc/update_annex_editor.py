import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Replace TableHeader mapping
old_header_mapping = """                        {annex.columns.map((col: CostSheetColumn) => (
                            <TableHead key={col.key} className="font-black py-4 px-4 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {col.label || col.title || col.key}
                            </TableHead>
                        ))}
                        <TableHead className="text-center w-20 uppercase tracking-widest">Acciones</TableHead>"""

new_header_mapping = """                        {annex.columns.map((col: CostSheetColumn) => {
                             const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                             return (
                                <TableHead key={col.key} className={cn(
                                    "font-black py-4 px-4 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap",
                                    !isMain && "w-[1%]"
                                )}>
                                    {col.label || col.title || col.key}
                                </TableHead>
                             );
                        })}
                        <TableHead className="text-center w-[1%] whitespace-nowrap uppercase tracking-widest">Acciones</TableHead>"""

content = content.replace(old_header_mapping, new_header_mapping)

# Replace TableBody row mapping
old_row_mapping_start = """                            {annex.columns.map((col: CostSheetColumn) => (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className="p-3 sm:p-4">
                                    {col.formula ? ("""

new_row_mapping_start = """                            {annex.columns.map((col: CostSheetColumn) => {
                                const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                                return (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className={cn("p-3 sm:p-4", !isMain && "w-[1%] whitespace-nowrap")}>
                                    {col.formula ? ("""

content = content.replace(old_row_mapping_start, new_row_mapping_start)

# Add closing brace for the map and return
old_row_mapping_end = """                                    )}
                                </TableCell>
                            ))}"""

new_row_mapping_end = """                                    )}
                                </TableCell>
                                );
                            })}"""

content = content.replace(old_row_mapping_end, new_row_mapping_end)

# Also update the Actions cell
old_actions_cell = """                            <TableCell data-label="Acciones" className="text-center p-3 sm:p-4">"""
new_actions_cell = """                            <TableCell data-label="Acciones" className="text-center p-3 sm:p-4 w-[1%] whitespace-nowrap">"""

content = content.replace(old_actions_cell, new_actions_cell)

with open(filepath, 'w') as f:
    f.write(content)
