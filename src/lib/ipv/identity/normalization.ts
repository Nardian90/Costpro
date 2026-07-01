/**
 * Normalizes a name string for reliable matching.
 * - Uppercase
 * - Removes accents
 * - Removes special characters
 * - Trims double spaces
 */
export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Remove double spaces
    .trim()
    .toUpperCase();
}

/**
 * Strips all spaces and special characters for a "canonical" representation
 * to identify duplicates across different spacing formats.
 */
export function getCanonicalName(name: string): string {
    return normalizeName(name).replace(/\s+/g, "");
}

/**
 * Unified normalization for customer data.
 * Handles different field names from various sources (localStorage legacy, Dexie, raw imports).
 */
export const normalizeCliente = (raw: any) => {
  const ci = (raw.ci || raw.CI || raw.documento || raw.carnet || "").toString().trim();
  const nombreRaw = raw.nombre || raw.name || raw.cliente || raw.nombre_cliente || "";
  const nombre = normalizeName(nombreRaw);
  const telefono = (raw.telefono || raw.phone || raw.telefono_cliente || "").toString().trim();
  const tarjeta = (raw.tarjeta || raw.card_number || raw.tarjeta_cliente || "").toString().trim();

  return {
    ci,
    nombre,
    nombre_display: nombreRaw.toUpperCase().trim() || "—",
    telefono,
    tarjeta,
  };
};

/**
 * Levenshtein Distance for fuzzy matching
 */
export function levenshteinDistance(s1: string, s2: string): number {
    if (s1.length < s2.length) return levenshteinDistance(s2, s1);
    if (s2.length === 0) return s1.length;

    let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 0; i < s1.length; i++) {
        const currentRow = [i + 1];
        for (let j = 0; j < s2.length; j++) {
            const insertions = previousRow[j + 1] + 1;
            const deletions = currentRow[j] + 1;
            const substitutions = previousRow[j] + (s1[i] === s2[j] ? 0 : 1);
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow = currentRow;
    }
    return previousRow[s2.length];
}

export function similarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - levenshteinDistance(s1, s2)) / longer.length;
}
