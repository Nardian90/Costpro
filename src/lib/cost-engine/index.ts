import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import {
  FichaJSON,
  CalculationResult,
  CalculatedRow,
  AuditEntry,
  CostRow,
  BaseRef,
} from './types';

export function validateFicha(ficha: FichaJSON): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();
  const classifications = new Set<string>();

  ficha.rows.forEach((row) => {
    if (ids.has(row.id)) errors.push(`Duplicate row ID: ${row.id}`);
    ids.add(row.id);
    classifications.add(row.classification);
  });

  ficha.rows.forEach((row) => {
    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
      if (!classifications.has(base.classification)) {
        errors.push(`Row ${row.id} ${row.label} references non-existent classification: ${base.classification}`);
      }
    } else if (base?.type === 'ANEXO') {
      if (!ficha.anexos.find((a) => a.id === base.anexoId)) {
        errors.push(`Row ${row.id} ${row.label} references non-existent anexo: ${base.anexoId}`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

export function calculateFicha(
  ficha: FichaJSON,
  options?: { actor?: string; maxIter?: number; damping?: number }
): CalculationResult {
  const startTime = Date.now();
  const actor = options?.actor || 'system';
  const decimals = ficha.meta.decimals;
  const maxIter = options?.maxIter ?? ficha.meta.settings?.maxIter ?? 10;
  const dampingValue = options?.damping ?? ficha.meta.settings?.damping ?? 0.6;
  const damping = new Decimal(dampingValue);
  const audits: AuditEntry[] = [];

  // 1. Prepare maps for O(1) lookup
  const annexSumMap = new Map<string, Map<string, Decimal>>();
  ficha.anexos.forEach((anexo) => {
    const classMap = new Map<string, Decimal>();
    anexo.rows.forEach((row) => {
      const current = classMap.get(row.classification) || new Decimal(0);
      classMap.set(row.classification, current.plus(new Decimal(row.importe)));
    });
    annexSumMap.set(anexo.id, classMap);
  });

  const rowsByClass = new Map<string, CostRow[]>();
  ficha.rows.forEach((row) => {
    const list = rowsByClass.get(row.classification) || [];
    list.push(row);
    rowsByClass.set(row.classification, list);
  });

  // 2. Initialize calculated rows
  const calculatedRows = new Map<string, CalculatedRow>();
  ficha.rows.forEach((row) => {
    calculatedRows.set(row.id, {
      ...row,
      total: 0,
      audit: [],
    });
  });

  const parser = new Parser();
  parser.functions.SUM_ANEXO = (anexoId: string, classification: string) => {
    return annexSumMap.get(anexoId)?.get(classification)?.toNumber() || 0;
  };

  parser.functions.ref = (classification: string) => {
      const targets = rowsByClass.get(classification) || [];
      return targets.reduce((acc, t) => {
          const calculated = calculatedRows.get(t.id);
          return acc + (calculated?.total || 0);
      }, 0);
  };

  parser.functions.pct = (value: number, percentage: number) => {
      return value * (percentage / 100);
  };

  parser.functions.round2 = (value: number) => {
      return Math.round(value * 100) / 100;
  };

  parser.functions.sum = (...args: number[]) => {
      return args.reduce((a, b) => a + b, 0);
  };

  const computeRowTotal = (
    row: CostRow,
    currentRows: Map<string, CalculatedRow>
  ): { total: Decimal; note: string; type: AuditEntry['type']; fuente: string; baseTotal: Decimal; baseHist: Decimal } => {
    let total = new Decimal(0);
    let note = '';
    let baseTotalValue = new Decimal(0);
    let baseHistValue = new Decimal(0);
    let type: AuditEntry['type'] = 'INFO';
    let fuenteParts: string[] = [row.formaCalculo];

    const vh = new Decimal(row.valorHistorico || 0);

    // Resolve Rules
    const activeRules = (ficha.rules || [])
      .filter((r) => r.enabled)
      .filter((r) => {
        if (r.targetClassification && !row.classification.startsWith(r.targetClassification)) return false;
        if (r.targetType && row.type !== r.targetType) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority);

    const ruleOverride = activeRules[0];
    let formulaToUse = row.formula;
    let formaCalculoToUse = row.formaCalculo;

    if (ruleOverride) {
        if (ruleOverride.formulaOverride) {
            formulaToUse = ruleOverride.formulaOverride;
            formaCalculoToUse = 'FORMULA';
            note += `Rule '${ruleOverride.name}' v${ruleOverride.version} applied. `;
            type = 'RULE_APPLIED';
        }
    }

    const base = row.baseCalculo;

    switch (formaCalculoToUse) {
      case 'FIJO':
        total = vh;
        note += `Used VH ${vh.toFixed(decimals)}.`;
        break;

      case 'IMPORTAR_ANEXO':
        if (base?.type === 'ANEXO') {
          const classSum = annexSumMap.get(base.anexoId)?.get(row.classification) || new Decimal(0);
          total = classSum;
          baseTotalValue = classSum;
          baseHistValue = classSum;
          fuenteParts.push(base.anexoId);
          note += `Imported from ${base.anexoId} for class ${row.classification}.`;
        } else {
          type = 'WARNING';
          note += `Missing ANEXO reference.`;
        }
        break;

      case 'PRORRATEO':
      case 'COEFICIENTE':
        let baseRefName = '';

        if (base?.type === 'ANEXO') {
            const anexo = annexSumMap.get(base.anexoId);
            baseTotalValue = Array.from(anexo?.values() || []).reduce((acc, val) => acc.plus(val), new Decimal(0));
            baseHistValue = baseTotalValue;
            baseRefName = `Anexo:${base.anexoId}`;
        } else if (base?.type === 'FILA') {
            const targets = rowsByClass.get(base.classification) || [];
            targets.forEach(t => {
                const calculated = currentRows.get(t.id);
                baseTotalValue = baseTotalValue.plus(new Decimal(calculated?.total || 0));
                baseHistValue = baseHistValue.plus(new Decimal(t.valorHistorico || 0));
            });
            baseRefName = `Fila:${base.classification}`;
        }
        fuenteParts.push(baseRefName);

        if (formaCalculoToUse === 'PRORRATEO') {
            if (baseHistValue.isZero()) {
                total = new Decimal(0);
                type = 'WARNING';
                note += `BaseHist is zero for ${baseRefName}.`;
            } else {
                const ratio = vh.div(baseHistValue);
                total = ratio.times(baseTotalValue);
                note += `Prorrated: (${vh}/${baseHistValue}) * ${baseTotalValue.toFixed(decimals)}.`;
            }
        } else {
            const coef = new Decimal(row.coeficiente ?? 0);
            total = coef.times(baseTotalValue);
            note += `Coefficient: ${coef} * ${baseTotalValue.toFixed(decimals)}.`;
        }
        break;

      case 'FORMULA':
        if (!ficha.meta.settings?.allowFormulas && !ruleOverride) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formulas are disabled.`;
            break;
        }
        try {
            const expr = parser.parse(formulaToUse || '0');

            if (base?.type === 'ANEXO') {
                 const anexo = annexSumMap.get(base.anexoId);
                 baseTotalValue = Array.from(anexo?.values() || []).reduce((acc, val) => acc.plus(val), new Decimal(0));
            } else if (base?.type === 'FILA') {
                const targets = rowsByClass.get(base.classification) || [];
                targets.forEach(t => {
                    const calculated = currentRows.get(t.id);
                    baseTotalValue = baseTotalValue.plus(new Decimal(calculated?.total || 0));
                });
            }

            const result = expr.evaluate({
                VH: vh.toNumber(),
                BASE_TOTAL: baseTotalValue.toNumber(),
                COEF: row.coeficiente || 0
            });
            total = new Decimal(result);
            note += `Evaluated: ${formulaToUse}.`;
        } catch (e: any) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formula error: ${e.message}`;
        }
        break;
    }

    return { total, note, type, fuente: fuenteParts.join('|'), baseTotal: baseTotalValue, baseHist: baseHistValue };
  };

  // 3. Iterative Solver
  let converged = false;
  let iterations = 0;

  while (!converged && iterations < maxIter) {
    iterations++;
    converged = true;

    ficha.rows.forEach((row) => {
      const current = calculatedRows.get(row.id)!;
      const { total: computedTotal, note, type, fuente, baseTotal, baseHist } = computeRowTotal(row, calculatedRows);

      const targetTotal = computedTotal.toDecimalPlaces(decimals);
      const currentTotal = new Decimal(current.total);

      if (!targetTotal.equals(currentTotal)) {
        converged = false;

        let nextValue = targetTotal;
        // Apply damping ONLY if we are halfway through maxIter and haven't converged
        // or if explicitly needed for stability in cycles.
        if (iterations > maxIter / 2 && maxIter > 2) {
            nextValue = currentTotal.times(damping).plus(targetTotal.times(new Decimal(1).minus(damping)));
        }

        const finalTotal = nextValue.toDecimalPlaces(decimals).toNumber();

        if (finalTotal !== current.total || (iterations === 1)) {
            current.audit.push({
                ts: new Date().toISOString(),
                actor,
                type: iterations === maxIter && !converged ? 'CYCLE_DETECTED' : type,
                rowId: row.id,
                prev: current.total.toString(),
                now: finalTotal.toString(),
                note: iterations === maxIter && !converged ? `Cycle detected/Damping: ${note}` : note
            });
            current.total = finalTotal;
            current.fuente = fuente;
            current.baseTotal = baseTotal.toNumber();
            current.baseHist = baseHist.toNumber();
        }
      }
    });
  }

  // 4. Final Totals
  const summary = {
    totalCost: 0,
    totalMargin: 0,
    totalTax: 0,
    grandTotal: 0,
  };

  calculatedRows.forEach(row => {
    const val = row.total;
    if (row.type === 'COST') summary.totalCost += val;
    else if (row.type === 'MARGIN') summary.totalMargin += val;
    else if (row.type === 'TAX') summary.totalTax += val;
  });

  summary.grandTotal = new Decimal(summary.totalCost).plus(summary.totalMargin).plus(summary.totalTax).toDecimalPlaces(decimals).toNumber();

  return {
    fichaId: ficha.meta.id,
    rows: Array.from(calculatedRows.values()),
    audits: Array.from(calculatedRows.values()).flatMap(r => r.audit),
    summary,
    elapsedMs: Date.now() - startTime,
  };
}
