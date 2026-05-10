import { FichaJSON, CalculationResult, CostRow, ValidationError, CalculatedRow, RowSemanticType } from './types';
import { safeDecimal, ROMAN_MAP, normalize, extractDependencies } from './shared-mapping';
import { createSafeParser, smartTranslate } from './formula-utils';
import Decimal from 'decimal.js';
import { Values } from 'expr-eval';
import { calculateAnnexesPure } from './mapper';

/**
 * Validates a Ficha for circular dependencies, missing references, and semantic errors.
 */
export function validateFicha(ficha: FichaJSON, knownAnnexes: Set<string> = new Set()): { valid: boolean; errors: string[]; validationErrors: ValidationError[] } {
  const errors: string[] = [];
  const validationErrors: ValidationError[] = [];
  const ids = new Set<string>();
  const classifications = new Set<string>();
  const rowMap = new Map<string, CostRow>();

  ficha.rows.forEach((row) => {
    if (ids.has(row.id)) {
        const msg = `Duplicate row ID: ${row.id}`;
        errors.push(msg);
        validationErrors.push({ rowId: row.id, message: msg, type: 'CRITICAL', code: 'INVALID_FORMULA' });
    }
    ids.add(row.id);
    rowMap.set(row.id, row);
    classifications.add(row.classification);
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const adj = new Map<string, string[]>();

  ficha.rows.forEach((row) => {
    const deps = extractDependencies(row, ficha.rows, knownAnnexes);
    adj.set(row.id, deps);
  });

  const getAncestors = (rowId: string): Set<string> => {
    const ancestors = new Set<string>();
    let current = rowMap.get(rowId);
    while (current?.parentId) {
      ancestors.add(current.parentId);
      current = rowMap.get(current.parentId);
    }
    return ancestors;
  };

  function hasCycle(u: string): boolean {
    visited.add(u);
    recStack.add(u);
    const neighbors = adj.get(u) || [];
    for (const vId of neighbors) {
      let targetRows = ficha.rows.filter(r => r.classification === vId || r.id === vId);
      for (const vRow of targetRows) {
          const v = vRow.id;
          if (v === u && vId !== u) continue;
          if (recStack.has(v)) {
              const uRow = rowMap.get(u);
              const ancestorsOfU = getAncestors(u);
              if (ancestorsOfU.has(v)) {
                  if (!validationErrors.some(e => e.rowId === u && e.code === 'HIERARCHY')) {
                    validationErrors.push({
                        rowId: u,
                        message: `Validación de Jerarquía: Esta fila ('${uRow?.label}') depende de un valor superior ('${vRow.label}'). Asegúrese de que no esté incluida en la sumatoria total del padre para evitar duplicidad.`,
                        type: 'WARNING',
                        code: 'HIERARCHY'
                    });
                  }
              } else {
                  validationErrors.push({
                    rowId: u,
                    message: `Referencia Circular Detectada: El cálculo no puede procesarse porque las celdas se llaman entre sí indefinidamente ('${uRow?.label}' <-> '${vRow.label}').`,
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

  ficha.rows.forEach((row) => { if (!visited.has(row.id)) hasCycle(row.id); });

  const getSectionPrefix = (r: CostRow) => r.classification.split('.')[0];
  ficha.rows.forEach((row) => {
    const deps = adj.get(row.id) || [];
    deps.forEach(vId => {
        let targets = ficha.rows.filter(r => r.classification === vId || r.id === vId);
        targets.forEach(vRow => {
            if (vRow.id === row.id) return;
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
        });
    });

    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
      if (!Array.from(classifications).includes(base.classification) && !ids.has(base.classification)) {
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

    const formulaToUse = row.formula || row.totalFormula;
    if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        const refMatches = formulaToUse.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
        for (const match of Array.from(refMatches)) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                validationErrors.push({ rowId: row.id, message: `Referencia en fórmula no resuelta: ${refId}`, type: 'CRITICAL', code: 'MISSING_REF' });
            }
        }
    }
  });

  return { valid: !validationErrors.some(e => e.type === 'CRITICAL'), errors, validationErrors };
}

export function calculateFicha(ficha: FichaJSON, options?: { actor?: string; maxIter?: number; damping?: number }): CalculationResult {
  const startTime = Date.now();
  const actor = options?.actor || 'system';
  const decimals = ficha.meta.decimals || 2;
  const maxIter = options?.maxIter ?? 20;
  const dampingValue = options?.damping ?? 0.6;
  const damping = new Decimal(dampingValue);
  const knownIds = new Set(ficha.rows.map(r => r.id));
  const knownClasses = new Set(ficha.rows.map(r => r.classification));
  const knownAnnexes = new Set(ficha.anexos.map(a => a.id));

  const { validationErrors } = validateFicha(ficha, knownAnnexes);

  // FIX: Ensure annex processing produces rows that calculateFicha expects
  const processedAnexos = (ficha.anexos || []).map(anexo => {
      const calc = calculateAnnexesPure(anexo, decimals);
      // If calculateAnnexesPure returned an object with .data, convert back to .rows
      if (calc.data && !calc.rows) {
          return { ...calc, rows: calc.data };
      }
      return calc;
  });

  const annexSumMap = new Map<string, Map<string, Decimal>>();
  const annexTotals = new Map<string, number>();

  processedAnexos.forEach((anexo) => {
    const normId = normalize(anexo.id);
    const classMap = new Map<string, Decimal>();
    let totalAnexo = new Decimal(0);
    const rows = (anexo.rows || anexo.data || []).filter((r: any) => !!r);
    rows.forEach((row: any) => {
      const cls = normalize(row.classification || row.label || '');
      const current = classMap.get(cls) || new Decimal(0);
      const val = [row.importe, row.total, row.amount, row.depreciation_cost, row.price_total, row.value, row.cost].find(v => v !== undefined && v !== null) ?? 0;
      const dVal = safeDecimal(val);
      classMap.set(cls, current.plus(dVal).toDecimalPlaces(decimals));
      totalAnexo = totalAnexo.plus(dVal);
    });
    annexSumMap.set(normId, classMap);
    annexTotals.set(normId, totalAnexo.toDecimalPlaces(decimals).toNumber());
  });

  const calculatedRows = new Map<string, CalculatedRow>();
  ficha.rows.forEach((row) => {
    calculatedRows.set(row.id, {
      ...row,
      total: Number(row.valorHistorico || 0),
      calculatedVH: Number(row.valorHistorico || 0),
      audit: [],
      baseTotal: 0,
      baseHist: 0,
    });
  });

  const parser = createSafeParser();
  parser.functions.ref = (id: string) => {
    const targets = ficha.rows.filter(r => r.id === id || r.classification === id);
    if (targets.length === 0) return 0;
    return targets.reduce((sum, t) => sum.plus(new Decimal(calculatedRows.get(t.id)?.total || 0)), new Decimal(0)).toNumber();
  };
  parser.functions.vh = (id: string) => {
    const targets = ficha.rows.filter(r => r.id === id || r.classification === id);
    if (targets.length === 0) return 0;
    return targets.reduce((sum, t) => sum.plus(new Decimal(calculatedRows.get(t.id)?.calculatedVH || t.valorHistorico || 0)), new Decimal(0)).toNumber();
  };
  parser.functions.SUM_ANEXO = (anexoId: string | number, classification?: string) => {
    const id = String(anexoId);
    if (!classification) return annexTotals.get(id) || 0;
    const normalizedTarget = normalize(classification);
    const aMap = annexSumMap.get(id);
    if (!aMap) return 0;
    let sum = new Decimal(0);
    for (const [cls, val] of Array.from(aMap.entries())) {
        if (normalize(cls).startsWith(normalizedTarget)) sum = sum.plus(val);
    }
    return sum.toNumber();
  };

  const getAnnexSumForPrefix = (anexoId: string, prefix: string): Decimal => {
    const id = normalize(anexoId);
    const aMap = annexSumMap.get(id);
    if (!aMap) return new Decimal(-1);
    const normalizedPrefix = normalize(prefix);
    let sum = new Decimal(0);
    let found = false;
    for (const [cls, val] of Array.from(aMap.entries())) {
        if (cls.startsWith(normalizedPrefix)) {
            sum = sum.plus(val);
            found = true;
        }
    }
    return found ? sum : new Decimal(-1);
  };

  const computeRowTotal = (row: CostRow, currentMap: Map<string, CalculatedRow>) => {
    let total = new Decimal(0);
    let type: any = 'INFO';
    let baseTotalValue = new Decimal(0);
    let baseHistValue = new Decimal(0);

    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
        ficha.rows.filter(r => r.classification === base.classification || r.id === base.classification).forEach(t => {
            baseTotalValue = baseTotalValue.plus(safeDecimal(currentMap.get(t.id)?.total || 0));
            baseHistValue = baseHistValue.plus(safeDecimal(currentMap.get(t.id)?.calculatedVH || t.valorHistorico || 0));
        });
    } else if (base?.type === 'ANEXO') {
        const prefixSum = getAnnexSumForPrefix(base.anexoId, row.classification);
        const val = prefixSum.gte(0) ? prefixSum.toNumber() : (annexTotals.get(base.anexoId) || 0);
        baseTotalValue = safeDecimal(val);
        baseHistValue = safeDecimal(val);
    }

    if (ficha.rules) {
        const applicableRules = ficha.rules.filter(rule =>
            rule.enabled &&
            ((rule.targetClassification && row.classification.startsWith(rule.targetClassification)) ||
             (rule.targetType && row.type === rule.targetType))
        ).sort((a, b) => b.priority - a.priority);
        if (applicableRules.length > 0 && applicableRules[0].formulaOverride) {
            row = { ...row, formaCalculo: 'FORMULA', formula: applicableRules[0].formulaOverride, metadata: { ...row.metadata, ruleId: applicableRules[0].id } };
            type = 'RULE_APPLIED';
        }
    }

    switch (row.formaCalculo) {
      case 'FIJO': total = new Decimal(row.valorHistorico || 0); break;
      case 'PORCENTAJE': case 'COEFICIENTE':
        total = baseTotalValue.times(safeDecimal(row.coeficiente || 0)).dividedBy(row.formaCalculo === 'PORCENTAJE' ? 100 : 1);
        break;
      case 'DISTRIBUCION': total = baseTotalValue.times(safeDecimal(row.coeficiente || 0)); break;
      case 'IMPORTAR_ANEXO': case 'ANEXO':
        const annexSum = getAnnexSumForPrefix(base?.type === 'ANEXO' ? base.anexoId : '', row.classification);
        if (annexSum.gte(0)) {
            total = annexSum;
        } else {
            // Fallback to baseTotalValue which already contains the annex total if type is ANEXO
            total = baseTotalValue;
        }
        break;
      case 'PRORRATEO':
        const pSum = getAnnexSumForPrefix(base?.type === 'ANEXO' ? base.anexoId : '', row.classification);
        const effectiveBaseHist = baseHistValue.isZero() ? pSum : baseHistValue;
        const effectiveBaseTotal = baseTotalValue.isZero() ? pSum : baseTotalValue;
        const ratio = effectiveBaseHist.isZero() ? new Decimal(0) : safeDecimal(row.valorHistorico || 0).dividedBy(effectiveBaseHist);
        total = effectiveBaseTotal.times(ratio);
        break;
                  case 'FORMULA':
        try {
            const formulaToUse = row.formula || row.totalFormula || '0';
            const translated = smartTranslate(formulaToUse, knownIds, knownClasses, Array.from(knownAnnexes));
            const expr = parser.parse(translated);
            const context: any = {
                VH: safeDecimal(currentMap.get(row.id)?.calculatedVH || row.valorHistorico || 0).toNumber(),
                BASE_TOTAL: baseTotalValue.toNumber(),
                COEF: row.coeficiente || 0,
                QUANTITY: Number(ficha.meta.quantity || 0),
                cantidad: Number(ficha.meta.quantity || 0),
                quantity: Number(ficha.meta.quantity || 0),
                children: ficha.rows.filter(r => r.parentId === row.id).map(r => currentMap.get(r.id)?.total || 0),
                hijos: ficha.rows.filter(r => r.parentId === row.id).map(r => currentMap.get(r.id)?.total || 0)
            };
            ficha.anexos.forEach((anexo, idx) => {
                const normId = normalize(anexo.id);
                const totalVal = annexTotals.get(normId) || 0;
                const prefixSum = getAnnexSumForPrefix(anexo.id, row.classification);
                const valueToUse = prefixSum.gte(0) ? prefixSum.toNumber() : 0;

                context[anexo.id] = valueToUse;
                context[`Anexo${anexo.id}`] = valueToUse;
                context[anexo.id.toUpperCase()] = valueToUse;
                context[`ANEXO${anexo.id.toUpperCase()}`] = valueToUse;

                context[`TotalAnexo${anexo.id}`] = totalVal;
                context[`Total${anexo.id}`] = totalVal;
                context[`TotalAnexo${anexo.id.toUpperCase()}`] = totalVal;

                if (idx < 10) {
                    const roman = ROMAN_MAP[idx+1];
                    context[`Anexo${roman}`] = valueToUse;
                    context[`TotalAnexo${roman}`] = totalVal;
                    context[`Total${roman}`] = totalVal;
                }
            });

            const result = expr.evaluate(context);
            total = new Decimal(isNaN(result) || !isFinite(result) ? 0 : result);
        } catch (e: any) { total = new Decimal(0); type = 'ERROR'; }
        break;
    }
    return { total, type, baseTotal: baseTotalValue, baseHist: baseHistValue };
  };

  let converged = false;
  let iterations = 0;
  while (!converged && iterations < maxIter) {
    iterations++;
    converged = true;
    ficha.rows.forEach((row) => {
      const current = calculatedRows.get(row.id)!;
      const isParentRow = ficha.rows.some(r => r.parentId === row.id);
      if (row.formaCalculo !== 'FIJO') {
        const vhFormulaToUse = isParentRow ? 'sum(children)' : row.vhFormula;
        if (vhFormulaToUse) {
            try {
                const vhFormulaStr = smartTranslate(vhFormulaToUse, knownIds, knownClasses, Array.from(knownAnnexes));
                const vhExpr = parser.parse(vhFormulaStr);
                const vhContext: any = {
                    VH: row.valorHistorico || 0,
                    QUANTITY: Number(ficha.meta.quantity || 0),
                    children: ficha.rows.filter(r => r.parentId === row.id).map(r => calculatedRows.get(r.id)?.calculatedVH || 0)
                };
                const vhRaw = vhExpr.evaluate(vhContext as Values);
                const vhResult = new Decimal(Number(vhRaw) || 0).toDecimalPlaces(decimals).toNumber();
                if (vhResult !== current.calculatedVH) { current.calculatedVH = vhResult; converged = false; }
            } catch (e) {}
        }
      }
      const { total: computedTotal, type, baseTotal, baseHist } = computeRowTotal(row, calculatedRows);
      const targetTotal = computedTotal.toDecimalPlaces(decimals);
      if (!targetTotal.equals(new Decimal(current.total))) {
        converged = false;
        let nextValue = targetTotal;
        if (iterations > 60) nextValue = new Decimal(current.total).times(damping).plus(targetTotal.times(new Decimal(1).minus(damping)));
        current.total = nextValue.toDecimalPlaces(decimals).toNumber();
        current.baseTotal = baseTotal.toDecimalPlaces(decimals).toNumber();
        current.baseHist = baseHist.toDecimalPlaces(decimals).toNumber();
        if (type === 'RULE_APPLIED') current.audit.push({ ts: new Date().toISOString(), actor, type: 'RULE_APPLIED', note: 'Regla aplicada' });
      }
    });
  }

  let totals = { totalCost: 0, totalMargin: 0, totalTax: 0, grandTotal: 0 };
  calculatedRows.forEach(r => {
    const val = r.total;
    if (r.type === 'COST') totals.totalCost += val;
    else if (r.type === 'MARGIN') totals.totalMargin += val;
    else if (r.type === 'TAX') totals.totalTax += val;
  });
  const finalGrandTotal = Array.from(calculatedRows.values())
    .find(r => ['14.1', '14', '5'].includes(r.id))?.total;
  totals.grandTotal = finalGrandTotal ?? (totals.totalCost + totals.totalMargin + totals.totalTax);

  return {
    fichaId: ficha.meta.id,
    fichaName: ficha.meta.name,
    metadata: { header: ficha.meta },
    rows: Array.from(calculatedRows.values()),
    anexos: ficha.anexos,
    audits: Array.from(calculatedRows.values()).flatMap(r => r.audit),
    summary: {
        totalCost: Number(totals.totalCost.toFixed(decimals)),
        totalMargin: Number(totals.totalMargin.toFixed(decimals)),
        totalTax: Number(totals.totalTax.toFixed(decimals)),
        grandTotal: Number(totals.grandTotal.toFixed(decimals))
    },
    validationErrors: validationErrors.map(e => `${e.type}: ${e.message}`),
    deepValidationErrors: validationErrors,
    elapsedMs: Date.now() - startTime,
  };
}

export * from './mapper';
export * from './solver';
export * from './formula-utils';
export * from './shared-mapping';
