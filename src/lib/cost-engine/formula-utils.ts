
/**
 * Maps Spanish function names to their English equivalents used by the calculation engine.
 */
export function translateFormulaFromSpanish(formula: string): string {
  if (!formula) return formula;

  // Mapping of Spanish functions to English
  const mapping: Record<string, string> = {
    'SUMA': 'sum',
    'PROMEDIO': 'average',
    'MAX': 'max',
    'MIN': 'min',
    'PCT': 'pct',
    'ROUND2': 'round2',
  };

  let translated = formula;

  // Replace each function name using a word-boundary regex for safety
  Object.entries(mapping).forEach(([spanish, english]) => {
    // Regex matches the function name case-insensitively, ensuring it's followed by an opening parenthesis
    const regex = new RegExp(`\\b${spanish}\\b\\s*(?=\\()`, 'gi');
    translated = translated.replace(regex, english);
  });

  return translated;
}
