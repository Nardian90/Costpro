import sys

file_path = 'src/lib/ipv/utils.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Improve recalculateIPVReportsChain to be idempotent and inclusive
search_block = """        const updatedFilas = report.filas.map((f: any) => {
            const product = productMap.get(f.cod);

            // Entradas inteligentes para este producto en esta fecha
            const intelligentEntries = allMovements
                .filter((m: any) => m.producto_destino_cod === f.cod && m.fecha === reportDate && m.tipo === 'INTELLIGENT_RECEIPT')
                .reduce((sum: number, m) => sum + m.cantidad_destino, 0);

            // Descomposiciones (entradas como destino)
            const decompositionEntries = allMovements
                .filter((m: any) => m.producto_destino_cod === f.cod && m.fecha === reportDate && m.tipo === 'DECOMPOSITION')
                .reduce((sum: number, m) => sum + m.cantidad_destino, 0);

            // Descomposiciones (salidas como origen)
            const decompositionExits = allMovements
                .filter((m: any) => m.producto_origen_cod === f.cod && m.fecha === reportDate && m.tipo === 'DECOMPOSITION')
                .reduce((sum: number, m) => sum + m.cantidad_origen, 0);

            const initial = prevReport
                ? (prevReport.filas.find((pf: any) => pf.cod === f.cod)?.existencia_final_qty || 0)
                : (product?.stock_inicial_manual || 0);

            const entradaManual = f.entrada_qty || 0;
            const entradaTotal = entradaManual + intelligentEntries + decompositionEntries;
            const salidaManual = f.salida_qty || 0;
            const salidaTotal = salidaManual + decompositionExits;

            const venta = f.venta_cantidad_qty;
            const totalDisponible = initial + entradaTotal;
            const final = totalDisponible - salidaTotal - venta;

            return {
                ...f,
                saldo_inicial_qty: initial,
                entrada_qty: entradaTotal,
                salida_qty: salidaTotal,
                total_disponible_qty: totalDisponible,
                existencia_final_qty: final
            };
        });"""

replace_block = """        const updatedFilas = report.filas.map((f: any) => {
            const product = productMap.get(f.cod);

            // Sumar todas las entradas registradas en product_movements para esta fecha
            const totalEntries = allMovements
                .filter((m: any) => m.producto_destino_cod === f.cod && m.fecha === reportDate &&
                    ['INTELLIGENT_RECEIPT', 'DECOMPOSITION', 'MANUAL', 'IMPORT'].includes(m.tipo))
                .reduce((sum: number, m) => sum + (m.cantidad_destino || 0), 0);

            // Sumar todas las salidas registradas en product_movements para esta fecha
            const totalExits = allMovements
                .filter((m: any) => m.producto_origen_cod === f.cod && m.fecha === reportDate &&
                    ['DECOMPOSITION', 'MANUAL'].includes(m.tipo))
                .reduce((sum: number, m) => sum + (m.cantidad_origen || 0), 0);

            const initial = prevReport
                ? (prevReport.filas.find((pf: any) => pf.cod === f.cod)?.existencia_final_qty || 0)
                : (product?.stock_inicial_manual || 0);

            const venta = f.venta_cantidad_qty || 0;
            const totalDisponible = initial + totalEntries;
            const final = totalDisponible - totalExits - venta;

            return {
                ...f,
                saldo_inicial_qty: initial,
                entrada_qty: totalEntries,
                salida_qty: totalExits,
                entrada_salida_qty: totalEntries - totalExits,
                total_disponible_qty: totalDisponible,
                existencia_final_qty: final
            };
        });"""

content = content.replace(search_block, replace_block)

with open(file_path, 'w') as f:
    f.write(content)
