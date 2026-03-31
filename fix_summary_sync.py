import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

# 1. Correct sync to include coefficient change, not just ID change
pattern = r'useEffect\(\(\) => \{\s+if \(annex\) \{\s+setManualCoef\(annex\.coefficient \|\| 1\);\s+\}\s+\}, \[selectedAnnexId, annex\]\);'
replacement = '''useEffect(() => {
    if (annex) {
      setManualCoef(annex.coefficient || 1);
    }
  }, [selectedAnnexId, annex?.coefficient]);'''

content = re.sub(pattern, replacement, content)

# 2. Add rounding to the feedback health battery (already rounded but to be sure)
# The user mentioned "SALUD FICHA" labels too.
content = content.replace(
    'SALUD FICHA</span>\n                <span className={cn("text-3xl font-black font-mono", healthPercent > 80 ? "text-emerald-500" : "text-amber-500")}>\n                  {healthPercent}%',
    'SALUD FICHA</span>\n                <span className={cn("text-3xl font-black font-mono", healthPercent > 80 ? "text-emerald-500" : "text-amber-500")}>\n                  {Math.round(healthPercent)}%'
)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
