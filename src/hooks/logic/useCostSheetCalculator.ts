
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import Decimal from 'decimal.js';
import {
  CostSheetData,
  CostSheetRow,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, CostRow, RowSemanticType, FormaCalculo, BaseRef, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';

// Helper to safely evaluate a formula string for ANNEXES (keeping it simple for annex rows)
const evaluateAnnexExpression = (expression: string, rowData: any, header: any, calculatedAnnexes: any[] = []): number => {
  if (expression === undefined || expression === null || expression === '') return 0;
  if (typeof expression === 'number') return expression;

  const trimmed = String(expression).trim();
  if (trimmed === '') return 0;

  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  try {
    let expr = trimmed;
    if (expr.startsWith('=')) expr = expr.substring(1);

    const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(rowData[key] || 0));
    }
    expr = expr.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(header[key] || 0));

    expr = expr.replace(/(Total)?Anexo([IVXLC]+)/g, (match, totalPrefix, id) => {
        const targetAnnex = calculatedAnnexes.find(a => a.id === id);
        if (!targetAnnex) return '0';

        const total = targetAnnex.data.reduce((sum: number, r: any) => {
             const val = r.total || r.amount || r.depreciation_cost || r.price_total || 0;
             return sum + (typeof val === 'number' ? val : 0);
        }, 0);

        if (totalPrefix) return String(total);

        const rowClass = String(rowData.classification || '').split(' - ')[0].trim();
        if (rowClass) {
            const matches = targetAnnex.data.filter((d: any) =>
                String(d.classification || d.label || '').split(' - ')[0].trim() === rowClass
            );

            if (matches.length > 0) {
                const sum = matches.reduce((acc: number, d: any) => {
                    const val = d.total || d.amount || d.depreciation_cost || d.price_total || 0;
                    return acc + (typeof val === 'number' ? val : 0);
                }, 0);
                return String(sum);
            }
        }

        return '0';
    });

    if (!/^[0-9.+\-*/() ]+$/.test(expr)) {
        return isNaN(Number(trimmed)) ? 0 : Number(trimmed);
    }

    return new Function(`return ${expr}`)();
  } catch (error) {
    return isNaN(Number(trimmed)) ? 0 : Number(trimmed);
  }
};

export const useCostSheetCalculator = (template: CostSheetData) => {
  const [resultState, setResultState] = useState<{
      calculatedValues: { [key: string]: CalculatedRowValue };
      calculationResult: CalculationResult | null;
      audits: AuditEntry[];
      error: Error | null;
      isBlocked: boolean;
      deepValidationErrors: any[];
  }>({
      calculatedValues: {},
      calculationResult: null,
      audits: [],
      error: null,
      isBlocked: false,
      deepValidationErrors: []
  });

  const calculatedAnnexes = useMemo(() => {
    if (!template || !template.annexes) return [];

    const results: any[] = [];
    const isNumericColumn = (key: string) => {
        const lowerKey = key.toLowerCase();
        return lowerKey === 'no' ||
               lowerKey.includes('norm') ||
               lowerKey.includes('price') ||
               lowerKey.includes('value') ||
               lowerKey.includes('amount') ||
               lowerKey.includes('count') ||
               lowerKey.includes('rate') ||
               lowerKey.includes('total') ||
               lowerKey.includes('cost');
    };

    (template?.annexes || []).forEach(annex => {
      const calculatedAnnex = {
        ...annex,
        data: (annex.data || []).map(row => produce(row, (draft: any) => {
          for (const col of annex.columns) {
            if (!col.formula && isNumericColumn(col.key)) {
              const val = draft[col.key];
              if (typeof val === 'string' && val.length > 0 && isNaN(Number(val))) {
                  draft[col.key] = evaluateAnnexExpression(val, row, template?.header, results);
              }
            }
          }
          for (const col of annex.columns) {
            if (col.formula) {
              draft[col.key] = evaluateAnnexExpression(col.formula, draft, template?.header, results);
            }
          }
        }))
      };
      results.push(calculatedAnnex);
    });

    return results;
  }, [template?.annexes, template?.header]);

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    calculatedAnnexes.forEach(a => {
      const total = (a.data || []).reduce((sum: number, row: any) => {
        const val = row.total || row.amount || row.depreciation_cost || row.price_total || 0;
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);
      totals[a.id] = total;
    });
    return totals;
  }, [calculatedAnnexes]);

  useEffect(() => {
    try {
      if (!template || !template.header || !template.sections) {
          return;
      }

      const engineRows: CostRow[] = [];

      const vhSums: Record<string, number> = {};
      const calculateVH = (rows: CostSheetRow[]) => {
          (rows || []).forEach(r => {
              if (r.children && r.children.length > 0) {
                  calculateVH(r.children);
                  vhSums[r.id] = r.children.reduce((sum, child) => {
                      const val = vhSums[child.id] ?? child.valor_historico ?? 0;
                      return sum + val;
                  }, 0);
              } else {
                  vhSums[r.id] = r.valor_historico ?? 0;
              }
          });
      };
      (template?.sections || []).forEach(s => calculateVH(s?.rows));

      const flatten = (uiRows: CostSheetRow[], sectionIdx: number, parentNumbering?: string, parentId: string | null = null) => {
        (uiRows || []).forEach((r, rowIdx) => {
          const currentNumbering = parentNumbering
            ? `${parentNumbering}.${rowIdx + 1}`
            : `${sectionIdx + 1}.${rowIdx + 1}`;

          let type: RowSemanticType = 'COST';
          if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
          if (r.id === '13.2') type = 'TAX';
          if (['14', '12', '5'].includes(r.id)) type = 'TOTAL';

          let formula = r.formula;

          if (!formula && r.children && r.children.length > 0 && r.calculation_method !== 'ValorFijo') {
              formula = '=sum(children)';
          }

          let formaCalculo: FormaCalculo = 'FIJO';
          if (r.calculation_method === 'Prorrateo') formaCalculo = 'PRORRATEO';
          if (r.calculation_method === 'ANEXO') formaCalculo = 'ANEXO';
          if (r.calculation_method === 'ValorFijo') formaCalculo = 'FIJO';
          if (r.is_percent) formaCalculo = 'COEFICIENTE';
          if (formula) formaCalculo = 'FORMULA';

          let baseCalculo: BaseRef | null = null;
          const baseRefId = r.base_ref;
          if (baseRefId) {
              const isAnnex = (template?.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
              if (isAnnex) {
                  baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
                  if (r.calculation_method !== 'Prorrateo' && !r.formula) {
                      formaCalculo = 'IMPORTAR_ANEXO';
                  }
              } else {
                  baseCalculo = { type: 'FILA', classification: baseRefId };
              }
          }

          if (formula?.trim() === '=sum(children)' && r.children) {
              const validChildren = r.children.filter(c => c.id !== r.id);
              const childRefs = validChildren.map(c => `ref('${c.id}')`).join(', ');
              formula = `sum(${childRefs})`;
          }

          engineRows.push({
            id: r.id,
            parentId: parentId,
            classification: currentNumbering,
            label: r.label,
            type,
            formaCalculo,
            valorHistorico: vhSums[r.id] ?? r.valor_historico,
            baseCalculo,
            coeficiente: r.is_percent ? (r.valor_historico) : (r.coeficiente || 0),
            formula: formula,
          });

          if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id);
        });
      };
      (template?.sections || []).forEach((s, sIdx) => flatten(s?.rows, sIdx, undefined, null));

      const ficha: FichaJSON = {
        meta: {
          id: template?.header?.code || 'default',
          name: template?.header?.name || 'Ficha',
          currency: template?.header?.currency || 'CUP',
          decimals: 2,
          settings: { allowFormulas: true }
        },
        anexos: (calculatedAnnexes || []).filter((a: any) => !!a).map((a: any) => ({
          id: a.id,
          name: a.title,
          rows: (a.data || []).filter((d: any) => !!d).map((d: any) => ({
            classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
            importe: d.total || d.amount || d.depreciation_cost || d.price_total || 0
          }))
        })),
        rows: engineRows
      };

      const result = calculateFicha(ficha, { actor: 'ui-hook' });

      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      result.rows.forEach(r => {
          const rowValidationErrors = (result.deepValidationErrors || []).filter(ve => ve.rowId === r.id);

          newCalculatedValues[r.id] = {
              total: r.total,
              valor_historico: r.valorHistorico || 0,
              base_ref: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : (r.baseCalculo?.anexoId || null),
              baseTotal: r.baseTotal || 0,
              baseValorHistorico: r.baseHist || 0,
              coeficiente: r.formaCalculo === 'PRORRATEO'
                ? (r.baseHist ? (r.valorHistorico || 0) / r.baseHist : 0)
                : (r.coeficiente || 0),
              audits: r.audit,
              hasWarnings: r.audit.some(a => a.type === 'WARNING' || a.type === 'ERROR' || a.type === 'CYCLE_DETECTED') || rowValidationErrors.length > 0,
              validationErrors: rowValidationErrors.map(ve => ({
                  message: ve.message,
                  type: ve.type,
                  code: ve.code
              })),
              // Backward compatibility
              valorHistorico: r.valorHistorico || 0,
              baseDeCalculoRef: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : (r.baseCalculo?.anexoId || null),
          };
      });

      const isBlocked = (result.deepValidationErrors || []).some(e => e.type === 'CRITICAL');

      setResultState({
          calculatedValues: newCalculatedValues,
          calculationResult: result,
          audits: result.audits,
          error: null,
          isBlocked,
          deepValidationErrors: result.deepValidationErrors || []
      });
    } catch (e) {
      setResultState(prev => ({ ...prev, error: e as Error }));
      console.error("Error in unified cost calculator:", e);
    }
  }, [template, calculatedAnnexes]);

  return {
      calculatedValues: resultState.calculatedValues,
      calculatedAnnexes,
      annexTotals,
      audits: resultState.audits,
      calculationResult: resultState.calculationResult,
      error: resultState.error,
      isBlocked: resultState.isBlocked,
      deepValidationErrors: resultState.deepValidationErrors
  };
};
