/**
 * Sanitizes Annex titles to avoid redundant IDs like "ANEXO I: I - Title"
 */
export function sanitizeAnnexTitle(id: string, title: string): string {
    if (!title) return `ANEXO ${id}`;

    // Normalize and clean the title
    let cleanTitle = title.trim();

    // Patterns to remove from the start: "I - ", "I: ", "ANEXO I ", etc.
    const patternsToRemove = [
        new RegExp(`^ANEXO\\s+${id}[:\\s-]*`, 'i'),
        new RegExp(`^${id}[:\\s-\\.]+`, 'i'), // Added dot for "1. Materiales"
    ];

    patternsToRemove.forEach(p => {
        cleanTitle = cleanTitle.replace(p, '');
    });

    return `ANEXO ${id}: ${cleanTitle.trim()}`;
}

/**
 * Checks if a section header is redundant compared to its first row
 */
export function isSectionHeaderRedundant(sectionLabel: string, rows: any[]): boolean {
    if (!rows || rows.length === 0) return false;
    const firstRowLabel = rows[0].label || '';

    // Normalize for comparison
    const norm = (s: string) => s.toLowerCase().trim()
        .replace(/^sección\s+\d+[:\s-]*/i, '')
        .replace(/[^a-z0-9]/g, '');

    return norm(sectionLabel) === norm(firstRowLabel);
}

/**
 * Adds the general data block to the PDF document
 */
export function addGeneralData(doc: any, header: any, y: number, pageWidth: number, isBilingual: boolean = false): number {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    const productLabel = isBilingual ? "Producto / Product:" : "Producto:";
    const codeLabel = isBilingual ? "Código / Code:" : "Código:";
    const qtyLabel = isBilingual ? "Cantidad / Quantity:" : "Cantidad:";
    const umLabel = isBilingual ? "UM / UoM:" : "UM:";

    doc.text(`${productLabel} ${header.name || 'N/A'}`, 14, y);
    doc.text(`${codeLabel} ${header.code || 'N/A'}`, pageWidth / 2, y);
    y += 6;
    doc.text(`${qtyLabel} ${header.quantity || '1'}`, 14, y);
    doc.text(`${umLabel} ${header.unit || header.um || 'N/A'}`, pageWidth / 2, y);

    return y + 10;
}
