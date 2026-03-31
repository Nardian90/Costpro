import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
found_extra_div = False

# We saw something like:
#                         </div>
#                         </div>
#                       </div>
#                     </TableCell>

for i, line in enumerate(lines):
    if i > 370 and '</div>' in line and i < 385:
        # Check if we have too many closing divs
        # Let's count them and see.
        pass
    new_lines.append(line)

# Let's just manually fix the known problematic area based on the previous cat output
# Line 377 and 378 seem redundant or misplaced.

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.writelines(new_lines)

# Actually, let's use a more robust way to fix it by matching the structure.
with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# Pattern we saw:
#                             </div>
#                         </div>
#                         </div>
#                       </div>
#                     </TableCell>

# Let's look at the div nesting in the footer.
# <TableCell ...> (1)
#   <div className="flex flex-col sm:flex-row ..."> (2)
#     <span ...>Total</span>
#     <div className="flex items-center gap-3"> (3)
#        <span ...>{formatCurrency(totalValue)}</span>
#        <div className="flex flex-col items-end ..."> (4)
#           <div className="flex items-center gap-4 mb-1"> (5)
#              <div className="flex flex-col items-start"> (6)
#                 ...
#              </div> (closes 6)
#              <div className="flex flex-col items-end"> (7)
#                 ...
#                 <div className="flex items-center gap-2"> (8)
#                    <div className="relative group/coef"> (9)
#                       ...
#                    </div> (closes 9)
#                    {annex.coefficient ... && (
#                       <Button ...> ... </Button>
#                    )}
#                 </div> (closes 8)
#              </div> (closes 7)
#           </div> (closes 5)
#        </div> (closes 4)
#     </div> (closes 3)
#   </div> (closes 2)
# </TableCell> (closes 1)

# So we need 5 closing divs after "Commit" button logic.
# In the current file we have:
#                                 </div> (closes 5)
#                             </div> (closes 4)
#                         </div> (closes 3)
#                         </div> (???)
#                       </div> (???)
#                     </TableCell>

import re

# Corrected block from <div className="flex flex-col items-end print:hidden ...">
footer_content = r'''<div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">
                                <div className="flex items-center gap-4 mb-1">
                                    <div className="flex flex-col items-start">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-primary/50">Columna a Ajustar</span>
                                        <Select
                                            value={annex.adjustmentColumn || 'PRECIO UNITARIO'}
                                            onValueChange={(val) => updateAnnexAdjustment(annex.id, annex.coefficient || 1, val)}
                                        >
                                            <SelectTrigger className="h-7 min-w-[120px] bg-background/50 border-primary/20 rounded-lg text-[9px] font-black uppercase">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PRECIO UNITARIO" className="text-[10px] font-bold uppercase">Precio Unitario</SelectItem>
                                                <SelectItem value="NORMA DE CONSUMO" className="text-[10px] font-bold uppercase">Norma de Consumo</SelectItem>
                                                <SelectItem value="AMBOS" className="text-[10px] font-bold uppercase">Ambos</SelectItem>
                                                <SelectItem value="VALOR" className="text-[10px] font-bold uppercase">Valor</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">Factor de Ajuste (Auto)</span>
                                        <div className="flex items-center gap-2">
                                            <div className="relative group/coef">
                                                <input
                                                    type="text"
                                                    value={localCoef}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setLocalCoef(val);
                                                        const numericVal = parseFloat(val);
                                                        if (!isNaN(numericVal)) {
                                                            updateAnnexAdjustment(annex.id, numericVal, annex.adjustmentColumn || 'PRECIO UNITARIO');
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (localCoef === '' || isNaN(parseFloat(localCoef))) {
                                                            setLocalCoef('1');
                                                            updateAnnexAdjustment(annex.id, 1, annex.adjustmentColumn || 'PRECIO UNITARIO');
                                                        }
                                                    }}
                                                    className="w-24 h-9 px-3 rounded-xl bg-background/50 border border-primary/20 text-xs font-black font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-right"
                                                />
                                                <RefreshCw className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/40 group-hover/coef:rotate-180 transition-transform duration-700" />
                                            </div>
                                            {annex.coefficient && annex.coefficient !== 1 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => updateAnnexAdjustment(annex.id, annex.coefficient, annex.adjustmentColumn || 'PRECIO UNITARIO', true)}
                                                    className="h-9 px-3 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 transition-all font-black text-[10px] uppercase tracking-widest"
                                                >
                                                    Commit
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                      </div>
                    </TableCell>'''

# Replace the messy block
pattern = r'<div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">.*?</TableCell>'
content = re.sub(pattern, footer_content, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
