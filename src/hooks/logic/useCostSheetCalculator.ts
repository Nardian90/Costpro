
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import Decimal from 'decimal.js';
import {
  CostSheetData,
  CostSheetRow,
  CostSheetColumn,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, CostRow, Anexo, RowSemanticType, FormaCalculo, BaseRef, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';

// Helper to safely evaluate a formula string for ANNEXES (keeping it simple for annex rows)
const evaluateAnnexExpression = (expression: string, rowData: any, header: any): number => {
  if (!expression) return 0;
  try {
    if (/^-?\d*\.?\d+$/.test(expression.trim())) {
      return parseFloat(expression.trim());
    }
    // Simple replacement for annex row variables
    let expr = expression;
    const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(rowData[key] || 0));
    }
    // Header replacements
    expr = expr.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(header[key] || 0));

    return new Function(`return ${expr}`)();
  } catch (error) {
    return 0;
  }
};

export const useCostSheetCalculator = (template: CostSheetData) => {
  const [calculatedValues, setCalculatedValues] = useState<{ [key: string]: CalculatedRowValue }>({});
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // 1. Calculate Annexes first (internal formulas)
  const calculatedAnnexes = useMemo(() => {
    if (!template || !template.annexes) return [];
    return template.annexes.map(annex => ({
      ...annex,
      data: (annex.data || []).map(row => produce(row, (draft: any) => {
        for (const col of annex.columns) {
          if (col.formula) {
            draft[col.key] = evaluateAnnexExpression(col.formula, row, template.header);
          }
        }
      }))
    }));
  }, [template.annexes, template.header]);

  // 2. Run the declarative Engine for the main rows
  useEffect(() => {
    try {
      if (!template || !template.header || !template.sections) return;

      // Map UI state to Engine-compatible JSON
      const engineRows: CostRow[] = [];
      const flatten = (uiRows: CostSheetRow[]) => {
        uiRows.forEach(r => {
          // Infer semantic type
          let type: RowSemanticType = 'COST';
          if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
          if (r.id === '13.2') type = 'TAX';
          if (['14', '12', '5'].includes(r.id)) type = 'TOTAL';

          // Map calculation method
          let formaCalculo: FormaCalculo = 'FIJO';
          if (r.calculationMethod === 'Prorrateo') formaCalculo = 'PRORRATEO';
          if (r.is_percent) formaCalculo = 'COEFICIENTE';
          if (r.formula || r.totalFormula) formaCalculo = 'FORMULA';

          // Base Calculation mapping
          let baseCalculo: BaseRef | null = null;
          const baseRefId = r.baseDeCalculoRef || r.base_ref;
          if (baseRefId) {
              // Check if it's an Annex ID (I, II, III, IV, V)
              if (/^[IVXLC]+$/.test(baseRefId)) {
                  baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
                  // If pointing to annex without specific formula, it's an import
                  if (r.calculationMethod !== 'Prorrateo' && !r.formula && !r.totalFormula) {
                      formaCalculo = 'IMPORTAR_ANEXO';
                  }
              } else {
                  baseCalculo = { type: 'FILA', classification: baseRefId };
              }
          }

          let formula = r.formula || r.totalFormula;

          // Map =sum(children) to a specific engine-compatible formula
          if (formula?.trim() === '=sum(children)' && r.children) {
              const childRefs = r.children.map(c => `ref('${c.id}')`).join(', ');
              formula = `sum(${childRefs})`;
          }

          engineRows.push({
            id: r.id,
            parentId: null, // We could pass it but ref based formula is enough
            classification: r.id,
            label: r.label,
            type,
            formaCalculo,
            valorHistorico: r.valorHistorico ?? r.value,
            baseCalculo,
            coeficiente: r.is_percent ? (r.value ?? r.valorHistorico) : r.coeficiente,
            formula: formula,
          });

          if (r.children) flatten(r.children);
        });
      };
      template.sections.forEach(s => flatten(s.rows));

      const ficha: FichaJSON = {
        meta: {
          id: template.header.code || 'default',
          name: template.header.name || 'Ficha',
          currency: template.header.currency || 'CUP',
          decimals: 2,
          settings: { allowFormulas: true }
        },
        anexos: calculatedAnnexes.map(a => ({
          id: a.id,
          name: a.title,
          rows: a.data.map(d => ({
            // Normalize classification by taking the prefix before ' - ' (e.g. "1.1 - Insumos" -> "1.1")
            classification: (d.classification || d.label || '').split(' - ')[0].trim(),
            importe: d.total || d.amount || d.depreciation_cost || d.price_total || 0
          }))
        })),
        rows: engineRows
      };

      // Execute Engine
      const result = calculateFicha(ficha, { actor: 'ui-hook' });

      // Map back to UI values
      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      result.rows.forEach(r => {
          // We need to approximate baseTotal and coeficiente for the UI table display
          // The engine doesn't explicitly return baseTotal in the row object, but we can infer or leave it
          newCalculatedValues[r.id] = {
              total: r.total,
              valorHistorico: r.valorHistorico || 0,
              baseDeCalculoRef: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : (r.baseCalculo?.anexoId || null),
              baseTotal: r.baseTotal || 0,
              baseValorHistorico: r.baseHist || 0,
              coeficiente: r.coeficiente || 0,
              audits: r.audit,
              hasWarnings: r.audit.some(a => a.type === 'WARNING' || a.type === 'ERROR' || a.type === 'CYCLE_DETECTED')
          };
      });

      setCalculatedValues(newCalculatedValues);
      setCalculationResult(result);
      setAudits(result.audits);
      setError(null);
    } catch (e) {
      setError(e as Error);
      console.error("Error in unified cost calculator:", e);
    }
  }, [template, calculatedAnnexes]);

  return { calculatedValues, calculatedAnnexes, audits, calculationResult, error };
};
