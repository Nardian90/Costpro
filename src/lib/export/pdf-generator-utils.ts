import { sanitizeText } from './pdf-shared';

/**
 * Sanitizes Annex titles to avoid redundant IDs like "ANEXO I: I - Title"
 */
export function sanitizeAnnexTitle(id: string, title: string): string {
    if (!title) return `ANEXO ${sanitizeText(id) || id}`;

    // Normalize and clean the title
    let cleanTitle = sanitizeText(title) || title;
    cleanTitle = cleanTitle.trim();

    // Patterns to remove from the start: "I - ", "I: ", "ANEXO I ", etc.
    const patternsToRemove = [
        new RegExp(`^ANEXO\\s+${id}[:\\s-]*`, 'i'),
        new RegExp(`^${id}[:\\s-\\.]+`, 'i'),
    ];

    patternsToRemove.forEach(p => {
        cleanTitle = cleanTitle.replace(p, '');
    });

    return `ANEXO ${id}: ${cleanTitle.trim()}`;
}

/**
 * Checks if a section header is redundant compared to its first row.
 * BUG FIX: Also strips "Seccion N:" prefix from section labels during comparison,
 * preventing duplicate headers like "Seccion 1: Gasto Material" + "1 GASTO MATERIAL".
 */
export function isSectionHeaderRedundant(sectionLabel: string, rows: any[]): boolean {
    if (!rows || rows.length === 0) return false;
    const firstRowLabel = rows[0].label || '';

    // Normalize for comparison — remove "Seccion/Sección N:" prefix and non-alphanumeric chars
    // FIX: Merged the two regexes into one (the first was dead code, subsumed by the second)
    const norm = (s: string) => sanitizeText(s)!.toLowerCase().trim()
        .replace(/^secci[oó]n\s+\d+[:\s-]*/i, '')
        .replace(/[^a-z0-9]/g, '');

    return norm(sectionLabel) === norm(firstRowLabel);
}
