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
import { translateFormulaFromSpanish, smartTranslate } from './formula-utils';

export function extractDependencies(row: CostRow, allRows: CostRow[]): string[] {
  const deps: string[] = [];

  const extractFromFormula = (formula: string) => {
    // Extract ref('...')
    const refMatches = formula.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
    for (const match of refMatches) {
        deps.push(match[1]);
    }
  };

  if (row.formaCalculo === 'FORMULA' && row.formula) {
    extractFromFormula(row.formula);
  }
  if (row.vhFormula) {
    extractFromFormula(row.vhFormula);
  }

  if (row.baseCalculo?.type === 'FILA') {
    deps.push(row.baseCalculo.classification);
  }

  return Array.from(new Set(deps));
}

export function validateFicha(ficha: FichaJSON): { valid: boolean; errors: string[]; validationErrors: ValidationError[] } {
  const errors: string[] = [];
  const validationErrors: ValidationError[] = [];
  const classifications = new Set(ficha.rows.map((r) => r.classification));
  const ids = new Set(ficha.rows.map((r) => r.id));

  // Warn about duplicate classifications in main rows (they cause summing in ref())
  ficha.rows.forEach(row => {
    if (ficha.rows.filter(r => r.classification === row.classification).length > 1) {
        if (!errors.includes(`Duplicate classification detected: ${row.classification}. ref() will sum all matching rows.`)) {
            errors.push(`Duplicate classification detected: ${row.classification}. ref() will sum all matching rows.`);
        }
    }
  });

  // 1. Cycle Detection
  const adj = new Map<string, string[]>();
  ficha.rows.forEach((row) => {
    adj.set(row.id, extractDependencies(row, ficha.rows));
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();

  const getAncestors = (rowId: string, currentSet = new Set<string>()): Set<string> => {
      const row = ficha.rows.find(r => r.id === rowId);
      if (!row || !row.parentId) return currentSet;
      currentSet.add(row.parentId);
      return getAncestors(row.parentId, currentSet);
  };

  function hasCycle(u: string): boolean {
    visited.add(u);
    recStack.add(u);

    const neighbors = adj.get(u) || [];
    for (const vId of neighbors) {
      let targets = ficha.rows.filter(r => r.classification === vId).map(r => r.id);
      if (targets.length === 0) targets = ficha.rows.filter(r => r.id === vId).map(r => r.id);

      for (const v of targets) {
          // Hierarchical references are not blocked as critical cycles
          const ancestors = getAncestors(u);
          if (ancestors.has(v)) continue;

          if (!visited.has(v)) {
            if (hasCycle(v)) return true;
          } else if (recStack.has(v)) {
            const msg = `Ciclo detectado: ${u} -> ${v}`;
            errors.push(msg);
            validationErrors.push({ rowId: u, message: msg, type: 'CRITICAL', code: 'CYCLE' });
            return true;
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
                if (!validationErrors.some(e => e.rowId === row.id && e.code === 'EXTERNAL_LINK')) {
                    validationErrors.push({
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
                if (!validationErrors.some(e => e.rowId === row.id && e.code === 'HIERARCHY')) {
                    validationErrors.push({
                        rowId: row.id,
                        message: `Validación de Jerarquía: Esta fila depende de un valor superior ('${vRow.label}'). Asegúrese de que no esté incluida en la sumatoria total del padre para evitar duplicidad.`,
                        type: 'WARNING',
                        code: 'HIERARCHY'
                    });
                }
            }
        });
    });

    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
      if (!classifications.has(base.classification) && !ids.has(base.classification)) {
        const msg = `Referencia inexistente: ${base.classification}`;
        errors.push(msg);
        validationErrors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
      }
    } else if (base?.type === 'ANEXO') {
      if (!ficha.anexos.find((a) => a.id === base.anexoId)) {
        const msg = `Anexo inexistente: ${base.anexoId}`;
        errors.push(msg);
        validationErrors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
      }
    }

    // Check ref() in formulas
    if (row.formaCalculo === 'FORMULA' && row.formula) {
        const refMatches = row.formula.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
        for (const match of refMatches) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                const msg = `Referencia en fórmula inexistente: ${refId}`;
                errors.push(msg);
                validationErrors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'MISSING_REF' });
            }
        }
    }
  });

  // 3. Hard Rules (Section 13, Taxes, etc)
  ficha.rows.forEach(row => {
      // 8.2 Taxes - Base imponible > 0 warning (semantic, done during calculation or here if VH)
      if (row.id === '13.2' || row.classification === '13.2') {
          const deps = adj.get(row.id) || [];
          if (deps.length === 0 && (row.valorHistorico || 0) === 0 && row.formaCalculo === 'FIJO') {
            validationErrors.push({
                rowId: row.id,
                message: "Advertencia: La base imponible para impuestos es 0.",
                type: 'WARNING',
                code: 'HARD_RULE_VIOLATION'
            });
          }
      }
  });

  return {
    valid: !validationErrors.some(e => e.type === 'CRITICAL'),
    errors,
    validationErrors
  };
}





export function calculateFicha(ficha: FichaJSON, optionsOrActor: string | any = 'system'): CalculationResult {
  const parser = new Parser();
  const startTime = Date.now();
  const actor = typeof optionsOrActor === 'string' ? optionsOrActor : 'system';
  const options = typeof optionsOrActor === 'object' ? optionsOrActor : {};

  const decimals = ficha.meta.decimals ?? 2;
  const maxIter = options.maxIter ?? ficha.meta.settings?.maxIter ?? 20;
  const damping = new Decimal(options.damping ?? ficha.meta.settings?.damping ?? 0.5);
  const validationErrors: ValidationError[] = [];

  const rowsById = new Map<string, CostRow[]>();
  const rowsByClass = new Map<string, CostRow[]>();
  const knownIds = new Set<string>();
  const knownClasses = new Set<string>();

  ficha.rows.forEach(r => {
    if (!rowsById.has(r.id)) rowsById.set(r.id, []);
    rowsById.get(r.id)!.push(r);
    knownIds.add(r.id);
    if (r.classification) {
      if (!rowsByClass.has(r.classification)) rowsByClass.set(r.classification, []);
      rowsByClass.get(r.classification)!.push(r);
      knownClasses.add(r.classification);
    }
  });

  const annexTotals = new Map<string, number>();
  const annexSumMap = new Map<string, Map<string, Decimal>>();
  ficha.anexos.forEach(anexo => {
    const sum = (anexo.rows || []).reduce((acc, row) => acc.plus(new Decimal(row.importe || 0)), new Decimal(0));
    annexTotals.set(anexo.id, sum.toNumber());
    const classMap = new Map<string, Decimal>();
    (anexo.rows || []).forEach(row => {
      const current = classMap.get(row.classification) || new Decimal(0);
      classMap.set(row.classification, current.plus(new Decimal(row.importe || 0)));
    });
    annexSumMap.set(anexo.id, classMap);
  });

  const calculatedRows = new Map<string, CalculatedRow>();
  ficha.rows.forEach(row => {
    calculatedRows.set(row.id, {
      ...row,
      total: 0,
      calculatedVH: row.valorHistorico || 0,
      audit: []
    });
  });

  const computeRowTotal = (row: CostRow, currentRows: Map<string, CalculatedRow>) => {
    let total = new Decimal(0);
    let note = '';
    let type: AuditEntry['type'] = 'INFO';
    let baseTotalValue = new Decimal(0);
    let baseHistValue = new Decimal(0);

    const isParent = ficha.rows.some(r => r.parentId === row.id);
    let formulaToUse = row.formula || (isParent ? 'HIJOS' : '');
    let ruleApplied = false;

    if (ficha.rules) {
        for (const rule of ficha.rules) {
            if (!rule.enabled) continue;
            let matches = false;
            if (rule.targetClassification && row.classification.startsWith(rule.targetClassification)) matches = true;
            if (rule.targetType && row.type === rule.targetType) matches = true;
            if (matches && rule.formulaOverride) {
                formulaToUse = rule.formulaOverride;
                ruleApplied = true;
                break;
            }
        }
    }

    if (row.baseCalculo?.type === 'ANEXO') {
        const anId = row.baseCalculo.anexoId;
        const classSum = annexSumMap.get(anId)?.get(row.classification);
        baseTotalValue = classSum || new Decimal(annexTotals.get(anId) || 0);
    } else if (row.baseCalculo?.type === 'FILA') {
        const targets = rowsByClass.get(row.baseCalculo.classification) || rowsById.get(row.baseCalculo.classification) || [];
        targets.forEach(t => baseTotalValue = baseTotalValue.plus(new Decimal(currentRows.get(t.id)?.total || 0)));
    }

    const formaCalculo = ruleApplied ? 'FORMULA' : row.formaCalculo;

    switch (formaCalculo) {
      case 'FIJO':
        total = new Decimal(row.valorHistorico || 0);
        note = 'Valor Fijo';
        break;
      case 'IMPORTAR_ANEXO':
        total = baseTotalValue;
        note = `Importado de Anexo`;
        break;
      case 'PRORRATEO':
      case 'COEFICIENTE':
        const vh = new Decimal(currentRows.get(row.id)?.calculatedVH || row.valorHistorico || 0);
        if (formaCalculo === 'PRORRATEO') {
            let baseHist = new Decimal(0);
            if (row.baseCalculo?.type === 'FILA') {
                const targets = rowsByClass.get(row.baseCalculo.classification) || rowsById.get(row.baseCalculo.classification) || [];
                targets.forEach(t => baseHist = baseHist.plus(new Decimal(t.valorHistorico || 0)));
            } else { baseHist = baseTotalValue; }
            baseHistValue = baseHist;
            if (baseHist.isZero()) { total = new Decimal(0); note = 'Base historial es cero'; }
            else { total = vh.div(baseHist).times(baseTotalValue); note = `Prorrateo: (${vh}/${baseHist}) * ${baseTotalValue}`; }
        } else {
            const coef = new Decimal(row.coeficiente || 0);
            total = coef.times(baseTotalValue);
            note = `Coeficiente: ${coef} * ${baseTotalValue}`;
        }
        break;

      case 'FORMULA':
        let currentFormula = formulaToUse;
        let tFormula = '';
        try {
            const rawF = currentFormula.trim().startsWith('=') ? currentFormula.trim().substring(1) : currentFormula;
            tFormula = smartTranslate(rawF, knownIds, knownClasses);
            const expr = parser.parse(tFormula);
            const context: any = {
                VH: currentRows.get(row.id)?.calculatedVH || row.valorHistorico || 0,
                vh: (id: any) => {
                   const sid = String(id);
                   if (currentRows.has(sid)) return currentRows.get(sid)!.calculatedVH;
                   const matches = ficha.rows.filter(r => r.classification === sid);
                   return matches.length > 0 ? (matches[0].valorHistorico || 0) : 0;
                },
                ref: (id: any) => {
                   const sid = String(id);
                   if (currentRows.has(sid)) return currentRows.get(sid)!.total;
                   const matches = ficha.rows.filter(r => r.classification === sid);
                   return matches.length > 0 ? matches.reduce((acc, r) => acc + (currentRows.get(r.id)?.total || 0), 0) : 0;
                },
                BASE_TOTAL: baseTotalValue.toNumber(),
                COEF: row.coeficiente || 0,
                QUANTITY: Number(ficha.meta.quantity) || 0,
                header: ficha.meta,
                children: ficha.rows.filter(r => r.parentId === row.id).reduce((acc, r) => acc + (currentRows.get(r.id)?.total || 0), 0)
            };
            const romanMap = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            ficha.anexos.forEach((anexo, idx) => {
                const val = annexTotals.get(anexo.id) || 0;
                const filtered = annexSumMap.get(anexo.id)?.get(row.classification)?.toNumber() || 0;
                context[`Anexo${anexo.id}`] = filtered;
                context[`TotalAnexo${anexo.id}`] = val;
                context[anexo.id] = filtered;
                if (idx < romanMap.length) {
                    context[`Anexo${romanMap[idx]}`] = filtered;
                    context[`TotalAnexo${romanMap[idx]}`] = val;
                }
            });
            const resVal = expr.evaluate(context);  total = new Decimal(resVal || 0);
            note = ruleApplied ? `Regla aplicada: ${formulaToUse}` : `Formula result: ${total}`;
            if (ruleApplied) type = 'RULE_APPLIED';
        } catch (e: any) {
            total = new Decimal(0);
            type = 'ERROR';
            note = `Formula error: ${e.message} (Formula: ${tFormula})`;
        }
        break;

    }
    return { total, note, type, baseTotal: baseTotalValue, baseHist: baseHistValue };
  };

  let converged = false;
  let iterations = 0;
  while (!converged && iterations < maxIter) {
    iterations++; converged = true;
    ficha.rows.forEach(row => {
      const current = calculatedRows.get(row.id)!;
      const { total: targetTotal, note, type, baseTotal, baseHist } = computeRowTotal(row, calculatedRows);
      const targetVal = targetTotal.toDecimalPlaces(decimals).toNumber();
      const currentVal = current.total;
      if (Math.abs(targetVal - currentVal) > 0.0000001) {
        converged = false;
        let nextValue = (iterations > maxIter / 2) ? (currentVal * damping.toNumber() + targetVal * (1 - damping.toNumber())) : targetVal;
        current.total = Number(nextValue.toFixed(decimals));
        current.baseTotal = baseTotal.toNumber();
        current.baseHist = baseHist.toNumber();
        if (iterations === 1 || iterations === maxIter || type === 'RULE_APPLIED' || type === 'ERROR') {
           current.audit.push({ ts: new Date().toISOString(), actor, type: (iterations === maxIter && !converged ? 'CYCLE_DETECTED' : type), rowId: row.id, prev: currentVal.toString(), now: current.total.toString(), note });
        }
      }
    });
  }

  const summary = { totalCost: 0, totalMargin: 0, totalTax: 0, grandTotal: 0 };
  calculatedRows.forEach(r => {
    if (r.type === 'COST') summary.totalCost += r.total;
    else if (r.type === 'MARGIN') summary.totalMargin += r.total;
    else if (r.type === 'TAX') summary.totalTax += r.total;
  });
  summary.grandTotal = Number((summary.totalCost + summary.totalMargin + summary.totalTax).toFixed(decimals));

  return {
    fichaId: ficha.meta.id, fichaName: ficha.meta.name, metadata: { header: ficha.meta },
    rows: Array.from(calculatedRows.values()), anexos: ficha.anexos, audits: Array.from(calculatedRows.values()).flatMap(r => r.audit),
    summary, validationErrors: [], deepValidationErrors: [], elapsedMs: Date.now() - startTime
  };
}
