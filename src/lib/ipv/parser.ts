export interface ParsedObservation {
  payer: string;
  account: string;
  tax: number;
  commission: number;
}

/**
 * Robustly parses the observations string from a bank transaction to extract
 * key information for the IPV dashboard.
 */
export function parseObservations(obs: string): ParsedObservation {
  if (!obs) {
    return { payer: '', account: '', tax: 0, commission: 0 };
  }

  // 1. Payer Name Extraction
  // Look for common prefixes used in bank transfers
  let payer = '';
  const payerRegex = /(?:PAGO DE:|TRANSFERENCIA DE:|DE:|ORDENADA POR:|ORDENANTE NOMBRE:)\s*([A-Z\s]+?)(?=\s*(?:NIT|PAN:|Cuenta|\||\d|\n|$))/i;
  const payerMatch = obs.match(payerRegex);
  if (payerMatch && payerMatch[1]) {
    payer = payerMatch[1].trim();
  }

  // 2. Account/Card Identification
  let account = '';
  const accountRegex = /(?:PAN:|Cuenta:)\s*([\d*]+)/i;
  const accountMatch = obs.match(accountRegex);
  if (accountMatch && accountMatch[1]) {
    account = accountMatch[1].trim();
  }

  // 3. Tax Extraction (e.g., from NIT references or explicit tags)
  let tax = 0;
  if (obs.toUpperCase().includes('NIT:')) {
    // Usually if NIT is present, it's a tax-related payment
    // We try to extract a numeric value if it's explicitly stated as a fee/tax
    const taxValueRegex = /IMPUESTO[:\s]+([\d.]+)/i;
    const taxMatch = obs.match(taxValueRegex);
    if (taxMatch) tax = parseFloat(taxMatch[1]) || 0;
  }

  // 4. Commission Extraction
  let commission = 0;
  const commissionRegex = /COMISION[:\s]+([\d.]+)/i;
  const commissionMatch = obs.match(commissionRegex);
  if (commissionMatch) {
    commission = parseFloat(commissionMatch[1]) || 0;
  }

  return { payer, account, tax, commission };
}

/**
 * Legacy support for existing parsing logic if needed, but updated to use new robust parser.
 */
export function parseTransactions(data: any[]): any[] {
  if (!data) return [];
  return data.map(tx => {
    const parsed = parseObservations(tx.observaciones || '');
    return {
      ...tx,
      pagador: parsed.payer,
      esImpuesto: parsed.tax > 0 || (tx.observaciones || '').includes('NIT:'),
      comision: parsed.commission
    };
  });
}
