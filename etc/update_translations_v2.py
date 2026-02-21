import re

file_path = 'src/app/api/cost-sheets/export-pdf/route.ts'
with open(file_path, 'r') as f:
    content = f.read()

translations = {
    'provider': 'Proveedor',
    'observation': 'Observación',
    'observations': 'Observaciones',
    'concept': 'Concepto',
    'date': 'Fecha',
    'type': 'Tipo',
    'unit': 'UM',
    'norm': 'Norma',
    'total_cost': 'Costo Total',
    'category': 'Categoría',
    'reference': 'Referencia',
    'status': 'Estado',
    'percentage': 'Porcentaje',
    'weight': 'Peso',
    'volume': 'Volumen',
    'notes': 'Notas'
}

# Find the end of translationMap
match = re.search(r"const translationMap: Record<string, string> = \{([\s\S]*?)\};", content)
if match:
    existing = match.group(1)
    new_entries = []
    for k, v in translations.items():
        if f"'{k}':" not in existing and f'"{k}":' not in existing:
            new_entries.append(f"        '{k}': '{v}',")

    if new_entries:
        updated_existing = existing.rstrip() + "\n" + "\n".join(new_entries) + "\n    "
        content = content.replace(existing, updated_existing)

with open(file_path, 'w') as f:
    f.write(content)
