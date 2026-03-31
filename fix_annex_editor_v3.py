import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip_until = None

for i, line in enumerate(lines):
    # Fix TableFooter mess
    if 'TableFooter className={cn(' in line:
        new_lines.append('                <TableFooter className={cn(layoutMode === "grid" && "hidden sm:table-footer-group")}>\n')
        continue

    # Check for Input line
    if '<Input' in line and 'value={' in line:
        # Find where the Input ends
        j = i
        while '/>' not in lines[j]:
            j += 1

        # Extract existing attributes
        content = "".join(lines[i:j+1])

        highlight = '''
                                                    (annex.coefficient && annex.coefficient !== 1 && (
                                                        (annex.adjustmentColumn === "AMBOS" && (col.key.includes("norm") || col.key.includes("price") || col.key.includes("unit"))) ||
                                                        (col.label === annex.adjustmentColumn) ||
                                                        (annex.adjustmentColumn === "PRECIO UNITARIO" && (col.key === "price_unit" || col.key === "rate")) ||
                                                        (annex.adjustmentColumn === "NORMA DE CONSUMO" && (col.key === "norm" || col.key === "consumption" || col.key === "quantity"))
                                                    )) && "!ring-2 !ring-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.2)]",'''

        placeholder = '''
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

        new_input = line.replace('className={cn(', 'className={cn(' + highlight)
        new_input = new_input.replace('/>', placeholder + ' />')

        new_lines.append(new_input)
        continue

    new_lines.append(line)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.writelines(new_lines)
