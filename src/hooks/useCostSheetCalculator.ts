
import { useState, useEffect, useCallback } from 'react';
import { produce } from 'immer';

// Define the types for the hook
interface Row {
  id: string;
  value: number;
  formula?: string;
  readonly?: boolean;
  [key: string]: any;
}

interface Section {
  id: string;
  rows: Row[];
  [key: string]: any;
}

interface Template {
  sections: Section[];
  [key: string]: any;
}

interface UseCostSheetCalculatorProps {
  template: Template;
  annexData: { [key: string]: any[] };
}

class CalculationRulesManager {
    private rules: Map<string, any>;

    constructor() {
        this.rules = new Map();
        this.initializeRules();
    }

    initializeRules() {
        this.rules.set('insumo', {
            id: 'insumo',
            description: 'Basado en el Gasto de Insumos',
            coefficientFormula: (rowValue: number, insumoValue: number) => insumoValue > 0 ? (rowValue / insumoValue) * 100 : 0,
            totalFormula: (coefficient: number, insumoValue: number) => (coefficient / 100) * insumoValue,
        });
        this.rules.set('salario', {
            id: 'salario',
            description: 'Basado en el Salario Directo',
            coefficientFormula: (rowValue: number, salarioValue: number) => salarioValue > 0 ? (rowValue / salarioValue) * 100 : 0,
            totalFormula: (coefficient: number, salarioValue: number) => (coefficient / 100) * salarioValue,
        });
    }

    getRule(ruleId: string) {
        return this.rules.get(ruleId);
    }
}

class CalculationPriorityManager {
    private priorityRules: Map<string, string>;

    constructor() {
        this.priorityRules = new Map();
        this.initializePriorityRules();
    }

    initializePriorityRules() {
        this.priorityRules.set('1.1', 'coefficient-first');
        this.priorityRules.set('2.1', 'coefficient-first');
    }

    shouldUseHistorical(row: Row, selectedBase: string | null, hasHistoricalValue: boolean) {
        if (row.readonly || row.formula) {
            return false;
        }

        const rule = this.priorityRules.get(row.id);

        switch (rule) {
            case 'coefficient-first':
                return false;
            case 'base-dependent':
                return hasHistoricalValue && (!selectedBase || selectedBase === 'libre');
            case 'conditional-historical':
                return hasHistoricalValue && (!selectedBase || selectedBase === 'libre');
            default:
                return hasHistoricalValue;
        }
    }
}


export const useCostSheetCalculator = ({ template, annexData }: UseCostSheetCalculatorProps) => {
  const [sections, setSections] = useState<Section[]>(template.sections);
  const [nivelProduccion, setNivelProduccion] = useState(1);
  const [cantidadProducto, setCantidadProducto] = useState(1);

  const rulesManager = new CalculationRulesManager();
  const priorityManager = new CalculationPriorityManager();

  const getAnnexTotal = useCallback((annexId: string) => {
    if (!annexData[annexId]) return 0;
    return annexData[annexId].reduce((total, row) => total + (parseFloat(row.Total) || 0), 0);
  }, [annexData]);

  const getRow = useCallback((rowId: string) => {
    for (const section of sections) {
        const row = section.rows.find(r => r.id === rowId);
        if (row) {
            return row;
        }
    }
    return null;
  }, [sections]);

  const getRowValue = useCallback((rowId: string) => {
    return getRow(rowId)?.value || 0;
  }, [getRow]);

  const updateRowValue = (rowId: string, value: number) => {
    setSections(produce(draft => {
        for (const section of draft) {
            const row = section.rows.find(r => r.id === rowId);
            if (row) {
                row.value = value;
                break;
            }
        }
    }));
  };

  const evaluateFormula = useCallback((formula: string) => {
    const sumRegex = /=sum\((.*)\)/;
    const pctRegex = /=pct\((.*), (.*)\)/;
    const round2Regex = /=round2\((.*)\)/;
    const refRegex = /ref\('([^']*)'\)/g;

    let evaluatedFormula = formula.replace(refRegex, (match, rowId) => {
        return getRowValue(rowId).toString();
    });

    if (sumRegex.test(evaluatedFormula)) {
        const matches = evaluatedFormula.match(sumRegex);
        if (matches && matches[1]) {
            const values = matches[1].split(', ').map(v => parseFloat(v) || 0);
            return values.reduce((acc, v) => acc + v, 0);
        }
    }

    if (pctRegex.test(evaluatedFormula)) {
        const matches = evaluatedFormula.match(pctRegex);
        if (matches && matches[1] && matches[2]) {
            const value = parseFloat(matches[1]) || 0;
            const percentage = parseFloat(matches[2]) || 0;
            return (value * percentage) / 100;
        }
    }

    if (round2Regex.test(evaluatedFormula)) {
        const matches = evaluatedFormula.match(round2Regex);
        if (matches && matches[1]) {
            const value = parseFloat(matches[1]) || 0;
            return Math.round(value * 100) / 100;
        }
    }

    try {
        return new Function(`return ${evaluatedFormula}`)();
    } catch (error) {
        return 0;
    }

  }, [getRowValue]);

  useEffect(() => {
    const newSections = produce(sections, draft => {
        for (const section of draft) {
            for (const row of section.rows) {
                row.value = row.defaultValue || 0;
            }
        }

        for (let i = 0; i < 5; i++) {
            for (const section of draft) {
                for (const row of section.rows) {
                    const hasHistoricalValue = row.value !== 0;
                    if (priorityManager.shouldUseHistorical(row, null, hasHistoricalValue)) {
                        continue;
                    }

                    if (row.formula) {
                        row.value = evaluateFormula(row.formula);
                    } else if (row.base?.startsWith('Anexo')) {
                        row.value = getAnnexTotal(row.base);
                    } else if (row.base) {
                        const rule = rulesManager.getRule(row.base.toLowerCase());
                        if (rule) {
                            const baseValue = getRowValue(row.base === 'insumo' ? '1.1' : '2.1');
                            const coefficient = rule.coefficientFormula(row.value, baseValue);
                            row.value = rule.totalFormula(coefficient, baseValue);
                        }
                    }
                }
            }
        }
    });
    setSections(newSections);
  }, [template, annexData, nivelProduccion, cantidadProducto]);

  return {
    sections,
    updateRowValue,
    getRowValue,
    setNivelProduccion,
    setCantidadProducto,
  };
};
