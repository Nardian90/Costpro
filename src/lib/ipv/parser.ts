import { extractIdentity } from './identity/mapping-engine';
import { resolveIdentity } from './identity/registry';

export interface ParsedObservation {
  payer: string;
  account: string;
  tax: number;
  commission: number;
  ci?: string;
}

/**
 * Robustly parses the observations string from a bank transaction to extract
 * key information for the IPV dashboard.
 * Returns commission in CENTS.
 */
export function parseObservations(obs: string): ParsedObservation {
  if (!obs) {
    return { payer: '', account: '', tax: 0, commission: 0 };
  }

  // Use the new Identity Mapping Engine
  const id = extractIdentity(obs);

  // 1. Payer Name Extraction
  let payer = id.nombre || '';
  if (!payer) {
    const payerRegex = /(?:PAGO DE:|TRANSFERENCIA DE:|DE:|ORDENADA POR:|ORDENANTE NOMBRE:)\s*([A-Z\s]+?)(?=\s*(?:NIT|PAN:|Cuenta|\||\d|\n|$))/i;
    const payerMatch = obs.match(payerRegex);
    if (payerMatch && payerMatch[1]) {
      payer = payerMatch[1].trim();
    }
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
    const taxValueRegex = /IMPUESTO[:\s]+([\d.]+)/i;
    const taxMatch = obs.match(taxValueRegex);
    if (taxMatch) tax = parseFloat(taxMatch[1]) || 0;
  }

  // 4. Commission Extraction (Returns in cents)
  let commission = 0;
  const commissionRegex = /COMISION[:\s]+([\d.]+)/i;
  const commissionMatch = obs.match(commissionRegex);
  if (commissionMatch) {
    commission = Math.round(parseFloat(commissionMatch[1]) * 100) || 0;
  }

  return { payer, account, tax, commission, ci: id.ci };
}

/**
 * Enriches a batch of transactions with identity data from the registry.
 */
export async function enrichTransactions(transactions: any[]): Promise<any[]> {
  const enriched = [];
  for (const tx of transactions) {
    const parsed = parseObservations(tx.observaciones || '');
    const identity = await resolveIdentity(tx.referencia_origen || tx.id, parsed.ci, parsed.payer);

    enriched.push({
      ...tx,
      nombre_cliente: identity.nombre || parsed.payer,
      carnet: identity.ci || parsed.ci,
      pagador: identity.nombre || parsed.payer,
      esImpuesto: parsed.tax > 0 || (tx.observaciones || '').includes('NIT:'),
      comision: parsed.commission // This is now in cents
    });
  }
  return enriched;
}

/**
 * Legacy support for existing parsing logic if needed, but updated to use new robust parser.
 * Note: Prefer enrichTransactions for async identity resolution.
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
