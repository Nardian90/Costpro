import { db, Product, IntelligentReceipt, ProductMovement } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { PersistenceService } from '../persistenceService';

export interface SimulationResult {
    receipts: IntelligentReceipt[];
    stockImpact: Map<string, { current: number; simulated: number }>;
    correctedProducts: string[];
}

/**
 * Decompone unidades totales en niveles (BOX, PACK, UNIT) usando algoritmo greedy.
 */
export function descomponerUnidades(totalUnits: number, product: Product, hierarchy: Product[]): { level: 'BOX' | 'PACK' | 'UNIT', quantity: number, units: number }[] {
    const results: { level: 'BOX' | 'PACK' | 'UNIT', quantity: number, units: number }[] = [];
    let remaining = totalUnits;

    // Sort hierarchy by unit_factor descending (BOX -> PACK -> UNIT)
    const sortedHierarchy = [...hierarchy].sort((a, b) => (b.unit_factor || 0) - (a.unit_factor || 0));

    for (const p of sortedHierarchy) {
        if (remaining <= 0) break;
        const factor = p.unit_factor || 1;
        if (remaining >= factor) {
            const qty = Math.floor(remaining / factor);
            results.push({
                level: p.unit_level || 'UNIT',
                quantity: qty,
                units: qty * factor
            });
            remaining %= factor;
        }
    }

    return results;
}

/**
 * Redondea la demanda total a múltiplos de 10.
 */
function aplicarRedondeo(units: number): number {
    return Math.ceil(units / 10) * 10;
}

/**
 * Corrige los negativos detectados en una simulación.
 */
export async function corregirNegativos(
    date: string,
    productCod: string,
    needed: number,
    mode: 'A' | 'B' | 'C',
    simulationId: string
): Promise<IntelligentReceipt[]> {
    const product = await PersistenceService.readSafe(() => db.products.where('cod').equals(productCod).first());
    if (!product) return [];

    // Get product hierarchy (all products in the same group)
    let hierarchy: Product[] = [];
    if (product.id_grupo) {
        hierarchy = await PersistenceService.readSafe(() => db.products.where('id_grupo').equals(product.id_grupo).toArray());
    } else {
        hierarchy = [product];
    }

    // Apply rounding to the needed amount (except for products 'A Medida')
    const { isProductAMedida } = await import('./utils');
    const roundedNeeded = isProductAMedida(product.um) ? needed : aplicarRedondeo(needed);

    // Decompose into levels
    const decomposition = descomponerUnidades(roundedNeeded, product, hierarchy);

    const receipts: IntelligentReceipt[] = decomposition.map(d => ({
        id: uuidv4(),
        date,
        product_id: productCod,
        type: 'CORRECTIVE',
        level: d.level,
        quantity: d.quantity,
        total_units: d.units,
        source: 'ADJUSTMENT',
        mode,
        simulation_id: simulationId,
        applied: 0,
        created_at: new Date().toISOString()
    }));

    return receipts;
}

/**
 * Reconstruye las recepciones basadas en las ventas y el modo de operación.
 */
export async function reconstruirRecepciones(
    startDate: string,
    endDate: string,
    mode: 'A' | 'B' | 'C',
    stockGoals?: Map<string, number>
): Promise<SimulationResult> {
    const simulationId = uuidv4();
    const products = await PersistenceService.readSafe(() => db.products.toArray());
    const receipts: IntelligentReceipt[] = [];
    const stockImpact = new Map<string, { current: number; simulated: number }>();
    const correctedProducts = new Set<string>();

    // Initial stock map
    const simulatedStock = new Map<string, number>();
    for (const p of products) {
        simulatedStock.set(p.cod, p.stock_inicial_manual || 0);
    }

    // Get all dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }

    // Pre-load all movements and sales
    const allLines = await PersistenceService.readSafe(() => db.reconciliation_lines.where('fecha_operacion').between(startDate, endDate, true, true).toArray());

    // Mode B: include existing manual receipts
    const existingReceipts = mode === 'B'
        ? await PersistenceService.readSafe(() => db.product_movements.where('fecha').between(startDate, endDate, true, true).toArray())
        : [];

    // Simulate day by day
    for (const date of dates) {
        // 1. Add existing receipts if Mode B
        if (mode === 'B') {
            const todayReceipts = existingReceipts.filter(r => r.fecha === date);
            todayReceipts.forEach(r => {
                const current = simulatedStock.get(r.producto_destino_cod) || 0;
                simulatedStock.set(r.producto_destino_cod, current + r.cantidad_destino);
                // Also handle origin if it's a decomposition
                if (r.producto_origen_cod !== 'SYSTEM_GEN') {
                    const origin = simulatedStock.get(r.producto_origen_cod) || 0;
                    simulatedStock.set(r.producto_origen_cod, origin - r.cantidad_origen);
                }
            });
        }

        // 2. Subtract sales
        const todaySales = allLines.filter(l => l.fecha_operacion === date);
        todaySales.forEach(s => {
            const current = simulatedStock.get(s.product_cod) || 0;
            simulatedStock.set(s.product_cod, current - s.cantidad);
        });

        // 3. Re-check all products for negatives at end of day and correct
        for (const [cod, stock] of simulatedStock.entries()) {
            if (stock < 0) {
                const corrective = await corregirNegativos(date, cod, Math.abs(stock), mode, simulationId);
                corrective.forEach(r => {
                    receipts.push(r);
                    const current = simulatedStock.get(r.product_id) || 0;
                    simulatedStock.set(r.product_id, current + r.total_units);
                });
                correctedProducts.add(cod);
            }
        }
    }

    // Mode C: Check stock goals at the end
    if (mode === 'C' && stockGoals) {
        for (const [cod, goal] of stockGoals.entries()) {
            const current = simulatedStock.get(cod) || 0;
            if (current < goal) {
                const diff = goal - current;
                const corrective = await corregirNegativos(dates[dates.length - 1], cod, diff, mode, simulationId);
                corrective.forEach(r => {
                    receipts.push(r);
                    simulatedStock.set(r.product_id, (simulatedStock.get(r.product_id) || 0) + r.total_units);
                });
                correctedProducts.add(cod);
            }
        }
    }

    // Final stock comparison
    for (const p of products) {
        const currentStock = await calculateActualStock(p.cod);
        stockImpact.set(p.cod, {
            current: currentStock,
            simulated: simulatedStock.get(p.cod) || 0
        });
    }

    return {
        receipts,
        stockImpact,
        correctedProducts: Array.from(correctedProducts)
    };
}

async function calculateActualStock(productCod: string): Promise<number> {
    const product = await PersistenceService.readSafe(() => db.products.get(productCod));
    if (!product) return 0;
    const lines = await PersistenceService.readSafe(() => db.reconciliation_lines.where('product_cod').equals(productCod).toArray());
    const sales = lines.reduce((sum, l) => sum + l.cantidad, 0);
    const movementsDest = await PersistenceService.readSafe(() => db.product_movements.where('producto_destino_cod').equals(productCod).toArray());
    const entries = movementsDest.reduce((sum, m) => sum + m.cantidad_destino, 0);
    const movementsOrig = await PersistenceService.readSafe(() => db.product_movements.where('producto_origen_cod').equals(productCod).toArray());
    const exits = movementsOrig.reduce((sum, m) => sum + m.cantidad_origen, 0);

    return (product.stock_inicial_manual || 0) + entries - exits - sales;
}

/**
 * Persiste las recepciones confirmadas en la base de datos.
 */
export async function aplicarRecepciones(receipts: IntelligentReceipt[]) {
    await PersistenceService.transactionSafe([db.intelligent_receipts, db.product_movements, db.audit_logs], async () => {
        for (const r of receipts) {
            // 1. Marcar como aplicada
            r.applied = 1;
            await db.intelligent_receipts.put(r);

            // 2. Crear movimiento de producto
            await db.product_movements.add({
                id: uuidv4(),
                fecha: r.date,
                producto_origen_cod: 'SYSTEM_GEN',
                producto_destino_cod: r.product_id,
                cantidad_origen: 0,
                cantidad_destino: r.total_units,
                tipo: 'INTELLIGENT_RECEIPT',
                referencia_transaccion: r.id,
                motivo: `Recepción inteligente (${r.level})`,
                costo_unitario_cents: r.costo_unitario_cents,
                costo_total_cents: r.costo_total_cents,
                created_at: new Date().toISOString()
            } as any);
        }
    });
}

/**
 * Simula el impacto de aplicar las recepciones generadas.
 */
export async function simularImpacto(receipts: IntelligentReceipt[]): Promise<SimulationResult> {
    throw new Error("Not implemented");
}

/**
 * Genera recepciones simuladas basadas en el stock inicial manual del catálogo.
 */
export async function generarRecepcionDesdeSaldoInicial(): Promise<SimulationResult> {
    const products = await PersistenceService.readSafe(() => db.products.where('stock_inicial_manual').above(0).toArray());
    const simulationId = uuidv4();
    const today = new Date().toISOString().split('T')[0];

    const receipts: IntelligentReceipt[] = products.map(p => ({
        id: uuidv4(),
        date: today,
        product_id: p.cod,
        type: 'INTELLIGENT',
        level: p.unit_level || 'UNIT',
        quantity: p.stock_inicial_manual / (p.unit_factor || 1),
        total_units: p.stock_inicial_manual,
        source: 'ADJUSTMENT',
        mode: 'A',
        simulation_id: simulationId,
        applied: 0,
        created_at: new Date().toISOString()
    }));

    const stockImpact = new Map<string, { current: number; simulated: number }>();
    for (const p of products) {
        const current = await calculateActualStock(p.cod);
        stockImpact.set(p.cod, {
            current,
            simulated: current + p.stock_inicial_manual
        });
    }

    return {
        receipts,
        stockImpact,
        correctedProducts: products.map(p => p.cod)
    };
}
