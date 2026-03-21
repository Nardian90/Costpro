import sys

file_path = 'src/components/views/terminal/views/ipv/IPVReportView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add movements query
old_line = "const lines = await db.reconciliation_lines.where('fecha_operacion').equals(dateStr).toArray();"
new_line = old_line + "\n    const movements = await db.product_movements.where('fecha').equals(dateStr).toArray();"
content = content.replace(old_line, new_line)

# Update reportFilas mapping
search_block = """    const reportFilas = products.map(p => {
        const ventaInfo = productGroups[p.cod] || { venta_cantidad_qty: 0, precio_unitario_cents: p.precio_cents, importe_cents: 0 };
        const prevRow = lastReport?.filas.find((pr: any) => pr.cod === p.cod);
        const initial = prevRow ? prevRow.existencia_final_qty : (p.stock_inicial_manual || 0);
        const entrada = 0;
        const salida = 0;
        const venta = ventaInfo.venta_cantidad_qty;
        const totalDisponible = initial + entrada;
        const final = totalDisponible - salida - venta;

        return {
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            saldo_inicial_qty: initial,
            entrada_qty: entrada,
            salida_qty: salida,
            entrada_salida_qty: 0,
            total_disponible_qty: totalDisponible,"""

replace_block = """    const reportFilas = products.map(p => {
        const ventaInfo = productGroups[p.cod] || { venta_cantidad_qty: 0, precio_unitario_cents: p.precio_cents, importe_cents: 0 };
        const prevRow = lastReport?.filas.find((pr: any) => pr.cod === p.cod);
        const initial = prevRow ? prevRow.existencia_final_qty : (p.stock_inicial_manual || 0);

        const entries = movements
            .filter(m => m.producto_destino_cod === p.cod && (m.tipo === 'INTELLIGENT_RECEIPT' || m.tipo === 'DECOMPOSITION'))
            .reduce((sum, m) => sum + (m.cantidad_destino || 0), 0);

        const exits = movements
            .filter(m => m.producto_origen_cod === p.cod && m.tipo === 'DECOMPOSITION')
            .reduce((sum, m) => sum + (m.cantidad_origen || 0), 0);

        const venta = ventaInfo.venta_cantidad_qty;
        const totalDisponible = initial + entries;
        const final = totalDisponible - exits - venta;

        return {
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            saldo_inicial_qty: initial,
            entrada_qty: entries,
            salida_qty: exits,
            entrada_salida_qty: entries - exits,
            total_disponible_qty: totalDisponible,"""

content = content.replace(search_block, replace_block)

with open(file_path, 'w') as f:
    f.write(content)
