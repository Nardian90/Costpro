/**
 * formula-classifier.ts — Single source of truth for formula pattern detection.
 *
 * CRITICAL: Any regex that classifies a string as "formula", "annex ref", etc.
 * MUST live here.  Both useCellEditor.ts (client) and shared-mapping.ts (engine)
 * consume these functions so that the classification logic is always consistent.
 *
 * Pure functions only — no React hooks, no state, no side-effects.
 */

// ── Patterns ────────────────────────────────────────────────────────────

/** Matches bare annex references like "AnexoI", "TotalAnexoIV", "ANEXOii" */
const ANNEX_REF_RE = /^(Total)?[Aa]nexo([IVXLC]+)$/i;

/**
 * Matches formula expressions that use engine functions (with or without "=").
 * E.g. "ref('12.1') * 0.3", "vh('4.1.1')", "=SUMA(a,b,c)", "REDONDEO(x)"
 */
const FORMULA_FUNC_RE = /\b(ref|vh|sum|average|pct|round2|valor|REDONDEO|SUM_ANEXO|GET_ANEXO|GET_FILA|header)\s*\(/i;

// ── Public API ──────────────────────────────────────────────────────────

export type FormulaKind =
  | 'EQUATION'        // starts with "=" — explicit formula (=ref('1.1')*0.3, =AnexoI)
  | 'ANNEX_REF'       // bare annex reference without "=" (AnexoI, TotalAnexoIII)
  | 'ENGINE_FUNC'     // uses engine function without "=" (ref('1.1')*0.3, vh('2.1')/ref('1.1'))
  | 'NUMERIC'         // plain number (0, 3.14, 500)
  | 'EMPTY';          // empty / whitespace-only string

export interface FormulaClassification {
  kind: FormulaKind;
  /** The annex Roman numeral (uppercase) if kind === 'ANNEX_REF', else null. */
  annexRoman: string | null;
}

/**
 * Classify a raw user-input string (what the user types in a cell before clicking OK).
 *
 * Order matters: EQUATION is checked first because "=AnexoI" has a leading "="
 * but should still be treated as an annex ref under the hood.
 */
export function classifyFormula(raw: string): FormulaClassification {
  const trimmed = raw.trim();

  if (!trimmed) return { kind: 'EMPTY', annexRoman: null };

  // 1. Explicit "=" prefix → always a formula
  if (trimmed.startsWith('=')) {
    // Check if it's an annex ref disguised as equation: "=AnexoI"
    const inner = trimmed.substring(1).trim();
    const annexMatch = inner.match(ANNEX_REF_RE);
    if (annexMatch) {
      return { kind: 'EQUATION', annexRoman: annexMatch[2].toUpperCase() };
    }
    return { kind: 'EQUATION', annexRoman: null };
  }

  // 2. Bare annex reference without "=" (AnexoI, TotalAnexoIV)
  const annexMatch = trimmed.match(ANNEX_REF_RE);
  if (annexMatch && !trimmed.includes(' ')) {
    return { kind: 'ANNEX_REF', annexRoman: annexMatch[2].toUpperCase() };
  }

  // 3. Engine function call without "=" (ref('1.1')*0.3, vh('2.1'))
  if (FORMULA_FUNC_RE.test(trimmed)) {
    return { kind: 'ENGINE_FUNC', annexRoman: null };
  }

  // 4. Plain numeric value
  if (!isNaN(Number(trimmed))) {
    return { kind: 'NUMERIC', annexRoman: null };
  }

  // 5. Fallback — anything else (e.g. garbled input) treated as numeric attempt
  return { kind: 'NUMERIC', annexRoman: null };
}

/**
 * Returns true if the formula string (possibly with "=" prefix) is a simple
 * annex reference.  Used by shared-mapping.ts to infer `baseDeCalculoRef`.
 */
export function isSimpleAnnexRef(formulaMaybeWithEquals: string): false | string {
  const stripped = formulaMaybeWithEquals.replace(/^=\s*/, '').trim();
  const m = stripped.match(ANNEX_REF_RE);
  if (m && !stripped.includes(' ')) {
    return m[2].toUpperCase();
  }
  return false;
}

/** Re-export the raw regex for edge cases that need direct match (e.g. baseDeCalculoRef) */
export { ANNEX_REF_RE };
