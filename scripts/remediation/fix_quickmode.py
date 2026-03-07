import sys

path = 'src/components/views/terminal/views/cost_sheet/CostSheetQuickMode.tsx'
with open(path, 'r') as f:
    content = f.read()

# Fix Row height
content = content.replace('tr key={row.id} className="group hover:bg-primary/5 transition-colors"', 'tr key={row.id} className="group hover:bg-primary/5 transition-colors h-auto sm:h-12"')

# Add data-label to cells
replacements = [
    ('<td className="px-6 py-3 font-black text-muted-foreground text-[10px]">', '<td data-label="No." className="px-6 py-3 font-black text-muted-foreground text-[10px]">'),
    ('<td className="px-6 py-3">', '<td data-label="Producto" className="px-6 py-3">'), # first one
    ('<td className="px-6 py-3">', '<td data-label="UM" className="px-6 py-3">'), # second one
    ('<td className="px-6 py-3">', '<td data-label="Cantidad" className="px-6 py-3">'), # third one
    ('<td className="px-6 py-3">', '<td data-label="Costo" className="px-6 py-3">'), # fourth one
    ('<td className="px-6 py-3 bg-amber-500/5">', '<td data-label="Precio Venta" className="px-6 py-3 bg-amber-500/5">'),
    ('<td className="px-6 py-3 text-center">', '<td data-label="Acciones" className="px-6 py-3 text-center">'),
]

# Since there are multiple <td className="px-6 py-3">, we need to replace them carefully or use a more specific search
content = content.replace('<td className="px-6 py-3 font-black text-muted-foreground text-[10px]">', '<td data-label="No." className="px-6 py-3 font-black text-muted-foreground text-[10px]">')

# Use a marker to replace sequential identical tags
marker = "!!!TD_MARKER!!!"
content = content.replace('<td className="px-6 py-3">', marker, 4)
content = content.replace(marker, '<td data-label="Producto" className="px-6 py-3">', 1)
content = content.replace(marker, '<td data-label="UM" className="px-6 py-3">', 1)
content = content.replace(marker, '<td data-label="Cantidad" className="px-6 py-3">', 1)
content = content.replace(marker, '<td data-label="Costo" className="px-6 py-3">', 1)

content = content.replace('<td className="px-6 py-3 bg-amber-500/5">', '<td data-label="Precio Venta" className="px-6 py-3 bg-amber-500/5">')
content = content.replace('<td className="px-6 py-3 text-center">', '<td data-label="Acciones" className="px-6 py-3 text-center">')

# Wrap table in table-to-cards
content = content.replace('<div className="overflow-x-auto">', '<div className="overflow-x-auto table-to-cards rounded-2xl">')

with open(path, 'w') as f:
    f.write(content)
