/**
 * Centralized currency formatting for the cost module.
 * All components should use these functions instead of
 * formatCurrency().replace('$', '') or similar fragile patterns.
 */

/**
 * @locale es-ES — All cost formatting uses Spanish locale (decimal comma, thousands dot).
 * This is intentional: CostPro targets Cuban/Spanish-speaking markets where es-ES is the standard.
 * If the runtime doesn't support es-ES, toLocaleString falls back to the system locale gracefully.
 */
const CURRENCY = 'CUP';
const MIN_DECIMALS = 2;
const MAX_DECIMALS = 2;

/**
 * Format a number as cost value (no symbol).
 * Use this in tables, cards, and inline displays.
 */
export function formatCost(value: number | string | undefined | null): string {
  if (value === null || value === undefined || value === '') return '0,00';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('es-ES', { minimumFractionDigits: MIN_DECIMALS, maximumFractionDigits: MAX_DECIMALS });
}

/**
 * Format a number as currency (with symbol).
 * Use this in headers, summaries, and highlighted values.
 */
export function formatCurrencyDisplay(value: number | string | undefined | null): string {
  if (value === null || value === undefined || value === '') return '$0,00';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
  if (isNaN(num)) return '$0,00';
  return num.toLocaleString('es-ES', { minimumFractionDigits: MIN_DECIMALS, maximumFractionDigits: MAX_DECIMALS, style: 'currency', currency: CURRENCY });
}

/**
 * Format as accounting-style (negative in parentheses).
 * Use this in financial reports and PDFs.
 */
export function formatAccounting(value: number | string | undefined | null): string {
  if (value === null || value === undefined || value === '') return '0,00';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
  if (isNaN(num)) return '0,00';
  const formatted = Math.abs(num).toLocaleString('es-ES', { minimumFractionDigits: MIN_DECIMALS, maximumFractionDigits: MAX_DECIMALS });
  return num < 0 ? `(${formatted})` : formatted;
}
