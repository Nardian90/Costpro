import re

with open('src/app/api/cost-sheets/export-pdf/route.ts', 'r') as f:
    content = f.read()

old_dict = """        const dict: Record<string, string> = {
            'classification': 'Fila',
            'label': 'Concepto',
            'total': 'Total',
            'v_historico': 'V. Histórico',
            'valorhistorico': 'V. Histórico',
            'um': 'UM',
            'cantidad': 'Cant.',
            'precio': 'Precio',
            'importe': 'Importe'
        };"""

new_dict = """        const dict: Record<string, string> = {
            'classification': 'Clasificación',
            'label': 'Concepto',
            'total': 'Total',
            'v_historico': 'V. Histórico',
            'valorhistorico': 'V. Histórico',
            'um': 'UM',
            'unit': 'UM',
            'cantidad': 'Cantidad',
            'quantity': 'Cantidad',
            'precio': 'Precio',
            'price': 'Precio',
            'importe': 'Importe',
            'amount': 'Importe',
            'no': 'No.',
            'code': 'Código',
            'description': 'Descripción',
            'consumption_norm': 'Norma Consumo',
            'time_norm': 'Norma Tiempo',
            'hourly_rate': 'Tarifa Horaria',
            'worker_count': 'Cant. Obreros',
            'initial_value': 'Valor Inicial',
            'useful_life': 'Vida Útil',
            'depreciation_cost': 'Depreciación',
            'worker_name': 'Trabajador',
            'daily_allowance': 'Dieta Diaria',
            'days': 'Días'
        };"""

content = content.replace(old_dict, new_dict)

with open('src/app/api/cost-sheets/export-pdf/route.ts', 'w') as f:
    f.write(content)
