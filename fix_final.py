import sys
import re

# 1. Fix CostSheetAnnexEditor.tsx (Duplicate imports and small improvements)
with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
seen_imports = set()
for line in lines:
    if 'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }' in line:
        if line.strip() in seen_imports:
            continue
        seen_imports.add(line.strip())
    new_lines.append(line)

content = "".join(new_lines)

# Improve placeholder logic for "AMBOS"
placeholder_replacement = '''
                                                placeholder={(() => {
                                                    const val = annex.data[rowIndex][col.key];
                                                    const coef = annex.coefficient || 1;
                                                    if (coef === 1 || typeof val !== "number") return "";

                                                    const isPrice = col.key === "price_unit" || col.key === "rate" || col.label === "PRECIO UNITARIO";
                                                    const isNorm = col.key === "norm" || col.key === "consumption" || col.key === "quantity" || col.label === "NORMA DE CONSUMO";

                                                    if (annex.adjustmentColumn === "AMBOS") {
                                                        if (isPrice || isNorm) {
                                                            return (val * Math.sqrt(coef)).toFixed(4);
                                                        }
                                                    } else {
                                                        const isAdjusted =
                                                            (col.label === annex.adjustmentColumn) ||
                                                            (annex.adjustmentColumn === "PRECIO UNITARIO" && isPrice) ||
                                                            (annex.adjustmentColumn === "NORMA DE CONSUMO" && isNorm) ||
                                                            (annex.adjustmentColumn === "VALOR" && col.key === "value") ||
                                                            (annex.adjustmentColumn === "IMPORTE" && col.key === "importe");

                                                        if (isAdjusted) return (val * coef).toFixed(4);
                                                    }
                                                    return "";
                                                })()}'''

# Replace the old placeholder logic
content = re.sub(r'placeholder=\{\(\(\) => \{.*?\}\)\(\)\}', placeholder_replacement, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)

# 2. Fix src/store/cost-sheet-store.ts (Commit logic)
with open('src/store/cost-sheet-store.ts', 'r') as f:
    store_content = f.read()

commit_logic_replacement = '''              if (commit) {
                const coef = coefficient;
                annex.data.forEach((row: any) => {
                  const applyCoef = (key: string, c: number) => {
                    if (row[key] !== undefined) {
                      const currentVal = row[key];
                      const cStr = c.toFixed(4);
                      if (typeof currentVal === 'number') {
                        row[key] = `=${currentVal}*${cStr}`;
                      } else if (typeof currentVal === 'string' && currentVal.startsWith('=')) {
                        row[key] = `=(${currentVal.substring(1)})*${cStr}`;
                      }
                    }
                  };

                  if (adjustmentColumn === 'AMBOS') {
                    const sqrtCoef = Math.sqrt(coef);
                    ['price_unit', 'rate', 'norm', 'consumption', 'quantity'].forEach(k => applyCoef(k, sqrtCoef));
                  } else {
                    const keys = adjustmentColumn === 'PRECIO UNITARIO' ? ['price_unit', 'rate'] :
                                 (adjustmentColumn === 'NORMA DE CONSUMO' ? ['norm', 'consumption', 'quantity'] :
                                 (adjustmentColumn === 'VALOR' ? ['value'] :
                                 (adjustmentColumn === 'IMPORTE' ? ['importe', 'amount', 'total'] : [])));
                    keys.forEach(k => applyCoef(k, coef));
                  }
                });

                annex.coefficient = 1;'''

store_content = re.sub(r'if \(commit\) \{.*?annex\.coefficient = 1;', commit_logic_replacement, store_content, flags=re.DOTALL)

with open('src/store/cost-sheet-store.ts', 'w') as f:
    f.write(store_content)

# 3. Fix CostSheetSummary.tsx (Defensive checks)
with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    summary_content = f.read()

# Add totalCost > 0 check to Markup Real
summary_content = summary_content.replace(
    'Math.round((utility / totalCost) * 100)',
    'totalCost > 0 ? Math.round((utility / totalCost) * 100) : 0'
)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(summary_content)
