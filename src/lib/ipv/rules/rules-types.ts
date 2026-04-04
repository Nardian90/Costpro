import { BankTransaction } from '@/lib/dexie';

export const TRANSACTION_TYPE = {
  DEBIT: 'Db',
  CREDIT: 'Cr'
} as const;

export type TransactionType = typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE];

/**
 * Deriva si una transacción debe mostrarse como seleccionada en la UI.
 * Regla: No excluida Y No es un Débito (Db).
 * Si el campo 'excluido' está definido explícitamente, su valor tiene precedencia.
 */
export function isTransactionSelected(tx: BankTransaction): boolean {
  // Si ya fue marcada o desmarcada explícitamente por el usuario
  if (tx.excluido !== undefined) {
    return !tx.excluido;
  }
  // Por defecto, Débitos no se seleccionan
  return tx.tipo !== TRANSACTION_TYPE.DEBIT;
}
