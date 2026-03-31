import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# 1. Use calculated data for display
# Replace row[col.key] with calculatedRow[col.key] for formula display
content = content.replace(
    "{formatCurrency(row[col.key] ?? 0).replace('$', '').trim()}",
    "{formatCurrency((calculatedAnnex?.data[rowIndex]?.[col.key] ?? 0)).replace('$', '').trim()}"
)

# 2. Restrict Adjustment Factor UI to Annex I only
# Find the footer and wrap it in a conditional
# Look for the print:hidden div
footer_div_pattern = r'(<div className="flex flex-col items-end print:hidden animate-in fade-in slide-in-from-right-2 duration-500">)'
content = content.replace(footer_div_pattern, "{annex.id === 'I' && $1" % r"") # Wait, need to be careful with replace and variables

# Actually, let's use a simpler way
content = content.replace(
    'print:hidden animate-in fade-in slide-in-from-right-2 duration-500">',
    'print:hidden animate-in fade-in slide-in-from-right-2 duration-500" style={{ display: annex.id === "I" ? "flex" : "none" }}>'
)

# And for the grid mode total
content = content.replace(
    '{annex.coefficient && annex.coefficient !== 1 && (',
    '{annex.id === "I" && annex.coefficient && annex.coefficient !== 1 && ('
)

# 3. Add adjusted value preview next to input
input_pattern = r'(<Input[^>]*?)\s*/>'
# We already have a placeholder. Let's make sure it's visible.
# The user wants to see it even if there IS a value?
# "entonces en este ponga el valor del resultado de 2x0.35"
# Maybe show it in a badge or as a suffix?
# Let's try adding a small absolute label in the cell.

replacement = r'''\1 />
                                            {annex.id === 'I' && annex.coefficient && annex.coefficient !== 1 && typeof annex.data[rowIndex][col.key] === 'number' && (
                                                <div className="absolute -bottom-1 right-1 text-[8px] font-black text-primary/60 bg-background/80 px-1 rounded border border-primary/10 pointer-events-none">
                                                    {(() => {
                                                        const val = annex.data[rowIndex][col.key];
                                                        const coef = annex.coefficient || 1;
                                                        const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO";
                                                        const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO";

                                                        if (annex.adjustmentColumn === "AMBOS") {
                                                            if (isPrice || isNorm) return (val * Math.sqrt(coef)).toFixed(2);
                                                        } else {
                                                            const isAdjusted = (col.label === annex.adjustmentColumn) ||
                                                                (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                                (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                                (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                                (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");
                                                            if (isAdjusted) return (val * coef).toFixed(2);
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}'''

# content = re.sub(input_pattern, replacement, content)
# Wait, let's be more precise with re.sub to avoid double replacing or missing.

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
