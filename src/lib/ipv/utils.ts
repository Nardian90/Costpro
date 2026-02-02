
/**
 * Extract commission from bank observations string.
 * Supports formats like "comis 10.50" or "Comis: 10.50"
 */
export function extractCommissionCents(observations: string): number {
    if (!observations) return 0;
    const comisMatch = observations.match(/comis:?\s*([0-9,.]+)/i);
    if (comisMatch) {
        const comisStr = comisMatch[1].replace(/,/g, '');
        return Math.round(parseFloat(comisStr) * 100);
    }
    return 0;
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 */
export function standardizeDate(dateStr: string): string {
    if (!dateStr) return '';
    // Handle DD/MM/YYYY or DD/MM/YY
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    // Already YYYY-MM-DD or other
    return dateStr;
}
