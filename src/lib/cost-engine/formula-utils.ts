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
    'REF': 'ref',
    'VH': 'vh',
  };
  let translated = formula;

  // First, handle vh(...) and ref(...) with existing quotes to avoid double wrapping
  // These are often already in English-like format or handled by smartTranslate

  Object.entries(mapping).forEach(([spanish, english]) => {
    const regex = new RegExp(`\\b${spanish}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });

  // Normalize vh('...') and ref('...') to ensure they have quotes if they are naked IDs
  // This helps smartTranslate not touch them again
  translated = translated.replace(/\b(vh|ref)\s*\(([^'\)]+)\)/gi, (match, fn, p1) => {
      const id = p1.trim();
      if (id.startsWith("'") || id.startsWith('"')) return `${fn.toLowerCase()}('${id.substring(1, id.length - 1)}')`;
      return `${fn.toLowerCase()}('${id}')`;
  });

  return translated;
}

export function smartTranslate(formula: string, knownIds: Set<string>, knownClasses: Set<string>): string {
  if (!formula) return '0';

  // Pre-translate keywords
  let translated = translateFormulaFromSpanish(formula);

  // Tokenize and replace numbers that match known IDs or Classes,
  // but ONLY if they are NOT already inside ref('') or vh('')

  // A trick to avoid replacing inside existing calls:
  // We can look for occurrences of ref('...') and replace them with placeholders
  const placeholders: string[] = [];
  translated = translated.replace(/\b(ref|vh)\('([^']+)'\)/g, (match) => {
      placeholders.push(match);
      return `__PH${placeholders.length - 1}__`;
  });

  const tokenRegex = /\b(\d+(?:\.\d+)*)\b/g;
  translated = translated.replace(tokenRegex, (match) => {
      if (knownIds.has(match) || knownClasses.has(match)) {
          return `ref('${match}')`;
      }
      return match;
  });

  // Restore placeholders
  placeholders.forEach((val, idx) => {
      translated = translated.replace(`__PH${idx}__`, val);
  });

  return translated;
}
