
export function translateFormulaFromSpanish(formula: string): string {
  if (!formula) return formula;
  const mapping: Record<string, string> = {
    'SUMA': 'sum',
    'PROMEDIO': 'average',
    'MAX': 'max',
    'MIN': 'min',
    'PCT': 'pct',
    'ROUND2': 'round2',
    'HIJOS': 'children',
  };
  let translated = formula;
  translated = translated.replace(/\\bvh\\(([^'\\)]+)\\)/gi, (match, p1) => {
      const id = p1.trim();
      if (id.startsWith("'") || id.startsWith('"')) return match;
      return `vh('${id}')`;
  });
  Object.entries(mapping).forEach(([spanish, english]) => {
    const regex = new RegExp(`\\b${spanish}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });
  return translated;
}

export function smartTranslate(formula: string, knownIds: Set<string>, knownClasses: Set<string>): string {
  if (!formula) return '0';
  let translated = translateFormulaFromSpanish(formula);
  // Keep VH as is, it's provided in the context

  const tokenRegex = /\\b(\\d+(?:\\.\\d+)*)\\b/g;
  translated = translated.replace(tokenRegex, (match) => {
      if (knownIds.has(match) || knownClasses.has(match)) {
          return `ref('${match}')`;
      }
      return match;
  });
  return translated;
}
