import { CostSheetData } from '../../types/cost-sheet';
import { buildEngineFicha } from './build-ficha';
import { calculateFicha } from './index';

export function solveCoefficient(
    template: CostSheetData,
    targetRowId: string,
    targetValue: number,
    options: { maxIter?: number; tolerance?: number } = {}
): number {
    const maxIter = options.maxIter || 100;
    const tolerance = options.tolerance || 0.001;

    const probe = (val: number) => {
        const testTemplate = {
            ...template,
            annexes: (template.annexes || []).map(a => ({
                ...a,
                coefficient: val,
                isAdjustmentActive: true
            }))
        };
        const ficha = buildEngineFicha(testTemplate);
        const result = calculateFicha(ficha);

        const row = result.rows.find(r => r.id === targetRowId || r.classification === targetRowId);
        let current = row ? row.total : result.summary.grandTotal;
        return isNaN(current) ? 0 : current;
    };

    let low = 0;
    let high = 100;

    let vLow = probe(low);
    let vHigh = probe(high);

    if (Math.abs(vHigh - targetValue) < tolerance) return high;
    if (Math.abs(vLow - targetValue) < tolerance) return low;

    // Detect direction and scale up if needed
    if (vHigh < targetValue && vHigh > vLow) {
        while (vHigh < targetValue && high < 1e15) {
            low = high;
            high *= 10;
            vHigh = probe(high);
        }
    } else if (vHigh > targetValue && vHigh < vLow) {
         while (vHigh > targetValue && high < 1e15) {
            low = high;
            high *= 10;
            vHigh = probe(high);
        }
    }

    const ascending = vHigh > vLow;

    let mid = (low + high) / 2;
    for (let i = 0; i < maxIter; i++) {
        mid = (low + high) / 2;
        const currentTotal = probe(mid);
        if (Math.abs(currentTotal - targetValue) < tolerance) return mid;
        if (ascending) {
            if (currentTotal < targetValue) low = mid;
            else high = mid;
        } else {
            if (currentTotal > targetValue) low = mid;
            else high = mid;
        }
    }
    return mid;
}

export function solveForTarget(
    template: CostSheetData,
    targetRowId: string,
    targetValue: number,
    variableRowId: string,
    options: { maxIter?: number; tolerance?: number } = {}
): number {
    const maxIter = options.maxIter || 100;
    const tolerance = options.tolerance || 0.001;

    const probe = (val: number) => {
        const testTemplate = JSON.parse(JSON.stringify(template));
        const findAndSet = (rows: any[]) => {
            for (const r of rows) {
                if (r.id === variableRowId || r.classification === variableRowId) {
                    r.valorHistorico = val;
                    r.value = val;
                    r.calculationMethod = 'FIJO';
                    return true;
                }
                if (r.children && findAndSet(r.children)) return true;
            }
            return false;
        };

        for (const section of testTemplate.sections) {
            if (findAndSet(section.rows)) break;
        }

        const ficha = buildEngineFicha(testTemplate);
        const result = calculateFicha(ficha);
        const row = result.rows.find(r => r.id === targetRowId || r.classification === targetRowId);
        let current = row ? row.total : result.summary.grandTotal;
        return isNaN(current) ? 0 : current;
    };

    let low = 0;
    let high = Math.max(targetValue * 10, 2000000);

    let vLow = probe(low);
    let vHigh = probe(high);

    if (vHigh < targetValue && vHigh > vLow) {
        while (vHigh < targetValue && high < 1e18) {
            low = high;
            high *= 10;
            vHigh = probe(high);
        }
    }

    const ascending = vHigh > vLow;

    let mid = (low + high) / 2;
    for (let i = 0; i < maxIter; i++) {
        mid = (low + high) / 2;
        const currentTotal = probe(mid);
        if (Math.abs(currentTotal - targetValue) < tolerance) return mid;
        if (ascending) {
            if (currentTotal < targetValue) low = mid;
            else high = mid;
        } else {
            if (currentTotal > targetValue) low = mid;
            else high = mid;
        }
    }
    return mid;
}
