import Decimal from 'decimal.js';
import { createSafeParser } from './parser-factory';
import {
  FichaJSON,
  FichaMeta,
  CalculationResult,
  CalculatedRow,
  AuditEntry,
  CostRow,
  BaseRef,
  ValidationError,
} from './types';
import { translateFormulaFromSpanish, smartTranslate, getFormulaReferenceIssue } from './formula-utils';
import { ROMAN_MAP } from './constants';
import type { Values } from './safe-parser';

interface FormulaContext {
  VH: number;
  BASE_TOTAL: number;
  COEF: number;
  QUANTITY: number | string;
  cantidad: number | string;
  quantity: number | string;
  header: FichaMeta;
  children: number[];
  hijos: number[];
  [key: string]: unknown;
}

interface VHFormulaContext {
  VH: number;
  QUANTITY: number | string;
  cantidad: number | string;
  quantity: number | string;
  header: FichaMeta;
  children: number[];
  hijos: number[];
  [key: string]: unknown;
}



const safeDecimal = (val: unknown) => {
    const n = parseFloat(String(val));
    return new Decimal(isNaN(n) ? 0 : n);
};

// extractDependencies is only used internally by validateFicha and calculateFicha.
function extractDependencies(row: CostRow, allRows: CostRow[]): string[] {
  const deps: string[] = [];

  const extractFromFormula = (formula: string) => {
    if (!formula) return;
    const knownIds = new Set(allRows.map(r => r.id));
    const knownClasses = new Set(allRows.map(r => r.classification));
    const translated = smartTranslate(formula, knownIds, knownClasses);

    // Extract ref('...')
    const refMatches = translated.matchAll(/ref\(['"]([^'"]+)['"]\)/g);
    for (const match of refMatches) {
        deps.push(match[1]);
    }
    // Extract vh('...')
    const vhMatches = translated.matchAll(/vh\(['"]([^'"]+)['"]\)/g);
    for (const match of vhMatches) {
        deps.push(match[1]);
    }
    // Extract children/hijos
    if (formula.toLowerCase().includes('children') || formula.toLowerCase().includes('hijos')) {
        const childrenIds = allRows.filter(r => r.parentId === row.id).map(r => r.id);
        deps.push(...childrenIds);
    }
  };

  const formulaToUse = row.formula || row.totalFormula;
  if (row.formaCalculo === 'FORMULA' && formulaToUse) {
    extractFromFormula(formulaToUse);
  }

  if (row.vhFormula) {
    extractFromFormula(row.vhFormula);
  }

  if (row.baseCalculo?.type === 'FILA') {
    deps.push(row.baseCalculo.classification);
  }

  return deps;
}

export function validateFicha(ficha: FichaJSON): { valid: boolean; errors: string[]; validationErrors: ValidationError[] } {
  const errors: string[] = [];
  const validationErrors: ValidationError[] = [];
  const knownIds = new Set(ficha.rows.map(r => r.id));
  const knownClasses = new Set(ficha.rows.map(r => r.classification));
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

    // Warn about duplicate classifications in main rows (they cause summing in ref())
    if (classifications.has(row.classification)) {
        errors.push(`Duplicate classification detected: ${row.classification}. ref() will sum all matching rows.`);
    }
    classifications.add(row.classification);

    // C15: Warn if row id or classification conflicts with a reserved formula name
    const idIssue = getFormulaReferenceIssue(row.id);
    if (idIssue) {
      validationErrors.push({ rowId: row.id, message: `ID reservado: ${idIssue}`, type: 'WARNING', code: 'RESERVED_NAME' });
    }
    const classIssue = getFormulaReferenceIssue(row.classification);
    if (classIssue && row.classification !== row.id) {
      validationErrors.push({ rowId: row.id, message: `Clasificación reservada: ${classIssue}`, type: 'WARNING', code: 'RESERVED_NAME' });
    }
  });

  // 1. Dependency Graph & Cycle Detection
  const adj = new Map<string, string[]>();
  const parser = createSafeParser();

  // Override REDONDEO with a no-op for dry-run validation (no actual rounding needed)
  parser.functions.REDONDEO = (val: number, _decimals: number = 2) => val;
  parser.functions.valor = (x: unknown) => x;
  parser.functions.SUM_ANEXO = (a: string, c: string) => 0;
  parser.functions.GET_ANEXO_FILA_DATO = (a: string, r: number, f: string) => 0;
  parser.functions.GET_ANEXO_DATO = (a: string, c: string, f: string) => 0;
  parser.functions.GET_FILA_DATO = (s: string, f: string) => 0;
  ficha.rows.forEach((row) => {
    const deps = extractDependencies(row, ficha.rows);

    const formulaToUse = row.formula || row.totalFormula;
  if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        try {
            const formulaStr = translateFormulaFromSpanish(formulaToUse.startsWith('=') ? formulaToUse.substring(1) : formulaToUse);
            parser.parse(formulaStr);

            // check for trivial formulas
            if (formulaStr.trim() === "0" || formulaStr.trim() === "") {
                validationErrors.push({ rowId: row.id, message: "Fórmula trivial o vacía", type: 'WARNING', code: 'TRIVIAL_FORMULA' });
            }
        } catch (e) {
            validationErrors.push({ rowId: row.id, message: `Fórmula inválida: ${e}`, type: 'CRITICAL', code: 'INVALID_FORMULA' });
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
                  validationErrors.push({
                    rowId: u,
                    message: `Validación de Jerarquía: Esta fila ('${uRow?.label}') depende de un valor superior ('${vRow.label}'). Asegúrese de que no esté incluida en la sumatoria total del padre para evitar duplicidad.`,
                    type: 'WARNING',
                    code: 'HIERARCHY'
                  });
                  // Hierarchical references are not blocked as critical cycles
              } else if (isDirect) {
                  validationErrors.push({
                    rowId: u,
                    message: `Referencia Circular Detectada: El cálculo no puede procesarse porque las celdas se llaman entre sí indefinidamente ('${uRow?.label}' <-> '${vRow.label}').`,
                    type: 'CRITICAL',
                    code: 'CYCLE'
                  });
                  return true;
              } else {
                  validationErrors.push({
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

    // Check ref() in formulas — INFO (not WARNING) because:
    // 1. Templates legitimately reference rows in other sections (e.g. ref('1.1.1') from section 4)
    // 2. Cross-section refs are resolved dynamically at calculation time
    // 3. The calculation engine gracefully returns 0 for missing refs
    // 4. CRITICAL would block export for valid templates
    // 5. WARNING pollutes the Problems Panel with false positives for normal cross-section dependencies
    const formulaToUse = row.formula || row.totalFormula;
  if (row.formaCalculo === 'FORMULA' && formulaToUse) {
        // Check both ref() and vh() references for unresolved rows
        const refPattern = /ref\(['"]([^'"]+)['"]\)/g;
        const vhPattern = /vh\(['"]([^'"]+)['"]\)/g;
        let match: RegExpExecArray | null;

        while ((match = refPattern.exec(formulaToUse)) !== null) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                const msg = `Referencia en fórmula no resuelta: ref('${refId}')`;
                validationErrors.push({ rowId: row.id, message: msg, type: 'INFO', code: 'MISSING_REF' });
            }
        }

        while ((match = vhPattern.exec(formulaToUse)) !== null) {
            const refId = match[1];
            if (!ids.has(refId) && !classifications.has(refId)) {
                const msg = `Referencia en fórmula no resuelta: vh('${refId}')`;
                validationErrors.push({ rowId: row.id, message: msg, type: 'INFO', code: 'MISSING_REF' });
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

  // 0. Pre-validate
  const { validationErrors } = validateFicha(ficha);

  // 1. Prepare maps for O(1) lookup
  const annexSumMap = new Map<string, Map<string, Decimal>>();
  ficha.anexos.forEach((anexo) => {
    const classMap = new Map<string, Decimal>();
    anexo.rows.forEach((row) => {
      const current = classMap.get(row.classification) || new Decimal(0);
      classMap.set(row.classification, current.plus(safeDecimal(row.importe)).toDecimalPlaces(decimals));
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
      calculatedVH: row.valorHistorico || 0,
      audit: [],
    });
  });

  const parser = createSafeParser();
  parser.functions.valor = (x: unknown) => x;
  // REDONDEO is already registered by createSafeParser with the same Decimal logic

  // Use Decimal for high precision in parser functions
  parser.functions.SUM_ANEXO = (anexoId: string, classification: string) => {
    return annexSumMap.get(anexoId)?.get(classification)?.toNumber() || 0;
  };

  /**
   * GET_ANEXO_FILA_DATO(anexoId, rowIndex, field)
   * Retrieves data from an annex by its 1-based row index.
   */
  parser.functions.GET_ANEXO_FILA_DATO = (anexoId: string, rowIndex: number, field: string) => {
    const anexo = ficha.anexos.find(a => a.id === anexoId);
    if (!anexo || !anexo.rows) return 0;
    const index = rowIndex - 1;
    if (index >= 0 && index < anexo.rows.length) {
        return parseFloat(String(anexo.rows[index][field])) || (anexo.rows[index][field] ?? 0);
    }
    return 0;
  };

  parser.functions.GET_ANEXO_DATO = (anexoId: string, classification: string, field: string) => {
    const anexo = ficha.anexos.find(a => a.id === anexoId);
    if (!anexo) return 0;
    const row = anexo.rows.find(r => r.classification === classification);
    if (!row) return 0;
    return parseFloat(String(row[field])) || (row[field] ?? 0);
  };

  parser.functions.GET_FILA_DATO = (search: string, field: string) => {
      // Priority 1: Classification (Visual Numbering)
      // Priority 2: ID (UUID or template ID)
      let targets = rowsByClass.get(search);
      if (!targets || targets.length === 0) {
          targets = rowsById.get(search) || [];
      }
      if (targets.length === 0) return 0;

      const target = targets[0];
      const calculated = calculatedRows.get(target.id);
      if (!calculated) return 0;

      const val = (calculated as unknown as Record<string, unknown>)[field];
      return typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val) || 0 : 0);
  };

  parser.functions.header = (key: string) => {
      // Handle other meta fields if needed
      if (key === 'decimals') return ficha.meta.decimals;
      return 0;
  };

  parser.functions.ref = (arg: string) => {
      const search = String(arg);
      // Priority 1: Classification (Visual Numbering)
      // Priority 2: ID (UUID or template ID)
      let targets = rowsByClass.get(search);
      if (!targets || targets.length === 0) {
          targets = rowsById.get(search) || [];
      }

      const val = targets.reduce((acc, t) => {
          const calculated = calculatedRows.get(t.id);
          return acc.plus(safeDecimal(calculated?.total));
      }, new Decimal(0));
      return val.toNumber();
  };

  parser.functions.vh = (arg: string) => {
      const search = String(arg);
      let targets = rowsByClass.get(search);
      if (!targets || targets.length === 0) {
          targets = rowsById.get(search) || [];
      }
      const val = targets.reduce((acc, t) => {
          const calculated = calculatedRows.get(t.id);
          const cvh = calculated?.calculatedVH;
          const numVal = typeof cvh === 'string' ? parseFloat(cvh) || 0 : (cvh || t.valorHistorico || 0);
          return acc.plus(new Decimal(numVal));
      }, new Decimal(0));
      return val.toNumber();
  };

  parser.functions.pct = (value: number, percentage: number) => {
      return new Decimal(value || 0).times(new Decimal(percentage || 0).div(100)).toNumber();
  };

  parser.functions.round2 = (value: number) => {
      return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  };

  parser.functions.sum = (...args: unknown[]) => {
      let flatArgs: unknown[] = [];
      args.forEach(arg => {
          if (Array.isArray(arg)) flatArgs = flatArgs.concat(arg);
          else flatArgs.push(arg);
      });
      return flatArgs.reduce((a: Decimal, b) => {
        const numB = typeof b === 'string' ? parseFloat(b) : (typeof b === 'number' ? b : 0);
        return a.plus(safeDecimal(numB));
      }, new Decimal(0)).toNumber();
  };

  parser.functions.average = (...args: unknown[]) => {
      let flatArgs: unknown[] = [];
      args.forEach(arg => {
          if (Array.isArray(arg)) flatArgs = flatArgs.concat(arg);
          else flatArgs.push(arg);
      });
      if (flatArgs.length === 0) return 0;
      const sum = flatArgs.reduce((a: Decimal, b) => {
        const numB = typeof b === 'string' ? parseFloat(b) : (typeof b === 'number' ? b : 0);
        return a.plus(safeDecimal(numB));
      }, new Decimal(0));
      return sum.div(flatArgs.length).toNumber();
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

    const currentCalculated = currentRows.get(row.id);
    const rawVH = currentCalculated?.calculatedVH;
    const vhNum = typeof rawVH === 'string' ? parseFloat(rawVH) || 0 : (rawVH || row.valorHistorico || 0);
    const vh = new Decimal(vhNum);

    // Helper for prefix matching in annexes
    const getAnnexSumForPrefix = (anexoId: string, prefix: string): Decimal => {
        const classSumMap = annexSumMap.get(anexoId);
        if (!classSumMap) return new Decimal(0);

        let sum = new Decimal(0);
        let found = false;
        classSumMap.forEach((val, classification) => {
            // Check if classification starts with prefix (e.g. "1.1.1" starts with "1.1")
            if (classification === prefix || classification.startsWith(prefix + '.')) {
                sum = sum.plus(val);
                found = true;
            }
        });
        return found ? sum : (new Decimal(-1)); // -1 means no match found
    };

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
    let formulaToUse = row.formula || row.totalFormula;
    let formaCalculoToUse = row.formaCalculo;

    const isParent = ficha.rows.some(r => r.parentId === row.id);
    // Respect explicit FIJO — do NOT override to sum(children) when solver/external code
    // sets formaCalculo = 'FIJO' (e.g., Goal Seek needs to pin a value).
    if (isParent && row.formaCalculo !== 'FIJO') {
        formulaToUse = 'sum(children)';
        formaCalculoToUse = 'FORMULA';
    }

    if (ruleOverride) {
        if (ruleOverride.formulaOverride) {
            formulaToUse = ruleOverride.formulaOverride;
            formaCalculoToUse = 'FORMULA';
            note += `Rule '${ruleOverride.name}' applied. `;
            type = 'RULE_APPLIED';
        }
    }

    const base = row.baseCalculo;

    switch (formaCalculoToUse) {
      case 'FIJO':
        total = vh;
        note += `Used VH ${vh.toFixed(decimals)}. `;
        break;

      case 'ANEXO':
      case 'IMPORTAR_ANEXO':
        if (base?.type === 'ANEXO') {
          const sum = getAnnexSumForPrefix(base.anexoId, row.classification);

          if (sum.gte(0)) {
              total = sum;
              note += `Imported prefix match from ${base.anexoId} for ${row.classification}. `;
          } else {
              total = new Decimal(0);
              note += `No matches in ${base.anexoId} for prefix ${row.classification}. `;
          }

          baseTotalValue = total;
          baseHistValue = total;
          fuenteParts.push(base.anexoId);
        } else {
          type = 'WARNING';
          note += `Missing ANEXO reference. `;
        }
        break;

      case 'PRORRATEO':
      case 'COEFICIENTE':
        let baseRefName = '';

        if (base?.type === 'ANEXO') {
            const sum = getAnnexSumForPrefix(base.anexoId, row.classification);

            if (sum.gte(0)) {
                baseTotalValue = sum;
                note += `Using prefix match for ${row.classification} from ${base.anexoId} as base. `;
            } else {
                // Fallback to total of annex if no prefix match found
                baseTotalValue = new Decimal(annexTotals.get(base.anexoId) || 0);
                note += `No prefix match for ${row.classification} in ${base.anexoId}, using Annex Total. `;
            }

            baseHistValue = baseTotalValue;
            baseRefName = `Anexo:${base.anexoId}`;
        } else if (base?.type === 'FILA') {
            let targets = rowsByClass.get(base.classification);
            if (!targets || targets.length === 0) {
                targets = rowsById.get(base.classification) || [];
            }

            targets.forEach(t => {
                const calculated = currentRows.get(t.id);
                baseTotalValue = baseTotalValue.plus(safeDecimal(calculated?.total));
                baseHistValue = baseHistValue.plus(new Decimal(t.valorHistorico || 0));
            });
            baseRefName = `Fila:${base.classification}`;
        }
        fuenteParts.push(baseRefName);

        if (formaCalculoToUse === 'PRORRATEO') {
            const epsilon = new Decimal(10).pow(-decimals - 4);
            if (baseHistValue.abs().lte(epsilon)) {
                total = new Decimal(0);
                type = 'WARNING';
                note += `BaseHist is zero for ${baseRefName}. `;
            } else {
                const ratio = vh.div(baseHistValue);
                total = ratio.times(baseTotalValue);
                note += `Prorrated: (${vh}/${baseHistValue}) * ${baseTotalValue.toFixed(decimals)}. `;
            }
        } else {
            const coef = new Decimal(row.coeficiente ?? 0);
            total = coef.times(baseTotalValue);
            note += `Coefficient: ${coef} * ${baseTotalValue.toFixed(decimals)}. `;
        }
        break;

      case 'FORMULA':
        const allowFormulas = ficha.meta.settings?.allowFormulas !== false;
        if (!allowFormulas && !ruleOverride) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formulas are disabled. `;
            break;
        }
        try {
            const formulaStrRaw = (formulaToUse || '0').trim().startsWith('=')
              ? formulaToUse!.trim().substring(1)
              : formulaToUse;

            const formulaStr = smartTranslate(formulaStrRaw || '0', knownIds, knownClasses);

            // ── DEBUG: Log formula resolution for annex references ──
            if (/anexo/i.test(formulaStrRaw || '')) {
              console.log(`[COST-ENGINE] FORMULA row=${row.id} (${row.classification}) formulaRaw="${formulaStrRaw}" translated="${formulaStr}" formaCalculo=${formaCalculoToUse}`);
              console.log(`[COST-ENGINE]   ficha.anexos=${ficha.anexos.map(a => a.id).join(',')}`);
              console.log(`[COST-ENGINE]   annexTotals=${JSON.stringify(Object.fromEntries(annexTotals))}`);
              console.log(`[COST-ENGINE]   row.classification="${row.classification}" baseCalculo=`, row.baseCalculo);
            }

            const expr = parser.parse(formulaStr);

            if (base?.type === 'ANEXO') {
                 // Formula context base total use total of annex
                 baseTotalValue = new Decimal(annexTotals.get(base.anexoId) || 0);
            } else if (base?.type === 'FILA') {
                let targets = rowsByClass.get(base.classification);
                if (!targets || targets.length === 0) {
                    targets = rowsById.get(base.classification) || [];
                }
                targets.forEach(t => {
                    const calculated = currentRows.get(t.id);
                    baseTotalValue = baseTotalValue.plus(safeDecimal(calculated?.total));
                });
            }

            const context: FormulaContext = {
                VH: vh.toNumber(),
                BASE_TOTAL: baseTotalValue.toNumber(),
                COEF: row.coeficiente || 0,
                QUANTITY: ficha.meta.quantity || 0,
                cantidad: ficha.meta.quantity || 0,
                quantity: ficha.meta.quantity || 0,
                header: ficha.meta,
                children: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => calculatedRows.get(r.id)?.total || 0),
                hijos: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => calculatedRows.get(r.id)?.total || 0)
            };

            const romanMap = Object.values(ROMAN_MAP);
            ficha.anexos.forEach((anexo, idx) => {
                const totalVal = annexTotals.get(anexo.id) || 0;
                const prefixSum = getAnnexSumForPrefix(anexo.id, row.classification);

                // Smart Resolve: if prefix matches exist, use them, otherwise 0 (formulas can use TotalAnexo explicitly)
                const valueToUse = prefixSum.gte(0) ? prefixSum.toNumber() : 0;

                const variations = new Set([
                    anexo.id,
                    `Anexo${anexo.id}`,
                    anexo.id.toUpperCase(),
                    `ANEXO${anexo.id.toUpperCase()}`
                ]);

                variations.forEach(v => {
                    context[v] = valueToUse;
                });

                context[`TotalAnexo${anexo.id}`] = totalVal;
                context[`Total${anexo.id}`] = totalVal;
                context[`TotalAnexo${anexo.id.toUpperCase()}`] = totalVal;
                context[`Total${anexo.id.toUpperCase()}`] = totalVal;

                if (idx < romanMap.length) {
                    const roman = romanMap[idx];
                    context[`Anexo${roman}`] = valueToUse;
                    context[`ANEXO${roman}`] = valueToUse;
                    context[`TotalAnexo${roman}`] = totalVal;
                    context[`Total${roman}`] = totalVal;
                }
            });

            // ── DEBUG: Log context values for annex formulas ──
            if (/anexo/i.test(formulaStrRaw || '')) {
              const anexoKeys = Object.keys(context).filter(k => /anexo|ANEXO/i.test(k));
              console.log(`[COST-ENGINE]   context annex keys:`, Object.fromEntries(anexoKeys.map(k => [k, context[k]])));
            }

            const result = expr.evaluate(context as Values);
            const numResult = typeof result === 'number' ? result : (typeof result === 'string' ? parseFloat(result) || 0 : Number(result) || 0);
            if (isNaN(numResult) || !isFinite(numResult)) {
                total = new Decimal(0);
                note += `Evaluation result was ${numResult} (NaN/Infinity). Forcing to 0. `;
                type = 'WARNING';
            } else {
                total = new Decimal(numResult);
                note += `Evaluated: ${formulaToUse}. `;
            }
        } catch (e: unknown) {
            total = new Decimal(0);
            type = 'ERROR';
            note += `Formula error: ${e instanceof Error ? e.message : String(e)}`;
        }
        break;
    }

    return { total, note, type, fuente: fuenteParts.join('|'), baseTotal: baseTotalValue, baseHist: baseHistValue };
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
      const isParentRow = ficha.rows.some(r => r.parentId === row.id);
      // Respect explicit FIJO — do NOT recalculate VH from children or vhFormula when
      // solver/external code sets formaCalculo = 'FIJO' (e.g., Goal Seek needs to pin a value).
      let vhFormulaToUse: string | null | undefined;
      if (row.formaCalculo === 'FIJO') {
        vhFormulaToUse = undefined; // Don't evaluate vhFormula for FIJO rows
      } else {
        vhFormulaToUse = isParentRow ? 'sum(children)' : row.vhFormula;
      }
      if (vhFormulaToUse) {
        try {
            const vhFormulaStrRaw = vhFormulaToUse.trim().startsWith('=')
              ? vhFormulaToUse.trim().substring(1)
              : vhFormulaToUse;
            const vhFormulaStr = smartTranslate(vhFormulaStrRaw, knownIds, knownClasses);
            const vhExpr = parser.parse(vhFormulaStr);

            const vhContext: VHFormulaContext = {
                VH: row.valorHistorico || 0,
                QUANTITY: ficha.meta.quantity || 0,
                cantidad: ficha.meta.quantity || 0,
                quantity: ficha.meta.quantity || 0,
                header: ficha.meta,
                children: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => { const cvh = calculatedRows.get(r.id)?.calculatedVH; return typeof cvh === 'string' ? parseFloat(cvh) || 0 : (cvh || r.valorHistorico || 0); }),
                hijos: ficha.rows
                    .filter(r => r.parentId === row.id)
                    .map(r => { const cvh = calculatedRows.get(r.id)?.calculatedVH; return typeof cvh === 'string' ? parseFloat(cvh) || 0 : (cvh || r.valorHistorico || 0); })
            };

            annexTotals.forEach((total, id) => {
                vhContext[`TotalAnexo${id}`] = total;
                vhContext[`Total${id}`] = total;
                const classSum = annexSumMap.get(id)?.get(row.classification);
                vhContext[id] = classSum !== undefined ? classSum.toNumber() : 0;
                vhContext[`Anexo${id}`] = classSum !== undefined ? classSum.toNumber() : 0;
            });

            const vhRaw = vhExpr.evaluate(vhContext as Values);
            const vhSafeNum = typeof vhRaw === 'string' ? parseFloat(vhRaw) || 0 : (typeof vhRaw === 'number' ? vhRaw : Number(vhRaw) || 0);
            const vhResult = new Decimal(vhSafeNum).toDecimalPlaces(decimals).toNumber();
            if (vhResult !== current.calculatedVH) {
                current.calculatedVH = vhResult;
                converged = false;
            }
        } catch (e) {
            // keep existing calculatedVH or fallback
        }
      }

      const { total: computedTotal, note, type, fuente, baseTotal, baseHist } = computeRowTotal(row, calculatedRows);

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
            current.baseTotal = baseTotal.toDecimalPlaces(decimals).toNumber();
            current.baseHist = baseHist.toDecimalPlaces(decimals).toNumber();
        }
      }
    });
  }

  // Truncate audit arrays to prevent unbounded growth (configurable retention)
  const MAX_AUDIT_ENTRIES = ficha.meta.settings?.maxAuditEntries ?? 100;
  if (MAX_AUDIT_ENTRIES !== Infinity && MAX_AUDIT_ENTRIES > 0) {
    calculatedRows.forEach(row => {
      if (row.audit.length > MAX_AUDIT_ENTRIES) {
        row.audit = row.audit.slice(-MAX_AUDIT_ENTRIES);
      }
    });
  }

  // 4. Final Totals — use Decimal accumulators to avoid floating-point drift
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

  // 5. Semantic Validation (Totals vs Children)
  ficha.rows.forEach(row => {
      const children = ficha.rows.filter(r => r.parentId === row.id);
      // We check if it's a sum row. If it has children and calculation is FORMULA with sum, it MUST match.
      if (children.length > 0 && (row.formula?.toLowerCase().includes('sum') || row.formula?.includes('SUMA'))) {
          const calcRow = calculatedRows.get(row.id)!;
          const childrenSum = children.reduce((acc, child) => acc.plus(new Decimal(calculatedRows.get(child.id)?.total || 0)), new Decimal(0));

          const materialityThreshold = new Decimal(10).pow(-decimals - 1).toNumber();
          const diff = Math.abs(calcRow.total - childrenSum.toNumber());
          if (diff > materialityThreshold) {
              validationErrors.push({
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
    fichaName: ficha.meta.name,
    metadata: { header: ficha.meta },
    rows: Array.from(calculatedRows.values()),
    anexos: ficha.anexos,
    audits: Array.from(calculatedRows.values()).flatMap(r => r.audit),
    summary,
    validationErrors: validationErrors.map(e => `${e.type}: ${e.message}`),
    deepValidationErrors: validationErrors,
    elapsedMs: Date.now() - startTime,
  };
}
// solver.ts is imported directly by consumers (CostSheetAnnexEditor, CostSheetSummary)
export * from './solver';
