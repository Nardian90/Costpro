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

      let formula = r.formula || r.totalFormula;
      const isParent = r.children && r.children.length > 0;
      if (isParent) formula = 'sum(children)';

      let formaCalculo: FormaCalculo = 'FIJO';
      const method = r.calculationMethod || '';
      if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
      if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
      if (['ValorFijo', 'FIJO', 'MANUAL'].includes(method)) formaCalculo = 'FIJO';
      if (r.is_percent) formaCalculo = 'COEFICIENTE';
      if (formula) formaCalculo = 'FORMULA';

      let baseCalculo: BaseRef | null = null;
      const baseRefId = r.baseDeCalculoRef || r.base_ref;
      if (baseRefId) {
          const isAnnex = (data.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
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

      engineRows.push({
        id: r.id,
        parentId: parentId,
        classification: r.classification || currentNumbering,
        label: r.label,
        um: r.um || r.unit,
        type,
        formaCalculo,
        valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value,
        vhFormula: r.vhFormula,
        baseCalculo,
        coeficiente: r.is_percent ? (r.value ?? r.valorHistorico) : r.coeficiente,
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
      quantity: header?.quantity || 1,
      settings: { allowFormulas: true }
    },
    anexos: (data.annexes || []).map(a => {
      const coef = !!a.isAdjustmentActive ? (a.coefficient ?? 1) : 1;
      return {
        id: a.id,
        name: a.title,
        rows: (a.data || []).map(d => {
          const val = [d.total, d.amount, d.depreciation_cost, d.price_total, d.importe, d.value, d.price_unit]
            .find(v => v !== undefined && v !== null);
          const baseImporte = (parseFloat(String(val ?? 0)) || 0);
          return {
            ...d,
            classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
            importe: baseImporte * coef
          };
        })
      };
    }),
    rows: engineRows
  };
}
