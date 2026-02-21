import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Replace TableHeader mapping
old_header_mapping = """                        {annex.columns.map((col: CostSheetColumn) => {
                             const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                             return (
                                <TableHead key={col.key} className={cn(
                                    "font-black py-4 px-4 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap",
                                    !isMain && "w-[1%]"
                                )}>
                                    {col.label || col.title || col.key}
                                </TableHead>
                             );
                        })}"""

new_header_mapping = """                        {annex.columns.map((col: CostSheetColumn) => {
                             const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                             const widthClass = col.key === 'no' ? 'w-12' :
                                               (col.key === 'um' ? 'w-16' :
                                               (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                               (!isMain ? 'w-24' : '')));
                             return (
                                <TableHead key={col.key} className={cn(
                                    "font-black py-4 px-4 text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap",
                                    widthClass
                                )}>
                                    {col.label || col.title || col.key}
                                </TableHead>
                             );
                        })}"""

content = content.replace(old_header_mapping, new_header_mapping)

# Replace TableBody row mapping
old_row_mapping_start = """                            {annex.columns.map((col: CostSheetColumn) => {
                                const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                                return (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className={cn("p-3 sm:p-4", !isMain && "w-[1%] whitespace-nowrap")}>"""

new_row_mapping_start = """                            {annex.columns.map((col: CostSheetColumn) => {
                                const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                                const widthClass = col.key === 'no' ? 'w-12' :
                                               (col.key === 'um' ? 'w-16' :
                                               (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                               (!isMain ? 'w-24' : '')));
                                return (
                                <TableCell key={col.key} data-label={col.label || col.title || col.key} className={cn("p-3 sm:p-4", widthClass)}>"""

content = content.replace(old_row_mapping_start, new_row_mapping_start)

with open(filepath, 'w') as f:
    f.write(content)
