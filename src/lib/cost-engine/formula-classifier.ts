/**
 * formula-classifier.ts
 *
 * Classifies a raw totalFormula string into an explicit intent.
 * This eliminates all ambiguity in how the engine processes formulas.
 *
 * Rules (evaluated in order):
 * 1. Null/empty        → EMPTY
 * 2. AnexoI/II/III...  → ANEXO_REF   (import from named annex)
 * 3. =SUMA(hijos)      → SUM_CHILDREN
 * 4. sum(children)     → SUM_CHILDREN
 * 5. =PCT(...)         → PERCENTAGE
 * 6. vh(...) pattern   → VH_RATIO
 * 7. anything else     → MATH        (evaluate with parser)
 */

export type FormulaIntent =
  | { kind: 'EMPTY' }
  | { kind: 'ANEXO_REF'; anexoId: string }
  | { kind: 'SUM_CHILDREN' }
  | { kind: 'PERCENTAGE'; expression: string }
  | { kind: 'VH_RATIO'; expression: string }
  | { kind: 'MATH'; expression: string };

const ANEXO_SHORTHAND = /^Anexo([IVXLCDM]+)$/i;
const SUM_CHILDREN_PATTERNS = [
  /^=?SUMA\(hijos\)$/i,
  /^=?sum\(children\)$/i,
  /^=?SUM_CHILDREN$/i,
];
const PCT_PATTERN = /^=?PCT\(/i;
const VH_RATIO_PATTERN = /vh\(/;

export function classifyFormula(raw: string | null | undefined): FormulaIntent {
  if (!raw || raw.trim() === '' || raw === 'undefined' || raw === 'null') {
    return { kind: 'EMPTY' };
  }

  const trimmed = raw.trim();

  // Rule 2: AnexoI, AnexoII, AnexoIII, etc.
  const anexoMatch = ANEXO_SHORTHAND.exec(trimmed);
  if (anexoMatch) {
    return { kind: 'ANEXO_REF', anexoId: anexoMatch[1].toUpperCase() };
  }

  // Rule 3 & 4: Sum of children
  if (SUM_CHILDREN_PATTERNS.some(p => p.test(trimmed))) {
    return { kind: 'SUM_CHILDREN' };
  }

  // Rule 5: Percentage formula
  if (PCT_PATTERN.test(trimmed)) {
    return { kind: 'PERCENTAGE', expression: trimmed };
  }

  // Rule 6: VH-ratio formula
  if (VH_RATIO_PATTERN.test(trimmed)) {
    return { kind: 'VH_RATIO', expression: trimmed };
  }

  // Rule 7: Generic math expression
  return { kind: 'MATH', expression: trimmed };
}

/**
 * Returns true if this formula kind should be passed to the engine's math parser.
 */
export function isMathFormula(intent: FormulaIntent): boolean {
  return intent.kind === 'MATH' || intent.kind === 'PERCENTAGE' || intent.kind === 'VH_RATIO';
}
