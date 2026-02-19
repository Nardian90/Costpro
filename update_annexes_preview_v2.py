import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Replace TableHeader mapping
old_header_mapping = """                    {annex.columns.map((col: CostSheetColumn) => {
                      const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                      return (
                        <th key={col.key} className={cn(
                            "p-3 text-left font-black uppercase tracking-widest text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap",
                            !isMain && "w-[1%]"
                        )}>
                            {col.label || col.title || col.key}
                        </th>
                      );
                    })}"""

new_header_mapping = """                    {annex.columns.map((col: CostSheetColumn) => {
                      const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                      const widthClass = col.key === 'no' ? 'w-12' :
                                       (col.key === 'um' ? 'w-16' :
                                       (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                       (!isMain ? 'w-24' : '')));
                      return (
                        <th key={col.key} className={cn(
                            "p-3 text-left font-black uppercase tracking-widest text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap",
                            widthClass
                        )}>
                            {col.label || col.title || col.key}
                        </th>
                      );
                    })}"""

content = content.replace(old_header_mapping, new_header_mapping)

# Replace TableBody mapping
old_body_mapping = """                      {annex.columns.map((col: CostSheetColumn) => {
                        const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                        return (
                        <td key={`${rowIndex}-${col.key}`} className={cn(
                            "p-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap",
                            !isMain && "w-[1%]"
                        )}>"""

new_body_mapping = """                      {annex.columns.map((col: CostSheetColumn) => {
                        const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                        const widthClass = col.key === 'no' ? 'w-12' :
                                         (col.key === 'um' ? 'w-16' :
                                         (col.key === 'total' || col.key === 'amount' ? 'w-32' :
                                         (!isMain ? 'w-24' : '')));
                        return (
                        <td key={`${rowIndex}-${col.key}`} className={cn(
                            "p-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap",
                            widthClass
                        )}>"""

content = content.replace(old_body_mapping, new_body_mapping)

with open(filepath, 'w') as f:
    f.write(content)
