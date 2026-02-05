
/**
 * Maps Spanish function names to their English equivalents used by the calculation engine.
 */
export function translateFormulaFromSpanish(formula: string): string {
  if (!formula) return formula;

  // Mapping of Spanish functions/variables to English
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

  // Replace each term using a word-boundary regex for safety
  Object.entries(mapping).forEach(([spanish, english]) => {
    // For functions like SUMA, we can be more specific, but for variables like HIJOS we just need word boundaries
    const isVariable = spanish === 'HIJOS';
    const regex = isVariable
      ? new RegExp(`\\b${spanish}\\b`, 'gi')
      : new RegExp(`\\b${spanish}\\b\\s*(?=\\()`, 'gi');

    translated = translated.replace(regex, english);
  });

  return translated;
}
