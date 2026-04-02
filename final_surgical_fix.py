import sys
import re

def fix():
    with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
        lines = f.readlines()

    # 1. Add imports
    for i, line in enumerate(lines):
        if "import { Trash2" in line:
            lines[i] = line.replace("Upload }", "Upload, Target }")
            lines.insert(i+1, "import { solveCoefficient } from '@/lib/cost-engine/solver';\n")
            break

    # 2. Add state and handleSolve logic
    for i, line in enumerate(lines):
        if "const [targetRowIndex" in line:
            # We'll add our new state and the function here
            extra = [
                "  const [targetPrice, setTargetPrice] = React.useState('');\n",
                "  const [isSolving, setIsSolving] = React.useState(false);\n",
                "\n",
                "  const handleSolve = () => {\n",
                "    const target = parseFloat(targetPrice);\n",
                "    if (isNaN(target) || target <= 0) return;\n",
                "    \n",
                "    setIsSolving(true);\n",
                "    setTimeout(() => {\n",
                "      try {\n",
                "        const bestCoef = solveCoefficient(data, annex.id, target);\n",
                "        const finalCoef = parseFloat(bestCoef.toFixed(6));\n",
                "        updateAnnexAdjustment(annex.id, finalCoef, annex.adjustmentColumn || 'PRECIO UNITARIO', true);\n",
                "        setLocalCoef(String(finalCoef));\n",
                "      } catch (err) {\n",
                "        console.error('Solver error:', err);\n",
                "      } finally {\n",
                "        setIsSolving(false);\n",
                "      }\n",
                "    }, 100);\n",
                "  };\n"
            ]
            for j, item in enumerate(extra):
                lines.insert(i + 1 + j, item)
            break

    content = "".join(lines)

    # 3. UI Transformation
    # We'll define the new header content.
    # I will replace the entire first card div to be safe.

    # Identify the start of the return statement's content
    start_tag = '<div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-card/50 p-6 rounded-[2.5rem] border border-border/50 shadow-xl backdrop-blur-md">'

    # Identify the end of the first card (before the next section)
    # The first card usually ends after the "Añadir Fila" button.
    # In the original file, there's a </div> for the buttons group, then </div> for the lg:flex-row group, then </div> for the bg-card group.

    # Let's find the exact block.
    # It starts at the line with "bg-card/50" and ends before "ProductInventoryPicker"

    header_block_pattern = re.compile(r'<div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-card/50 p-6 rounded-\[2\.5rem\] border border-border/50 shadow-xl backdrop-blur-md">.*?Añadir Fila.*?</Button>\s+</div>\s+</div>', re.DOTALL)

    new_header = """<div className="flex flex-col gap-6 bg-card/50 p-6 rounded-[2.5rem] border border-border/50 shadow-xl backdrop-blur-md">
          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-3 w-full border-b border-primary/10 pb-4">
             <div className="relative group">
                <input
                  type="file"
                  id={`import-${annex.id}`}
                  className="hidden"
                  onChange={handleImport}
                  accept=".xlsx, .xls"
                />
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="rounded-xl border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5 text-primary h-10 px-4 font-black uppercase tracking-widest text-[10px]"
                >
                  <label htmlFor={`import-${annex.id}`} className="cursor-pointer flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    Importar Excel
                  </label>
                </Button>
             </div>
             <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="rounded-xl border-primary/20 hover:bg-primary/10 text-primary h-10 px-4 font-black uppercase tracking-widest text-[10px] gap-2"
             >
                <Download className="w-3.5 h-3.5" />
                Exportar
             </Button>
             <Button
                onClick={() => addRow(annex.id)}
                className="rounded-xl bg-primary text-foreground h-10 px-4 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 active:scale-95 transition-all gap-2"
             >
                <Plus className="w-4 h-4" />
                Añadir Fila
             </Button>
          </div>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 w-full">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-primary rounded-full" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70">Editor de Anexo</h2>
                </div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tighter italic">
                    {annex.id}: {annex.title}
                </h3>

                <div className="flex flex-wrap items-center gap-4 mt-2 p-3 rounded-2xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Columna a Ajustar</span>
                        <Select
                            value={annex.adjustmentColumn || 'PRECIO UNITARIO'}
                            onValueChange={(val) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, val, annex.isAdjustmentActive)}
                        >
                            <SelectTrigger className="h-8 min-w-[140px] bg-background border-primary/20 rounded-xl text-[9px] font-black uppercase hover:border-primary/40 transition-colors">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-primary/20">
                                <SelectItem value="PRECIO UNITARIO" className="text-[10px] font-bold uppercase">Precio Unitario</SelectItem>
                                <SelectItem value="NORMA DE CONSUMO" className="text-[10px] font-bold uppercase">Norma de Consumo</SelectItem>
                                <SelectItem value="AMBOS" className="text-[10px] font-bold uppercase">Ambos</SelectItem>
                                <SelectItem value="VALOR" className="text-[10px] font-bold uppercase">Valor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Coeficiente</span>
                        <div className="relative group/coef">
                            <input
                                type="text"
                                value={localCoef}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setLocalCoef(val);
                                    if (val === '' || val === '-' || val.endsWith('.')) return;
                                    if (val === '0' || val === '0.' || val === '0.0') {
                                        updateAnnexAdjustment(annex.id, 0, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                        return;
                                    }
                                    const numericVal = parseFloat(val);
                                    if (!isNaN(numericVal)) {
                                        updateAnnexAdjustment(annex.id, numericVal, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                    }
                                }}
                                onBlur={() => {
                                    if (localCoef === '' || isNaN(parseFloat(localCoef))) {
                                        setLocalCoef('1');
                                        updateAnnexAdjustment(annex.id, 1, annex.adjustmentColumn || 'PRECIO UNITARIO', annex.isAdjustmentActive);
                                    }
                                }}
                                className="w-24 h-8 px-8 rounded-xl bg-background border border-primary/20 text-[10px] font-black font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-center"
                            />
                            <RefreshCw className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/40 group-hover/coef:rotate-180 transition-transform duration-700" />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-background/50 px-4 py-1.5 rounded-xl border border-primary/10 ml-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">Auto-ajuste</span>
                        <Switch
                            checked={!!annex.isAdjustmentActive}
                            onCheckedChange={(checked) => updateAnnexAdjustment(annex.id, annex.coefficient !== undefined ? annex.coefficient : 1, annex.adjustmentColumn || 'PRECIO UNITARIO', checked)}
                            className="scale-90"
                        />
                    </div>

                    {showTargetPriceInput && (
                      <div className="flex flex-row items-end gap-2 ml-4 animate-in fade-in slide-in-from-left-4 duration-700">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 mb-1">Precio Venta Objetivo</span>
                            <div className="relative group/target">
                                <input
                                    disabled={isSolving}
                                    type="number"
                                    value={targetPrice}
                                    onChange={(e) => setTargetPrice(e.target.value)}
                                    placeholder="Ej: 25"
                                    className="w-32 h-8 px-2 rounded-xl bg-background border-primary/40 text-sm font-black font-mono text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-center placeholder:text-primary/20 shadow-inner"
                                />
                                <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/40" />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleSolve}
                            disabled={isSolving || !targetPrice}
                            className="h-8 px-4 rounded-xl bg-primary text-foreground font-black uppercase tracking-widest text-[9px] shadow-lg shadow-primary/10 active:scale-95 transition-all gap-2"
                        >
                            {isSolving ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <>Calcular</>
                            )}
                        </Button>
                      </div>
                    )}
                </div>
            </div>
          </div>
       </div>"""

    content = header_block_pattern.sub(new_header.replace('\\', '\\\\'), content)

    with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
