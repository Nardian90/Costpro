/**
 * Worker helpers — extracted from WorkersView for testability and reuse.
 *
 * FIX-AUDIT: These functions were inline in WorkersView.tsx which made them
 * impossible to unit test. Now they're pure functions that can be imported
 * by both the component and the tests.
 */

// Re-export from the locations data file for convenience
export { CUBAN_PROVINCES, CUBAN_MUNICIPALITIES, getMunicipalitiesForProvince } from './cuban-locations';

/**
 * Validación de CI cubano en cliente (11 dígitos, YYMMDD#####).
 *
 * @param ci - CI string (may contain non-digit chars, will be cleaned)
 * @returns Error message string, or '' if valid
 *
 * @example
 * validateCubanCI('85010112345') → ''
 * validateCubanCI('123') → 'El CI debe tener 11 dígitos'
 * validateCubanCI('85130112345') → 'Mes inválido en CI (debe ser 01-12)'
 */
export function validateCubanCI(ci: string): string {
  const clean = ci.replace(/\D/g, '');
  if (!clean) return 'El CI es obligatorio';
  if (clean.length !== 11) return 'El CI debe tener 11 dígitos';
  const yy = parseInt(clean.substring(0, 2), 10);
  const mm = parseInt(clean.substring(2, 4), 10);
  const dd = parseInt(clean.substring(4, 6), 10);
  if (mm < 1 || mm > 12) return 'Mes inválido en CI (debe ser 01-12)';
  if (dd < 1 || dd > 31) return 'Día inválido en CI (debe ser 01-31)';
  if (yy > 30 && yy < 50) return 'Año inválido en CI (YY debe ser 00-30 o 50-99)';
  return '';
}

/**
 * Sizes for worker uniform (shirt, shoe, waist).
 */
export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
