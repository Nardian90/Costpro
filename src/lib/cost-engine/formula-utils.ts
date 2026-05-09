/**
 * Reserved names that conflict with the expr-eval parser built-ins,
 * engine context variables, or custom engine functions.
 *
 * If a row's `id` (which becomes `classification` in the engine) matches
 * any of these, the formula translator or parser could misinterpret bare
 * references — producing silent incorrect calculations.
 *
 * The set includes:
 *  - expr-eval built-in functions  (sin, cos, round, …)
 *  - expr-eval built-in constants  (PI, E, true, NaN, …)
 *  - engine context variables      (VH, COEF, cantidad, …)
 *  - engine custom functions       (ref, vh, pct, sum, …)
 *  - Spanish keyword tokens        (SUMA, MAX, REDONDEO, …)
 *  - single-letter identifiers    (e, i) that overlap with math constants
 */
export const RESERVED_FORMULA_NAMES: ReadonlySet<string> = new Set([
  // expr-eval built-in functions
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'log', 'ln', 'sqrt', 'abs', 'ceil', 'floor', 'round',
  'max', 'min', 'pow', 'exp', 'random', 'sign', 'trunc',
  'typeof', 'constrain', 'map', 'lerp', 'clamp',
  'hypot', 'log2', 'log10', 'cbrt',
  // expr-eval built-in constants / JS literals
  'PI', 'E', 'e', 'i',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  // engine context variables
  'VH', 'BASE_TOTAL', 'COEF', 'QUANTITY', 'cantidad',
  'header', 'children', 'hijos',
  // engine custom functions
  'ref', 'vh', 'pct', 'round2', 'sum', 'average',
  'valor', 'REDONDEO',
  'SUM_ANEXO', 'GET_ANEXO_FILA_DATO', 'GET_ANEXO_DATO', 'GET_FILA_DATO',
  // Spanish keyword tokens (would be replaced by translateFormulaFromSpanish)
  'SUMA', 'SUM', 'PROMEDIO', 'MAX', 'MIN', 'PCT', 'ROUND2',
  'HIJOS', 'VALOR', 'PROR',
]);

/**
 * Returns a human-readable explanation of why a name is invalid,
 * or `null` if the name is valid.
 */
export function getFormulaReferenceIssue(name: string): string | null {
  if (!name || !name.trim()) return 'El nombre no puede estar vacío.';
  const trimmed = name.trim();
  if (trimmed.length === 1) return `El identificador "${trimmed}" es demasiado corto (1 carácter). Use al menos 2 caracteres para evitar conflictos con variables internas del motor.`;
  if (RESERVED_FORMULA_NAMES.has(trimmed) || RESERVED_FORMULA_NAMES.has(trimmed.toLowerCase())) {
    return `"${trimmed}" es una palabra reservada del motor de fórmulas (función matemática, constante o variable interna). Elija otro nombre o use ref('${trimmed}') explícitamente.`;
  }
  return null;
}

export function translateFormulaFromSpanish(formula: string): string {
  if (!formula) return formula;
  const mapping: Record<string, string> = {
    'SUMA': 'sum',
    'SUM': 'sum',
    'REDONDEO': 'REDONDEO',
    'PROMEDIO': 'average',
    'MAX': 'max',
    'MIN': 'min',
    'PCT': 'pct',
    'ROUND2': 'round2',
    'HIJOS': 'children',
    'VALOR': 'valor',
    'PROR': 'pror',
  };
  let translated = formula;

  // 1. First, handle functions vh(...) and ref(...) with existing quotes or naked IDs
  // Normalize to lowercase function name and ensure single quotes
  translated = translated.replace(/\b(vh|ref)\s*\(([^)]+)\)/gi, (match, fn, p1) => {
    const id = p1.trim().replace(/['"]/g, '');
    return `${fn.toLowerCase()}('${id}')`;
  });

  // 2. Map other Spanish keywords
  Object.entries(mapping).forEach(([spanish, english]) => {
    const regex = new RegExp(`\\b${spanish}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });

  return translated;
}

/**
 * Smart formula translator: converts Spanish formulas with bare numbers/IDs
 * into engine-compatible formulas with ref('id') and vh('id') calls.
 *
 * FIX: Only replaces standalone numbers (not adjacent to operators like *, +, -, /, (, ))
 * FIX: Handles nested ref/ref() by protecting from inside out
 */
export function smartTranslate(
  formula: string,
  knownIds: Set<string>,
  knownClasses: Set<string>,
  knownAnnexes: Set<string> = new Set()
): string {
  if (!formula) return '0';

  // Pre-translate keywords and normalize vh/ref calls
  let translated = translateFormulaFromSpanish(formula);

  // Macro: pror(vh(X)) -> (VH / vh(X)) * ref(X)
  translated = translated.replace(/pror\s*\(\s*vh\s*\(\s*['"]?([^'"]+)['"]?\s*\)\s*\)/gi, (match, id) => {
    return `(VH / vh('${id.trim()}')) * ref('${id.trim()}')`;
  });

  const placeholders: string[] = [];

  // Generate a letter-based placeholder key (avoids digits that the token regex could match)
  const phKey = (i: number) => `__PH${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}__`;

  // FIX: Identify Annex references in formula (e.g. AnexoI * 0.1)
  if (knownAnnexes.size > 0) {
    const sortedAnnexes = Array.from(knownAnnexes).sort((a, b) => b.length - a.length);
    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const idTokenRegex = /\b([a-zA-Z0-9]+)\b/g;
    translated = translated.replace(idTokenRegex, (match, id) => {
      const normId = normalize(id);
      const found = sortedAnnexes.find(a => {
          const na = normalize(a);
          return na === normId || `anexo${na}` === normId;
      });
      if (found) return `SUM_ANEXO('${found}')`;
      return match;
    });
  }

  // FIX: Protect from inside out to handle nested calls like ref(ref('x'))
  // Keep replacing until no more nested calls remain
  let prevLength = 0;
  while (translated.length !== prevLength) {
    prevLength = translated.length;
    // Protect innermost ref/vh calls first (those whose argument is NOT a placeholder)
    translated = translated.replace(
      /\b(ref|vh)\s*\('([^']+?)'\)/gi,
      (match) => {
        // Only protect if the argument is NOT already a placeholder reference
        if (match.includes('__PH')) return match;
        placeholders.push(match);
        return phKey(placeholders.length - 1);
      }
    );
  }

  // Protect valor(X) content
  translated = translated.replace(/\bvalor\s*\(([^)]+)\)/gi, (_match, content) => {
    if (content.includes('__PH')) return _match; // Skip if contains placeholder
    placeholders.push(content);
    return `valor(${phKey(placeholders.length - 1)})`;
  });

  // FIX: Only replace numbers that are standalone operands (not adjacent to operators)
  // A standalone number is one that is NOT preceded by: *, /, +, -, (, or another digit
  // and NOT followed by: *, /, +, -, ), or another digit
  const tokenRegex = /(?<![*/+\-\.\(d])(\d+(?:\.\d+)?)(?![*/+\-\.\)d])/g;
  translated = translated.replace(tokenRegex, (match) => {
    if (knownIds.has(match) || knownClasses.has(match)) {
      return `ref('${match}')`;
    }
    return match;
  });

  // Restore placeholders (from last to first to avoid index collision)
  for (let i = placeholders.length - 1; i >= 0; i--) {
    translated = translated.replace(new RegExp(phKey(i), 'g'), placeholders[i]);
  }

  return translated;
}
