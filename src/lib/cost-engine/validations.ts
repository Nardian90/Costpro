
import { CostSheetData, CalculatedRowValue, CostSheetHeader } from '@/types/cost-sheet';

export interface ValidationResult {
    type: 'SUCCESS' | 'WARNING' | 'CRITICAL';
    category: string;
    title: string;
    message: string;
    rowId?: string;
    value?: number;
}

export interface HealthSummary {
    validations: ValidationResult[];
    healthPercent: number;
    passedCount: number;
    totalCount: number;
}

export const calculateCostSheetHealth = (
    data: CostSheetData,
    calculatedValues: Record<string, CalculatedRowValue>,
    calculatedHeader: CostSheetHeader
): HealthSummary => {
    const results: ValidationResult[] = [];
    if (!data || !calculatedValues) {
        return { validations: [], healthPercent: 0, passedCount: 0, totalCount: 0 };
    }

    // 1. Parent Sum Validation
    const checkRowIntegrity = (rows: any[]) => {
        rows.forEach(row => {
            if (row.children && row.children.length > 0) {
                const parentVal = calculatedValues[row.id]?.total || 0;
                const childrenSum = row.children.reduce((acc: number, child: any) => {
                    return acc + (calculatedValues[child.id]?.total || 0);
                }, 0);

                const diff = childrenSum - parentVal;
                if (Math.abs(diff) > 0.01) {
                    results.push({
                        type: 'CRITICAL',
                        category: 'Integridad Estructural',
                        title: `Desfase en ${row.label}`,
                        message: `La suma de los hijos (${childrenSum.toFixed(2)}) no coincide con el total del padre (${parentVal.toFixed(2)}). Diferencia: ${diff.toFixed(2)}.`,
                        rowId: row.id
                    });
                } else {
                    results.push({
                        type: 'SUCCESS',
                        category: 'Integridad Estructural',
                        title: `Integridad OK: ${row.label}`,
                        message: `La suma de los elementos hijos coincide correctamente con el total del padre (${parentVal.toFixed(2)}).`,
                        rowId: row.id
                    });
                }
                checkRowIntegrity(row.children);
            }
        });
    };

    if (data.sections) {
        data.sections.forEach((s: any) => checkRowIntegrity(s.rows));
    }

    // 2. Utility / Cost Validation (13.1 / 12.1 or 13 / 12)
    const utilId = calculatedValues['13'] ? '13' : (calculatedValues['13.1'] ? '13.1' : null);
    const costId = calculatedValues['12.1'] ? '12.1' : (calculatedValues['12'] ? '12' : null);

    if (utilId && costId) {
        let utilVal = calculatedValues[utilId]?.total || 0;
        const costVal = calculatedValues[costId]?.total || 0;

        // Detect if 13.1 is Price instead of Utility
        if (utilId === '13.1' && utilVal > costVal) {
            utilVal = utilVal - costVal;
        }

        if (costVal > 0) {
            const ratio = utilVal / costVal;
            if (ratio > 0.3) {
                results.push({
                    type: 'WARNING',
                    category: 'Rentabilidad',
                    title: 'Utilidad Excesiva',
                    message: `La relación utilidad/costo (${(ratio * 100).toFixed(2)}%) supera el límite prudencial del 30%.`,
                    value: ratio
                });
            } else {
                results.push({
                    type: 'SUCCESS',
                    category: 'Rentabilidad',
                    title: 'Rentabilidad Validada',
                    message: `La relación utilidad/costo (${(ratio * 100).toFixed(2)}%) está dentro del rango prudencial.`,
                    value: ratio
                });
            }
        }
    }

    // 3. Indirect Expenses Coefficient
    // (4 + 6 + 7) / 2
    const g4 = calculatedValues['4']?.total || 0;
    const g6 = calculatedValues['6']?.total || 0;
    const g7 = calculatedValues['7']?.total || 0;
    const s2 = calculatedValues['2']?.total || 0;

    if (s2 > 0) {
        const indirectTotal = g4 + g6 + g7;
        const coef = indirectTotal / s2;
        const destination = String(calculatedHeader?.destination || calculatedHeader?.destino || '').toLowerCase();
        const limit = (destination === 'servicios' || destination === 'servicio') ? 1.0 : 1.5;

        if (coef > limit) {
            results.push({
                type: 'WARNING',
                category: 'Gastos Indirectos',
                title: 'Coeficiente de Gastos Indirectos Elevado',
                message: `El coeficiente (${coef.toFixed(2)}) supera el máximo permitido para ${destination || 'producción'} (${limit.toFixed(2)}).`,
                value: coef
            });
        } else {
            results.push({
                type: 'SUCCESS',
                category: 'Gastos Indirectos',
                title: 'Coeficiente de Gastos Indirectos Validado',
                message: `El coeficiente (${coef.toFixed(2)}) está dentro de los límites permitidos para ${destination || 'producción'} (${limit.toFixed(2)}).`,
                value: coef
            });
        }
    }

    // 4. Global Negativity Check
    Object.entries(calculatedValues).forEach(([id, val]) => {
        if (val.total < 0) {
            results.push({
                type: 'CRITICAL',
                category: 'Integridad Matemática',
                title: 'Valor Negativo Detectado',
                message: `El concepto con ID ${id} tiene un valor negativo (${val.total.toFixed(2)}), lo cual es inconsistente para una ficha de costo.`,
                rowId: id
            });
        }
    });

    // 5. Quantity vs Cost Validation
    const quantity = parseFloat(String(calculatedHeader?.quantity || 0));
    const totalCost = calculatedValues['12']?.total || calculatedValues['12.1']?.total || 0;
    if (quantity === 0 && totalCost > 0) {
        results.push({
            type: 'WARNING',
            category: 'Consistencia de Datos',
            title: 'Cantidad es Cero',
            message: 'La cantidad a producir es 0, pero se han detectado costos asociados. Esto afectará el costo unitario.',
        });
    }

    // 6. Annex Reference Integrity
    if (data.annexes && data.sections) {
        const checkAnnexRefs = (rows: any[]) => {
            rows.forEach(row => {
                const formula = row.formula || row.totalFormula || '';
                const annexMatches = formula.match(/Anexo\s*['"]?([^'"]+)['"]?/g);
                if (annexMatches) {
                    annexMatches.forEach((m: str) => {
                        const id = m.replace(/Anexo\s*['"]?/, '').replace(/['"]?$/, '');
                        if (!data.annexes.find((a: any) => a.id === id)) {
                            results.push({
                                type: 'CRITICAL',
                                category: 'Integridad Matemática',
                                title: 'Referencia a Anexo Inexistente',
                                message: `La fórmula de '${row.label}' referencia al Anexo '${id}', que no existe en esta ficha.`,
                                rowId: row.id
                            });
                        }
                    });
                }
                if (row.children) checkAnnexRefs(row.children);
            });
        };
        data.sections.forEach((s: any) => checkAnnexRefs(s.rows));
    }

    const passedCount = results.filter(v => v.type === 'SUCCESS').length;
    const totalCount = results.length;
    const healthPercent = totalCount > 0 ? (passedCount / totalCount) * 100 : 100;

    return {
        validations: results,
        healthPercent,
        passedCount,
        totalCount
    };
};
