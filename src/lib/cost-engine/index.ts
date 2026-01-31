import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import {
  FichaJSON,
  CalculationResult,
  AuditEntry,
  CostRow,
} from './types';

/**
 * Validates the integrity of a FichaJSON object.
 */
export function validateFicha(ficha: FichaJSON): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const classifications = new Set<string>();

  ficha.rows.forEach((row) => {
    classifications.add(row.classification);
  });

  ficha.rows.forEach((row) => {
    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
      if (!classifications.has(base.classification)) {
        errors.push(`Row ${row.id} (${row.label}) references non-existent classification: ${base.classification}`);
      }
    } else if (base?.type === 'ANEXO') {
      if (!ficha.anexos.find((a) => a.id === base.anexoId)) {
        errors.push(`Row ${row.id} (${row.label}) references non-existent anexo: ${base.anexoId}`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Main calculation engine for Cost Sheets.
 * Implements a topological/iterative solver with Decimal precision.
 */
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

  // 1. Prepare Maps for efficient lookups
  // Map anexoId -> classification -> sum(importe)
  const annexMap = new Map<string, Map<string, Decimal>>();
  ficha.anexos.forEach((anexo) => {
    const classMap = new Map<string, Decimal>();
    anexo.rows.forEach((row) => {
      const current = classMap.get(row.classification) || new Decimal(0);
      classMap.set(row.classification, current.plus(new Decimal(row.importe)));
    });
    annexMap.set(anexo.id, classMap);
  });

  // Helper to get sum of an anexo (all rows)
  const getAnnexTotal = (anexoId: string): Decimal => {
    const classes = annexMap.get(anexoId);
    if (!classes) return new Decimal(0);
    return Array.from(classes.values()).reduce((acc, val) => acc.plus(val), new Decimal(0));
  };

  // Map classification -> Array of CostRow IDs
  const rowsByClass = new Map<string, string[]>();
  ficha.rows.forEach((row) => {
    const list = rowsByClass.get(row.classification) || [];
    list.push(row.id);
    rowsByClass.set(row.classification, list);
  });

  // Map ID -> CostRow (for quick access)
  const rowMap = new Map<string, CostRow>();
  ficha.rows.forEach((row) => {
    rowMap.set(row.id, {
        ...row,
        total: row.total ?? 0,
        audit: row.audit ?? [],
        fuente: row.fuente ?? ''
    });
  });

  const parser = new Parser();
  // Register SUM_ANEXO as specified: SUM_ANEXO('id','clas')
  parser.functions.SUM_ANEXO = (anexoId: string, classification: string) => {
    return annexMap.get(anexoId)?.get(classification)?.toNumber() || 0;
  };

  /**
   * Computes the total for a single row based on the current state of other rows.
   */
  const computeRow = (rowId: string): { total: Decimal; note: string; type: AuditEntry['type']; fuente: string } => {
    const row = rowMap.get(rowId)!;
    const vh = new Decimal(row.valorHistorico || 0);
    const base = row.baseCalculo;

    let total = new Decimal(0);
    let note = '';
    let type: AuditEntry['type'] = 'INFO';
    let detail = '';

    switch (row.formaCalculo) {
      case 'FIJO':
        total = vh;
        detail = `VH=${vh.toFixed(decimals)}`;
        break;

      case 'IMPORTAR_ANEXO':
        if (base?.type === 'ANEXO') {
          const classSum = annexMap.get(base.anexoId)?.get(row.classification) || new Decimal(0);
          total = classSum;
          detail = `${base.anexoId}|${row.classification}`;
          note = `Imported ${total.toFixed(decimals)} from Anexo ${base.anexoId}`;
        } else {
          type = 'WARNING';
          note = 'Missing ANEXO reference for IMPORTAR_ANEXO';
        }
        break;

      case 'PRORRATEO':
      case 'COEFICIENTE': {
        let baseTotalReal = new Decimal(0);
        let baseHist = new Decimal(0);
        let baseLabel = '';

        if (base?.type === 'ANEXO') {
          baseTotalReal = getAnnexTotal(base.anexoId);
          baseHist = baseTotalReal; // Fallback as specified
          baseLabel = `ANEXO:${base.anexoId}`;
        } else if (base?.type === 'FILA') {
          const peerIds = rowsByClass.get(base.classification) || [];
          peerIds.forEach(id => {
            const r = rowMap.get(id)!;
            baseTotalReal = baseTotalReal.plus(new Decimal(r.total || 0));
            baseHist = baseHist.plus(new Decimal(r.valorHistorico || 0));
          });
          baseLabel = `FILA:${base.classification}`;
        }

        if (row.formaCalculo === 'PRORRATEO') {
          if (baseHist.isZero()) {
            total = new Decimal(0);
            type = 'WARNING';
            note = `BaseHist is zero for ${baseLabel}`;
          } else {
            const ratio = vh.div(baseHist);
            total = ratio.times(baseTotalReal);
            detail = `${baseLabel}|ratio=${ratio.toFixed(6)}`;
            note = `Prorrateo: (${vh}/${baseHist}) * ${baseTotalReal.toFixed(decimals)}`;
          }
        } else {
          // COEFICIENTE
          let coef: Decimal;
          if (row.coeficiente !== null && row.coeficiente !== undefined) {
            coef = new Decimal(row.coeficiente);
          } else {
            coef = baseHist.isZero() ? new Decimal(0) : vh.div(baseHist);
          }
          total = coef.times(baseTotalReal);
          detail = `${baseLabel}|coef=${coef.toFixed(6)}`;
          note = `Coeficiente: ${coef.toFixed(6)} * ${baseTotalReal.toFixed(decimals)}`;
        }
        break;
      }

      case 'FORMULA': {
        try {
          let baseTotalReal = new Decimal(0);
          if (base?.type === 'ANEXO') {
            baseTotalReal = getAnnexTotal(base.anexoId);
          } else if (base?.type === 'FILA') {
            const peerIds = rowsByClass.get(base.classification) || [];
            peerIds.forEach(id => {
              baseTotalReal = baseTotalReal.plus(new Decimal(rowMap.get(id)!.total || 0));
            });
          }

          const expr = parser.parse(row.formula || '0');
          const result = expr.evaluate({
            VH: vh.toNumber(),
            BASE_TOTAL: baseTotalReal.toNumber(),
            COEF: row.coeficiente || 0
          });
          total = new Decimal(result);
          detail = row.formula || '0';
          note = `Formula evaluated to ${total.toFixed(decimals)}`;
        } catch (e: any) {
          total = new Decimal(0);
          type = 'ERROR';
          note = `Formula error: ${e.message}`;
        }
        break;
      }
    }

    const fuente = `${row.formaCalculo}|${detail}`;
    return { total, note, type, fuente };
  };

  // 2. Iterative Solver
  let converged = false;
  let iterations = 0;

  while (!converged && iterations < maxIter) {
    iterations++;
    converged = true;

    // We use a temporary map to store results of this iteration to ensure deterministic behavior
    // within the same iteration (Jacobi-style) or we can update in-place (Gauss-Seidel style).
    // The prompt implies we should favor convergence.

    ficha.rows.forEach((row) => {
      const current = rowMap.get(row.id)!;
      const { total: computedTotal, note, type, fuente } = computeRow(row.id);

      const targetTotal = computedTotal.toDecimalPlaces(decimals);
      const prevTotal = new Decimal(current.total || 0);

      if (!targetTotal.equals(prevTotal)) {
        converged = false;

        let nextValue = targetTotal;
        // Apply damping if we suspect a cycle or after initial iterations
        if (iterations > 1 && maxIter > 1) {
            nextValue = prevTotal.times(damping).plus(targetTotal.times(new Decimal(1).minus(damping)));
        }

        const finalTotal = nextValue.toDecimalPlaces(decimals).toNumber();

        // Audit logic
        if (finalTotal !== current.total || iterations === 1) {
            current.audit = current.audit || [];
            current.audit.push({
                ts: new Date().toISOString(),
                actor,
                note: iterations === maxIter && !converged ? `Cycle detected/Converging: ${note}` : note,
                type: iterations === maxIter && !converged ? 'CYCLE_DETECTED' : type,
                prev: current.total,
                now: finalTotal
            });
            current.total = finalTotal;
            current.fuente = fuente;
        }
      } else if (iterations === 1) {
          // Even if it didn't change (e.g. both 0), we record the first calculation
          current.total = targetTotal.toNumber();
          current.fuente = fuente;
          current.audit = current.audit || [];
          current.audit.push({
              ts: new Date().toISOString(),
              actor,
              note,
              type,
              prev: 0,
              now: current.total
          });
      }
    });
  }

  // 3. Post-calculation summaries
  const rows = Array.from(rowMap.values());
  const summary = {
    totalCost: 0,
    totalMargin: 0,
    totalTax: 0,
    grandTotal: 0,
  };

  rows.forEach(r => {
    const val = r.total || 0;
    if (r.type === 'COST') summary.totalCost += val;
    else if (r.type === 'MARGIN') summary.totalMargin += val;
    else if (r.type === 'TAX') summary.totalTax += val;
  });

  summary.grandTotal = new Decimal(summary.totalCost)
    .plus(summary.totalMargin)
    .plus(summary.totalTax)
    .toDecimalPlaces(decimals)
    .toNumber();

  return {
    fichaId: ficha.meta.id,
    rows,
    audits: rows.flatMap(r => r.audit || []),
    summary,
    elapsedMs: Date.now() - startTime,
  };
}
