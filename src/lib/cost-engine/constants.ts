// Result row IDs — rows that show calculated totals (not leaf values)
export const RESULT_ROW_IDS = [
  '1', '2', '3', '4', '5', '5.1', '6', '7', '8', '9', '10',
  '11', '11.1', '12', '12.1', '13', '13.1', '13.2', '13.3', '14', '14.1',
  '15', '15.1', '16', '16.1', '17', '18', '19', '20'
] as const;

export function isResultRow(id: string): boolean {
  return (RESULT_ROW_IDS as readonly string[]).includes(id);
}

// Roman numeral mapping (extended to 20)
export const ROMAN_MAP: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
  6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
  11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV',
  16: 'XVI', 17: 'XVII', 18: 'XVIII', 19: 'XIX', 20: 'XX'
};

// Shared error/severity config for audit views
export const ERROR_CODE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  CYCLE: { label: 'Ciclo Detectado', color: 'text-purple-600 dark:text-purple-400', icon: '🔄' },
  MISSING_REF: { label: 'Referencia Faltante', color: 'text-orange-600 dark:text-orange-400', icon: '🔍' },
  SEMANTIC_DISCREPANCY: { label: 'Discrepancia Semántica', color: 'text-amber-600 dark:text-amber-400', icon: '⚠️' },
  INVALID_FORMULA: { label: 'Fórmula Inválida', color: 'text-red-600 dark:text-red-400', icon: '❌' },
  HARD_RULE_VIOLATION: { label: 'Regla Violada', color: 'text-red-700 dark:text-red-500', icon: '🛑' },
  TRIVIAL_FORMULA: { label: 'Fórmula Trivial', color: 'text-blue-500 dark:text-blue-400', icon: '💡' },
  HIERARCHY: { label: 'Problema de Jerarquía', color: 'text-amber-600 dark:text-amber-400', icon: '📐' },
  EXTERNAL_LINK: { label: 'Enlace Externo', color: 'text-cyan-600 dark:text-cyan-400', icon: '🔗' },
  RESERVED_NAME: { label: 'Nombre Reservado', color: 'text-amber-600 dark:text-amber-400', icon: '🚫' },
};

export const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  CRITICAL: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800/50',
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  },
  WARNING: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800/50',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  },
  INFO: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800/50',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  },
};

