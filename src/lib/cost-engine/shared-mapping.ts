/**
 * Shared mapping logic between useCostSheetCalculator (client hook)
 * and build-ficha (server pure function).
 *
 * CRITICAL: All changes to mapping/engine-row-building logic must be made HERE.
 * Both useCostSheetCalculator and build-ficha consume these shared functions,
 * so a single edit propagates to both client and server.
 *
 * Contains pure functions only — no React hooks, no state.
 */
import Decimal from 'decimal.js';
import { produce } from 'immer';
import { createSafeParser } from './parser-factory';
import type { Parser } from 'expr-eval';
import { isSimpleAnnexRef } from './formula-classifier';
import {
  CostSheetData,
  CostSheetRow,
  CostSheetHeader,
  CostSheetSection,
  CostSheetAnnex,
  CalculatedRowValue,
} from '@/types/cost-sheet';
import {
  FichaJSON,
  CostRow,
  RowSemanticType,
  FormaCalculo,
  BaseRef,
} from './types';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface AnnexDataRow {
  [key: string]: string | number | boolean | undefined;
  classification?: string;
  label?: string;
  total?: number;
  amount?: number;
  importe?: number;
  depreciation_cost?: number;
  price_total?: number;
}

interface CalculatedAnnex extends Omit<CostSheetAnnex, 'data'> {
  data: AnnexDataRow[];
}

// ─── Parser Factory ───────────────────────────────────────────────────────────

export function createSharedParser(): Parser {
  return createSafeParser();
}

// ─── Annex Expression Evaluation ─────────────────────────────────────────────

export function evaluateAnnexExpressionShared(
  expression: string,
  rowData: Record<string, unknown>,
  header: CostSheetHeader,
  calculatedAnnexes: CalculatedAnnex[],
  parser?: Parser,
  _warnings?: string[], // ISO 9001 §8.5.2 — error logging for corrective actions
): number {
  const p = parser || createSharedParser();

  if (expression === undefined || expression === null || expression === '') return 0;
  if (typeof expression === 'number') return expression;

  const trimmed = String(expression).trim();
  if (trimmed === '') return 0;
  if (/^-?\d*\.?\d+$/.test(trimmed)) return parseFloat(trimmed);

  let expr = trimmed;
  if (expr.startsWith('=')) expr = expr.substring(1);

  try {
    // GET_ANEXO_FILA_DATO(anexoId, rowIndex, field) — 1-based index
    expr = expr.replace(
      /GET_ANEXO_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\)/g,
      (_, anexoId, rowIndex, field) => {
        const targetAnnex = calculatedAnnexes.find((a: CalculatedAnnex) => a.id === anexoId);
        if (!targetAnnex || !targetAnnex.data) return '0';
        const index = parseInt(rowIndex) - 1;
        if (index >= 0 && index < targetAnnex.data.length) {
          const val = targetAnnex.data[index][field];
          return typeof val === 'string' ? JSON.stringify(val) : String(val ?? 0);
        }
        return '0';
      },
    );

    // GET_ANEXO_DATO(anexoId, classification, field)
    expr = expr.replace(
      /GET_ANEXO_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g,
      (_, anexoId, classification, field) => {
        const targetAnnex = calculatedAnnexes.find((a: CalculatedAnnex) => a.id === anexoId);
        if (!targetAnnex) return '0';
        const matches = targetAnnex.data.filter((d: AnnexDataRow) =>
          String(d.classification || d.label || '').split(' - ')[0].trim() === classification,
        );
        if (matches.length > 0) {
          const sum = matches.reduce(
            (acc: number, d: AnnexDataRow) => acc + (parseFloat(String(d[field])) || 0),
            0,
          );
          return String(sum);
        }
        return '0';
      },
    );

    // Row data variable replacements
    const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(rowData[key] || 0));
    }

    // Header replacements
    expr = expr.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(header[key] || 0));
    expr = expr.replace(/\bcantidad\b/g, String(header.quantity || 0));
    expr = expr.replace(/\bQUANTITY\b/g, String(header.quantity || 0));
    expr = expr.replace(/\bquantity\b/g, String(header.quantity || 0));

    // Annex replacements (e.g. AnexoI) with Smart Resolve
    // Also handles TotalAnexo[ID] for explicit total access
    expr = expr.replace(/(Total)?Anexo([IVXLC]+)/g, (_match, totalPrefix: string | undefined, id: string) => {
      const targetAnnex = calculatedAnnexes.find((a: CalculatedAnnex) => a.id === id);
      if (!targetAnnex) return '0';

      // Calculate total (used for fallback or explicit TotalAnexo request)
      const total = targetAnnex.data.reduce((sum: number, r: AnnexDataRow) => {
        const val = [r.total, r.amount, r.depreciation_cost, r.price_total, r.importe].find(
          (v: string | number | boolean | undefined) => v !== undefined && v !== null,
        ) ?? 0;
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);

      if (totalPrefix) return String(total);

      // Smart Resolve: if current row has a classification, try to get the specific sum for that class
      const rowClass = String(rowData.classification || '').split(' - ')[0].trim();
      if (rowClass) {
        const matches = targetAnnex.data.filter((d: AnnexDataRow) =>
          String(d.classification || d.label || '').split(' - ')[0].trim() === rowClass,
        );
        if (matches.length > 0) {
          const sum = matches.reduce((acc: number, d: AnnexDataRow) => {
            const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe].find(
              (v: string | number | boolean | undefined) => v !== undefined && v !== null,
            ) ?? 0;
            return acc + (typeof val === 'number' ? val : 0);
          }, 0);
          return String(sum);
        }
      }

      return '0';
    });

    return p.evaluate(expr);
  } catch (e) {
    const msg = `[AnnexEval] Failed: "${expression.substring(0, 50)}" — ${e instanceof Error ? e.message : String(e)}`;
    if (_warnings) _warnings.push(msg);
    else console.debug(msg); // Only log in dev, don't pollute production
    return 0;
  }
}

// ─── Header Expression Evaluation ────────────────────────────────────────────

export function evaluateHeaderExpressionShared(
  expression: string | number | undefined | null,
  header: CostSheetHeader,
  calculatedAnnexes: CalculatedAnnex[] = [],
  calculatedValues: Record<string, CalculatedRowValue> = {},
  parser?: Parser,
): string | number {
  const p = parser || createSharedParser();

  if (expression === undefined || expression === null) return '';
  if (typeof expression === 'number') return expression;
  const trimmed = String(expression).trim();
  if (!trimmed.startsWith('=')) return expression;

  let expr = trimmed.substring(1);

  try {
    /**
     * GET_ANEXO_FILA_DATO(anexoId, rowIndex, field)
     * Retrieves a specific field from an annex row by its 1-based index.
     */
    expr = expr.replace(
      /GET_ANEXO_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\)/g,
      (_, anexoId, rowIndex, field) => {
        const targetAnnex = calculatedAnnexes.find((a: CalculatedAnnex) => a.id === anexoId);
        if (!targetAnnex || !targetAnnex.data) return '0';
        const index = parseInt(rowIndex) - 1;
        if (index >= 0 && index < targetAnnex.data.length) {
          const val = targetAnnex.data[index][field];
          return typeof val === 'string' ? JSON.stringify(val) : String(val ?? 0);
        }
        return '0';
      },
    );

    // GET_ANEXO_DATO(anexoId, classification, field)
    expr = expr.replace(
      /GET_ANEXO_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g,
      (_, anexoId, classification, field) => {
        const targetAnnex = calculatedAnnexes.find((a: CalculatedAnnex) => a.id === anexoId);
        if (!targetAnnex) return '0';
        const matches = targetAnnex.data.filter((d: AnnexDataRow) =>
          String(d.classification || d.label || '').split(' - ')[0].trim() === classification,
        );
        if (matches.length > 0) {
          const val = matches[0][field];
          return typeof val === 'string' ? JSON.stringify(val) : String(val ?? 0);
        }
        return '0';
      },
    );

    // GET_FILA_DATO(search, field)
    expr = expr.replace(
      /GET_FILA_DATO\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g,
      (_, search, field) => {
        const val = Object.values(calculatedValues).find(
          (v: CalculatedRowValue) => v.metadata?.id === search || v.metadata?.classification === search,
        );
        if (val) return String((val as unknown as Record<string, unknown>)[field] || 0);
        const directVal = calculatedValues[search];
        if (directVal) return String((directVal as unknown as Record<string, unknown>)[field] || 0);
        return '0';
      },
    );

    // ref('...') and vh('...') support in header
    expr = expr.replace(/\b(ref|vh)\(['"]([^'"]+)['"]\)/g, (_, fn, search) => {
      const field = fn === 'ref' ? 'total' : 'calculatedVH';
      const val = Object.values(calculatedValues).find(
        (v: CalculatedRowValue) => v.metadata?.id === search || v.metadata?.classification === search,
      );
      if (val) return String((val as unknown as Record<string, unknown>)[field] || 0);
      const directVal = calculatedValues[search];
      if (directVal) return String((directVal as unknown as Record<string, unknown>)[field] || 0);
      return '0';
    });

    // Replace header variables
    const headerKeys = Object.keys(header).sort((a, b) => b.length - a.length);
    for (const key of headerKeys) {
      if (key !== 'quantity') {
        // handle quantity separately to avoid circularity if it's the one being evaluated
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(header[key] || 0));
      }
    }

    return p.evaluate(expr);
  } catch (e) {
    const msg = `[HeaderEval] Failed: "${String(expression).substring(0, 50)}" — ${e instanceof Error ? e.message : String(e)}`;
    console.debug(msg); // Only log in dev, don't pollute production
    return 0;
  }
}

// ─── Internal Helpers for Annex Calculation ───────────────────────────────────

function isNumericColumn(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    lowerKey === 'no' ||
    lowerKey.includes('norm') ||
    lowerKey.includes('price') ||
    lowerKey.includes('value') ||
    lowerKey.includes('amount') ||
    lowerKey.includes('count') ||
    lowerKey.includes('rate') ||
    lowerKey.includes('total') ||
    lowerKey.includes('cost')
  );
}

const isPrice = (k: string) => {
  const lower = k.toLowerCase();
  return k === 'price_unit' || k === 'rate' || k === 'price' || k === 'precio' ||
         lower.includes('price') || lower.includes('rate') || lower.includes('tarifa');
};
const isNorm = (k: string) => {
  const lower = k.toLowerCase();
  return k === 'norm' || k === 'consumption' || k === 'quantity' || k === 'qty' || k === 'norma' ||
         lower.includes('norm') || lower.includes('consumption');
};
const isTimeNorm = (k: string) => k === 'time_norm';
const isHourlyRate = (k: string) => k === 'hourly_rate';
const isWorkerCount = (k: string) => k === 'worker_count';

// ─── Pure Annex Calculation ─────────────────────────────────────────────────

export function calculateAnnexesPure(template: CostSheetData, parser?: Parser): CalculatedAnnex[] {
  if (!template || !template.annexes) return [];
  const p = parser || createSharedParser();
  const results: CalculatedAnnex[] = [];
  // Warnings collector — errors are no longer silently swallowed (ISO 9001 §8.5.2)
  const _annexWarnings: string[] = [];

  (template.annexes || []).forEach(annex => {
    const isAdjActive = !!annex.isAdjustmentActive;
    const coef = isAdjActive ? (annex.coefficient !== undefined ? annex.coefficient : 1) : 1;
    const adjCol = annex.adjustmentColumn || (annex.id === 'II' ? 'HORAS MENSUALES' : 'PRECIO UNITARIO');

    const calculatedAnnex = {
      ...annex,
      data: (annex.data || []).map((row: AnnexDataRow) =>
        produce(row, (draft: AnnexDataRow) => {
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

          // A2. Auto-recalculate total from norm * price when coefficient changed or total is 0/missing
          if (coef !== 1 || draft.total === 0 || draft.total === undefined || draft.total === null) {
            const normKeys = Object.keys(draft).filter(k => isNorm(k) && typeof draft[k] === 'number');
            const priceKeys = Object.keys(draft).filter(k => isPrice(k) && typeof draft[k] === 'number');

            if (normKeys.length > 0 && priceKeys.length > 0) {
              const norm = draft[normKeys[0]] as number;
              const price = draft[priceKeys[0]] as number;
              const newTotal = new Decimal(norm).times(price).toDecimalPlaces(2).toNumber();
              if (newTotal > 0) {
                draft.total = newTotal;
              }
            } else if (priceKeys.length > 0 && coef !== 1) {
              if (typeof draft.total === 'number' && draft.total > 0) {
                const adjPriceKey = priceKeys.find(k => {
                  const lower = k.toLowerCase();
                  return lower.includes('price') || lower.includes('rate') || lower.includes('tarifa');
                });
                if (adjPriceKey) {
                  draft.total = draft[adjPriceKey] as number;
                }
              }
            } else if (coef !== 1 && typeof draft.total === 'number' && draft.total > 0) {
              // Fallback: no norm/price columns found, multiply total directly by coefficient
              draft.total = draft.total * coef;
            }
          }

          // B. Manual formulas in non-formula numeric columns
          for (const col of annex.columns) {
            if (!col.formula && isNumericColumn(col.key)) {
              const val = draft[col.key];
              if (typeof val === 'string' && val.length > 0 && val.startsWith('=')) {
                // BUG-012 FIX: Use draft (post-coefficient) not row (pre-coefficient)
                draft[col.key] = evaluateAnnexExpressionShared(val, draft as unknown as Record<string, unknown>, template.header, results, p, _annexWarnings);
              }
            }
          }

          // C. Column-level formulas
          let hasTotalFormula = false;
          for (const col of annex.columns) {
            if (col.formula) {
              draft[col.key] = evaluateAnnexExpressionShared(col.formula, draft, template.header, results, p, _annexWarnings);
              if (col.key === 'total') hasTotalFormula = true;
            }
          }

          // D. Safety net: if total is still 0 but norm*price data exists, force-calculate
          // This handles edge cases where formula evaluation silently fails (browser-specific)
          if (hasTotalFormula && (draft.total === 0 || draft.total === undefined || draft.total === null)) {
            const normKeys = Object.keys(draft).filter(k => isNorm(k) && typeof draft[k] === 'number' && (draft[k] as number) > 0);
            const priceKeys = Object.keys(draft).filter(k => isPrice(k) && typeof draft[k] === 'number' && (draft[k] as number) > 0);
            if (normKeys.length > 0 && priceKeys.length > 0) {
              const forcedTotal = new Decimal(draft[normKeys[0]] as number).times(draft[priceKeys[0]] as number).toDecimalPlaces(2).toNumber();
              if (forcedTotal > 0) {
                draft.total = forcedTotal;
              }
            }
          }
        }),
      ),
    };
    results.push(calculatedAnnex);
  });

  return results;
}

// ─── Valor Histórico Recursive Calculation ────────────────────────────────────

export function buildVHSums(sections: CostSheetSection[]): Record<string, number> {
  const vhSums: Record<string, number> = {};

  const calculateVH = (rows: CostSheetRow[]) => {
    (rows || []).forEach(r => {
      if (r.children && r.children.length > 0) {
        calculateVH(r.children);
        const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(r.calculationMethod || '');
        if (isFixedValue && (r.valorHistorico !== undefined || r.value !== undefined)) {
          vhSums[r.id] = parseFloat(String(r.value ?? r.valorHistorico ?? 0)) || 0;
        } else {
          vhSums[r.id] = r.children.reduce((sum: number, child: CostSheetRow) => {
            const val = vhSums[child.id] ?? child.value ?? child.valorHistorico ?? 0;
            return sum + parseFloat(String(val || 0)) || 0;
          }, 0);
        }
      } else {
        vhSums[r.id] = parseFloat(String(r.value ?? r.valorHistorico ?? 0)) || 0;
      }
    });
  };

  (sections || []).forEach(s => {
    calculateVH(s?.rows);
    vhSums[s.id] = (s.rows || []).reduce((sum: number, r: CostSheetRow) => sum + (vhSums[r.id] || 0), 0);
  });

  return vhSums;
}

// ─── Early Header Evaluation ──────────────────────────────────────────────────

export function evaluateEarlyHeader(
  header: CostSheetHeader,
  calculatedAnnexes: CalculatedAnnex[],
  parser?: Parser,
): CostSheetHeader {
  const earlyHeader = { ...header };
  const p = parser || createSharedParser();

  ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
    const val = (earlyHeader as Record<string, unknown>)[field];
    if (typeof val === 'string' && val.startsWith('=')) {
      (earlyHeader as Record<string, unknown>)[field] = evaluateHeaderExpressionShared(
        val, earlyHeader, calculatedAnnexes, {}, p,
      );
    }
  });

  return earlyHeader;
}

// ─── Engine Row Building ──────────────────────────────────────────────────────

export function buildEngineRows(
  template: CostSheetData,
  vhSums: Record<string, number>,
): CostRow[] {
  const engineRows: CostRow[] = [];

  const flatten = (
    uiRows: CostSheetRow[],
    sectionIdx: number,
    parentNumbering?: string,
    parentId: string | null = null,
    isParentAffected = false,
  ) => {
    (uiRows || []).forEach((r, rowIdx) => {
      // Calculate visual numbering (e.g. "1.1", "1.1.1")
      const currentNumbering = parentNumbering
        ? `${parentNumbering}.${rowIdx + 1}`
        : `${sectionIdx + 1}.${rowIdx + 1}`;

      // Infer semantic type
      let type: RowSemanticType = 'COST';
      if (['13', '13.1', '13.2'].includes(r.id)) type = 'MARGIN';
      if (r.id === '13.2' || r.id === '13.3') type = 'TAX';
      if (['14', '14.1', '12', '12.1', '5'].includes(r.id)) type = 'TOTAL';

      // Map calculation method
      // Prefer totalFormula (row total calculation) over formula (often VH-specific or legacy)
      let formula = r.totalFormula || r.formula;
      const isParent = r.children && r.children.length > 0;


      // When solver/external code pins a value (calculationMethod = ValorFijo/FIJO/MANUAL),
      // do NOT auto-assign sum(children) — respect the cleared formula and fixed value.
      const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(r.calculationMethod || '');
      if (isParent && (!formula || formula === 'VH')) {
          formula = 'sum(children)';
      }

      // Map formaCalculo
      let formaCalculo: FormaCalculo = 'FIJO';
      const method = r.calculationMethod || '';
      if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
      if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
      if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';
      // isPercent must NOT override an explicit ValorFijo/FIJO calculationMethod
      const isPercentRow = r.isPercent === true || r.is_percent === true;
      if (isPercentRow && !['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'COEFICIENTE';
      // Only override to FORMULA if the formula is meaningful (not auto-generated for a pinned row)
      if (formula && !isFixedValue) formaCalculo = 'FORMULA';

      // Base Calculation mapping
      let baseCalculo: BaseRef | null = null;
      const baseRefId = r.baseDeCalculoRef || r.base_ref || r.baseRef;

      // Detect simple annex reference in formula (e.g. "=AnexoI", "=TotalAnexoIII")
      const annexRoman = isSimpleAnnexRef(r.totalFormula || r.formula || '');
      const isSimpleAnnexFormula = !!annexRoman;

      // Resolve baseCalculo: from baseDeCalculoRef OR from a simple annex formula
      if (baseRefId) {
        const isAnnex =
          (template.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
        if (isAnnex) {
          baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
        } else {
          baseCalculo = { type: 'FILA', classification: baseRefId };
        }
      } else if (isSimpleAnnexFormula && annexRoman) {
        // No explicit baseDeCalculoRef, but formula is a bare annex ref → infer it
        baseCalculo = { type: 'ANEXO', anexoId: annexRoman };
      }

      // Route to IMPORTAR_ANEXO when:
      //   a) baseCalculo points to an annex AND no complex formula, OR
      //   b) formula is a simple annex reference (e.g. "=AnexoI") with no other expression
      if (
        baseCalculo?.type === 'ANEXO' &&
        r.calculationMethod !== 'Prorrateo' &&
        (isSimpleAnnexFormula || (!r.formula && !r.totalFormula))
      ) {
        formaCalculo = 'IMPORTAR_ANEXO';
      }

      // Normalize =sum(children) formula
      if (formula?.trim() === '=sum(children)' || formula?.trim() === 'sum(children)') {
        formula = 'sum(children)';
      }

      // Apply Indirect Configuration (Coefficient or Fixed)
      let finalFormula = formula;
      const sectionIdStr = template.sections[sectionIdx]?.id || String(sectionIdx + 1);
      const isSectionSelected = template.indirectConfig?.selectedSections?.includes(sectionIdStr);
      const isBaseSection = sectionIdStr === template.indirectConfig?.baseSection;
      const isAffected =
        (isParentAffected || isSectionSelected || template.indirectConfig?.selectedSections?.includes(r.id)) &&
        !isBaseSection;

      if (isAffected && !isParent) {
        const config = template.indirectConfig;
        if (config?.mode === 'fixed') {
          const selectedIds = config.selectedSections || [];
          const totalSelected = selectedIds.reduce((sum, id) => sum + (vhSums[id] || 0), 0);
          const rowWeight = totalSelected > 0 ? (vhSums[r.id] || 0) / totalSelected : 0;
          const fixedPart = (config.fixedAmount || 0) * rowWeight;

          if (fixedPart > 0) {
            const baseVal = finalFormula
              ? `(${finalFormula.startsWith('=') ? finalFormula.substring(1) : finalFormula})`
              : 'VH';
            finalFormula = `${baseVal} + ${fixedPart.toFixed(4)}`;
            formaCalculo = 'FORMULA';
          }
        } else {
          const coef = config?.coefficient || 1;
          if (coef !== 1) {
            const baseVal = finalFormula
              ? `(${finalFormula.startsWith('=') ? finalFormula.substring(1) : finalFormula})`
              : 'VH';
            finalFormula = `${baseVal} * ${coef}`;
            formaCalculo = 'FORMULA';
          }
        }
      }

      engineRows.push({
        id: r.id,
        parentId: parentId,
        // Classification must always be positional numbering (e.g. "4.1.1")
        // so that ref()/vh() lookups resolve correctly — the engine's
        // Priority-2 ID fallback still handles legacy ref('4.1') calls.
        classification: currentNumbering,
        label: r.label,
        um: r.um || r.unit,
        type,
        formaCalculo,
        valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value ?? r.total ?? 0,
        vhFormula: r.vhFormula,
        baseCalculo,
        coeficiente: isPercentRow ? (r.value ?? r.valorHistorico) : r.coeficiente,
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

  (template.sections || []).forEach((s, sIdx) => flatten(s?.rows, sIdx, undefined, null));

  return engineRows;
}

// ─── FichaJSON Assembly ───────────────────────────────────────────────────────

export function assembleFichaJSON(
  earlyHeader: CostSheetHeader,
  calculatedAnnexes: CalculatedAnnex[],
  engineRows: CostRow[],
): FichaJSON {
  return {
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
      .filter((a: CalculatedAnnex) => !!a)
      .map((a: CalculatedAnnex) => ({
        id: a.id,
        name: a.title,
        rows: (a.data || [])
          .filter((d: AnnexDataRow) => !!d)
          .map((d: AnnexDataRow) => ({
            ...d,
            // Normalize classification by taking the prefix before ' - '
            classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
            importe: (() => {
              const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe].find(
                (v: string | number | boolean | undefined) => v !== undefined && v !== null,
              );
              return parseFloat(String(val ?? 0)) || 0;
            })(),
          })),
      })),
    rows: engineRows,
  };
}
