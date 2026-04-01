import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'typeof row[col.key] === "number" && isZero(col.key) && "text-muted-foreground opacity-60 font-medium"' in line:
        # This is inside the Input's className. Let's add the placeholder after the Input's closing brace.
        new_lines.append(line)
        continue

    if 'activeAnnexId === \'I\' && col.key === \'description\') return undefined;' in line:
        # We are inside the list={() => ...} logic.
        new_lines.append(line)
        continue

    if 'className={cn(' in line and 'annex.adjustmentColumn === "AMBOS"' in line:
         # This is the highlight logic I added.
         new_lines.append(line)
         continue

    if '/>' in line and 'handleInputChange' in lines[new_lines.__len__()-10:new_lines.__len__()+1].__str__():
        # Found the closing tag of the Input
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
        new_lines.append(line.replace('/>', placeholder_logic + ' />'))
        continue

    new_lines.append(line)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.writelines(new_lines)
