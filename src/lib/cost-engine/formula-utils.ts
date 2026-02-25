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

export function smartTranslate(formula: string, knownIds: Set<string>, knownClasses: Set<string>): string {
  if (!formula) return '0';

  // Pre-translate keywords and normalize vh/ref calls
  let translated = translateFormulaFromSpanish(formula);

  // Macro: pror(vh(X)) -> (VH / vh(X)) * ref(X)
  // This must happen before we start protecting calls
  translated = translated.replace(/pror\s*\(\s*vh\s*\(\s*['"]?([^'"]+)['"]?\s*\)\s*\)/gi, (match, id) => {
    return `(VH / vh('${id.trim()}')) * ref('${id.trim()}')`;
  });

  // A trick to avoid replacing inside existing calls or literal values:
  const placeholders: string[] = [];

  // 1. Protect existing ref/vh calls
  translated = translated.replace(/\b(ref|vh)\s*\('([^']+)'\)/gi, (match) => {
      placeholders.push(match);
      return `__PH${placeholders.length - 1}__`;
  });

  // 2. Protect valor(X) content
  translated = translated.replace(/\bvalor\s*\(([^)]+)\)/gi, (match, content) => {
      placeholders.push(content);
      return `valor(__PH${placeholders.length - 1}__)`;
  });

  // 3. Tokenize and replace numbers that match known IDs or Classes
  const tokenRegex = /\b(\d+(?:\.\d+)*)\b/g;
  translated = translated.replace(tokenRegex, (match) => {
      if (knownIds.has(match) || knownClasses.has(match)) {
          return `ref('${match}')`;
      }
      return match;
  });

  // 4. Restore placeholders
  for (let i = placeholders.length - 1; i >= 0; i--) {
      translated = translated.replace(`__PH${i}__`, placeholders[i]);
  }

  return translated;
}
