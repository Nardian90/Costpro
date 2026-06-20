/**
 * Reserved names that conflict with the expr-eval parser built-ins,
 * engine context variables, or custom engine functions.
 */
export const RESERVED_FORMULA_NAMES: ReadonlySet<string> = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'log', 'ln', 'sqrt', 'abs', 'ceil', 'floor', 'round',
  'max', 'min', 'pow', 'exp', 'random', 'sign', 'trunc',
  'typeof', 'constrain', 'map', 'lerp', 'clamp',
  'hypot', 'log2', 'log10', 'cbrt',
  'PI', 'E', 'e', 'i',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'VH', 'BASE_TOTAL', 'COEF', 'QUANTITY', 'cantidad',
  'header', 'children', 'hijos',
  'ref', 'vh', 'pct', 'round2', 'sum', 'average',
  'valor', 'REDONDEO',
  'SUM_ANEXO', 'GET_ANEXO_FILA_DATO', 'GET_ANEXO_DATO', 'GET_FILA_DATO',
  'SUMA', 'SUM', 'PROMEDIO', 'MAX', 'MIN', 'PCT', 'ROUND2',
  'HIJOS', 'VALOR', 'PROR',
]);

export function getFormulaReferenceIssue(name: string): string | null {
  if (!name || !name.trim()) return 'El nombre no puede estar vacío.';
  const trimmed = name.trim();
  if (trimmed.length === 1 && /^[a-zA-Z]$/.test(trimmed)) {
    return `El identificador "${trimmed}" es una letra reservada potencial del motor de fórmulas. Use al menos 2 caracteres para evitar conflictos.`;
  }
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

  // 1. Normalize vh/ref calls: vh(id), vh('id'), vh("id") -> vh('id')
  // Match vh or ref followed by parenthesis and an alphanumeric ID (possibly with quotes)
  translated = translated.replace(/\b(vh|ref)\s*\(\s*['"]?([^'"]+?)['"]?\s*\)/gi, (match, fn, id) => {
    return `${fn.toLowerCase()}('${id.trim()}')`;
  });

  // 2. Map other Spanish keywords
  Object.entries(mapping).forEach(([spanish, english]) => {
    const regex = new RegExp(`\\b${spanish}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });

  return translated;
}

export function smartTranslate(formula: string, knownIds: Set<string>, knownClasses: Set<string>): string {
  if (!formula) return '0';

  let translated = translateFormulaFromSpanish(formula);

  // Macro: pror(vh(X)) -> (VH / vh(X)) * ref(X)
  translated = translated.replace(/pror\s*\(\s*vh\s*\(\s*['"]?([^'"]+)['"]?\s*\)\s*\)/gi, (match, id) => {
    const tid = id.trim();
    return `(VH / vh('${tid}')) * ref('${tid}')`;
  });

  const placeholders: string[] = [];
  const phKey = (i: number) => `__PH${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}__`;

  // Protect ref/vh calls from inside out
  let prevLength = 0;
  while (translated.length !== prevLength) {
    prevLength = translated.length;
    translated = translated.replace(
      /\b(ref|vh)\s*\('([^']+?)'\)/gi,
      (match) => {
        if (match.includes('__PH')) return match;
        placeholders.push(match);
        return phKey(placeholders.length - 1);
      }
    );
  }

  // Protect valor(X) content
  translated = translated.replace(/\bvalor\s*\(([^)]+)\)/gi, (_match, content) => {
    if (content.includes('__PH')) return _match;
    placeholders.push(content);
    return `valor(${phKey(placeholders.length - 1)})`;
  });

  // Match alphanumeric tokens that are NOT part of a decimal and NOT surrounded by word characters or dots.
  // This avoids matching "101" in "101.5" or "5" in "101.5".
  const tokenRegex = /(?<![a-zA-Z0-9.])([a-zA-Z0-9]+)(?![a-zA-Z0-9.])/g;
  translated = translated.replace(tokenRegex, (match) => {
    if ((knownIds.has(match) || knownClasses.has(match)) && !RESERVED_FORMULA_NAMES.has(match)) {
      return `ref('${match}')`;
    }
    return match;
  });

  // Restore placeholders
  for (let i = placeholders.length - 1; i >= 0; i--) {
    translated = translated.replaceAll(phKey(i), placeholders[i]);
  }

  return translated;
}
