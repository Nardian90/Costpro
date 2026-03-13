import { RawSms, ConsolidatedTransaction, AnalyticalTransaction, WalletAnalytics, WalletSummary } from './types';

const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

export function parseRawSms(text: string): RawSms[] {
  if (!text) return [];
  const lines = text.split('\n');
  const rawSms: RawSms[] = [];

  let startIdx = 0;
  if (lines.length > 0 && lines[0].toLowerCase().includes('type') && lines[0].toLowerCase().includes('content')) {
    startIdx = 1;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\t|\s{2,}/);

    if (parts.length >= 4) {
      rawSms.push({
        id: generateId(),
        type: parts[0].trim(),
        date: parts[1].trim(),
        nameNumber: parts[2].trim(),
        content: parts.slice(3).join(' ').trim()
      });
    } else {
      const dateRegex = /(\d{1,2}\s+[a-z]{3}\.?\s+\d{4})/;
      const match = line.match(dateRegex);
      if (match) {
        const dateStr = match[1];
        const dateIdx = line.indexOf(dateStr);
        const type = line.substring(0, dateIdx).trim() || 'Recibido';
        const rest = line.substring(dateIdx + dateStr.length).trim();
        const restParts = rest.split(/\s+/);
        const nameNumber = restParts[0] || 'PAGOxMOVIL';
        const content = restParts.slice(1).join(' ');

        rawSms.push({
          id: generateId(),
          type,
          date: dateStr,
          nameNumber,
          content
        });
      }
    }
  }

  const unique = new Map<string, RawSms>();
  rawSms.forEach(sms => {
    const key = `${sms.type}|${sms.date}|${sms.content}`;
    if (!unique.has(key)) {
      unique.set(key, sms);
    }
  });

  return Array.from(unique.values());
}

export function normalizeBank(text: string): string {
  const low = text.toLowerCase();
  if (low.includes('banco popular de ahorro') || low.includes('bpa')) return 'BPA';
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('metropolitano')) return 'METRO';
  return 'BANDEC';
}

export function deriveTransactions(raw: RawSms[]): ConsolidatedTransaction[] {
  const consolidated: ConsolidatedTransaction[] = [];
  const seen = new Set<string>();

  raw.forEach(sms => {
    const bank = normalizeBank(sms.content);

    if (sms.content.includes('Ultimas operaciones')) {
      const lines = sms.content.split(/[.;\n]/);
      lines.forEach(line => {
        if (line.includes(';')) {
          const parts = line.split(';');
          if (parts.length >= 6) {
            const date = parts[0].trim();
            const service = parts[1].trim();
            const operation = parts[2].trim().toUpperCase();
            const amountStr = parts[3].replace(',', '.').trim();
            const amount = parseFloat(amountStr);
            const currency = parts[4].trim();
            const transactionId = parts[5].trim();

            if (!isNaN(amount) && transactionId) {
              const op: 'CR' | 'DB' = (operation === 'CR' || operation.includes('CR')) ? 'CR' : 'DB';
              const key = `${date}|${amount}|${transactionId}|${bank}`;
              if (!seen.has(key)) {
                consolidated.push({
                  date: formatDate(date),
                  service,
                  operation: op,
                  amount,
                  currency,
                  transactionId,
                  bank,
                  counterparty: service // In statement lines, service often contains counterparty info
                });
                seen.add(key);
              }
            }
          }
        }
      });
    }

    const patterns = [
      {
        regex: /Transferencia fue completada.*?Monto:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: any) => ({ amount: parseFloat(m[1].replace(',', '.')), currency: m[2], transactionId: m[3], date: m[4], operation: 'DB' as const, service: 'Transferencia', counterparty: 'Enviada' })
      },
      {
        regex: /le ha realizado una transferencia.*?de\s+([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: any) => {
            const phoneMatch = sms.content.match(/telefono\s+(\d+)/i);
            return {
                amount: parseFloat(m[1].replace(',', '.')),
                currency: m[2],
                transactionId: m[3],
                date: m[4],
                operation: 'CR' as const,
                service: 'Transferencia',
                counterparty: phoneMatch ? phoneMatch[1] : 'Recibida'
            };
        }
      },
      {
        regex: /Recarga de cupon.*?Monto Pagado:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: any) => ({ amount: parseFloat(m[1].replace(',', '.')), currency: m[2], transactionId: m[3], date: m[4], operation: 'DB' as const, service: 'Recarga', counterparty: 'ETECSA' })
      },
      {
        regex: /Pago factura.*?Monto Pagado:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: any) => ({ amount: parseFloat(m[1].replace(',', '.')), currency: m[2], transactionId: m[3], date: m[4], operation: 'DB' as const, service: 'Pago', counterparty: 'Servicio' })
      }
    ];

    patterns.forEach(p => {
      const match = sms.content.match(p.regex);
      if (match) {
        const data = p.map(match);
        const key = `${data.date}|${data.amount}|${data.transactionId}|${bank}`;
        if (!seen.has(key)) {
          consolidated.push({
            date: formatDate(data.date),
            service: data.service,
            operation: data.operation,
            amount: data.amount,
            currency: data.currency,
            transactionId: data.transactionId,
            bank,
            counterparty: data.counterparty
          });
          seen.add(key);
        }
      }
    });
  });

  return consolidated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function deriveAnalyticalData(consolidated: ConsolidatedTransaction[]): AnalyticalTransaction[] {
  return consolidated.map((tx, idx) => {
    let typeOperation = tx.service;
    let category = 'Otros';
    let contraparte = tx.counterparty || 'N/A';
    let note = tx.service;

    const serviceLow = tx.service.toLowerCase();

    if (serviceLow.includes('transferencia') || serviceLow === 'otr') {
      typeOperation = 'Transferencia';
      category = tx.operation === 'CR' ? 'Ingreso' : 'Transferencia';
      note = tx.operation === 'CR' ? 'Recibida' : 'Enviada';
    } else if (serviceLow.includes('recarga')) {
      typeOperation = 'Recarga';
      category = 'Telecom';
    } else if (serviceLow.includes('pago') || serviceLow.includes('factura')) {
      typeOperation = 'Pago';
      category = 'Impuesto';
    } else if (tx.isAdjustment) {
      typeOperation = 'Ajuste';
      category = 'Ajuste';
      note = 'Ajuste automático para integridad contable';
    }

    return {
      id: `an-${idx}-${tx.transactionId}`,
      date: tx.date,
      bank: tx.bank,
      typeOperation,
      nature: tx.operation,
      amount: tx.amount,
      currency: tx.currency,
      counterparty: contraparte,
      category,
      transactionId: tx.transactionId,
      channel: 'Transfermovil',
      note
    };
  });
}

export function calculateLedger(raw: RawSms[], consolidated: ConsolidatedTransaction[]): ConsolidatedTransaction[] {
  const ledger: ConsolidatedTransaction[] = [...consolidated];
  const banks = Array.from(new Set(ledger.map(t => t.bank)));

  banks.forEach(bank => {
    const bankTxs = ledger.filter(t => t.bank === bank).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const balances: { date: string, amount: number }[] = [];

    raw.forEach(sms => {
      if (normalizeBank(sms.content) === bank) {
        const match = sms.content.match(/(Saldo Disponible|Saldo restante):\s*(CR|DB)?\s*([\d,.]+)\s*CUP/i);
        if (match) {
          balances.push({
            date: formatDateFromSms(sms.date),
            amount: parseFloat(match[3].replace(',', '.'))
          });
        }
      }
    });

    balances.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (let i = 0; i < balances.length; i++) {
      const currentBalanceReport = balances[i];
      const prevBalanceReport = i > 0 ? balances[i-1] : null;
      let theoreticalBalance = prevBalanceReport ? prevBalanceReport.amount : (i === 0 ? currentBalanceReport.amount : 0);

      if (i === 0) continue; // Start from first reported balance

      const periodTxs = bankTxs.filter(t => {
        const tDate = new Date(t.date).getTime();
        const prevDate = new Date(prevBalanceReport!.date).getTime();
        const currDate = new Date(currentBalanceReport.date).getTime();
        return tDate > prevDate && tDate <= currDate;
      });

      periodTxs.forEach(t => {
        if (t.operation === 'CR') theoreticalBalance += t.amount;
        else theoreticalBalance -= t.amount;
      });

      if (Math.abs(theoreticalBalance - currentBalanceReport.amount) > 0.01) {
        const diff = currentBalanceReport.amount - theoreticalBalance;
        ledger.push({
          date: currentBalanceReport.date,
          service: 'AJUSTE',
          operation: diff > 0 ? 'CR' : 'DB',
          amount: Math.abs(diff),
          currency: 'CUP',
          transactionId: `ADJ-${Date.now()}-${i}`,
          bank: bank,
          isAdjustment: true,
          balanceAfter: currentBalanceReport.amount,
          counterparty: 'Sistema'
        });
      }
    }
  });

  return ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function calculateAnalytics(rawSms: RawSms[]): WalletAnalytics {
  const consolidatedBase = deriveTransactions(rawSms);
  const consolidated = calculateLedger(rawSms, consolidatedBase);
  const transactions = deriveAnalyticalData(consolidated);

  const summary: WalletSummary = { total_income: 0, total_expenses: 0, balance: 0 };
  const banks: Record<string, { income: number; expenses: number; current_balance: number }> = {};
  const categories: Record<string, number> = {};
  const monthly: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(tx => {
    if (tx.nature === 'CR') summary.total_income += tx.amount;
    else summary.total_expenses += tx.amount;

    if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0, current_balance: 0 };
    if (tx.nature === 'CR') banks[tx.bank].income += tx.amount;
    else banks[tx.bank].expenses += tx.amount;

    const month = tx.date.substring(0, 7);
    if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
    if (tx.nature === 'CR') monthly[month].income += tx.amount;
    else monthly[month].expenses += tx.amount;

    categories[tx.category] = (categories[tx.category] || 0) + tx.amount;
  });

  summary.balance = summary.total_income - summary.total_expenses;

  return {
    summary,
    banks,
    monthly,
    categories,
    transactions,
    rawSms,
    consolidated
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    return `${year}-\n${month}-\n${day}`.replace(/\n/g, ''); // Defensive
  }
  // Handle DD/MM/YYYY with potentially different separators or spaces
  const parts2 = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (parts2) {
      const day = parts2[1].padStart(2, '0');
      const month = parts2[2].padStart(2, '0');
      const year = parts2[3].length === 2 ? '20' + parts2[3] : parts2[3];
      return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function formatDateFromSms(dateStr: string): string {
  if (dateStr.includes('/')) return formatDate(dateStr);
  const months: Record<string, string> = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
  };
  const parts = dateStr.toLowerCase().replace('.', '').split(/\s+/);
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const month = months[parts[1]] || '01';
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}
