import { classifyFormula } from "./formula-classifier";
import { CostSheetData, CostSheetRow } from '@/types/cost-sheet';
import { FichaJSON, CostRow, RowSemanticType, FormaCalculo, BaseRef } from './types';

export function mapUIToFicha(data: CostSheetData): FichaJSON {
  const header = data.header;
  const engineRows: CostRow[] = [];

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
  (data.sections || []).forEach(s => calculateVH(s.rows));

  const flatten = (uiRows: CostSheetRow[], sectionIdx: number, parentNumbering?: string, parentId: string | null = null) => {
    (uiRows || []).forEach((r, rowIdx) => {
      const currentNumbering = parentNumbering
        ? `${parentNumbering}.${rowIdx + 1}`
        : `${sectionIdx + 1}.${rowIdx + 1}`;

      let type: RowSemanticType = 'COST';
      if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
      if (r.id === '13.2') type = 'TAX';
      if (['14', '12', '5', '14.1'].includes(r.id)) type = 'TOTAL';

      const rawFormula = r.totalFormula || r.formula;
      const intent = classifyFormula(rawFormula);

      let formaCalculo: FormaCalculo = 'FIJO';
      let baseCalculo: BaseRef | null = null;
      let formula: string | undefined = undefined;

      const method = r.calculationMethod || '';
      const isParent = !!(r.children && r.children.length > 0);
      const isFixedValue = ['ValorFijo', 'FIJO', 'MANUAL'].includes(method);
      const isPct = r.isPercent === true || r.is_percent === true;

      if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
      if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
      if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';
      if (isPct && !isFixedValue) formaCalculo = 'COEFICIENTE';

      const baseRefId = r.baseDeCalculoRef || r.base_ref || r.baseRef;
      if (baseRefId) {
        const isAnnex =
          (data.annexes || []).some((a: { id: string }) => a.id === baseRefId) ||
          /^[IVXLCDM]+$/i.test(baseRefId);
        baseCalculo = isAnnex
          ? { type: 'ANEXO', anexoId: baseRefId.toUpperCase() }
          : { type: 'FILA', classification: baseRefId };
      }

      switch (intent.kind) {
        case 'EMPTY':
          if (isParent) {
            formaCalculo = 'FORMULA';
            formula = 'sum(children)';
          } else if (baseCalculo?.type === 'ANEXO' && !isFixedValue && method !== 'Prorrateo') {
            formaCalculo = 'IMPORTAR_ANEXO';
          }
          break;
        case 'ANEXO_REF':
          formaCalculo = 'IMPORTAR_ANEXO';
          baseCalculo = { type: 'ANEXO', anexoId: intent.anexoId };
          break;
        case 'SUM_CHILDREN':
          formaCalculo = 'FORMULA';
          formula = 'sum(children)';
          break;
        case 'MATH':
        case 'PERCENTAGE':
        case 'VH_RATIO':
          formula = intent.expression;
          if (!isFixedValue) {
            formaCalculo = 'FORMULA';
          }
          break;
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
        coeficiente: isPct ? (r.value ?? r.valorHistorico) : r.coeficiente,
        formula: formula,
        fuente: r.note || r.fuente,
        metadata: r.metadata
      });

      if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id);
    });
  };
  (data.sections || []).forEach((s, sIdx) => flatten(s.rows, sIdx, undefined, null));

  return {
    meta: {
      ...header,
      id: header?.code || 'default',
      name: header?.name || 'Ficha',
      currency: header?.currency || 'CUP',
      decimals: 2,
      quantity: header?.quantity || 0,
      settings: { allowFormulas: true }
    },
    anexos: (data.annexes || []).map(a => {
      const coef = !!a.isAdjustmentActive ? (a.coefficient ?? 1) : 1;
      return {
        id: a.id,
        name: a.title,
        rows: (a.data || []).map(d => {
          // Try to find a numeric value for the total/importe using keys and common labels
          const findValue = (row: Record<string, unknown>, searchKeys: string[], searchLabels: string[]) => {
              // Priority 1: Direct key match with numeric value (or string representing a number)
              for (const k of searchKeys) {
                  const val = row[k];
                  if (typeof val === 'number' && val !== 0) return val;
                  if (typeof val === 'string' && val.trim() !== '') {
                      const num = parseFloat(val);
                      if (!isNaN(num) && num !== 0) return num;
                  }
              }
              // Priority 2: Case-insensitive search in keys/labels if we had column metadata (omitted for now)
              return undefined;
          };

          const totalKeys = ['total', 'amount', 'importe', 'valor', 'value', 'price_total', 'depreciation_cost'];
          let baseVal = findValue(d, totalKeys, []);

          // Fallback: If no numeric total, try to calculate from norm * price
          if (baseVal === undefined) {
            const normKeys = ["consumption_norm", "consumption_norm", 'norm', 'consumption', 'quantity', 'qty', 'norma', 'cantidad'];
            const priceKeys = ["price", "price", 'price_unit', 'rate', 'price', 'precio', 'costo_unitario'];

            const norm = findValue(d, normKeys, []);
            const price = findValue(d, priceKeys, []);

            if (typeof norm === 'number' && typeof price === 'number') {
              baseVal = norm * price;
            } else {
              // Last resort: find any numeric value in the priority list
              const anyVal = findValue(d, [...totalKeys, ...priceKeys, ...normKeys], []);
              baseVal = typeof anyVal === 'number' ? anyVal : 0;
            }
          }

          return {
            ...d,
            classification: normalizeClass(String(d.classification || d.label || '').split(/[ -]/)[0]),
            importe: (baseVal || 0) * coef
          };
        })
      };
    }),
    rows: engineRows
  };
}
