import re

file_path = 'src/lib/cost-engine/formula-utils.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Revert the aggressive regex but keep vh normalization if desired (or move it)
# I'll keep vh normalization because it's helpful and relatively safe.
# But I'll remove the numeric reference regex.

new_content = """
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

  // Normalize VH: vh(ID) -> vh('ID') if not already quoted
  translated = translated.replace(/\\bvh\\(([^'\\)]+)\\)/gi, (match, p1) => {
      const id = p1.trim();
      if (id.startsWith("'") || id.startsWith('"')) return match;
      return `vh('${id}')`;
  });

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
"""

with open(file_path, 'w') as f:
    f.write(new_content)
