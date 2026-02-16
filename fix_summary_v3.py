import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

initial_coef_search = "const [localCoef, setLocalCoef] = useState(1.0);"
initial_coef_replace = """const [localCoef, setLocalCoef] = useState(() => {
    // Try to extract current multiplier from section 4 formulas
    const s4 = data.sections.find(s => s.id === '4' || s.id === 's4');
    if (s4 && s4.rows.length > 0) {
      const firstRow = s4.rows[0];
      const formula = firstRow.formula || '';
      const match = formula.match(/\*\s*([\d.]+)$/);
      if (match) return parseFloat(match[1]);
    }
    return 1.0;
  });"""

content = content.replace(initial_coef_search, initial_coef_replace)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
