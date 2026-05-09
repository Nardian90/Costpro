import { FichaJSON, CalculationResult, CostRow, ValidationError, CalculatedRow } from './types';
import { safeDecimal, ROMAN_MAP, normalize, extractDependencies } from './shared-mapping';
import { createSafeParser, smartTranslate } from './formula-utils';
import Decimal from 'decimal.js';
import { Values } from 'expr-eval';
import { calculateAnnexesPure } from './mapper';

interface VHFormulaContext {
  VH: number;
  QUANTITY: number;
  cantidad: number;
  quantity: number;
  header: any;
  children: number[];
  hijos: number[];
  [key: string]: any;
}

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
      let targetRows = ficha.rows.filter(r => r.classification === vId);
      if (targetRows.length === 0) {
          targetRows = ficha.rows.filter(r => r.id === vId);
      }

      for (const vRow of targetRows) {
          const v = vRow.id;
          if (v === u && vId !== u) continue;

          if (recStack.has(v)) {
              const uRow = rowMap.get(u);
              const ancestorsOfU = getAncestors(u);
              const isParentRef = ancestorsOfU.has(v);

              if (isParentRef) {
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

  ficha.rows.forEach((row) => {
    if (!visited.has(row.id)) {
      hasCycle(row.id);
    }
  });

  const getSectionPrefix = (r: CostRow) => r.classification.split('.')[0];

  ficha.rows.forEach((row) => {
    const deps = adj.get(row.id) || [];
    deps.forEach(vId => {
        let targets = ficha.rows.filter(r => r.classification === vId);
        if (targets.length === 0) targets = ficha.rows.filter(r => r.id === vId);

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

    const formulaToUse = row.formula || row.totalFormula;
    if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        const refMatches = formulaToUse.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
        for (const match of Array.from(refMatches)) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                const msg = `Referencia en fórmula no resuelta: ${refId}`;
                validationErrors.push({ rowId: row.id, message: msg, type: 'WARNING', code: 'MISSING_REF' });
            }
        }
    }
  });

  return {
    valid: !validationErrors.some(e => e.type === 'CRITICAL'),
    errors,
    validationErrors
  };
}

/**
 * Main calculation engine. Uses an iterative solver for circular or complex dependencies.
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

  const knownIds = new Set(ficha.rows.map(r => r.id));
  const knownClasses = new Set(ficha.rows.map(r => r.classification));
  const knownAnnexes = new Set(ficha.anexos.map(a => a.id));

  // 0. Pre-validate
  const { validationErrors } = validateFicha(ficha, knownAnnexes);

  // 1. Resolve internal Annex formulas (hours * rate, etc) before summing
  const processedAnexos = (ficha.anexos || []).map(anexo => calculateAnnexesPure(anexo, decimals));

  // 2. Prepare maps for O(1) lookup
  const annexSumMap = new Map<string, Map<string, Decimal>>();
  const annexTotals = new Map<string, number>();

  processedAnexos.forEach((anexo) => {
    const classMap = new Map<string, Decimal>();
    let totalAnexo = new Decimal(0);
    anexo.rows.forEach((row) => {
      const current = classMap.get(row.classification) || new Decimal(0);
      const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe, row.value, row.cost].find(v => v !== undefined && v !== null) ?? 0;
      const dVal = safeDecimal(val);
      classMap.set(row.classification, current.plus(dVal).toDecimalPlaces(decimals));
      totalAnexo = totalAnexo.plus(dVal);
    });
    annexSumMap.set(anexo.id, classMap);
    annexTotals.set(anexo.id, totalAnexo.toDecimalPlaces(decimals).toNumber());
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

  // Custom engine functions
  parser.functions.ref = (id: string) => {
    let sum = new Decimal(0);
    let found = false;
    for (const r of ficha.rows) {
      if (r.id === id || r.classification === id) {
        sum = sum.plus(new Decimal(calculatedRows.get(r.id)?.total || 0));
        found = true;
      }
    }
    return found ? sum.toNumber() : 0;
  };

  parser.functions.vh = (id: string) => {
    let sum = new Decimal(0);
    let found = false;
    for (const r of ficha.rows) {
      if (r.id === id || r.classification === id) {
        sum = sum.plus(new Decimal(calculatedRows.get(r.id)?.calculatedVH || r.valorHistorico || 0));
        found = true;
      }
    }
    return found ? sum.toNumber() : 0;
  };

  parser.functions.SUM_ANEXO = (anexoId: string | number, classification?: string) => {
    const id = String(anexoId);
    if (!classification) return annexTotals.get(id) || 0;
    const normalizedTarget = normalize(classification);
    const aMap = annexSumMap.get(id);
    if (!aMap) return 0;

    let sum = new Decimal(0);
    for (const entry of Array.from(aMap.entries())) {
        const [cls, val] = entry;
        if (normalize(cls).startsWith(normalizedTarget)) {
            sum = sum.plus(val);
        }
    }
    return sum.toNumber();
  };

  const getAnnexSumForPrefix = (anexoId: string, prefix: string): Decimal => {
    const aMap = annexSumMap.get(anexoId);
    if (!aMap) return new Decimal(-1);
    const normalizedPrefix = normalize(prefix);
    let sum = new Decimal(0);
    let found = false;
    for (const entry of Array.from(aMap.entries())) {
        const [cls, val] = entry;
        if (normalize(cls).startsWith(normalizedPrefix)) {
            sum = sum.plus(val);
            found = true;
        }
    }
    return found ? sum : new Decimal(-1);
  };

  // 3. Evaluation logic
  const computeRowTotal = (row: CostRow, currentMap: Map<string, CalculatedRow>) => {
    let total = new Decimal(0);
    let note = '';
    let type: any = 'INFO';
    let fuenteParts: string[] = [];
    let baseTotalValue = new Decimal(0);
    let baseHistValue = new Decimal(0);

    const base = row.baseCalculo;
    if (base?.type === 'FILA') {
        const targets = ficha.rows.filter(r => r.classification === base.classification || r.id === base.classification);
        targets.forEach(t => {
            const tr = currentMap.get(t.id);
            baseTotalValue = baseTotalValue.plus(safeDecimal(tr?.total || 0));
            baseHistValue = baseHistValue.plus(safeDecimal(tr?.calculatedVH || t.valorHistorico || 0));
        });
        fuenteParts.push(`REF:${base.classification}`);
    } else if (base?.type === 'ANEXO') {
        const val = annexTotals.get(base.anexoId) || 0;
        baseTotalValue = safeDecimal(val);
        baseHistValue = safeDecimal(val);
        fuenteParts.push(`ANX:${base.anexoId}`);
    }

    switch (row.formaCalculo) {
      case 'FIJO':
        total = new Decimal(row.valorHistorico || 0);
        note = 'Valor manual fijo. ';
        fuenteParts.push('MANUAL');
        break;
      case 'PORCENTAJE':
        total = baseTotalValue.times(safeDecimal(row.coeficiente || 0)).dividedBy(100);
        note = `${row.coeficiente}% de base (${baseTotalValue.toNumber()}). `;
        fuenteParts.push('PRC');
        break;
      case 'DISTRIBUCION':
        total = baseTotalValue.times(safeDecimal(row.coeficiente || 0));
        note = `Distribución: base * ${row.coeficiente}. `;
        fuenteParts.push('DST');
        break;
      case 'FORMULA':
        try {
            const formulaToUse = row.formula || row.totalFormula || '0';
            const translated = smartTranslate(formulaToUse, knownIds, knownClasses, knownAnnexes);
            const expr = parser.parse(translated);
            const vh = safeDecimal(currentMap.get(row.id)?.calculatedVH || row.valorHistorico || 0);

            const context: any = {
                VH: vh.toNumber(),
                BASE_TOTAL: baseTotalValue.toNumber(),
                COEF: row.coeficiente || 0,
                QUANTITY: Number(ficha.meta.quantity || 0),
                cantidad: Number(ficha.meta.quantity || 0),
                quantity: Number(ficha.meta.quantity || 0),
                header: ficha.meta,
                children: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => currentMap.get(r.id)?.total || 0),
                hijos: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => currentMap.get(r.id)?.total || 0)
            };

            const romanMap = Object.values(ROMAN_MAP);
            processedAnexos.forEach((anexo, idx) => {
                const totalVal = annexTotals.get(anexo.id) || 0;
                const prefixSum = getAnnexSumForPrefix(anexo.id, row.classification);
                const valueToUse = prefixSum.gte(0) ? prefixSum.toNumber() : 0;

                const variations = [anexo.id, `Anexo${anexo.id}`, anexo.id.toUpperCase(), `ANEXO${anexo.id.toUpperCase()}`];
                variations.forEach(v => { context[v] = valueToUse; });

                context[`TotalAnexo${anexo.id}`] = totalVal;
                context[`Total${anexo.id}`] = totalVal;

                if (idx < romanMap.length) {
                    const roman = romanMap[idx];
                    context[`Anexo${roman}`] = valueToUse;
                    context[`TotalAnexo${roman}`] = totalVal;
                }
            });

            const result = expr.evaluate(context as Values);
            total = new Decimal(isNaN(result) || !isFinite(result) ? 0 : result);
            note = `Evaluado: ${formulaToUse}. `;
        } catch (e: any) {
            total = new Decimal(0);
            type = 'ERROR';
            note = `Error en fórmula: ${e.message}`;
        }
        break;
    }
    return { total, note, type, fuente: fuenteParts.join('|'), baseTotal: baseTotalValue, baseHist: baseHistValue };
  };

  const finalComputeOrder = [...ficha.rows];

  let converged = false;
  let iterations = 0;
  while (!converged && iterations < maxIter) {
    iterations++;
    converged = true;

    finalComputeOrder.forEach((row) => {
      const current = calculatedRows.get(row.id)!;
      const isParentRow = ficha.rows.some(r => r.parentId === row.id);

      if (row.formaCalculo !== 'FIJO') {
        const vhFormulaToUse = isParentRow ? 'sum(children)' : row.vhFormula;
        if (vhFormulaToUse) {
            try {
                const vhFormulaStr = smartTranslate(vhFormulaToUse, knownIds, knownClasses, knownAnnexes);
                const vhExpr = parser.parse(vhFormulaStr);
                const vhContext: VHFormulaContext = {
                    VH: row.valorHistorico || 0,
                    QUANTITY: Number(ficha.meta.quantity || 0),
                    cantidad: Number(ficha.meta.quantity || 0),
                    quantity: Number(ficha.meta.quantity || 0),
                    header: ficha.meta,
                    children: ficha.rows.filter(r => r.parentId === row.id).map(r => calculatedRows.get(r.id)?.calculatedVH || 0),
                    hijos: ficha.rows.filter(r => r.parentId === row.id).map(r => calculatedRows.get(r.id)?.calculatedVH || 0)
                };
                annexTotals.forEach((val, id) => {
                    vhContext[`TotalAnexo${id}`] = val;
                    const cSum = annexSumMap.get(id)?.get(row.classification);
                    vhContext[id] = cSum ? cSum.toNumber() : 0;
                });
                const vhRaw = vhExpr.evaluate(vhContext as Values);
                const vhResult = new Decimal(Number(vhRaw) || 0).toDecimalPlaces(decimals).toNumber();
                if (vhResult !== current.calculatedVH) {
                    current.calculatedVH = vhResult;
                    converged = false;
                }
            } catch (e) {}
        }
      }

      const { total: computedTotal, note, type, fuente, baseTotal, baseHist } = computeRowTotal(row, calculatedRows);
      const targetTotal = computedTotal.toDecimalPlaces(decimals);
      const currentTotal = new Decimal(current.total);

      if (!targetTotal.equals(currentTotal)) {
        converged = false;
        let nextValue = targetTotal;
        if (iterations > maxIter / 2) {
            nextValue = currentTotal.times(damping).plus(targetTotal.times(new Decimal(1).minus(damping)));
        }
        const finalTotal = nextValue.toDecimalPlaces(decimals).toNumber();
        current.total = finalTotal;
        current.fuente = fuente;
        current.baseTotal = baseTotal.toDecimalPlaces(decimals).toNumber();
        current.baseHist = baseHist.toDecimalPlaces(decimals).toNumber();
      }
    });
  }

  let totalCostD = new Decimal(0);
  let totalMarginD = new Decimal(0);
  let totalTaxD = new Decimal(0);

  calculatedRows.forEach(row => {
    const val = safeDecimal(row.total);
    if (row.type === 'COST') totalCostD = totalCostD.plus(val);
    else if (row.type === 'MARGIN') totalMarginD = totalMarginD.plus(val);
    else if (row.type === 'TAX') totalTaxD = totalTaxD.plus(val);
  });

  const summary = {
    totalCost: totalCostD.toDecimalPlaces(decimals).toNumber(),
    totalMargin: totalMarginD.toDecimalPlaces(decimals).toNumber(),
    totalTax: totalTaxD.toDecimalPlaces(decimals).toNumber(),
    grandTotal: totalCostD.plus(totalMarginD).plus(totalTaxD).toDecimalPlaces(decimals).toNumber(),
  };

  return {
    fichaId: ficha.meta.id,
    fichaName: ficha.meta.name,
    metadata: { header: ficha.meta },
    rows: Array.from(calculatedRows.values()),
    anexos: ficha.anexos,
    audits: [],
    summary,
    validationErrors: validationErrors.map(e => `${e.type}: ${e.message}`),
    deepValidationErrors: validationErrors,
    elapsedMs: Date.now() - startTime,
  };
}

export * from './mapper';
export * from './solver';
export * from './formula-utils';
export * from './shared-mapping';
