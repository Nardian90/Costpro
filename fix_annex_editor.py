import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# Add imports
if 'import { Select' not in content:
    content = content.replace(
        "import { ViewMode } from '@/components/ui/ViewSwitcher';",
        "import { ViewMode } from '@/components/ui/ViewSwitcher';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';"
    )

# Add localCoef state
state_pattern = r"const \[isPickerOpen, setIsPickerOpen\] = React\.useState\(false\);"
if 'localCoef' not in content:
    content = re.sub(state_pattern,
                     state_pattern + '\n  const [localCoef, setLocalCoef] = React.useState(String(annex?.coefficient || 1));\n  React.useEffect(() => {\n    setLocalCoef(String(annex?.coefficient || 1));\n  }, [annex?.coefficient]);',
                     content)

# Modify TableCell to show adjusted values
# Look for the Input or formula display
cell_pattern = r'value=\{annex\.data\[rowIndex\]\[col\.key\] \?\? ""\}'
replacement = r'''value={annex.data[rowIndex][col.key] ?? ""}
                                                placeholder={(() => {
                                                    const val = annex.data[rowIndex][col.key];
                                                    const coef = annex.coefficient || 1;
                                                    const isAdjusted =
                                                        (annex.adjustmentColumn === "AMBOS" && (col.key.includes("norm") || col.key.includes("price") || col.key.includes("unit"))) ||
                                                        (col.label === annex.adjustmentColumn) ||
                                                        (annex.adjustmentColumn === "PRECIO UNITARIO" && (col.key === "price_unit" || col.key === "rate")) ||
                                                        (annex.adjustmentColumn === "NORMA DE CONSUMO" && (col.key === "norm" || col.key === "consumption" || col.key === "quantity"));

                                                    if (isAdjusted && coef !== 1 && typeof val === "number") {
                                                        return (val * coef).toFixed(4);
                                                    }
                                                    return "";
                                                })()}'''

content = content.replace('value={annex.data[rowIndex][col.key] ?? ""}', replacement)

# Add highlight for adjusted cells
content = content.replace(
    'className={cn(',
    '''className={cn(
                                                    (annex.coefficient && annex.coefficient !== 1 && (
                                                        (annex.adjustmentColumn === "AMBOS" && (col.key.includes("norm") || col.key.includes("price") || col.key.includes("unit"))) ||
                                                        (col.label === annex.adjustmentColumn) ||
                                                        (annex.adjustmentColumn === "PRECIO UNITARIO" && (col.key === "price_unit" || col.key === "rate")) ||
                                                        (annex.adjustmentColumn === "NORMA DE CONSUMO" && (col.key === "norm" || col.key === "consumption" || col.key === "quantity"))
                                                    )) && "ring-1 ring-primary/30 bg-primary/5",'''
)

# Update the Factor de Ajuste UI to include Column Selector and better Input
# Find the div with "Factor de Ajuste (Auto)"
footer_pattern = r'<div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">.*?</div>\s*</div>'
new_footer = r'''<div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">
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
                        </div>'''

content = re.sub(footer_pattern, new_footer, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
