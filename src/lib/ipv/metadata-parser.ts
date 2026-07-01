/**
 * Robust metadata parser for bank transaction strings.
 * Delimiter: ";"
 * Format: Key:Value or Key: Value
 */

export interface ParsedTransactionMetadata {
  nit?: string;
  pd?: string; // Fecha
  ph?: string;
  tp?: string;
  rf?: string; // Impuesto
  ii?: string;
  principal?: number;
  recargo?: number;
  ti?: string;
  io?: number;
  pf?: string;
  suc?: string;
  ejecutado_por?: string;
  autorizado_por?: string;
  valor: number; // Derived: Principal or IO
  raw: Record<string, string>;
  inconsistencies: string[];
}

export function parseTransactionMetadata(observaciones: string): ParsedTransactionMetadata {
  const result: ParsedTransactionMetadata = {
    valor: 0,
    raw: {},
    inconsistencies: []
  };

  if (!observaciones) return result;

  // Split by delimiter and filter empty parts
  const parts = observaciones.split(';').map(p => p.trim()).filter(p => p.length > 0);

  parts.forEach(part => {
    // Try to find the first colon to split key and value
    const colonIndex = part.indexOf(':');
    if (colonIndex !== -1) {
      const key = part.substring(0, colonIndex).trim().toUpperCase();
      let value = part.substring(colonIndex + 1).trim();

      // Clean value (typos, extra spaces)
      value = value.replace(/\s+/g, ' ');

      // Map known fields
      switch (key) {
        case 'NIT': result.nit = value; break;
        case 'PD': result.pd = value; break;
        case 'PH': result.ph = value; break;
        case 'TP': result.tp = value; break;
        case 'RF':
            // Normalize "Especial" if split or other common typos can be added here
            result.rf = value.replace(/Es pecial/i, 'Especial');
            break;
        case 'II': result.ii = value; break;
        case 'PRINCIPAL': result.principal = parseFloat(value) || 0; break;
        case 'RECARGO': result.recargo = parseFloat(value) || 0; break;
        case 'TI': result.ti = value; break;
        case 'IO': result.io = parseFloat(value) || 0; break;
        case 'PF': result.pf = value; break;
        case 'SUC':
            // Special handling for nested fields like "Ejecutado por"
            const matchExec = value.match(/Ejecutado por:\s*([\w\s]+?)(?=\s*Autorizado por:|$)/i);
            const matchAuth = value.match(/Autorizado por:\s*(.+)$/i);

            if (matchExec) result.ejecutado_por = matchExec[1].trim();
            if (matchAuth) result.autorizado_por = matchAuth[1].trim();

            result.suc = value.split(' ')[0];
            break;
      }

      result.raw[key] = value;
    } else {
        result.inconsistencies.push(`Part without colon: "${part}"`);
    }
  });

  // Business Rule: Prioritize Principal, fallback to IO
  // Even if Principal is 0, use it if it exists? The requirement says "Si Principal = 0, usar IO".
  // And "Priorizar Principal, fallback IO".
  if (result.principal !== undefined && result.principal !== 0) {
      result.valor = result.principal;
  } else {
      result.valor = result.io || 0;
  }

  // Validation: Missing critical fields if NIT exists
  if (result.nit) {
    if (!result.pd) result.inconsistencies.push("Missing PD (Fecha)");
    if (!result.rf) result.inconsistencies.push("Missing RF (Impuesto)");
  }

  return result;
}
