/**
 * Pure function that builds an engine-ready FichaJSON from a CostSheetData template.
 *
 * CRITICAL: This must stay in sync with the mapping logic in useCostSheetCalculator.
 * Any change here must be mirrored there, and vice-versa.
 *
 * Used by: solver, simulateForVerification, useCostSheetCalculator.
 */
import { produce } from 'immer';
import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import {
  CostSheetData,
  CostSheetRow,
} from '@/types/cost-sheet';
import {
  FichaJSON,
  CostRow,
  RowSemanticType,
  FormaCalculo,
  BaseRef,
} from './types';

// ─── Annex evaluation (simplified, no cross-annex refs needed for solver) ───
const evaluateAnnexExpression = (expression: string, rowData: any, header: any, calculatedAnnexes: any[] = []): any => {
  let expr = "";
  if (expression === undefined || expression === null || expression === '') return 0;
  if (typeof expression === 'number') return expression;

  const trimmed = String(expression).trim();
  if (trimmed === '') return 0;
  if (/^-?\d*\.?\d+$/.test(trimmed)) return parseFloat(trimmed);

  try {
    expr = trimmed;
    if (expr.startsWith('=')) expr = expr.substring(1);

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
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(rowData[key] || 0));
    }
    expr = expr.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(header[key] || 0));
    expr = expr.replace(/\bcantidad\b/g, String(header.quantity || 0));
    expr = expr.replace(/\bQUANTITY\b/g, String(header.quantity || 0));

    expr = expr.replace(/(Total)?Anexo([IVXLC]+)/g, (match, totalPrefix, id) => {
      const targetAnnex = calculatedAnnexes.find(a => a.id === id);
      if (!targetAnnex) return '0';
      const total = targetAnnex.data.reduce((sum: number, r: any) => {
        const val = [r.total, r.amount, r.depreciation_cost, r.price_total, r.importe].find(v => v !== undefined && v !== null) ?? 0;
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
            const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe].find(v => v !== undefined && v !== null) ?? 0;
            return acc + (typeof val === 'number' ? val : 0);
          }, 0);
          return String(sum);
        }
      }
      return '0';
    });

    const parser = new Parser();
    parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
      new Decimal(val).toDecimalPlaces(decimals).toNumber();
    parser.functions.round = parser.functions.REDONDEO;
    return parser.evaluate(expr);
  } catch {
    return expr;
  }
};

// ─── Pure annex calculation (mirrors useCostSheetCalculator useMemo) ───
export function calculateAnnexesPure(template: CostSheetData): any[] {
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

  const isPrice = (k: string) => k === 'price_unit' || k === 'rate' || k === 'price';
  const isNorm = (k: string) => k === 'norm' || k === 'consumption' || k === 'quantity' || k === 'qty';
  // Annex II specific columns
  const isTimeNorm = (k: string) => k === 'time_norm';
  const isHourlyRate = (k: string) => k === 'hourly_rate';
  const isWorkerCount = (k: string) => k === 'worker_count';

  (template?.annexes || []).forEach(annex => {
    const isAdjActive = !!annex.isAdjustmentActive;
    const coef = isAdjActive ? (annex.coefficient !== undefined ? annex.coefficient : 1) : 1;
    const adjCol = annex.adjustmentColumn || (annex.id === 'II' ? 'HORAS MENSUALES' : 'PRECIO UNITARIO');

    const calculatedAnnex = {
      ...annex,
      data: (annex.data || []).map((row: any) => produce(row, (draft: any) => {
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
              if (isPrice(k) && typeof draft[k] === 'number') draft[k] = draft[k] * coef;
            });
          } else if (adjCol === 'NORMA DE CONSUMO') {
            Object.keys(draft).forEach(k => {
              if (isNorm(k) && typeof draft[k] === 'number') draft[k] = draft[k] * coef;
            });
          } else if (adjCol === 'HORAS MENSUALES') {
            Object.keys(draft).forEach(k => {
              if (isTimeNorm(k) && typeof draft[k] === 'number') draft[k] = draft[k] * coef;
            });
          } else if (adjCol === 'TARIFA $/H') {
            Object.keys(draft).forEach(k => {
              if (isHourlyRate(k) && typeof draft[k] === 'number') draft[k] = draft[k] * coef;
            });
          } else if (adjCol === 'CANT. OBREROS') {
            Object.keys(draft).forEach(k => {
              if (isWorkerCount(k) && typeof draft[k] === 'number') draft[k] = draft[k] * coef;
            });
          } else if (adjCol === 'VALOR' && typeof draft['value'] === 'number') {
            draft['value'] *= coef;
          } else if (adjCol === 'IMPORTE' && typeof draft['importe'] === 'number') {
            draft['importe'] *= coef;
          }
        }

        for (const col of annex.columns) {
          if (!col.formula && isNumericColumn(col.key)) {
            const val = draft[col.key];
            if (typeof val === 'string' && val.length > 0 && val.startsWith('=')) {
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
}

// ─── Pure engine Ficha builder (mirrors useCostSheetCalculator useEffect mapping) ───
export function buildEngineFicha(template: CostSheetData): FichaJSON {
  const calculatedAnnexes = calculateAnnexesPure(template);

  // Early header
  const earlyHeader = { ...template.header };

  const parser = new Parser();
  parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
    new Decimal(val).toDecimalPlaces(decimals).toNumber();
  parser.functions.round = parser.functions.REDONDEO;

  const evaluateHeaderExpression = (expression: any): any => {
    if (expression === undefined || expression === null) return '';
    if (typeof expression === 'number') return expression;
    const trimmed = String(expression).trim();
    if (!trimmed.startsWith('=')) return expression;
    let expr = trimmed.substring(1);

    expr = expr.replace(/GET_ANEXO_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, rowIndex, field) => {
      const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
      if (!targetAnnex || !targetAnnex.data) return '0';
      const index = parseInt(rowIndex) - 1;
      if (index >= 0 && index < targetAnnex.data.length) return String(targetAnnex.data[index][field] ?? 0);
      return '0';
    });

    expr = expr.replace(/GET_ANEXO_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g, (_, anexoId, classification, field) => {
      const targetAnnex = calculatedAnnexes.find(a => a.id === anexoId);
      if (!targetAnnex) return '0';
      const matches = targetAnnex.data.filter((d: any) =>
        String(d.classification || d.label || '').split(' - ')[0].trim() === classification
      );
      if (matches.length > 0) return String(matches[0][field] ?? 0);
      return '0';
    });

    const headerKeys = Object.keys(earlyHeader).sort((a, b) => b.length - a.length);
    for (const key of headerKeys) {
      if (key !== 'quantity') {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(earlyHeader[key] || 0));
      }
    }

    return parser.evaluate(expr);
  };

  // Evaluate early header fields
  ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
    const val = (earlyHeader as any)[field];
    if (typeof val === 'string' && val.startsWith('=')) {
      (earlyHeader as any)[field] = evaluateHeaderExpression(val);
    }
  });

  // Pre-calculate recursive Valor Histórico for parents
  const vhSums: Record<string, number> = {};
  const calculateVH = (rows: CostSheetRow[]) => {
    (rows || []).forEach(r => {
      if (r.children && r.children.length > 0) {
        calculateVH(r.children);
        // When solver/external code pins a value (calculationMethod = ValorFijo/FIJO/MANUAL),
        // respect r.valorHistorico instead of summing children.
        const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(r.calculationMethod || '');
        if (isFixedValue) {
          vhSums[r.id] = r.valorHistorico ?? r.value ?? 0;
        } else {
          vhSums[r.id] = r.children.reduce((sum, child) => {
            const val = vhSums[child.id] ?? child.valorHistorico ?? child.value ?? 0;
            return sum + val;
          }, 0);
        }
      } else {
        vhSums[r.id] = r.valorHistorico ?? r.value ?? 0;
      }
    });
  };
  (template?.sections || []).forEach(s => {
    calculateVH(s?.rows);
    vhSums[s.id] = (s.rows || []).reduce((sum, r) => sum + (vhSums[r.id] || 0), 0);
  });

  // Build engine rows
  const engineRows: CostRow[] = [];

  const flatten = (
    uiRows: CostSheetRow[],
    sectionIdx: number,
    parentNumbering?: string,
    parentId: string | null = null,
    isParentAffected = false
  ) => {
    (uiRows || []).forEach((r, rowIdx) => {
      const currentNumbering = parentNumbering
        ? `${parentNumbering}.${rowIdx + 1}`
        : `${sectionIdx + 1}.${rowIdx + 1}`;

      let type: RowSemanticType = 'COST';
      if (['13', '13.1', '13.2'].includes(r.id)) type = 'MARGIN';
      if ((r.id === '13.2' || r.id === '13.3')) type = 'TAX';
      if (['14', '14.1', '12', '12.1', '5'].includes(r.id)) type = 'TOTAL';

      let formula = r.totalFormula || r.formula;
      const isParent = r.children && r.children.length > 0;
      // When solver/external code pins a value (calculationMethod = ValorFijo/FIJO/MANUAL),
      // do NOT auto-assign sum(children) — respect the cleared formula and fixed value.
      const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(r.calculationMethod || '');
      if (isParent && !isFixedValue) formula = '=sum(children)';

      let formaCalculo: FormaCalculo = 'FIJO';
      const method = r.calculationMethod || '';
      if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
      if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
      if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';
      // is_percent must NOT override an explicit ValorFijo calculationMethod
      if (r.is_percent && !['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'COEFICIENTE';
      // Only override to FORMULA if the formula is meaningful (not auto-generated for a pinned row)
      if (formula && !isFixedValue) formaCalculo = 'FORMULA';

      let baseCalculo: BaseRef | null = null;
      const baseRefId = r.baseDeCalculoRef || r.base_ref;
      if (baseRefId) {
        const isAnnex = (template?.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
        if (isAnnex) {
          baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
          if (r.calculationMethod !== 'Prorrateo' && !r.formula && !r.totalFormula) {
            formaCalculo = 'IMPORTAR_ANEXO';
          }
        } else {
          baseCalculo = { type: 'FILA', classification: baseRefId };
        }
      }

      if (formula?.trim() === '=sum(children)' || formula?.trim() === 'sum(children)') {
        formula = 'sum(children)';
      }

      // Indirect configuration
      let finalFormula = formula;
      const sectionIdStr = template?.sections[sectionIdx]?.id || (sectionIdx + 1 + '');
      const isSectionSelected = template?.indirectConfig?.selectedSections?.includes(sectionIdStr);
      const isBaseSection = sectionIdStr === template?.indirectConfig?.baseSection;
      const isAffected = (isParentAffected || isSectionSelected || template?.indirectConfig?.selectedSections?.includes(r.id)) && !isBaseSection;

      if (isAffected && !isParent) {
        const config = template?.indirectConfig;
        if (config?.mode === 'fixed') {
          const selectedIds = config.selectedSections || [];
          const totalSelected = selectedIds.reduce((sum, id) => sum + (vhSums[id] || 0), 0);
          const rowWeight = totalSelected > 0 ? (vhSums[r.id] || 0) / totalSelected : 0;
          const fixedPart = (config.fixedAmount || 0) * rowWeight;
          if (fixedPart > 0) {
            const baseVal = finalFormula ? `(${finalFormula.startsWith('=') ? finalFormula.substring(1) : finalFormula})` : 'VH';
            finalFormula = `${baseVal} + ${fixedPart.toFixed(4)}`;
            formaCalculo = 'FORMULA';
          }
        } else {
          const coef = config?.coefficient || 1;
          if (coef !== 1) {
            const baseVal = finalFormula ? `(${finalFormula.startsWith('=') ? finalFormula.substring(1) : finalFormula})` : 'VH';
            finalFormula = `${baseVal} * ${coef}`;
            formaCalculo = 'FORMULA';
          }
        }
      }

      engineRows.push({
        id: r.id,
        parentId,
        // Use r.id (NOT r.classification) — this is the canonical lookup for ref()
        classification: r.id || currentNumbering,
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
        metadata: {
          ...(r.metadata || {}),
          appliedFormula: finalFormula,
          isIndirectAffected: isAffected,
        },
      });

      if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id, isAffected);
    });
  };
  (template?.sections || []).forEach((s, sIdx) => flatten(s?.rows, sIdx, undefined, null));

  const ficha: FichaJSON = {
    meta: {
      ...earlyHeader,
      id: earlyHeader?.code || 'default',
      name: earlyHeader?.name || 'Ficha',
      currency: earlyHeader?.currency || 'CUP',
      decimals: 2,
      quantity: earlyHeader?.quantity || 0,
      settings: { allowFormulas: true },
    },
    anexos: (calculatedAnnexes || [])
      .filter((a: any) => !!a)
      .map((a: any) => ({
        id: a.id,
        name: a.title,
        rows: (a.data || [])
          .filter((d: any) => !!d)
          .map((d: any) => ({
            ...d,
            classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
            importe: (() => {
              const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe].find(v => v !== undefined && v !== null);
              return parseFloat(String(val ?? 0)) || 0;
            })(),
          })),
      })),
    rows: engineRows,
  };

  return ficha;
}

/**
 * Full pipeline: build Ficha + calculate. Returns the engine CalculationResult.
 */
export async function fullEngineCalc(template: CostSheetData): Promise<import('./types').CalculationResult> {
  const ficha = buildEngineFicha(template);
  const { calculateFicha } = await import('./index');
  return calculateFicha(ficha, { actor: 'solver-verification' });
}
