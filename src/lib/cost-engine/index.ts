import Decimal from 'decimal.js';
import { Parser } from 'expr-eval';
import {
  FichaJSON,
  CalculationResult,
  CalculatedRow,
  AuditEntry,
  CostRow,
  BaseRef,
  ValidationError,
} from './types';
import { translateFormulaFromSpanish } from './formula-utils';

export function extractDependencies(row: CostRow, allRows: CostRow[]): string[] {
  const deps: string[] = [];

  const extractFromFormula = (formula: string) => {
    // Extract ref('...')
    const refMatches = formula.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
    for (const match of refMatches) {
        deps.push(match[1]);
    }
    // Extract vh('...')
    const vhMatches = formula.matchAll(/vh\(['"]([^'"]+)['"]\)/g);
    for (const match of vhMatches) {
        deps.push(match[1]);
    }
    // Extract children
    if (formula.toLowerCase().includes('children')) {
        const childrenIds = allRows.filter(r => r.parentId === row.id).map(r => r.id);
        deps.push(...childrenIds);
    }
  };

  if (row.calculation_method === 'FORMULA' && row.formula) {
    extractFromFormula(row.formula);
  }

  if (row.vh_formula) {
    extractFromFormula(row.vh_formula);
  }

  if (row.base_ref?.type === 'FILA') {
    deps.push(row.base_ref.classification);
  }

  return deps;
}

export function validateFicha(ficha: FichaJSON): { valid: boolean; errors: string[]; validation_errors: ValidationError[] } {
  const errors: string[] = [];
  const validation_errors: ValidationError[] = [];
  const ids = new Set<string>();
  const classifications = new Set<string>();
  const rowMap = new Map<string, CostRow>();

  ficha.rows.forEach((row) => {
    if (ids.has(row.id)) {
        const msg = `Duplicate row ID: ${row.id}`;
        errors.push(msg);
        validation_errors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'INVALID_FORMULA' });
    }
    ids.add(row.id);
    rowMap.set(row.id, row);

    // Warn about duplicate classifications in main rows (they cause summing in ref())
    if (classifications.has(row.classification)) {
        errors.push(`Duplicate classification detected: ${row.classification}. ref() will sum all matching rows.`);
    }
    classifications.add(row.classification);
  });

  // 1. Dependency Graph & Cycle Detection
  const adj = new Map<string, string[]>();
  const parser = new Parser();

  ficha.rows.forEach((row) => {
    const deps = extractDependencies(row, ficha.rows);

    if (row.calculation_method === 'FORMULA' && row.formula) {
        try {
            const formulaStr = translateFormulaFromSpanish(row.formula.startsWith('=') ? row.formula.substring(1) : row.formula);
            parser.parse(formulaStr);

            // check for trivial formulas
            if (formulaStr.trim() === "0" || formulaStr.trim() === "") {
                validation_errors.push({ rowId: row.id, message: "Fórmula trivial o vacía", type: 'WARNING', code: 'TRIVIAL_FORMULA' });
            }
        } catch (e) {
            validation_errors.push({ rowId: row.id, message: `Fórmula inválida: ${e}`, type: 'CRITICAL', code: 'INVALID_FORMULA' });
        }
    }

    adj.set(row.id, deps);
  });

  // DFS for Cycle Detection
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const getAncestors = (rowId: string): Set<string> => {
    const ancestors = new Set<string>();
    let curr = rowMap.get(rowId);
    while (curr && curr.parentId) {
      ancestors.add(curr.parentId);
      curr = rowMap.get(curr.parentId);
    }
    return ancestors;
  };

  function hasCycle(u: string): boolean {
    visited.add(u);
    recStack.add(u);

    const neighbors = adj.get(u) || [];
    for (const vId of neighbors) {
      // Priority 1: Classification match
      let targetRows = ficha.rows.filter(r => r.classification === vId);
      // Priority 2: ID match
      if (targetRows.length === 0) {
          targetRows = ficha.rows.filter(r => r.id === vId);
      }

      for (const vRow of targetRows) {
          const v = vRow.id;
          // Avoid false self-cycle
          if (v === u && vId !== u) continue;

          if (recStack.has(v)) {
              const uRow = rowMap.get(u);
              const ancestorsOfU = getAncestors(u);
              const isParentRef = ancestorsOfU.has(v);
              const isDirect = v === u || (adj.get(v) || []).some(d => {
                  let dTargets = ficha.rows.filter(r => r.classification === d).map(r => r.id);
                  if (dTargets.length === 0) dTargets = ficha.rows.filter(r => r.id === d).map(r => r.id);
                  return dTargets.includes(u);
              });

              if (isParentRef) {
                  validation_errors.push({
                    rowId: u,
                    message: `Validación de Jerarquía: Esta fila ('${uRow?.label}') depende de un valor superior ('${vRow.label}'). Asegúrese de que no esté incluida en la sumatoria total del padre para evitar duplicidad.`,
                    type: 'WARNING',
                    code: 'HIERARCHY'
                  });
                  // Hierarchical references are not blocked as critical cycles
              } else if (isDirect) {
                  validation_errors.push({
                    rowId: u,
                    message: `Referencia Circular Detectada: El cálculo no puede procesarse porque las celdas se llaman entre sí indefinidamente ('${uRow?.label}' <-> '${vRow.label}').`,
                    type: 'CRITICAL',
                    code: 'CYCLE'
                  });
                  return true;
              } else {
                  validation_errors.push({
                    rowId: u,
                    message: `Ciclo de dependencia detectado: La fila '${uRow?.label}' depende de '${vRow.label}' en un bucle cerrado.`,
                    type: 'CRITICAL',
                    code: 'CYCLE'
                  });
                  return true;
              }
          } else if (!visited.has(v)) {
              if (hasCycle(v)) return true;
          }
      }
    }

    recStack.delete(u);
    return false;
  }

  ficha.rows.forEach((row) => {
    if (!visited.has(row.id)) {
      hasCycle(row.id);
    }
  });

  // 2. Reference Existence & Contextual Check
  const getSectionPrefix = (r: CostRow) => r.classification.split('.')[0];

  ficha.rows.forEach((row) => {
    const deps = adj.get(row.id) || [];
    deps.forEach(vId => {
        let targets = ficha.rows.filter(r => r.classification === vId);
        if (targets.length === 0) targets = ficha.rows.filter(r => r.id === vId);

        targets.forEach(vRow => {
            if (vRow.id === row.id) return;

            // External Ref (INFO-level Warning)
            const uSec = getSectionPrefix(row);
            const vSec = getSectionPrefix(vRow);
            if (uSec !== vSec && uSec !== '' && vSec !== '') {
                if (!validation_errors.some(e => e.rowId === row.id && e.code === 'EXTERNAL_LINK')) {
                    validation_errors.push({
                        rowId: row.id,
                        message: `Vínculo Externo: El valor se calcula en base a la Sección ${vSec}.`,
                        type: 'INFO',
                        code: 'EXTERNAL_LINK'
                    });
                }
            }

            // Parent Ref (non-cycle or general hierarchy warning)
            const ancestors = getAncestors(row.id);
            if (ancestors.has(vRow.id)) {
                if (!validation_errors.some(e => e.rowId === row.id && e.code === 'HIERARCHY')) {
                    validation_errors.push({
                        rowId: row.id,
                        message: `Validación de Jerarquía: Esta fila depende de un valor superior ('${vRow.label}'). Asegúrese de que no esté incluida en la sumatoria total del padre para evitar duplicidad.`,
                        type: 'WARNING',
                        code: 'HIERARCHY'
                    });
                }
            }
        });
    });

    const base = row.base_ref;
    if (base?.type === 'FILA') {
      if (!classifications.has(base.classification) && !ids.has(base.classification)) {
        const msg = `Referencia inexistente: ${base.classification}`;
        errors.push(msg);
        validation_errors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
      }
    } else if (base?.type === 'ANEXO') {
      if (!ficha.anexos.find((a) => a.id === base.anexoId)) {
        const msg = `Anexo inexistente: ${base.anexoId}`;
        errors.push(msg);
        validation_errors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
      }
    }

    // Check ref() in formulas
    if (row.calculation_method === 'FORMULA' && row.formula) {
        const refMatches = row.formula.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
        for (const match of refMatches) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                const msg = `Referencia en fórmula inexistente: ${refId}`;
                errors.push(msg);
                validation_errors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
            }
        }
    }
  });

  // 3. Hard Rules (Section 13, Taxes, etc)
  ficha.rows.forEach(row => {
      // 8.2 Taxes - Base imponible > 0 warning (semantic, done during calculation or here if VH)
      if (row.id === '13.2' || row.classification === '13.2') {
          const deps = adj.get(row.id) || [];
          if (deps.length === 0 && (row.valor_historico || 0) === 0 && row.calculation_method === 'FIJO') {
            validation_errors.push({
                rowId: row.id,
                message: "Advertencia: La base imponible para impuestos es 0.",
                type: 'WARNING',
                code: 'HARD_RULE_VIOLATION'
            });
          }
      }
  });

  return {
    valid: !validation_errors.some(e => e.type === 'CRITICAL'),
    errors,
    validation_errors
  };
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

  // 0. Pre-validate
  const { validation_errors, errors: legacyErrors } = validateFicha(ficha);

  // 1. Prepare maps for O(1) lookup
  const annexSumMap = new Map<string, Map<string, Decimal>>();
  ficha.anexos.forEach((anexo) => {
    const classMap = new Map<string, Decimal>();
    anexo.rows.forEach((row) => {
      const current = classMap.get(row.classification) || new Decimal(0);
      classMap.set(row.classification, current.plus(new Decimal(row.importe || 0)));
    });
    annexSumMap.set(anexo.id, classMap);
  });

  const rowsByClass = new Map<string, CostRow[]>();
  const rowsById = new Map<string, CostRow[]>();

  ficha.rows.forEach((row) => {
    // Index by classification
    const classList = rowsByClass.get(row.classification) || [];
    classList.push(row);
    rowsByClass.set(row.classification, classList);

    // Index by ID
    const idList = rowsById.get(row.id) || [];
    idList.push(row);
    rowsById.set(row.id, idList);
  });

  const annexTotals = new Map<string, number>();
  annexSumMap.forEach((classMap, anexoId) => {
    const total = Array.from(classMap.values()).reduce((acc, val) => acc.plus(val), new Decimal(0)).toNumber();
    annexTotals.set(anexoId, total);
  });

  // 2. Topological Sort (Optimizes convergence to 1-pass for DAGs)
  const sortedRows: CostRow[] = [];
  const visitedSort = new Set<string>();
  const visiting = new Set<string>();

  const sortVisit = (uId: string) => {
    if (visitedSort.has(uId)) return;
    if (visiting.has(uId)) return; // Cycle handled by validation
    visiting.add(uId);

    const row = ficha.rows.find(r => r.id === uId);
    if (row) {
      const deps = extractDependencies(row, ficha.rows);
      for (const dId of deps) {
        let targets = ficha.rows.filter(r => r.classification === dId).map(r => r.id);
        if (targets.length === 0) targets = ficha.rows.filter(r => r.id === dId).map(r => r.id);
        for (const t of targets) {
          if (t !== uId) sortVisit(t);
        }
      }
      sortedRows.push(row);
    }
    visiting.delete(uId);
    visitedSort.add(uId);
  };

  ficha.rows.forEach(r => sortVisit(r.id));

  // If sorting failed somehow, fallback to original order to avoid losing data
  const finalComputeOrder = sortedRows.length === ficha.rows.length ? sortedRows : ficha.rows;

  // 3. Initialize calculated rows
  const calculatedRows = new Map<string, CalculatedRow>();
  ficha.rows.forEach((row) => {
    calculatedRows.set(row.id, {
      ...row,
      total: 0,
      calculated_vh: row.valor_historico || 0,
      audit: [],
    });
  });

  const parser = new Parser();

  // Use Decimal for high precision in parser functions
  parser.functions.SUM_ANEXO = (anexoId: string, classification: string) => {
    return annexSumMap.get(anexoId)?.get(classification)?.toNumber() || 0;
  };

  parser.functions.ref = (arg: any) => {
      const search = String(arg);
      // Priority 1: Classification (Visual Numbering)
      // Priority 2: ID (UUID or template ID)
      let targets = rowsByClass.get(search);
      if (!targets || targets.length === 0) {
          targets = rowsById.get(search) || [];
      }

      const val = targets.reduce((acc, t) => {
          const calculated = calculatedRows.get(t.id);
          return acc.plus(new Decimal(calculated?.total || 0));
      }, new Decimal(0));
      return val.toNumber();
  };

  parser.functions.vh = (arg: any) => {
      const search = String(arg);
      let targets = rowsByClass.get(search);
      if (!targets || targets.length === 0) {
          targets = rowsById.get(search) || [];
      }
      const val = targets.reduce((acc, t) => {
          const calculated = calculatedRows.get(t.id);
          return acc.plus(new Decimal(calculated?.calculated_vh || t.valor_historico || 0));
      }, new Decimal(0));
      return val.toNumber();
  };

  parser.functions.pct = (value: number, percentage: number) => {
      return new Decimal(value || 0).times(new Decimal(percentage || 0).div(100)).toNumber();
  };

  parser.functions.round2 = (value: number) => {
      return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  };

  parser.functions.sum = (...args: any[]) => {
      let flatArgs: any[] = [];
      args.forEach(arg => {
          if (Array.isArray(arg)) flatArgs = flatArgs.concat(arg);
          else flatArgs.push(arg);
      });
      return flatArgs.reduce((a, b) => a.plus(new Decimal(b || 0)), new Decimal(0)).toNumber();
  };

  parser.functions.average = (...args: any[]) => {
      let flatArgs: any[] = [];
      args.forEach(arg => {
          if (Array.isArray(arg)) flatArgs = flatArgs.concat(arg);
          else flatArgs.push(arg);
      });
      if (flatArgs.length === 0) return 0;
      const sum = flatArgs.reduce((a, b) => a.plus(new Decimal(b || 0)), new Decimal(0));
      return sum.div(flatArgs.length).toNumber();
  };

  const computeRowTotal = (
    row: CostRow,
    currentRows: Map<string, CalculatedRow>
  ): { total: Decimal; note: string; type: AuditEntry['type']; fuente: string; base_total: Decimal; base_hist: Decimal } => {
    let total = new Decimal(0);
    let note = '';
    let base_totalValue = new Decimal(0);
    let base_histValue = new Decimal(0);
    let type: AuditEntry['type'] = 'INFO';
    let fuenteParts: string[] = [row.calculation_method];

    const currentCalculated = currentRows.get(row.id);
    const vh = new Decimal(currentCalculated?.calculated_vh || row.valor_historico || 0);

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
    let calculation_methodToUse = row.calculation_method;

    if (ruleOverride) {
        if (ruleOverride.formulaOverride) {
            formulaToUse = ruleOverride.formulaOverride;
            calculation_methodToUse = 'FORMULA';
            note += `Rule '${ruleOverride.name}' v${ruleOverride.version} applied. `;
            type = 'RULE_APPLIED';
        }
    }

    const base = row.base_ref;

    switch (calculation_methodToUse) {
      case 'FIJO':
        total = vh;
        note += `Used VH ${vh.toFixed(decimals)}.`;
        break;

      case 'ANEXO':
      case 'IMPORTAR_ANEXO':
        if (base?.type === 'ANEXO') {
          const classSumMap = annexSumMap.get(base.anexoId);
          const classSum = classSumMap?.get(row.classification);

          if (classSum !== undefined) {
              total = classSum;
              note += `Imported from ${base.anexoId} for class ${row.classification}.`;
          } else {
              total = new Decimal(0);
              note += `Imported from ${base.anexoId} (Class ${row.classification} not found, using 0).`;
          }

          base_totalValue = total;
          base_histValue = total;
          fuenteParts.push(base.anexoId);
        } else {
          type = 'WARNING';
          note += `Missing ANEXO reference.`;
        }
        break;

      case 'PRORRATEO':
      case 'COEFICIENTE':
        let baseRefName = '';

        if (base?.type === 'ANEXO') {
            const classSumMap = annexSumMap.get(base.anexoId);
            const classSum = classSumMap?.get(row.classification);

            if (classSum !== undefined) {
                base_totalValue = classSum;
                note += `Using class ${row.classification} from ${base.anexoId} as base. `;
            } else {
                base_totalValue = Array.from(classSumMap?.values() || []).reduce((acc, val) => acc.plus(val), new Decimal(0));
                note += `Using total of ${base.anexoId} as base (class ${row.classification} not found). `;
            }

            base_histValue = base_totalValue;
            baseRefName = `Anexo:${base.anexoId}`;
        } else if (base?.type === 'FILA') {
            let targets = rowsByClass.get(base.classification);
            if (!targets || (targets?.length === 0)) {
                targets = rowsById.get(base.classification);
            }
            (targets || []).forEach(t => {
                const calculated = currentRows.get(t.id);
                base_totalValue = base_totalValue.plus(new Decimal(calculated?.total || 0));
                base_histValue = base_histValue.plus(new Decimal(t.valor_historico || 0));
            });
            baseRefName = `Fila:${base.classification}`;
        }
        fuenteParts.push(baseRefName);

        if (calculation_methodToUse === 'PRORRATEO') {
            if (base_histValue.isZero()) {
                total = new Decimal(0);
                type = 'WARNING';
                note += `BaseHist is zero for ${baseRefName}.`;
            } else {
                const ratio = vh.div(base_histValue);
                total = ratio.times(base_totalValue);
                note += `Prorrated: (${vh}/${base_histValue}) * ${base_totalValue.toFixed(decimals)}.`;
            }
        } else {
            const coef = new Decimal(row.coeficiente ?? 0);
            total = coef.times(base_totalValue);
            note += `Coefficient: ${coef} * ${base_totalValue.toFixed(decimals)}.`;
        }
        break;

      case 'FORMULA':
        const allowFormulas = ficha.meta.settings?.allowFormulas !== false;
        if (!allowFormulas && !ruleOverride) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formulas are disabled.`;
            break;
        }
        try {
            const formulaStrRaw = (formulaToUse || '0').trim().startsWith('=')
              ? formulaToUse!.trim().substring(1)
              : formulaToUse;

            const formulaStr = translateFormulaFromSpanish(formulaStrRaw || '0');
            const expr = parser.parse(formulaStr);

            if (base?.type === 'ANEXO') {
                 const anexo = annexSumMap.get(base.anexoId);
                 base_totalValue = Array.from(anexo?.values() || []).reduce((acc, val) => acc.plus(val), new Decimal(0));
            } else if (base?.type === 'FILA') {
                let targets = rowsByClass.get(base.classification);
                if (!targets || (targets?.length === 0)) {
                    targets = rowsById.get(base.classification);
                }
                (targets || []).forEach(t => {
                    const calculated = currentRows.get(t.id);
                    base_totalValue = base_totalValue.plus(new Decimal(calculated?.total || 0));
                });
            }

            const context: any = {
                VH: vh.toNumber(),
                BASE_TOTAL: base_totalValue.toNumber(),
                COEF: row.coeficiente || 0,
                children: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => calculatedRows.get(r.id)?.total || 0)
            };

            annexTotals.forEach((total, id) => {
                context[`TotalAnexo${id}`] = total;
                context[`Total${id}`] = total;

                const classSum = annexSumMap.get(id)?.get(row.classification);
                const valueToUse = classSum !== undefined ? classSum.toNumber() : 0;

                context[id] = valueToUse;
                context[`Anexo${id}`] = valueToUse;
            });

            const result = expr.evaluate(context);
            total = new Decimal(result);
            note += `Evaluated: ${formulaToUse}.`;
        } catch (e: any) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formula error: ${e.message}`;
        }
        break;
    }

    return { total, note, type, fuente: fuenteParts.join('|'), base_total: base_totalValue, base_hist: base_histValue };
  };

  // 4. Iterative Solver
  let converged = false;
  let iterations = 0;

  while (!converged && iterations < maxIter) {
    iterations++;
    converged = true;

    finalComputeOrder.forEach((row) => {
      const current = calculatedRows.get(row.id)!;

      // Calculate VH if formula exists
      if (row.vh_formula) {
        try {
            const vh_formulaStrRaw = row.vh_formula.trim().startsWith('=')
              ? row.vh_formula.trim().substring(1)
              : row.vh_formula;
            const vh_formulaStr = translateFormulaFromSpanish(vh_formulaStrRaw);
            const vhExpr = parser.parse(vh_formulaStr);

            const vhContext: any = {
                VH: row.valor_historico || 0,
                children: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => calculatedRows.get(r.id)?.total || 0)
            };

            annexTotals.forEach((total, id) => {
                vhContext[`TotalAnexo${id}`] = total;
                vhContext[`Total${id}`] = total;
                const classSum = annexSumMap.get(id)?.get(row.classification);
                vhContext[id] = classSum !== undefined ? classSum.toNumber() : 0;
                vhContext[`Anexo${id}`] = classSum !== undefined ? classSum.toNumber() : 0;
            });

            const vhResult = new Decimal(vhExpr.evaluate(vhContext)).toDecimalPlaces(decimals).toNumber();
            if (vhResult !== current.calculated_vh) {
                current.calculated_vh = vhResult;
                converged = false;
            }
        } catch (e) {
            // keep existing calculated_vh or fallback
        }
      }

      const { total: computedTotal, note, type, fuente, base_total, base_hist } = computeRowTotal(row, calculatedRows);

      const targetTotal = computedTotal.toDecimalPlaces(decimals);
      const currentTotal = new Decimal(current.total);

      if (!targetTotal.equals(currentTotal)) {
        converged = false;

        let nextValue = targetTotal;
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
            current.base_total = base_total.toNumber();
            current.base_hist = base_hist.toNumber();
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

  // 5. Semantic Validation (Totals vs Children)
  ficha.rows.forEach(row => {
      const children = ficha.rows.filter(r => r.parentId === row.id);
      // We check if it's a sum row. If it has children and calculation is FORMULA with sum, it MUST match.
      if (children.length > 0 && (row.formula?.toLowerCase().includes('sum') || row.formula?.includes('SUMA'))) {
          const calcRow = calculatedRows.get(row.id)!;
          const childrenSum = children.reduce((acc, child) => acc.plus(new Decimal(calculatedRows.get(child.id)?.total || 0)), new Decimal(0));

          const diff = Math.abs(calcRow.total - childrenSum.toNumber());
          if (diff > 0.01) {
              validation_errors.push({
                  rowId: row.id,
                  message: `Error Contable: El total de '${row.label}' (${calcRow.total}) no cuadra con la suma de sus componentes (${childrenSum.toNumber()}). Diferencia: ${diff.toFixed(2)}`,
                  type: 'CRITICAL',
                  code: 'SEMANTIC_DISCREPANCY'
              });
          }
      }
  });

  return {
    fichaId: ficha.meta.id,
    rows: Array.from(calculatedRows.values()),
    audits: Array.from(calculatedRows.values()).flatMap(r => r.audit),
    summary,
    validation_errors: validation_errors.map(e => e.message),
    deepValidationErrors: validation_errors,
    elapsedMs: Date.now() - startTime,
  };
}
