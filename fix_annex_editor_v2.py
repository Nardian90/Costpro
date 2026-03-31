import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# 1. Clear out the failed TableFooter pattern
content = re.sub(r'TableFooter className=\{cn\(.*?\)\}', 'TableFooter', content, flags=re.DOTALL)

# 2. Correctly inject highlights and placeholders into TableCell
# Search for the Input tag inside the map
input_pattern = r'(<Input\s+type=\{typeof \(annex\.data\[rowIndex\]\[col\.key\]\) === \'number\' \? \'number\' : \'text\'\}\s+value=\{annex\.data\[rowIndex\]\[col\.key\] \?\? ""\}\s+onChange=\{.*?\}\s+list=\{.*?\}\s+className=\{cn\()(.*?)(\)\}\s+/>)'

def input_replacer(match):
    prefix = match.group(1)
    orig_classes = match.group(2)
    suffix = match.group(3)

    # New highlighted class logic
    highlight = '''
                                                    (annex.coefficient && annex.coefficient !== 1 && (
                                                        (annex.adjustmentColumn === "AMBOS" && (col.key.includes("norm") || col.key.includes("price") || col.key.includes("unit"))) ||
                                                        (col.label === annex.adjustmentColumn) ||
                                                        (annex.adjustmentColumn === "PRECIO UNITARIO" && (col.key === "price_unit" || col.key === "rate")) ||
                                                        (annex.adjustmentColumn === "NORMA DE CONSUMO" && (col.key === "norm" || col.key === "consumption" || col.key === "quantity"))
                                                    )) && "!ring-2 !ring-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.2)]",'''

    # Placeholder logic
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

    return f"{prefix}{highlight}{orig_classes}{suffix.replace('/>', placeholder + ' />')}"

content = re.sub(input_pattern, input_replacer, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
