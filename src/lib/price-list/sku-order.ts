/**
 * PRICE LIST · Reglas de SKU — clasificación, orden y rango (misión CP-SALES-PRICE-LIST-001).
 *
 * Reglas de la misión (§4.2), funciones PURAS sin dependencias de Supabase/React:
 *  · SKU numérico = solo dígitos (`/^\d+$/`) — se ordena por VALOR, nunca
 *    lexicográfico (`1, 2, 10, 20, 100`, no `1, 10, 100, 2, 20`).
 *  · La clave numérica es AUXILIAR (BigInt: sin pérdida de precisión con
 *    identificadores largos) — el código original jamás se convierte ni se
 *    sobrescribe; «Cod1» NO se interpreta como 1.
 *  · Alfanuméricos después de todos los numéricos, orden natural insensible
 *    a mayúsculas/minúsculas.
 *  · Empates numéricos y ceros iniciales (`001` vs `1`) resueltos de forma
 *    determinista: mismo valor → orden por el código original.
 *  · El rango numérico aplica SOLO a SKU numéricos: con algún límite activo,
 *    alfanuméricos y sin SKU quedan excluidos.
 */

/** Grupo de un SKU: numérico (solo dígitos), alfanumérico o ausente (null/vacío). */
export type SkuGroup = 'numeric' | 'alphanumeric' | 'missing';

export interface SkuRange {
  ok: true;
  /** Límite inferior (incluido) o null si no se fijó. */
  from: bigint | null;
  /** Límite superior (incluido) o null si no se fijó. */
  to: bigint | null;
}
export interface SkuRangeError {
  ok: false;
  error: string;
}

/** Clasifica el SKU original (sin modificarlo). */
export function classifySku(sku: string | null | undefined): SkuGroup {
  if (sku === null || sku === undefined) return 'missing';
  const trimmed = sku.trim();
  if (trimmed === '') return 'missing';
  return /^\d+$/.test(trimmed) ? 'numeric' : 'alphanumeric';
}

/**
 * Valor numérico AUXILIAR del SKU (solo para ordenar/comparar/filtrar).
 * Devuelve null para alfanuméricos y sin SKU. BigInt evita errores de
 * precisión con identificadores numéricos largos (> 2^53).
 */
export function skuNumericValue(sku: string | null | undefined): bigint | null {
  if (classifySku(sku) !== 'numeric') return null;
  // Los ceros iniciales no afectan el valor: BigInt('001') === 1n.
  return BigInt(sku!.trim());
}

/**
 * Valida y normaliza el rango «SKU desde / SKU hasta».
 *  · Cadena vacía → límite no fijado.
 *  · Debe ser un entero positivo cuando se introduzca.
 *  · El límite inferior no puede superar al superior.
 */
export function parseSkuRange(desde: string, hasta: string): SkuRange | SkuRangeError {
  const parseBound = (raw: string, label: string): bigint | string | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed) || trimmed.startsWith('+') || trimmed.startsWith('-')) {
      return `${label} debe ser un entero positivo.`;
    }
    const value = BigInt(trimmed);
    if (value <= BigInt(0)) return `${label} debe ser un entero positivo.`;
    return value;
  };

  const from = parseBound(desde, '«SKU desde»');
  if (typeof from === 'string') return { ok: false, error: from };
  const to = parseBound(hasta, '«SKU hasta»');
  if (typeof to === 'string') return { ok: false, error: to };

  if (from !== null && to !== null && from > to) {
    return { ok: false, error: 'El límite inferior no puede superar al superior.' };
  }
  return { ok: true, from, to };
}

/** ¿El valor numérico está dentro del rango (límites incluidos)? */
export function skuInRange(value: bigint, range: { from: bigint | null; to: bigint | null }): boolean {
  if (range.from !== null && value < range.from) return false;
  if (range.to !== null && value > range.to) return false;
  return true;
}

/**
 * Comparador TOTAL del listado: numéricos primero (por valor ascendente,
 * empate por código original), luego alfanuméricos (natural, sin mayúsculas),
 * al final los sin SKU (por nombre). Determinista incluso con SKU duplicados
 * entre grupos: desempate final por nombre y por id.
 */
export function compareBySku<T extends { sku: string | null | undefined; name?: string; id?: string }>(a: T, b: T): number {
  const groupA = classifySku(a.sku);
  const groupB = classifySku(b.sku);
  const rank = (g: SkuGroup) => (g === 'numeric' ? 0 : g === 'alphanumeric' ? 1 : 2);
  const rankDiff = rank(groupA) - rank(groupB);
  if (rankDiff !== 0) return rankDiff;

  if (groupA === 'numeric') {
    const numDiff = skuNumericValue(a.sku)! - skuNumericValue(b.sku)!;
    if (numDiff !== BigInt(0)) return numDiff < BigInt(0) ? -1 : 1;
    // Ceros iniciales o mismo valor: desempate DETERMINISTA por puntos de
    // código ASCII (no localeCompare: depende del ICU del motor) —
    // '007' < '01' < '1' en cualquier runtime.
    const codeA = a.sku!.trim();
    const codeB = b.sku!.trim();
    if (codeA !== codeB) return codeA < codeB ? -1 : 1;
  }
  if (groupA === 'alphanumeric') {
    // Orden natural alfanumérico, independiente de mayúsculas y minúsculas
    // («A15» y «a15» empatan; «SKU-2» < «SKU-10»).
    const natDiff = (a.sku ?? '').localeCompare(b.sku ?? '', 'es', { numeric: true, sensitivity: 'base' });
    if (natDiff !== 0) return natDiff;
  }
  const nameDiff = (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' });
  if (nameDiff !== 0) return nameDiff;
  return (a.id ?? '').localeCompare(b.id ?? '');
}

export interface PriceListProductInput {
  sku: string | null | undefined;
  name: string;
  id?: string;
}

export type SkuFilter = { from: bigint | null; to: bigint | null } | null;

/**
 * Aplica el rango al grupo numérico y devuelve el subconjunto.
 *  · Sin rango (null o límites ambos ausentes) → pasan numéricos +
 *    alfanuméricos + sin SKU.
 *  · Con rango (algún límite) → solo numéricos dentro del rango:
 *    los alfanuméricos y los sin SKU quedan excluidos por regla (§4.2).
 */
export function applySkuRange<T extends PriceListProductInput>(items: readonly T[], range: SkuFilter): T[] {
  if (!range || (range.from === null && range.to === null)) return [...items];
  return items.filter((item) => {
    const value = skuNumericValue(item.sku);
    return value !== null && skuInRange(value, range);
  });
}

/** Filtra + ordena el listado completo (regla §4.2 en un solo paso). */
export function orderProductsBySku<T extends PriceListProductInput>(items: readonly T[], range: SkuFilter): T[] {
  return applySkuRange(items, range).sort(compareBySku);
}
