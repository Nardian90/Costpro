export interface ParsedObservation {
  payer: string;
  account: string;
  tax: number;
  commission: number;
  ci: string;
  phone: string;
}

/**
 * Robustly parses the observations string from a bank transaction to extract
 * key information for the IPV dashboard.
 */
export function parseObservations(obs: string): ParsedObservation {
  if (!obs) {
    return { payer: '', account: '', tax: 0, commission: 0, ci: '', phone: '' };
  }

  // 1. Payer Name Extraction
  let payer = '';
  const payerRegex = /(?:PAGO DE:|TRANSFERENCIA DE:|DE:|ORDENADA POR:|ORDENANTE NOMBRE:)\s*([A-Z\s.-]+?)(?=\s*(?:NIT|PAN:|CI:|Cuenta|\||\d{11}|\n|$))/i;
  const payerMatch = obs.match(payerRegex);
  if (payerMatch && payerMatch[1]) {
    payer = payerMatch[1].trim();
  }

  // 2. Account/Card Identification
  let account = '';
  const accountRegex = /(?:PAN:|Cuenta:|Tarjeta RED:)\s*([\d*]+)/i;
  const accountMatch = obs.match(accountRegex);
  if (accountMatch && accountMatch[1]) {
    account = accountMatch[1].trim();
  }

  // 3. CI Extraction
  let ci = '';
  const ciRegex = /(?:CI:)\s*(\d{11})/i;
  const ciMatch = obs.match(ciRegex);
  if (ciMatch) {
    ci = ciMatch[1];
  } else {
    // Fallback search for 11 digits that look like CI
    const ciFallbackMatch = obs.match(/\b\d{11}\b/);
    if (ciFallbackMatch) ci = ciFallbackMatch[0];
  }

  // 4. Phone Extraction (ID_CUBACEL pattern)
  let phone = '';
  const phoneRegex = /(?:ID_CUBACEL:)\s*\d+\s+(\d+)/i;
  const phoneMatch = obs.match(phoneRegex);
  if (phoneMatch) {
    phone = phoneMatch[1];
  }

  // 5. Tax Extraction
  let tax = 0;
  if (obs.toUpperCase().includes('NIT:')) {
    const taxValueRegex = /IMPUESTO[:\s]+([\d.]+)/i;
    const taxMatch = obs.match(taxValueRegex);
    if (taxMatch) tax = parseFloat(taxMatch[1]) || 0;
  }

  // 6. Commission Extraction
  let commission = 0;
  const commissionRegex = /COMI[:\s]+([\d.]+)/i;
  const commissionMatch = obs.match(commissionRegex);
  if (commissionMatch) {
    commission = parseFloat(commissionMatch[1]) || 0;
  }

  return { payer, account, tax, commission, ci, phone };
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
      comision: parsed.commission,
      payer_name: parsed.payer,
      payer_ci: parsed.ci,
      payer_phone: parsed.phone
    };
  });
}
