import { v4 as uuidv4 } from 'uuid';
import { WalletTransaction, WalletTransactionType, WalletAnalytics, WalletSummary } from './types';

const PATTERNS = {
  BALANCE: /Saldo Disponible:\s*CR\s*([\d.]+)\s*CUP/,
  TRANSFER_OUT: /Beneficiario:\s*(\d+X*)\s+.*Monto:\s*([\d.]+)\s*CUP/,
  TRANSFER_IN: /telefono\s+(\d+)\s+le ha realizado.*?cuenta\s+(\d+)\s+de\s+([\d.]+)\s+CUP/,
  ELECTRICITY: /factura de electricidad.*?Consumo mensual:\s*(\d+)\s*KW.*?Periodo Pagado:\s*(\d{2}\/\d{4})/i,
  RECHARGE: /Telefono:\s*(\d+).*?Monto Pagado:\s*([\d.]+).*?Saldo acreditado:\s*(\d+)/i,
  FAILED: /Fallo(.*?)(?:\. Fecha:|$)/i,
  LIMIT_CHANGE: /ATM:\s*([\d.]+);\s*POS:\s*([\d.]+);\s*TOTAL:\s*([\d.]+)/i,
  DATE: /Fecha:\s*(\d+\/\d+\/\d+)/,
  TRANS_ID: /Nro\. Transaccion\s+([A-Z0-9]+)/
};

export function parseSmsText(text: string): WalletTransaction[] {
  const lines = text.split('\n');
  const transactions: WalletTransaction[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const type = classify(trimmed);
    const dateMatch = trimmed.match(PATTERNS.DATE);
    const date = formatDate(dateMatch ? dateMatch[1] : new Date().toLocaleDateString());
    const transIdMatch = trimmed.match(PATTERNS.TRANS_ID);
    const transId = transIdMatch ? transIdMatch[1] : uuidv4();

    if (type === 'BALANCE_QUERY') {
      const match = trimmed.match(PATTERNS.BALANCE);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'BALANCE_QUERY',
          direction: 'IN',
          amount: 0,
          currency: 'CUP',
          counterparty: 'Consulta de Saldo',
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          balance_after: parseFloat(match[1]),
          status: 'SUCCESS'
        });
        continue;
      }
    }

    if (type === 'TRANSFER_IN') {
      const match = trimmed.match(PATTERNS.TRANSFER_IN);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'TRANSFER_IN',
          direction: 'IN',
          amount: parseFloat(match[3]),
          currency: 'CUP',
          counterparty: match[1],
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          status: 'SUCCESS'
        });
        continue;
      }
    }

    if (type === 'TRANSFER_OUT') {
      const match = trimmed.match(PATTERNS.TRANSFER_OUT);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'TRANSFER_OUT',
          direction: 'OUT',
          amount: parseFloat(match[2]),
          currency: 'CUP',
          counterparty: match[1],
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          status: 'SUCCESS'
        });
        continue;
      }
    }

    if (type === 'PAYMENT_SERVICE') {
      const elecMatch = trimmed.match(PATTERNS.ELECTRICITY);
      if (elecMatch) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'PAYMENT_SERVICE',
          direction: 'OUT',
          amount: 0, // Should extract amount if present in full SMS
          currency: 'CUP',
          counterparty: 'UNE (Electricidad)',
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          service_category: 'ELECTRICITY',
          extra_data: { consumption_kwh: parseInt(elecMatch[1]), period: elecMatch[2] },
          status: 'SUCCESS'
        });
        continue;
      }
    }

    if (type === 'PHONE_RECHARGE') {
      const match = trimmed.match(PATTERNS.RECHARGE);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'PHONE_RECHARGE',
          direction: 'OUT',
          amount: parseFloat(match[2]),
          currency: 'CUP',
          counterparty: match[1],
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          service_category: 'RECHARGE',
          status: 'SUCCESS'
        });
        continue;
      }
    }

    if (type === 'FAILED_OPERATION') {
      const match = trimmed.match(PATTERNS.FAILED);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'FAILED_OPERATION',
          direction: 'OUT',
          amount: 0,
          currency: 'CUP',
          counterparty: 'Operación Fallida',
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          status: 'FAILED',
          extra_data: { reason: match[1].trim().replace(/^[^a-zA-Z0-9]+/, '').replace(/\.\s*$/, '') }
        });
        continue;
      }
    }

    if (type === 'LIMIT_CHANGE') {
      const match = trimmed.match(PATTERNS.LIMIT_CHANGE);
      if (match) {
        transactions.push({
          id: uuidv4(),
          date,
          bank: 'BANDEC',
          type: 'LIMIT_CHANGE',
          direction: 'OUT',
          amount: 0,
          currency: 'CUP',
          counterparty: 'Cambio de Límite',
          transaction_id: transId,
          description: trimmed,
          source: 'SMS',
          extra_data: { atm: match[1], pos: match[2], total: match[3].replace(/\.\s*$/, '') }
        });
        continue;
      }
    }

    // Tabular format fallback
    if (trimmed.includes(';')) {
      const parts = trimmed.split(';');
      if (parts.length >= 5) {
        const amount = parseFloat(parts[3]);
        if (!isNaN(amount)) {
          transactions.push({
            id: uuidv4(),
            date: formatDate(parts[0]),
            bank: 'BANDEC',
            type: parts[2] === 'Cr' ? 'TRANSFER_IN' : 'TRANSFER_OUT',
            direction: parts[2] === 'Cr' ? 'IN' : 'OUT',
            amount,
            currency: parts[4] || 'CUP',
            counterparty: parts[1] || 'Bank Statement',
            transaction_id: parts[5] || uuidv4(),
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

function classify(text: string): WalletTransactionType {
  const low = text.toLowerCase();
  if (low.includes('consulta de saldo')) return 'BALANCE_QUERY';
  if (low.includes('le ha realizado una transferencia')) return 'TRANSFER_IN';
  if (low.includes('transferencia fue completada')) return 'TRANSFER_OUT';
  if (low.includes('factura de electricidad')) return 'PAYMENT_SERVICE';
  if (low.includes('recarga') && low.includes('exito')) return 'PHONE_RECHARGE';
  if (low.includes('fallo') || low.includes('falló')) return 'FAILED_OPERATION';
  if (low.includes('cambio de limite')) return 'LIMIT_CHANGE';
  return 'OTHER';
}

function formatDate(dateStr: string): string {
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
  const summary: WalletSummary = { total_income: 0, total_expenses: 0, balance: 0 };
  const banks: Record<string, { income: number; expenses: number }> = {};
  const monthly: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(tx => {
    if (tx.direction === 'IN') summary.total_income += tx.amount;
    else summary.total_expenses += tx.amount;

    if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0 };
    if (tx.direction === 'IN') banks[tx.bank].income += tx.amount;
    else banks[tx.bank].expenses += tx.amount;

    const month = tx.date.substring(0, 7);
    if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
    if (tx.direction === 'IN') monthly[month].income += tx.amount;
    else monthly[month].expenses += tx.amount;
  });

  summary.balance = summary.total_income - summary.total_expenses;
  return { summary, banks, monthly, transactions };
}
