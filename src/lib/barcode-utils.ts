/**
 * barcode-utils.ts
 * Generación automática de códigos de barras EAN-13
 * Sigue el estándar internacional GS1 para códigos de barras retail.
 *
 * EAN-13 structure: 13 digits
 * - Prefix (2-3 digits): Country/region code (e.g., 750-759 = Cuba)
 * - Company prefix (4-6 digits): Assigned by GS1
 * - Product code (1-5 digits): Assigned by company
 * - Check digit (1 digit): Calculated from first 12 digits
 *
 * For auto-generation we use a deterministic approach based on SKU hash
 * to ensure the same SKU always generates the same barcode.
 */

/**
 * Cuba GS1 country prefix range: 750–759
 */
const COUNTRY_PREFIX = '750';

/**
 * Calculate EAN-13 check digit using the GS1 standard algorithm.
 * Steps:
 * 1. Sum digits in odd positions (1st, 3rd, 5th, ...)
 * 2. Sum digits in even positions (2nd, 4th, 6th, ...) × 3
 * 3. Check digit = (10 - ((sum1 + sum2) mod 10)) mod 10
 */
export function calculateEAN13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('Se requieren exactamente 12 dígitos para calcular el dígito de verificación EAN-13');
  }

  let sumOdd = 0;
  let sumEven = 0;

  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12[i], 10);
    // EAN-13 position indexing: position 1 is the FIRST digit (leftmost)
    // Odd positions (1, 3, 5, 7, 9, 11) → index 0, 2, 4, 6, 8, 10
    // Even positions (2, 4, 6, 8, 10, 12) → index 1, 3, 5, 7, 9, 11
    if ((i + 1) % 2 === 1) {
      sumOdd += digit;
    } else {
      sumEven += digit;
    }
  }

  const total = sumOdd + sumEven * 3;
  const checkDigit = (10 - (total % 10)) % 10;
  return checkDigit;
}

/**
 * Validate an EAN-13 barcode string.
 * Returns true if it's a valid 13-digit code with correct check digit.
 */
export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const first12 = code.substring(0, 12);
  const expectedCheck = calculateEAN13CheckDigit(first12);
  return parseInt(code[12], 10) === expectedCheck;
}

/**
 * Generate a deterministic EAN-13 barcode from a SKU string.
 * Uses a hash of the SKU to generate 9 unique digits after the country prefix.
 * This ensures:
 * - The same SKU always produces the same barcode (idempotent)
 * - Different SKUs produce different barcodes (collision-resistant)
 *
 * @param sku - The product SKU to hash
 * @returns A valid 13-digit EAN-13 barcode string
 */
export function generateEAN13FromSKU(sku: string): string {
  // Simple deterministic hash: convert SKU chars to numeric values
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    const char = sku.charCodeAt(i);
    hash = Math.trunc((hash << 5) - hash + char); // Hash mixing
    hash = hash & 0x7fffffff; // Keep positive
  }

  // Generate 9 digits from the hash (3 groups of 3 digits, each 000-999)
  const h1 = hash % 1000;
  const h2 = Math.floor(hash / 1000) % 1000;
  const h3 = Math.floor(hash / 1000000) % 1000;

  // Build 12 digits: country prefix (3) + hash digits (9)
  const first12 = `${COUNTRY_PREFIX}${String(h3).padStart(3, '0')}${String(h2).padStart(3, '0')}${String(h1).padStart(3, '0')}`;

  // Calculate and append check digit
  const checkDigit = calculateEAN13CheckDigit(first12);
  return `${first12}${checkDigit}`;
}

/**
 * Generate multiple unique EAN-13 barcodes in sequence.
 * Useful for bulk import when you need N guaranteed-unique codes.
 *
 * @param count - Number of barcodes to generate
 * @param prefix - Optional store prefix for differentiation (default: '0')
 * @returns Array of unique 13-digit EAN-13 barcode strings
 */
export function generateUniqueEAN13Batch(count: number, prefix: string = '0'): string[] {
  const barcodes: string[] = [];
  const base = Date.now();

  for (let i = 0; i < count; i++) {
    const seed = `${prefix}-${base}-${i}`;
    const hash = hashCode(seed);
    const h1 = Math.abs(hash) % 1000;
    const h2 = Math.abs(Math.floor(hash / 1000)) % 1000;
    const h3 = Math.abs(Math.floor(hash / 1000000)) % 1000;

    const first12 = `${COUNTRY_PREFIX}${String(h3).padStart(3, '0')}${String(h2).padStart(3, '0')}${String(h1).padStart(3, '0')}`;
    const checkDigit = calculateEAN13CheckDigit(first12);
    barcodes.push(`${first12}${checkDigit}`);
  }

  return barcodes;
}

/**
 * Simple string hash function (djb2 algorithm).
 */
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = Math.trunc((hash << 5) + hash + str.charCodeAt(i));
  }
  return hash;
}

/**
 * Determine if a barcode value should be treated as "not provided" and needs auto-generation.
 * Handles cases like: empty string, null, "1", "N/A", "0", "n/a", etc.
 */
export function needsBarcodeAutogeneration(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = String(value).trim().toLowerCase();
  // Common placeholder values users put when they don't have a real barcode
  const placeholders = ['1', '0', 'n/a', 'na', 'none', 'ninguno', 'no tiene', 'no', '-', '..', '...'];
  return trimmed.length < 3 || placeholders.includes(trimmed);
}
