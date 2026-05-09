import {
  CostSheetData,
  CostSheetHeader,
  CostSheetRow,
  CostSheetSection,
  CalculatedAnnex,
  AnnexDataRow
} from '../../types/cost-sheet';
import {
  FichaJSON,
  CostRow,
  RowSemanticType,
  FormaCalculo,
  BaseRef,
  Anexo
} from './types';
import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import { produce } from 'immer';
import { createSharedParser, evaluateAnnexExpressionShared, evaluateHeaderExpressionShared } from './formula-utils';

export const ROMAN_MAP: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
  6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'
};

export function safeDecimal(val: any): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  try {
    return new Decimal(val);
  } catch {
    return new Decimal(0);
  }
}

export function normalize(str: string): string {
  if (!str) return '';
  return str.replace(/\s+/g, '').toLowerCase();
}

/**
 * Extracts dependencies from a row (formula and baseCalculo).
 */
export function extractDependencies(row: CostRow, allRows: CostRow[], knownAnnexes: Set<string>): string[] {
  const deps = new Set<string>();

  if (row.baseCalculo?.type === 'FILA') {
    deps.add(row.baseCalculo.classification);
  }

  const formula = row.formula || row.totalFormula;
  if (row.formaCalculo === 'FORMULA' && formula) {
    const refMatches = formula.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
    for (const match of Array.from(refMatches)) {
      deps.add(match[1]);
    }
  }

  if (formula?.includes('sum(children)') || formula?.includes('SUMA_HIJOS')) {
    allRows.filter(r => r.parentId === row.id).forEach(child => deps.add(child.id));
  }

  return Array.from(deps);
}

// ─── Annex Calculation ────────────────────────────────────────────────────────

export function calculateAnnexesShared(
  template: CostSheetData,
  decimals: number = 2,
): CalculatedAnnex[] {
  const results: CalculatedAnnex[] = [];
  const p = createSharedParser();

  (template.annexes || []).forEach((annex) => {
    const calculatedAnnex: CalculatedAnnex = {
      ...annex,
      data: (annex.data || []).map((row) =>
        produce(row, (draft: any) => {
          if (row.coefficient !== undefined && row.coefficient !== 1) {
            annex.columns.forEach((col) => {
              if (col.isCalculated && typeof draft[col.key] === 'number') {
                draft[col.key] = new Decimal(draft[col.key]).times(row.coefficient).toDecimalPlaces(decimals).toNumber();
              }
            });
          }

          for (const col of annex.columns) {
            if (!col.formula) {
              const val = draft[col.key];
              if (typeof val === 'string' && val.length > 0 && val.startsWith('=')) {
                draft[col.key] = evaluateAnnexExpressionShared(val, draft as unknown as Record<string, unknown>, template.header, results, p, []);
              }
            }
          }

          for (const col of annex.columns) {
            if (col.formula) {
              draft[col.key] = evaluateAnnexExpressionShared(col.formula, draft, template.header, results, p, []);
            }
          }
        }),
      ),
    };
    results.push(calculatedAnnex);
  });

  return results;
}

export function calculateAnnexesPure(data: any, decimals: number = 2): any {
    if (!data) return data;
    if (data.annexes) return calculateAnnexesShared(data, decimals);
    return data;
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
            return sum + (parseFloat(String(val || 0)) || 0);
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

export { evaluateHeaderExpressionShared } from './formula-utils';

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
      const currentNumbering = parentNumbering
        ? `${parentNumbering}.${rowIdx + 1}`
        : `${sectionIdx + 1}.${rowIdx + 1}`;

      let type: RowSemanticType = 'COST';
      if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
      if (r.id === '13.2') type = 'TAX';
      if (['14', '14.1', '12', '12.1', '5'].includes(r.id)) type = 'TOTAL';

      let formula = r.totalFormula || r.formula;
      const isParent = r.children && r.children.length > 0;

      const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(r.calculationMethod || '');
      if (isParent && (!formula || formula === 'VH')) {
          formula = 'sum(children)';
      }

      let formaCalculo: FormaCalculo = 'FIJO';
      const method = r.calculationMethod || '';

      if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'FORMULA';
      if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'FORMULA';
      if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';

      const isPercentRow = r.isPercent === true || r.is_percent === true;
      if (isPercentRow && !['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'PORCENTAJE';

      if (formula) formaCalculo = 'FORMULA';

      let baseCalculo: BaseRef | null = null;
      const baseRefId = r.baseDeCalculoRef || r.base_ref;
      if (baseRefId) {
        const isAnnex =
          (template.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
        if (isAnnex) {
          baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
        } else {
          baseCalculo = { type: 'FILA', classification: baseRefId };
        }
      }

      engineRows.push({
        id: r.id,
        parentId: parentId,
        classification: r.id || currentNumbering,
        label: r.label,
        um: r.um || r.unit,
        type,
        formaCalculo,
        valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value,
        vhFormula: r.vhFormula,
        baseCalculo,
        coeficiente: isPercentRow ? (r.value ?? r.valorHistorico) : r.coeficiente,
        formula: formula,
        fuente: r.note || r.fuente,
        metadata: {
          ...(r.metadata || {}),
          appliedFormula: formula,
        },
      });

      if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id, isParentAffected);
    });
  };

  (template.sections || []).forEach((s, sIdx) => flatten(s?.rows, sIdx, undefined, null));

  return engineRows;
}

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
      quantity: Number(earlyHeader?.quantity || 0),
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
            classification: String(d.classification || d.label || d.id || '').split(/[ -]/)[0].trim(),
            importe: Number([d.total, d.amount, d.depreciation_cost, d.price_total, d.importe, d.value, d.cost].find(v => v !== undefined && v !== null) ?? 0)
          })),
      })),
    rows: engineRows,
  };
}
