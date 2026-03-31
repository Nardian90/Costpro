import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

placeholder_logic = '''
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

# Target the specific location after the className closing brace
pattern = r'(typeof row\[col\.key\] === "number" && isZero\(col\.key\) && "text-muted-foreground opacity-60 font-medium"\s+)\)\}\s+/>'
replacement = r'\1)}' + placeholder_logic + r' />'

content = re.sub(pattern, replacement, content)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
