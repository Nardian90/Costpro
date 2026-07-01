import { type BankTransaction } from '../../dexie';

/**
 * Calculates a Data Quality Score (1-10) for a batch of transactions.
 * Scoring criteria:
 * - 4 points: CI Presence (does the transaction have a carnet?)
 * - 4 points: Name Presence (does it have a client name?)
 * - 2 points: Confidence/Audit match (not implemented in metadata yet, but could be)
 */
export function calculateBatchQuality(transactions: BankTransaction[]): number {
  if (!transactions || transactions.length === 0) return 10;

  let totalScore = 0;

  for (const tx of transactions) {
    let txScore = 0;

    // 5 points for CI
    if (tx.carnet && tx.carnet.length >= 7) {
      txScore += 5;
    }

    // 5 points for Name
    if (tx.nombre_cliente && tx.nombre_cliente.length > 2) {
      txScore += 5;
    }

    totalScore += txScore;
  }

  const average = totalScore / transactions.length;
  return Math.round(average * 10) / 10;
}
