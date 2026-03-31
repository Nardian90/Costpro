import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# 1. Formula display fix
content = content.replace(
    "{formatCurrency(row[col.key] ?? 0).replace('$', '').trim()}",
    "{formatCurrency((calculatedAnnex?.data[rowIndex]?.[col.key] ?? 0)).replace('$', '').trim()}"
)

# 2. Restrict UI to Annex I
# Grid mode total
content = content.replace(
    '{annex.coefficient && annex.coefficient !== 1 && (',
    '{annex.id === "I" && annex.coefficient && annex.coefficient !== 1 && ('
)

# Footer adjustment panel
content = content.replace(
    'print:hidden animate-in fade-in slide-in-from-right-2 duration-500">',
    'print:hidden animate-in fade-in slide-in-from-right-2 duration-500" style={{ display: annex.id === "I" ? "flex" : "none" }}>'
)

# 3. Use calculated values in the input cells as well (when adjusted)
# Instead of adding a div, let's change the value logic of the Input if there's a coefficient
# but keep it editable? No, if it's editable it should show the raw value.
# The user said: "no veo reflejado en la ui el valor de cada fila el nuevo valor"
# and "si se ajusta la columna PRECIO UNITARIO y se pone 0.35 como coeficiente y en precio unitrio tiene 2, entonces en este ponga el valor del resultado de 2x0.35"
# If I change the 'value' prop, the user can't edit the original value easily.
# BUT, since this is a "simulation", maybe it's okay.
# Let's try showing the adjusted value when coefficient is not 1.

# Find the Input tag and its value prop
# value={annex.data[rowIndex][col.key] ?? ''}
value_pattern = r'value=\{annex\.data\[rowIndex\]\[col\.key\] \?\? ""\}'
new_value_logic = r'''value={(() => {
                                                    const rawVal = annex.data[rowIndex][col.key];
                                                    const coef = annex.coefficient || 1;
                                                    if (annex.id !== "I" || coef === 1 || typeof rawVal !== "number") return rawVal ?? "";

                                                    const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO";
                                                    const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO";

                                                    if (annex.adjustmentColumn === "AMBOS") {
                                                        if (isPrice || isNorm) return (rawVal * Math.sqrt(coef)).toFixed(4);
                                                    } else {
                                                        const isAdjusted = (col.label === annex.adjustmentColumn) ||
                                                            (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                            (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                            (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                            (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");
                                                        if (isAdjusted) return (rawVal * coef).toFixed(4);
                                                    }
                                                    return rawVal ?? "";
                                                })()}'''

content = content.replace(value_pattern, new_value_logic)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
