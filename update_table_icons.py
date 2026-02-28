import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'r') as f:
    content = f.read()

# 1. Update applySuggestedFormula logic
old_apply = """    const suggestedRow = findInSections((reinicioTemplate as any).sections);
    if (suggestedRow) {
      const updates: any[] = [];
      if (suggestedRow.totalFormula) {
        updates.push({ path: [...path, 'totalFormula'], value: suggestedRow.totalFormula });
        updates.push({ path: [...path, 'calculationMethod'], value: 'FORMULA' });
      }
      if (suggestedRow.vhFormula) {
        updates.push({ path: [...path, 'vhFormula'], value: suggestedRow.vhFormula });
      }
      if (suggestedRow.formula) {
        updates.push({ path: [...path, 'formula'], value: suggestedRow.formula });
      }

      if (updates.length > 0) {
        updateValues(updates);
        toast.success(`Fórmula sugerida aplicada a: ${row.label}`);
      } else {
        toast.info("No hay una fórmula específica sugerida para esta fila.");
      }"""

new_apply = """    const suggestedRow = findInSections((reinicioTemplate as any).sections);
    if (suggestedRow) {
      const updates: any[] = [];

      const totalFormula = suggestedRow.totalFormula || suggestedRow.formula;
      if (totalFormula) {
        updates.push({ path: [...path, 'totalFormula'], value: totalFormula });
        updates.push({ path: [...path, 'formula'], value: totalFormula });
        updates.push({ path: [...path, 'calculationMethod'], value: 'FORMULA' });
      }

      if (suggestedRow.vhFormula) {
        updates.push({ path: [...path, 'vhFormula'], value: suggestedRow.vhFormula });
      }

      if (updates.length > 0) {
        updateValues(updates);
        toast.success(`Metodología aplicada a: ${row.label}`);
      } else {
        toast.info("No hay una fórmula específica sugerida para esta fila.");
      }"""

content = content.replace(old_apply, new_apply)

# 2. Update the "Acciones" column cell (Help, Note, Wand, Validation)
old_actions_cell = """        {/* Ayuda - Hidden on very small screens */}
        <TableCell className="px-2 py-0.5 text-center w-[100px] hidden sm:table-cell">
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full transition-all"
              onClick={applySuggestedFormula}
              title="Aplicar fórmula sugerida (VH y Total)"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
            {row.helpText && (
              <Popover>
                <PopoverTrigger asChild>
                   <button className="p-2 rounded-full hover:bg-primary/10 text-primary/50 hover:text-primary transition-colors">
                      <HelpCircle className="w-4 h-4" />
                   </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 sm:w-80"><p className="text-sm">{row.helpText}</p></PopoverContent>
              </Popover>
            )}
          </div>
        </TableCell>"""

new_actions_cell = """        {/* Acciones de Item */}
        <TableCell className="px-2 py-0.5 text-center w-[160px] border-r border-border/10">
          <div className="flex items-center justify-center gap-0.5">
            {/* Validation Status */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0">
                        {criticalErrors.length > 0 ? (
                            <XCircle className="w-4 h-4 text-destructive animate-pulse" />
                        ) : (warningErrors.length > 0 || hasEngineWarnings) ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-primary/60 hover:text-primary" />
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-3">
                        <h4 className="font-black text-xs uppercase tracking-widest border-b pb-2">Estado del Item: {row.id}</h4>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {(safeCalculated.validationErrors || []).map((ve, idx) => (
                                <div key={idx} className={cn(
                                    "text-xs p-2 rounded border flex gap-2",
                                    ve.type === 'CRITICAL' ? "bg-destructive/5 border-destructive/20 text-destructive" :
                                    ve.type === 'WARNING' ? "bg-amber-50 border-amber-200 text-amber-800" :
                                    "bg-primary/5 border-primary/20 text-primary"
                                )}>
                                    {ve.message}
                                </div>
                            ))}
                            {(safeCalculated.validationErrors || []).length === 0 && (
                                <p className="text-xs text-primary font-medium p-2">Este ítem cumple con los requisitos estructurales y de rentabilidad.</p>
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Note */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className={cn("h-7 w-7 rounded-full p-0", row.note && "text-primary bg-primary/10")}>
                        <StickyNote className="w-4 h-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-3">
                        <h4 className="font-black text-xs uppercase tracking-widest">Observaciones / Notas</h4>
                        <Input
                            placeholder="Agregar nota..."
                            defaultValue={row.note || ''}
                            className="text-xs"
                            onBlur={(e) => handleValueChange('note', e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleValueChange('note', (e.target as HTMLInputElement).value);
                                    toast.success("Nota actualizada");
                                }
                            }}
                        />
                    </div>
                </PopoverContent>
            </Popover>

            {/* Help / Methodology */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full p-0">
                        <HelpCircle className="w-4 h-4 text-primary/60 hover:text-primary" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="space-y-3">
                        <h4 className="font-black text-xs uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Metodología Res. 148</h4>
                        <p className="text-xs leading-relaxed text-muted-foreground italic">
                            {getMethodologyHelp(row.id, row.label)}
                        </p>
                        {row.helpText && <p className="text-xs border-t pt-2 mt-2">{row.helpText}</p>}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Apply Formula */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10 rounded-full transition-all"
              onClick={applySuggestedFormula}
              title="Aplicar metodología sugerida (VH y Total)"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>"""

content = content.replace(old_actions_cell, new_actions_cell)

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'w') as f:
    f.write(content)
