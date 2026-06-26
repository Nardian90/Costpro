/**
 * parse-ci.ts — Parser de Carnet de Identidad cubano.
 *
 * Formato cubano: 11 dígitos numéricos.
 *   Ejemplo: 90040240202
 *   - Primeros 2 dígitos = año (90 → 1990, 00 → 2000, 25 → 2025)
 *   - Siguientes 2 = mes (01-12)
 *   - Siguientes 2 = día (01-31)
 *   - Resto = número correlativo + dígito verificador
 *
 * Regla de siglo:
 *   - año <= 30 → 2000s
 *   - año > 30  → 1900s
 *   (Umbral 30: ajustable. En 2030 alguien con CI 30xxxx nacerá en 1930, lo cual es poco probable)
 *
 * Validaciones estrictas:
 *   - 11 dígitos exactos (acepta 12 para CIs emitidos después de 2010+)
 *   - Solo números
 *   - Mes 01-12
 *   - Día 01-31 (sin validar febrero/días por mes — el CI es dato administrativo)
 *   - Año no futuro (no puede ser > año actual)
 */

export interface ParsedCI {
  isValid: boolean;
  birthDate: Date | null;
  year: number | null;
  month: number | null;
  day: number | null;
  error?: string;
}

// Umbral configurable para siglo
const CENTURY_THRESHOLD = 30;

export function parseCI(ci: string | number | null | undefined): ParsedCI {
  if (ci == null || ci === '') {
    return { isValid: false, birthDate: null, year: null, month: null, day: null, error: 'CI vacío' };
  }

  // FIX C1: NO strip letras silenciosamente. Validar que el input original es solo dígitos.
  const ciRaw = String(ci).trim();
  if (!/^\d+$/.test(ciRaw)) {
    return {
      isValid: false,
      birthDate: null,
      year: null,
      month: null,
      day: null,
      error: 'CI contiene caracteres no numéricos (solo dígitos permitidos)',
    };
  }

  // FIX C2: 11 dígitos EXACTOS (no 11-12)
  if (ciRaw.length !== 11) {
    return {
      isValid: false,
      birthDate: null,
      year: null,
      month: null,
      day: null,
      error: `CI debe tener 11 dígitos exactos (recibido ${ciRaw.length})`,
    };
  }

  const ciStr = ciRaw;
  const yearStr = ciStr.substring(0, 2);
  const monthStr = ciStr.substring(2, 4);
  const dayStr = ciStr.substring(4, 6);

  const year2 = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (isNaN(year2) || isNaN(month) || isNaN(day)) {
    return { isValid: false, birthDate: null, year: null, month: null, day: null, error: 'CI con caracteres no numéricos' };
  }

  // Siglo
  const fullYear = year2 <= CENTURY_THRESHOLD ? 2000 + year2 : 1900 + year2;

  // Validar mes
  if (month < 1 || month > 12) {
    return { isValid: false, birthDate: null, year: fullYear, month, day, error: `Mes inválido: ${month}` };
  }

  // Validar día (sin validar días-por-mes, el CI es administrativo)
  if (day < 1 || day > 31) {
    return { isValid: false, birthDate: null, year: fullYear, month, day, error: `Día inválido: ${day}` };
  }

  // Validar fecha futura
  const currentYear = new Date().getFullYear();
  if (fullYear > currentYear) {
    return { isValid: false, birthDate: null, year: fullYear, month, day, error: `Año futuro: ${fullYear}` };
  }

  // Construir fecha (puede ser inválida para 31 de febrero, etc.)
  // Usar Date con UTC para evitar timezone drift
  const birthDate = new Date(Date.UTC(fullYear, month - 1, day));

  // Verificar que Date no se haya "corregido" (ej: 31 de febrero → 3 de marzo)
  if (birthDate.getUTCFullYear() !== fullYear ||
      birthDate.getUTCMonth() !== month - 1 ||
      birthDate.getUTCDate() !== day) {
    return { isValid: false, birthDate: null, year: fullYear, month, day, error: `Fecha inválida: ${fullYear}-${month}-${day}` };
  }

  return { isValid: true, birthDate, year: fullYear, month, day };
}

/**
 * Conveniencia: devuelve 'YYYY-MM-DD' o null si CI inválido.
 */
export function getBirthDateFromCI(ci: string | number | null | undefined): string | null {
  const parsed = parseCI(ci);
  if (!parsed.isValid || !parsed.birthDate) return null;
  return parsed.birthDate.toISOString().split('T')[0];
}

/**
 * Validación rápida (sin construir Date).
 */
export function isValidCI(ci: string | number | null | undefined): boolean {
  return parseCI(ci).isValid;
}
