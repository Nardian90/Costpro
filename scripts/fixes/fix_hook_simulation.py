import sys
import re

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

# 1. Update Annex Calculation (Phase 1) to include coefficient
# Find the start of the annex calculation loop
pattern_phase1 = r'\(template\?\.annexes \|\| \[\]\)\.forEach\(annex => \{'
replacement_phase1 = '''(template?.annexes || []).forEach(annex => {
      const coef = (annex.id === 'I') ? (annex.coefficient || 1) : 1;
      const adjCol = annex.adjustmentColumn || 'PRECIO UNITARIO';

      const isPrice = (k: string) => k === 'price_unit' || k === 'rate';
      const isNorm = (k: string) => k === 'norm' || k === 'consumption' || k === 'quantity';

      const calculatedAnnex = {
        ...annex,
        data: (annex.data || []).map(row => produce(row, (draft: any) => {
          // A. Apply coefficient to base columns (simulation)
          if (coef !== 1) {
              if (adjCol === 'AMBOS') {
                  const sqrt = Math.sqrt(coef);
                  Object.keys(draft).forEach(k => {
                      if ((isPrice(k) || isNorm(k)) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * sqrt;
                      }
                  });
              } else if (adjCol === 'PRECIO UNITARIO') {
                  Object.keys(draft).forEach(k => {
                      if (isPrice(k) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * coef;
                      }
                  });
              } else if (adjCol === 'NORMA DE CONSUMO') {
                  Object.keys(draft).forEach(k => {
                      if (isNorm(k) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * coef;
                      }
                  });
              } else if (adjCol === 'VALOR' && typeof draft['value'] === 'number') {
                  draft['value'] *= coef;
              } else if (adjCol === 'IMPORTE' && typeof draft['importe'] === 'number') {
                  draft['importe'] *= coef;
              }
          }

          // B. Then, pass through non-formula columns to see if they contain manual formulas
          for (const col of annex.columns) {'''

# Use a more specific match for the replacement to avoid breaking other parts
content = re.sub(r'\(template\?\.annexes \|\| \[\]\)\.forEach\(annex => \{(.*?)\(annex\.data \|\| \[\]\)\.map\(row => produce\(row, \(draft: any\) => \{.*?for \(const col of annex\.columns\) \{',
                 replacement_phase1, content, flags=re.DOTALL)

# 2. Update Engine mapping (Phase 2) to NOT multiply by coefficient again
content = content.replace(
    'return (parseFloat(String(val ?? 0)) || 0) * (a.coefficient || 1);',
    'return (parseFloat(String(val ?? 0)) || 0);'
)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.write(content)
