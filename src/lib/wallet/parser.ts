import { v4 as uuidv4 } from 'uuid';
import { WalletTransaction, WalletTransactionType } from './types';

export function parseSmsText(text: string): WalletTransaction[] {
  const lines = text.split('\n');
  const transactions: WalletTransaction[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TRANSFER_IN: PAGOxMOVIL El titular del telefono 5353183965 le ha realizado una transferencia a la cuenta 9204069997231162 de 1000.00 CUP. Nro. Transaccion KW600HAHQE999. Fecha: 9/3/2026.
    if (trimmed.includes('le ha realizado una transferencia')) {
      const phoneMatch = trimmed.match(/telefono (\d+)/);
      const amountMatch = trimmed.match(/de ([\d.]+) (\w+)/);
      const transIdMatch = trimmed.match(/Nro\. Transaccion ([A-Z0-9]+)/);
      const dateMatch = trimmed.match(/Fecha: (\d+\/\d+\/\d+)/);

      transactions.push({
        id: uuidv4(),
        date: formatDate(dateMatch ? dateMatch[1] : new Date().toLocaleDateString()),
        bank: 'BANDEC', // Default or extracted if possible
        type: 'TRANSFER_IN',
        direction: 'IN',
        amount: parseFloat(amountMatch ? amountMatch[1] : '0'),
        currency: amountMatch ? amountMatch[2] : 'CUP',
        counterparty: phoneMatch ? phoneMatch[1] : 'Unknown',
        transaction_id: transIdMatch ? transIdMatch[1] : uuidv4(),
        description: trimmed,
        source: 'SMS'
      });
      continue;
    }

    // TRANSFER_OUT: La Transferencia fue completada... (Simplified check)
    if (trimmed.includes('La Transferencia fue completada') || trimmed.includes('Monto:') && trimmed.includes('Beneficiario:')) {
       const amountMatch = trimmed.match(/Monto: ([\d.]+) (\w+)/);
       const destMatch = trimmed.match(/Beneficiario: (\d+)/);

       transactions.push({
        id: uuidv4(),
        date: new Date().toISOString().split('T')[0], // Placeholder
        bank: 'BANDEC',
        type: 'TRANSFER_OUT',
        direction: 'OUT',
        amount: parseFloat(amountMatch ? amountMatch[1] : '0'),
        currency: amountMatch ? amountMatch[2] : 'CUP',
        counterparty: destMatch ? destMatch[1] : 'Unknown',
        transaction_id: uuidv4(),
        description: trimmed,
        source: 'SMS'
      });
      continue;
    }

    // Tabular format check: Fecha;Servicio;Operacion;Monto;Moneda;NoTransaccion
    // 20/02/2026;Credito: Ref: EA60039732999;Cr;9043.85;CUP;
    if (trimmed.includes(';')) {
        const parts = trimmed.split(';');
        if (parts.length >= 5) {
            const date = formatDate(parts[0]);
            const service = parts[1];
            const op = parts[2];
            const amount = parseFloat(parts[3]);
            const currency = parts[4];
            const transId = parts[5] || '';

            if (!isNaN(amount)) {
                transactions.push({
                    id: uuidv4(),
                    date: date,
                    bank: 'BANDEC',
                    type: op === 'Cr' ? 'TRANSFER_IN' : 'TRANSFER_OUT',
                    direction: op === 'Cr' ? 'IN' : 'OUT',
                    amount: amount,
                    currency: currency || 'CUP',
                    counterparty: service || 'Bank Statement',
                    transaction_id: transId || uuidv4(),
                    description: trimmed,
                    source: 'BANK_LOG'
                });
                continue;
            }
        }
    }
  }

  return transactions;
}

function formatDate(dateStr: string): string {
  // Simple conversion from D/M/YYYY or DD/MM/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

export function calculateAnalytics(transactions: WalletTransaction[]): WalletAnalytics {
    const summary: WalletSummary = {
        total_income: 0,
        total_expenses: 0,
        balance: 0
    };

    const banks: Record<string, { income: number; expenses: number }> = {};
    const monthly: Record<string, { income: number; expenses: number }> = {};

    transactions.forEach(tx => {
        if (tx.direction === 'IN') {
            summary.total_income += tx.amount;
        } else {
            summary.total_expenses += tx.amount;
        }

        // Banks
        if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0 };
        if (tx.direction === 'IN') banks[tx.bank].income += tx.amount;
        else banks[tx.bank].expenses += tx.amount;

        // Monthly
        const month = tx.date.substring(0, 7); // YYYY-MM
        if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
        if (tx.direction === 'IN') monthly[month].income += tx.amount;
        else monthly[month].expenses += tx.amount;
    });

    summary.balance = summary.total_income - summary.total_expenses;

    return {
        summary,
        banks,
        monthly,
        transactions
    };
}
