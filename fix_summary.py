import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

# 1. Update handleAutoAdjust to apply directly to the store
content = content.replace(
    'updateAnnexAdjustment(selectedAnnexId, newCoef, adjustmentColumn);',
    'updateAnnexAdjustment(selectedAnnexId, newCoef, adjustmentColumn);'
)

# 2. Add "BOTH" / "AMBOS" to the adjustment column options in Summary
content = content.replace(
    '<SelectItem value="IMPORTE" className="text-xs font-bold uppercase py-3">Importe</SelectItem>',
    '<SelectItem value="IMPORTE" className="text-xs font-bold uppercase py-3">Importe</SelectItem>\n                      <SelectItem value="NORMA DE CONSUMO" className="text-xs font-bold uppercase py-3">Norma de Consumo</SelectItem>\n                      <SelectItem value="AMBOS" className="text-xs font-bold uppercase py-3">Ambos (Norma y Precio)</SelectItem>'
)

# 3. Round "Salud Ficha"
# Markup Real Rounding
content = re.sub(r'\+\{\(\(utility / totalCost\) \* 100\)\.toFixed\(1\)\}%', r'+{Math.round((utility / totalCost) * 100)}%', content)
# Salud Ficha Rounding
content = re.sub(r'\{healthPercent\}%', r'{Math.round(healthPercent)}%', content)
# Ajuste de Margen Deseado Rounding
content = re.sub(r'text-primary">\{\(\(utility / totalCost\) \* 100\)\.toFixed\(1\)\}%', r'text-primary">{Math.round((utility / totalCost) * 100)}%', content)

# 4. Fix layout of Anexo and Columna Selects (stack them)
# Find the grid that contains these selects
# Original: <div className="grid grid-cols-2 gap-4">
content = content.replace(
    '<div className="grid grid-cols-2 gap-4">',
    '<div className="grid grid-cols-1 gap-4">'
)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
