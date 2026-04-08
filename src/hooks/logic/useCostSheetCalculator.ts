
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import {
  CostSheetData,
  CostSheetRow,
  CostSheetColumn,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, CostRow, Anexo, RowSemanticType, FormaCalculo, BaseRef, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';
import { calculateCostSheetHealth, ValidationResult } from '@/lib/cost-engine/validations';

// Helper to safely evaluate a formula string for ANNEXES (keeping it simple for annex rows)
const evaluateAnnexExpression = (expression: string, rowData: any, header: any, calculatedAnnexes: any[] = []): any => {
  let expr = "";
  if (expression === undefined || expression === null || expression === '') return 0;

  // If it's already a number, return it
  if (typeof expression === 'number') return expression;

  const trimmed = String(expression).trim();
  if (trimmed === '') return 0;

  // If it's a simple number in a string, parse it
  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  try {
    // Simple replacement for annex row variables
    expr = trimmed;
    if (expr.startsWith('=')) expr = expr.substring(1);

    // Support GET_ANEXO_DATO and GET_FILA_DATO even in annexes for consistency
    // But since annexes are calculated first, GET_FILA_DATO might be limited here

    // GET_ANEXO_FILA_DATO(anexoId, rowIndex, field) - 1-based index
    expr = expr.replace(/GET_ANEXO_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, rowIndex, field) => {
        const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
        if (!targetAnnex || !targetAnnex.data) return '0';
        const index = parseInt(rowIndex) - 1;
        if (index >= 0 && index < targetAnnex.data.length) {
            const val = targetAnnex.data[index][field];
            return String(val ?? 0);
        }
        return '0';
    });

    expr = expr.replace(/GET_ANEXO_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, classification, field) => {
        const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
        if (!targetAnnex) return '0';
        const matches = targetAnnex.data.filter((d: any) =>
            String(d.classification || d.label || '').split(' - ')[0].trim() === classification
        );
        if (matches.length > 0) {
            const sum = matches.reduce((acc: number, d: any) => acc + (parseFloat(d[field]) || 0), 0);
            return String(sum);
        }
        return '0';
    });

    const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      // Avoid replacing the key if it's currently being evaluated (prevents some recursion issues)
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(rowData[key] || 0));
    }
    // Header replacements
    expr = expr.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(header[key] || 0));

    // Cantidad replacement
    expr = expr.replace(/\bcantidad\b/g, String(header.quantity || 0));
    expr = expr.replace(/\bQUANTITY\b/g, String(header.quantity || 0));

    // Annex replacements (e.g. AnexoI) with Smart Resolve
    // Note: We also handle TotalAnexo[ID] here for explicit total access
    expr = expr.replace(/(Total)?Anexo([IVXLC]+)/g, (match, totalPrefix, id) => {
        const targetAnnex = calculatedAnnexes.find(a => a.id === id);
        if (!targetAnnex) return '0';

        // Calculate total regardless (used for fallback or explicit TotalAnexo request)
        const total = targetAnnex.data.reduce((sum: number, r: any) => {
             const val = [ r.total, r.amount, r.depreciation_cost, r.price_total, r.importe ].find(v => v !== undefined && v !== null) ?? 0;
             return sum + (typeof val === 'number' ? val : 0);
        }, 0);

        if (totalPrefix) return String(total);

        // Smart Resolve: if current row has a classification, try to get the specific sum for that class in this annex
        const rowClass = String(rowData.classification || '').split(' - ')[0].trim();
        if (rowClass) {
            const matches = targetAnnex.data.filter((d: any) =>
                String(d.classification || d.label || '').split(' - ')[0].trim() === rowClass
            );

            if (matches.length > 0) {
                const sum = matches.reduce((acc: number, d: any) => {
                    const val = [ d.total, d.amount, d.depreciation_cost, d.price_total, d.importe ].find(v => v !== undefined && v !== null) ?? 0;
                    return acc + (typeof val === 'number' ? val : 0);
                }, 0);
                return String(sum);
            }
        }

        // Removed fallback to total to match engine logic
        return '0';
    });

    // Advanced arithmetic evaluation with expr-eval
    const parser = new Parser();
    parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
        return new Decimal(val).toDecimalPlaces(decimals).toNumber();
    };
    parser.functions.round = parser.functions.REDONDEO;
    return parser.evaluate(expr);
  } catch (error) {
    // Return processed expr if evaluation fails
    return expr;
  }
};

const evaluateHeaderExpression = (
    expression: any,
    header: any,
    calculatedAnnexes: any[] = [],
    calculatedValues: { [key: string]: CalculatedRowValue } = {}
): any => {
    if (expression === undefined || expression === null) return '';
    if (typeof expression === 'number') return expression;
    const trimmed = String(expression).trim();
    if (!trimmed.startsWith('=')) return expression;

    let expr = '';
    try {
        expr = trimmed.substring(1);

        /**
         * GET_ANEXO_FILA_DATO(anexoId, rowIndex, field)
         * Retrieves a specific field from an annex row by its 1-based index.
         * Useful for automatic header population from the first row of an annex.
         */
        expr = expr.replace(/GET_ANEXO_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, rowIndex, field) => {
            const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
            if (!targetAnnex || !targetAnnex.data) return '0';
            const index = parseInt(rowIndex) - 1;
            if (index >= 0 && index < targetAnnex.data.length) {
                const val = targetAnnex.data[index][field];
                return String(val ?? 0);
            }
            return '0';
        });

        // GET_ANEXO_DATO(anexoId, classification, field)
        expr = expr.replace(/GET_ANEXO_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, classification, field) => {
            const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
            if (!targetAnnex) {
                return '0';
            }
            const matches = targetAnnex.data.filter((d: any) =>
                String(d.classification || d.label || '').split(' - ')[0].trim() === classification
            );
            if (matches.length > 0) {
                const val = matches[0][field];
                return String(val ?? 0);
            }
            return '0';
        });

        // GET_FILA_DATO(search, field)
        expr = expr.replace(/GET_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g, (_, search, field) => {
            const val = Object.values(calculatedValues).find(v => v.metadata?.id === search || v.metadata?.classification === search);
            if (val) {
                return String((val as any)[field] || 0);
            }
            const directVal = calculatedValues[search];
            if (directVal) {
                return String((directVal as any)[field] || 0);
            }
            return '0';
        });

        // ref('...') and vh('...') support in header
        expr = expr.replace(/\b(ref|vh)\(['"]([^'"]+)['"]\)/g, (_, fn, search) => {
            const field = fn === 'ref' ? 'total' : 'calculatedVH';
            const val = Object.values(calculatedValues).find(v => v.metadata?.id === search || v.metadata?.classification === search);
            if (val) return String((val as any)[field] || 0);
            const directVal = calculatedValues[search];
            if (directVal) return String((directVal as any)[field] || 0);
            return '0';
        });

        // Replace other header variables
        const headerKeys = Object.keys(header).sort((a, b) => b.length - a.length);
        for (const key of headerKeys) {
            if (key !== 'quantity') { // handle quantity separately to avoid circularity if it's the one being evaluated
                expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(header[key] || 0));
            }
        }

        // Advanced arithmetic evaluation with expr-eval
        const parser = new Parser();
        parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
            return new Decimal(val).toDecimalPlaces(decimals).toNumber();
        };
        // Also map standard round for compatibility
        parser.functions.round = parser.functions.REDONDEO;

        return parser.evaluate(expr);
    } catch (e) {
        return expr;
    }
};

export const useCostSheetCalculator = (template: CostSheetData) => {
  const [resultState, setResultState] = useState<{
      calculatedValues: { [key: string]: CalculatedRowValue };
      calculatedHeader: any | null;
      calculationResult: CalculationResult | null;
      audits: AuditEntry[];
      validations: ValidationResult[];
      healthPercent: number;
      error: Error | null;
      isBlocked: boolean;
      deepValidationErrors: any[];
  }>({
      calculatedValues: {},
      calculatedHeader: null,
      calculationResult: null,
      audits: [],
      validations: [],
      healthPercent: 100,
      error: null,
      isBlocked: false,
      deepValidationErrors: []
  });

  // 1. Calculate Annexes first (internal formulas)
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
      const isAdjActive = !!annex.isAdjustmentActive;
      const coef = isAdjActive ? (annex.coefficient !== undefined ? annex.coefficient : 1) : 1;
      const adjCol = annex.adjustmentColumn || 'PRECIO UNITARIO';

      const isPrice = (k: string) => k === 'price_unit' || k === 'rate' || k === 'price';
      const isNorm = (k: string) => k === 'norm' || k === 'consumption' || k === 'quantity' || k === 'qty';

      const calculatedAnnex = {
        ...annex,
        data: (annex.data || []).map(row => produce(row, (draft: any) => {
          // A. Apply coefficient to base columns (simulation)
          if (coef !== 1) {
              if (adjCol === 'AMBOS') {
                  const sqrt = Math.sqrt(coef);
                  Object.keys(draft).forEach(k => {
                      if ((isPrice(k) || isNorm(k)) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * sqrt;
                      }
                  });
              } else if (adjCol === 'PRECIO UNITARIO') {
                  Object.keys(draft).forEach(k => {
                      if (isPrice(k) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * coef;
                      }
                  });
              } else if (adjCol === 'NORMA DE CONSUMO') {
                  Object.keys(draft).forEach(k => {
                      if (isNorm(k) && typeof draft[k] === 'number') {
                          draft[k] = draft[k] * coef;
                      }
                  });
              } else if (adjCol === 'VALOR' && typeof draft['value'] === 'number') {
                  draft['value'] *= coef;
              } else if (adjCol === 'IMPORTE' && typeof draft['importe'] === 'number') {
                  draft['importe'] *= coef;
              }
          }

          // B. Then, pass through non-formula columns to see if they contain manual formulas
          for (const col of annex.columns) {
            if (!col.formula && isNumericColumn(col.key)) {
              const val = draft[col.key];
              if (typeof val === 'string' && val.length > 0) {
                  // Only evaluate if it looks like a formula (starts with =)
                  // Otherwise, if it's just a string like "FC-999", keep it as is
                  if (val.startsWith('=')) {
                      draft[col.key] = evaluateAnnexExpression(val, row, template?.header, results);
                  }
              }
            }
          }

          // Then apply column-level formulas
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
        const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null) ?? 0;
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);
      totals[a.id] = total;
    });
    return totals;
  }, [calculatedAnnexes]);

  // 2. Run the declarative Engine for the main rows
  useEffect(() => {
    try {
      if (!template || !template.header || !template.sections) {
          return;
      }

      // --- Calculate Early Header ---
      const earlyHeader = { ...template.header };

      // 1. Evaluate early formulas first (name, code, product_code, unit, quantity)
      ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
          const val = (earlyHeader as any)[field];
          if (typeof val === 'string' && val.startsWith('=')) {
              (earlyHeader as any)[field] = evaluateHeaderExpression(val, earlyHeader, calculatedAnnexes, {});
          }
      });

      // 2. Automatic % Capacidad (Quantity / Nivel Prod) - AFTER quantity formula is evaluated
      const qVal = parseFloat(String(earlyHeader.quantity));
      const pVal = parseFloat(String(earlyHeader.production_level));
      if (!isNaN(qVal) && !isNaN(pVal) && pVal !== 0) {
          earlyHeader.capacity_utilization = Number(((qVal / pVal) * 100).toFixed(2));
      }

      // Map UI state to Engine-compatible JSON
      const engineRows: CostRow[] = [];

      // Pre-calculate recursive Valor Histórico for parents
      const vhSums: Record<string, number> = {};
      const calculateVH = (rows: CostSheetRow[]) => {
          (rows || []).forEach(r => {
              if (r.children && r.children.length > 0) {
                  calculateVH(r.children);
                  vhSums[r.id] = r.children.reduce((sum, child) => {
                      const val = vhSums[child.id] ?? child.valorHistorico ?? child.value ?? 0;
                      return sum + val;
                  }, 0);
              } else {
                  vhSums[r.id] = r.valorHistorico ?? r.value ?? 0;
              }
          });
      };
      (template?.sections || []).forEach(s => calculateVH(s?.rows));

      const flatten = (uiRows: CostSheetRow[], sectionIdx: number, parentNumbering?: string, parentId: string | null = null) => {
        (uiRows || []).forEach((r, rowIdx) => {
          // Calculate visual numbering (e.g. "1.1", "1.1.1")
          const currentNumbering = parentNumbering
            ? `${parentNumbering}.${rowIdx + 1}`
            : `${sectionIdx + 1}.${rowIdx + 1}`;

          // Infer semantic type
          let type: RowSemanticType = 'COST';
          if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
          if (r.id === '13.2') type = 'TAX';
          if (['14', '12', '5'].includes(r.id)) type = 'TOTAL';

          // Map calculation method
          let formula = r.formula || r.totalFormula;
          const isParent = r.children && r.children.length > 0;

          // Enforce sum(children) for parents
          if (isParent) {
              formula = '=sum(children)';
          }

          let formaCalculo: FormaCalculo = 'FIJO';
          const method = r.calculationMethod || '';
          if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
          if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
          if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';
          if (r.is_percent) formaCalculo = 'COEFICIENTE';
          if (formula) formaCalculo = 'FORMULA';

          // Base Calculation mapping
          let baseCalculo: BaseRef | null = null;
          const baseRefId = r.baseDeCalculoRef || r.base_ref;
          if (baseRefId) {
              // Check if it's an Annex ID (match explicit annexes or Roman numerals)
              const isAnnex = (template?.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
              if (isAnnex) {
                  baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
                  // If pointing to annex without specific formula, it's an import
                  if (r.calculationMethod !== 'Prorrateo' && !r.formula && !r.totalFormula) {
                      formaCalculo = 'IMPORTAR_ANEXO';
                  }
              } else {
                  baseCalculo = { type: 'FILA', classification: baseRefId };
              }
          }

          // Map =sum(children) to a specific engine-compatible formula
          // The engine now handles 'children' keyword natively in context
          if (formula?.trim() === '=sum(children)' || formula?.trim() === 'sum(children)') {
              formula = 'sum(children)';
          }

          // Apply Indirect Coefficient if enabled
          let finalFormula = formula;
          if (template?.indirectConfig?.selectedSections?.includes(sectionIdx + 1 + '') || template?.indirectConfig?.selectedSections?.includes(r.id)) {
              const coef = template?.indirectConfig?.coefficient || 1;
              if (coef !== 1) {
                  if (finalFormula && finalFormula !== 'sum(children)') {
                      finalFormula = `(${finalFormula.startsWith('=') ? finalFormula.substring(1) : finalFormula}) * ${coef}`;
                  } else if (r.calculationMethod === 'ValorFijo' || !finalFormula) {
                      finalFormula = `${r.value || 0} * ${coef}`;
                      formaCalculo = 'FORMULA';
                  }
              }
          }

          engineRows.push({
            id: r.id,
            parentId: parentId, // Correctly pass parentId for semantic validation
            classification: currentNumbering, // Use visual numbering for smart matching
            label: r.label,
            um: r.um || r.unit,
            type,
            formaCalculo,
            valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value,
            vhFormula: r.vhFormula,
            baseCalculo,
            coeficiente: r.is_percent ? (r.value ?? r.valorHistorico) : r.coeficiente,
            formula: finalFormula,
            fuente: r.note || r.fuente,
            metadata: { ...(r.metadata || {}), appliedFormula: finalFormula }
          });

          if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id);
        });
      };
      (template?.sections || []).forEach((s, sIdx) => flatten(s?.rows, sIdx, undefined, null));

      // Handle Section 13/14 Hard Rules mapping from UI to Engine types if needed
      // Engine already has some hardcoded IDs for Margin and Tax

      const ficha: FichaJSON = {
        meta: {
          ...earlyHeader,
          id: earlyHeader?.code || 'default',
          name: earlyHeader?.name || 'Ficha',
          currency: earlyHeader?.currency || 'CUP',
          decimals: 2,
          quantity: earlyHeader?.quantity || 0,
          settings: { allowFormulas: true }
        },
        anexos: (calculatedAnnexes || []).filter((a: any) => !!a).map((a: any) => ({
          id: a.id,
          name: a.title,
          rows: (a.data || []).filter((d: any) => !!d).map((d: any) => ({
            ...d,
            // Normalize classification by taking the prefix before ' - ' (e.g. "1.1 - Insumos" -> "1.1")
            classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
            importe: (() => { const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe].find(v => v !== undefined && v !== null); return (parseFloat(String(val ?? 0)) || 0); })()
          }))
        })),
        rows: engineRows
      };

      // Execute Engine
      const result = calculateFicha(ficha, { actor: 'ui-hook' });

      // Map back to UI values
      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      result.rows.forEach(r => {
          const rowValidationErrors = (result.deepValidationErrors || []).filter(ve => ve.rowId === r.id);

          newCalculatedValues[r.id] = {
              total: r.total,
              valorHistorico: r.valorHistorico || 0,
              calculatedVH: r.calculatedVH,
              baseDeCalculoRef: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : (r.baseCalculo?.anexoId || null),
              baseTotal: r.baseTotal || 0,
              baseValorHistorico: r.baseHist || 0,
              coeficiente: r.formaCalculo === 'PRORRATEO'
                ? (r.baseHist ? (r.valorHistorico || 0) / r.baseHist : 0)
                : (r.coeficiente || 0),
              fuente: r.fuente,
              metadata: { ...(r.metadata || {}), appliedFormula: finalFormula },
              audits: r.audit,
              hasWarnings: r.audit.some(a => a.type === 'WARNING' || a.type === 'ERROR' || a.type === 'CYCLE_DETECTED') || rowValidationErrors.length > 0,
              validationErrors: rowValidationErrors.map(ve => ({
                  message: ve.message,
                  type: ve.type,
                  code: ve.code
              }))
          };
      });

      const isBlocked = (result.deepValidationErrors || []).some(e => e.type === 'CRITICAL');

      // --- Calculate Late Header ---
      const finalHeader = { ...earlyHeader };
      if (typeof finalHeader.sale_price === 'string' && String(finalHeader.sale_price).startsWith('=')) {
          finalHeader.sale_price = evaluateHeaderExpression(finalHeader.sale_price, finalHeader, calculatedAnnexes, newCalculatedValues);
      }

      // Ensure the calculation result contains the final calculated header for export purposes
      const finalResult = {
          ...result,
          metadata: {
              ...(result.metadata || {}),
              header: finalHeader
          }
      };

      // Calculate health validations
      const health = calculateCostSheetHealth(template, newCalculatedValues, finalHeader);

      setResultState({
          calculatedValues: newCalculatedValues,
          calculatedHeader: finalHeader,
          calculationResult: finalResult,
          audits: result.audits,
          validations: health.validations,
          healthPercent: health.healthPercent,
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
      calculatedHeader: resultState.calculatedHeader || template?.header,
      calculatedAnnexes,
      annexTotals,
      audits: resultState.audits,
      validations: resultState.validations,
      healthPercent: resultState.healthPercent,
      calculationResult: resultState.calculationResult,
      error: resultState.error,
      isBlocked: resultState.isBlocked,
      deepValidationErrors: resultState.deepValidationErrors
  };
};
