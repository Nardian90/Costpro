import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexes.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# Replace TableHeader mapping
old_header_mapping = """                  <tr>
                    {annex.columns.map((col: CostSheetColumn) => (
                      <th key={col.key} className="p-3 text-left font-black uppercase tracking-widest text-xs text-slate-500 dark:text-slate-400">
                        {col.label || col.title || col.key}
                      </th>
                    ))}
                  </tr>"""

new_header_mapping = """                  <tr>
                    {annex.columns.map((col: CostSheetColumn) => {
                      const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                      return (
                        <th key={col.key} className={cn(
                            "p-3 text-left font-black uppercase tracking-widest text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap",
                            !isMain && "w-[1%]"
                        )}>
                            {col.label || col.title || col.key}
                        </th>
                      );
                    })}
                  </tr>"""

content = content.replace(old_header_mapping, new_header_mapping)

# Replace TableBody mapping
old_body_mapping = """                      {annex.columns.map((col: CostSheetColumn) => (
                        <td key={`${rowIndex}-${col.key}`} className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                           <span className={col.formula ? "font-black text-primary" : "font-medium"}>
                             {typeof row[col.key] === 'number'
                               ? row[col.key].toLocaleString('es-ES', { minimumFractionDigits: 2 })
                               : (row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== '' ? row[col.key] : '--')
                             }
                           </span>
                        </td>
                      ))}"""

new_body_mapping = """                      {annex.columns.map((col: CostSheetColumn) => {
                        const isMain = col.key === 'description' || col.label?.toLowerCase().includes('descripción') || col.label?.toLowerCase().includes('puesto');
                        return (
                        <td key={`${rowIndex}-${col.key}`} className={cn(
                            "p-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap",
                            !isMain && "w-[1%]"
                        )}>
                           <span className={col.formula ? "font-black text-primary" : "font-medium"}>
                             {typeof row[col.key] === 'number'
                               ? row[col.key].toLocaleString('es-ES', { minimumFractionDigits: 2 })
                               : (row[col.key] !== undefined && row[col.key] !== null && row[col.key] !== '' ? row[col.key] : '--')
                             }
                           </span>
                        </td>
                        );
                      })}"""

content = content.replace(old_body_mapping, new_body_mapping)

with open(filepath, 'w') as f:
    f.write(content)
