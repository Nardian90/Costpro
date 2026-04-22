import { CostSheetData, CalculatedRowValue, CostSheetHeader } from '@/types/cost-sheet';

// ═══════════════════════════════════════════════════════════════
// ISO-configurable materiality thresholds (ISA 540)
// ═══════════════════════════════════════════════════════════════

/** Materiality threshold for structural integrity checks (parent vs children sum) */
const MATERIALITY_THRESHOLD = 0.001;

/** Materiality threshold for certification rule checks */
const CERT_MATERIALITY_THRESHOLD = 0.05;

/** Cuban tax coefficients for standard format certification */
const CERT_COEFFICIENTS = {
  /** Row 2.1.1 — 9.09% of row 2.1 (social security contribution) */
  SECURITY_CONTRIBUTION: 1 / 11,   // ≈ 0.090909...
  /** Row 10.1 — 14% of base salary */
  SOCIAL_SECURITY_RATE: 0.14,
  /** Row 10.2 — 5% of base salary */
  SOCIAL_ASSISTANCE_RATE: 0.05,
  /** Row 13.3 — Tax: 13.1 / 0.9 * 0.1 */
  TAX_CALCULATION: { divisor: 0.9, rate: 0.1 },
  /** Profit ratio prudential limit */
  MAX_PROFIT_RATIO: 0.3,
  /** Indirect expense coefficient limits */
  INDIRECT_COEF_SERVICES: 1.0,
  INDIRECT_COEF_PRODUCTION: 1.5,
} as const;

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
                if (Math.abs(diff) > MATERIALITY_THRESHOLD) {
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
            if (ratio > CERT_COEFFICIENTS.MAX_PROFIT_RATIO) {
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
        const limit = (destination === 'servicios' || destination === 'servicio') ? CERT_COEFFICIENTS.INDIRECT_COEF_SERVICES : CERT_COEFFICIENTS.INDIRECT_COEF_PRODUCTION;

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
                    annexMatches.forEach((m: string) => {
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

    // 7. Standard Format Certification (New)
    const checkStandardFormat = () => {
        const standardResults: ValidationResult[] = [];
        const category = 'Formato Estándar Recomendado';

        const findRow = (rows: any[], id: string): any => {
            for (const r of rows) {
                if (r.id === id) return r;
                if (r.children) {
                    const found = findRow(r.children, id);
                    if (found) return found;
                }
            }
            return null;
        };

        const allRows: any[] = data.sections.flatMap(s => s.rows);

        // Rule 1: Section 1 children -> Anexo I
        const sec1 = data.sections.find(s => s.id === '1' || s.label?.startsWith('1.'));
        if (sec1) {
            sec1.rows.forEach(r => {
                if (r.children) {
                    r.children.forEach(child => {
                        const formula = child.formula || child.totalFormula || '';
                        if (!formula.includes('Anexo I')) {
                            standardResults.push({
                                type: 'WARNING',
                                category,
                                title: 'Certificación: Referencia Anexo I',
                                message: `El hijo '${child.label}' de la Sección 1 debe referenciar al Anexo I.`,
                                rowId: child.id
                            });
                        }
                    });
                }
            });
        }

        // Rule 2: 2.1.1 -> Anexo II & Value = 2.1 * 0.0909
        const row211 = findRow(allRows, '2.1.1');
        if (row211) {
            const formula = row211.formula || row211.totalFormula || '';
            if (!formula.includes('Anexo II')) {
                standardResults.push({
                    type: 'WARNING',
                    category,
                    title: 'Certificación: Referencia Anexo II',
                    message: `La fila 2.1.1 debe referenciar al Anexo II.`,
                    rowId: '2.1.1'
                });
            }
            const v21 = calculatedValues['2.1']?.total || 0;
            const v211 = calculatedValues['2.1.1']?.total || 0;
            const expected211 = Math.round(v21 * CERT_COEFFICIENTS.SECURITY_CONTRIBUTION * 100) / 100;
            if (Math.abs(v211 - expected211) > CERT_MATERIALITY_THRESHOLD) {
                standardResults.push({
                    type: 'WARNING',
                    category,
                    title: 'Certificación: Cálculo 2.1.1 (9.09%)',
                    message: `El valor de 2.1.1 (${v211}) no coincide con el 9.09% de 2.1 (${expected211}).`,
                    rowId: '2.1.1'
                });
            }
        }

        // Rule 3: Section 3 -> Anexo III to V
        const sec3 = data.sections.find(s => s.id === '3' || s.label?.startsWith('3.'));
        if (sec3) {
            sec3.rows.forEach(r => {
                const formula = r.formula || r.totalFormula || '';
                if (!/Anexo\s*(III|IV|V)/.test(formula)) {
                    standardResults.push({
                        type: 'WARNING',
                        category,
                        title: 'Certificación: Referencia Anexo III-V',
                        message: `La fila '${r.label}' debe referenciar a los Anexos III, IV o V.`,
                        rowId: r.id
                    });
                }
            });
        }

        // Rule 4: Sections 4, 6, 7 children -> pror(vh("1.1.1")) or pror(vh("2.1.1"))
        // Also accept the expanded form: vh(X)/vh('1.1.1')*ref('1.1.1') (equivalent to pror(vh('1.1.1')))
        const q = `['"]`; // matches single or double quote
        const isProrPattern = (formula: string): boolean => {
            // Shorthand: pror(vh('1.1.1')) or pror(vh("1.1.1")) — with optional whitespace
            const shorthandRe = new RegExp(`pror\\s*\\(\\s*vh\\s*\\(\\s*${q}1\\.1\\.1${q}\\s*\\)\\s*\\)`, 'i');
            // Shorthand: pror(vh('2.1.1'))
            const shorthandRe2 = new RegExp(`pror\\s*\\(\\s*vh\\s*\\(\\s*${q}2\\.1\\.1${q}\\s*\\)\\s*\\)`, 'i');
            // Expanded: vh(X)/vh('1.1.1')*ref('1.1.1') — the macro-expanded form of pror(vh('1.1.1'))
            const expandedRe1 = new RegExp(`vh\\s*\\(\\s*${q}[^)]+${q}\\s*\\)\\s*/\\s*vh\\s*\\(\\s*${q}1\\.1\\.1${q}\\s*\\)\\s*\\*\\s*ref\\s*\\(\\s*${q}1\\.1\\.1${q}\\s*\\)`, 'i');
            // Expanded: vh(X)/vh('2.1.1')*ref('2.1.1')
            const expandedRe2 = new RegExp(`vh\\s*\\(\\s*${q}[^)]+${q}\\s*\\)\\s*/\\s*vh\\s*\\(\\s*${q}2\\.1\\.1${q}\\s*\\)\\s*\\*\\s*ref\\s*\\(\\s*${q}2\\.1\\.1${q}\\s*\\)`, 'i');
            return shorthandRe.test(formula) || shorthandRe2.test(formula) || expandedRe1.test(formula) || expandedRe2.test(formula);
        };
        ['4', '6', '7'].forEach(id => {
            const sec = data.sections.find(s => s.id === id || s.label?.startsWith(id + '.'));
            if (sec) {
                const checkPror = (rows: any[]) => {
                    rows.forEach(r => {
                        if (r.children && r.children.length > 0) {
                            checkPror(r.children);
                        } else {
                            const formula = r.formula || r.totalFormula || '';
                            if (formula && !isProrPattern(formula)) {
                                standardResults.push({
                                    type: 'WARNING',
                                    category,
                                    title: 'Certificación: Prorrateo V.H.',
                                    message: `La fila '${r.label}' debe usar pror(vh("1.1.1")) o pror(vh("2.1.1")).`,
                                    rowId: r.id
                                });
                            }
                        }
                    });
                };
                checkPror(sec.rows);
            }
        });

        // Rule 5: 10.1 (14%) & 10.2 (5%) of (2.1 + 4.1.1 + 6.1.1 + 7.1.1)
        const v21 = calculatedValues['2.1']?.total || 0;
        const v411 = calculatedValues['4.1.1']?.total || 0;
        const v611 = calculatedValues['6.1.1']?.total || 0;
        const v711 = calculatedValues['7.1.1']?.total || 0;
        const baseSalario = v21 + v411 + v611 + v711;

        const v101 = calculatedValues['10.1']?.total || 0;
        const expected101 = Math.round(baseSalario * CERT_COEFFICIENTS.SOCIAL_SECURITY_RATE * 100) / 100;
        if (Math.abs(v101 - expected101) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Cálculo 10.1 (14%)',
                message: `10.1 (${v101}) debe ser el 14% de la suma de salarios (${expected101}).`,
                rowId: '10.1'
            });
        }

        const v102 = calculatedValues['10.2']?.total || 0;
        const expected102 = Math.round(baseSalario * CERT_COEFFICIENTS.SOCIAL_ASSISTANCE_RATE * 100) / 100;
        if (Math.abs(v102 - expected102) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Cálculo 10.2 (5%)',
                message: `10.2 (${v102}) debe ser el 5% de la suma de salarios (${expected102}).`,
                rowId: '10.2'
            });
        }

        // Rule 6: 5.1 = 1+2+3+4
        const v1 = calculatedValues['1']?.total || 0;
        const v2 = calculatedValues['2']?.total || 0;
        const v3 = calculatedValues['3']?.total || 0;
        const v4 = calculatedValues['4']?.total || 0;
        const v51 = calculatedValues['5.1']?.total || 0;
        const expected51 = v1 + v2 + v3 + v4;
        if (Math.abs(v51 - expected51) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Suma 5.1',
                message: `5.1 (${v51}) debe ser la suma de 1, 2, 3 y 4 (${expected51}).`,
                rowId: '5.1'
            });
        }

        // Rule 7: 11.1 = 6+7+8+9+10
        const v6 = calculatedValues['6']?.total || 0;
        const v7 = calculatedValues['7']?.total || 0;
        const v8 = calculatedValues['8']?.total || 0;
        const v9 = calculatedValues['9']?.total || 0;
        const v10 = calculatedValues['10']?.total || 0;
        const v111 = calculatedValues['11.1']?.total || 0;
        const expected111 = v6 + v7 + v8 + v9 + v10;
        if (Math.abs(v111 - expected111) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Suma 11.1',
                message: `11.1 (${v111}) debe ser la suma de 6, 7, 8, 9 y 10 (${expected111}).`,
                rowId: '11.1'
            });
        }

        // Rule 8: 12.1 = 5.1 + 11.1
        const v121 = calculatedValues['12.1']?.total || 0;
        const expected121 = v51 + v111;
        if (Math.abs(v121 - expected121) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Costo Total 12.1',
                message: `12.1 (${v121}) debe ser la suma de 5.1 y 11.1 (${expected121}).`,
                rowId: '12.1'
            });
        }

        // Rule 9: 13.2 = 12.1 + 13.1
        const v131 = calculatedValues['13.1']?.total || 0;
        const v132 = calculatedValues['13.2']?.total || 0;
        const expected132 = v121 + v131;
        if (Math.abs(v132 - expected132) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Precio 13.2',
                message: `13.2 (${v132}) debe ser 12.1 + 13.1 (${expected132}).`,
                rowId: '13.2'
            });
        }

        // Rule 10: 13.3 = 13.1 / 0.9 * 0.1
        const v133 = calculatedValues['13.3']?.total || 0;
        const expected133 = Math.round((v131 / CERT_COEFFICIENTS.TAX_CALCULATION.divisor * CERT_COEFFICIENTS.TAX_CALCULATION.rate) * 100) / 100;
        if (Math.abs(v133 - expected133) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Impuesto 13.3',
                message: `13.3 (${v133}) debe ser 13.1/0.9*0.1 (${expected133}).`,
                rowId: '13.3'
            });
        }

        // Rule 11: 14.1 = 13.2 + 13.3
        const v141 = calculatedValues['14.1']?.total || 0;
        const expected141 = v132 + v133;
        if (Math.abs(v141 - expected141) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Precio Final 14.1',
                message: `14.1 (${v141}) debe ser 13.2 + 13.3 (${expected141}).`,
                rowId: '14.1'
            });
        }

        // Rule 12: 15.1 = 12.1 / cantidad
        const qty = parseFloat(String(data.header?.quantity || 1));
        const v151 = calculatedValues['15.1']?.total || 0;
        const expected151 = qty !== 0 ? Math.round((v121 / qty) * 100) / 100 : 0;
        if (Math.abs(v151 - expected151) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Costo Unitario 15.1',
                message: `15.1 (${v151}) debe ser 12.1 / cantidad (${expected151}).`,
                rowId: '15.1'
            });
        }

        // Rule 13: 16.1 = 14.1 / cantidad
        const v161 = calculatedValues['16.1']?.total || 0;
        const expected161 = qty !== 0 ? Math.round((v141 / qty) * 100) / 100 : 0;
        if (Math.abs(v161 - expected161) > CERT_MATERIALITY_THRESHOLD) {
            standardResults.push({
                type: 'WARNING',
                category,
                title: 'Certificación: Precio Unitario 16.1',
                message: `16.1 (${v161}) debe ser 14.1 / cantidad (${expected161}).`,
                rowId: '16.1'
            });
        }

        if (standardResults.length === 0) {
            standardResults.push({
                type: 'SUCCESS',
                category,
                title: 'Formato Estándar Validado',
                message: 'La ficha cumple con todos los requisitos del formato estándar recomendado.'
            });
        }

        return standardResults;
    };

    results.push(...checkStandardFormat());

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

export { MATERIALITY_THRESHOLD, CERT_MATERIALITY_THRESHOLD, CERT_COEFFICIENTS };
