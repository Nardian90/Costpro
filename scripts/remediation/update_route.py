import sys

filepath = 'src/app/api/cost-sheets/export-pdf/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update exportOptions default
old_options = """    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true,
        includeUtilityNote: false
    };"""

new_options = """    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true,
        includeUtilityNote: false,
        showDateTime: true
    };"""

content = content.replace(old_options, new_options)

# 2. Add translation map
translation_map = """
    const translationMap: Record<string, string> = {
        'no': 'No.',
        'classification': 'Clasificación',
        'code': 'Código',
        'description': 'Descripción',
        'um': 'UM',
        'consumption_norm': 'Norma Consumo',
        'price': 'Precio Unitario',
        'total': 'Total',
        'time_norm': 'Norma Tiempo',
        'hourly_rate': 'Tarifa Horaria',
        'worker_count': 'Cant. Obreros',
        'name': 'Nombre/Descripción',
        'initial_value': 'Valor Inicial',
        'useful_life': 'Vida Útil (%)',
        'quantity': 'Cantidad/Tiempo',
        'depreciation_cost': 'Depreciación',
        'amount': 'Importe',
        'worker_name': 'Nombre Trabajador',
        'daily_allowance': 'Dieta Diaria',
        'days': 'Días',
        'rowId': 'Fila',
        'type': 'Tipo',
        'note': 'Nota',
        'change': 'Cambio'
    };

    const translate = (key: string) => translationMap[key] || key;
"""

# Insert translation map after safeLocale
safe_locale_end = "return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2 });\n    };"
content = content.replace(safe_locale_end, safe_locale_end + translation_map)

# 3. Use translation map for annex headers
old_annex_head = "head: [headers.map(h => h.toUpperCase())],"
new_annex_head = "head: [headers.map(h => translate(h).toUpperCase())],"
content = content.replace(old_annex_head, new_annex_head)

# 4. Update footer for showDateTime
old_footer = """    // Footer
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.text(`Generado el: ${timestamp} - Página ${i} de ${pageCount}`, 14, 285);
    }"""

new_footer = """    // Footer
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        const footerText = exportOptions.showDateTime
            ? `Generado el: ${timestamp} - Página ${i} de ${pageCount}`
            : `Página ${i} de ${pageCount}`;
        doc.text(footerText, 14, 285);
    }"""

content = content.replace(old_footer, new_footer)

with open(filepath, 'w') as f:
    f.write(content)
