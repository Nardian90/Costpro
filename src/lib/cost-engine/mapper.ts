import { FichaJSON, CostRow, BaseRef, Anexo, RowSemanticType } from './types';
import {
  CostSheetDataContract,
  CostSheetRowContract,
  CostSheetAnnexContract
} from '@/contracts/cost-sheet';

/**
 * Maps the UI/Legacy data structure to the new Engine FichaJSON structure.
 */
export function mapContractToFicha(contract: CostSheetDataContract): FichaJSON {
  const rows: CostRow[] = [];

  // Flatten nested sections and rows
  const flatten = (row: CostSheetRowContract, parentId: string | null = null) => {
    // Determine semantic type
    let type: RowSemanticType = 'COST';
    const labelLower = row.label.toLowerCase();
    if (labelLower.includes('utilidad') || labelLower.includes('margen')) type = 'MARGIN';
    else if (labelLower.includes('impuesto') || labelLower.includes('tributario')) type = 'TAX';
    else if (labelLower.includes('precio') || labelLower.includes('tarifa') || labelLower.includes('total')) type = 'INFO';

    // Map baseCalculo
    let baseCalculo: BaseRef | null = null;
    const baseRef = row.baseDeCalculoRef || row.baseRef;
    if (baseRef) {
        if (contract.annexes.some(a => a.id === baseRef)) {
            baseCalculo = { type: 'ANEXO', anexoId: baseRef };
        } else {
            baseCalculo = { type: 'FILA', classification: baseRef };
        }
    }

    // Map formaCalculo
    let formaCalculo: CostRow['formaCalculo'] = 'FIJO';
    if (row.calculationMethod === 'Prorrateo') formaCalculo = 'PRORRATEO';
    if (row.formula || row.totalFormula) formaCalculo = 'FORMULA';
    if (row.is_percent) formaCalculo = 'COEFICIENTE';
    if (baseCalculo?.type === 'ANEXO' && !row.is_percent && !row.formula && !row.totalFormula) {
        formaCalculo = 'IMPORTAR_ANEXO';
    }

    // Classification cleanup
    const classification = row.classification || row.id;

    rows.push({
      id: row.id,
      parentId,
      classification,
      label: row.label,
      type: row.type || type,
      valorHistorico: row.valorHistorico || row.value || 0,
      formaCalculo,
      baseCalculo,
      coeficiente: row.coeficiente || (row.is_percent ? row.value : null),
      formula: (row.formula || row.totalFormula || '').replace(/^=/, ''),
      total: row.total || 0,
      fuente: row.fuente || ''
    });

    if (row.children) {
      row.children.forEach(child => flatten(child, row.id));
    }
  };

  contract.sections.forEach(section => {
    section.rows.forEach(row => flatten(row));
  });

  const anexos: Anexo[] = contract.annexes.map(a => ({
    id: a.id,
    name: a.title,
    rows: a.data.map(d => {
        let classification = String(d.classification || d.id || '');
        const match = classification.match(/^(\d+(\.\d+)*)/);
        if (match) classification = match[1];

        return {
            classification,
            importe: d.amount || d.total || d.importe || 0,
            ...d
        };
    })
  }));

  return {
    meta: {
      id: contract.header.code || 'UNNAMED',
      name: contract.header.name,
      currency: contract.header.currency,
      decimals: 2,
      settings: {
        allowFormulas: true,
        maxIter: 10
      }
    },
    rows,
    anexos
  };
}

/**
 * Updates the contract with calculated results from the engine.
 */
export function updateContractWithResults(contract: CostSheetDataContract, result: FichaJSON): CostSheetDataContract {
  const rowMap = new Map(result.rows.map(r => [r.id, r]));

  const updateRow = (row: CostSheetRowContract) => {
    const calc = rowMap.get(row.id);
    if (calc) {
      row.total = calc.total || 0;
      row.audit = calc.audit;
      row.fuente = calc.fuente;
    }
    if (row.children) {
      row.children.forEach(updateRow);
    }
  };

  contract.sections.forEach(section => {
    section.rows.forEach(updateRow);
  });

  return contract;
}
