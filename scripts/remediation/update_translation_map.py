import os

filepath = 'src/app/api/cost-sheets/export-pdf/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

start_marker = 'const translationMap: Record<string, string> = {'
end_marker = '};'
start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

new_map = """const translationMap: Record<string, string> = {
        'no': 'No.',
        'classification': 'Clasificación',
        'code': 'Código',
        'description': 'Descripción',
        'um': 'UM',
        'consumption_norm': 'Norma Consumo',
        'price': 'Precio Unitario',
        'total': 'Total',
        'quantity': 'Cantidad',
        'amount': 'Importe',
        'cost': 'Costo',
        'unit_cost': 'Costo Unitario',
        'time_norm': 'Norma Tiempo',
        'hourly_rate': 'Tarifa Horaria',
        'worker_count': 'Cant. Obreros',
        'name': 'Nombre/Descripción',
        'initial_value': 'Valor Inicial',
        'useful_life': 'Vida Útil (%)',
        'time': 'Tiempo',
        'value': 'Valor',
        'depreciation': 'Depreciación',
        'diet': 'Dieta',
        'category': 'Categoría',
        'salary': 'Salario',
        'total_salary': 'Salario Total',
        'coefficient': 'Coeficiente'"""

content = content[:start_idx] + new_map + content[end_idx:]

with open(filepath, 'w') as f:
    f.write(content)
