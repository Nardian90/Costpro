import Decimal from 'decimal.js';
import { RawSms, ConsolidatedTransaction, AnalyticalTransaction, WalletAnalytics, WalletSummary, BankSummary } from './types';

const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

// FIX-DECIMAL (2026-07-05): parseAmount robusto que maneja todos los formatos:
// - "223,743.87" (coma miles, punto decimal) → 223743.87
// - "223.743,87" (punto miles, coma decimal) → 223743.87
// - "223743.87" (sin separador miles) → 223743.87
// - "223743,87" (coma decimal) → 223743.87
// - "5000.00" → 5000
// Antes: replace(',', '.') convertía "223,743.87" en "223.743.87" → DecimalError
export function parseAmount(str: string | undefined): number {
  if (!str) return 0;
  let s = str.trim();
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  try {
    return new Decimal(s || '0').toNumber();
  } catch {
    return 0;
  }
}

export function parseRawSms(text: string): RawSms[] {
  if (!text) return [];

  const lines = text.split('\n');

  // Compatibility check: if it looks like a TSV or has double spaces, use the simple line-by-line parser
  if (lines.some(l => l.includes('\t') || /\s{2,}/.test(l))) {
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
      }
    }
    if (rawSms.length > 0) return deduplicateRawSms(rawSms);
  }

  // Robust multi-line parser for fragmented input (like user's copy-paste)
  const messages: RawSms[] = [];
  let currentBlock: string[] = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // A new message record typically starts with "Recibido" or "Enviado" at the beginning of a line
    if (/^(Recibido|Enviado)/i.test(trimmed)) {
      if (currentBlock.length > 0) {
        messages.push(processBlock(currentBlock));
      }
      currentBlock = [trimmed];
    } else {
      if (currentBlock.length > 0) {
        currentBlock.push(trimmed);
      } else {
        currentBlock = [trimmed];
      }
    }
  });
  if (currentBlock.length > 0) messages.push(processBlock(currentBlock));

  return deduplicateRawSms(messages);
}

function processBlock(block: string[]): RawSms {
    const fullText = block.join(' ');
    let type = 'Recibido';
    const typeMatch = fullText.match(/^(Recibido|Enviado)/i);
    if (typeMatch) type = typeMatch[1];

    let date = '';
    const dateRegex = /(\d{1,2}\s+[a-z]{3}\.?\s+\d{4})|(\d{1,2}\/\d{1,2}\/\d{2,4})/;
    const dateMatch = fullText.match(dateRegex);
    if (dateMatch) date = dateMatch[0];

    let nameNumber = 'PAGOxMOVIL';
    if (fullText.includes('PAGOxMOVIL')) nameNumber = 'PAGOxMOVIL';

    let content = fullText;
    // Try to remove metadata from content
    const timeMatch = fullText.match(/\d{1,2}:\d{2}:\d{2}\s+(p\.\s*m\.|a\.\s*m\.)/i);
    if (timeMatch) {
        const timeEndIdx = fullText.indexOf(timeMatch[0]) + timeMatch[0].length;
        content = fullText.substring(timeEndIdx).trim();
    } else if (date) {
        const dateEndIdx = fullText.indexOf(date) + date.length;
        content = fullText.substring(dateEndIdx).trim();
    }

    if (content.startsWith('PAGOxMOVIL')) {
        content = content.substring('PAGOxMOVIL'.length).trim();
    }

    return {
        id: generateId(),
        type,
        date: date || new Date().toISOString().split('T')[0],
        nameNumber,
        content
    };
}

function deduplicateRawSms(rawSms: RawSms[]): RawSms[] {
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
  // FIX-WALLET (2026-07-05): si no se puede determinar, usar 'DESCONOCIDO'
  // antes retornaba 'BANDEC' como default lo cual era incorrecto
  return 'DESCONOCIDO';
}

/**
 * FIX-WALLET (2026-07-05): extrae el número de tarjeta/cuenta del SMS.
 * Ej: "920406XXXXXX1162" → "****1162"
 */
export function extractCard(text: string): string | undefined {
  // Patrón: "cuenta 920406XXXXXX1162" o "cuenta 9204069997231162"
  const match = text.match(/cuenta\s+(\d{6}[Xx]*\d{4})/i);
  if (match) {
    const card = match[1];
    // Si tiene X, mostrar últimos 4
    if (card.includes('X') || card.includes('x')) {
      return `****${card.slice(-4)}`;
    }
    // Si son todos dígitos, mostrar últimos 4
    return `****${card.slice(-4)}`;
  }
  return undefined;
}

export function deriveTransactions(raw: RawSms[]): ConsolidatedTransaction[] {
  const consolidated: ConsolidatedTransaction[] = [];
  const seen = new Set<string>();

  raw.forEach(sms => {
    const bank = normalizeBank(sms.content);
    const card = extractCard(sms.content);

    if (sms.content.includes('Ultimas operaciones')) {
      // Split by newline or pipe, then look for date patterns to handle joined headers
      const lines = sms.content.split(/[|\n\r]+/);
      lines.forEach(line => {
        const subLines = line.split(/(?=\d{1,2}\/\d{1,2}\/\d{2,4};)/);
        subLines.forEach(sl => {
            if (sl.includes(';')) {
                const parts = sl.split(';');
                if (parts.length >= 6) {
                    const rawDate = parts[0].trim();
                    const dateMatch = rawDate.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
                    if (!dateMatch) return;

                    const date = dateMatch[0];
                    const service = parts[1].trim();
                    const operation = parts[2].trim().toUpperCase();
                    const amountStr = parts[3].replace(',', '.').trim();
                    const amount = parseAmount(amountStr);
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
                                card, // FIX-WALLET: incluir tarjeta
                                counterparty: service,
                                isStatement: true
                            });
                            seen.add(key);
                        }
                    }
                }
            }
        });
      });
    }

    const patterns = [
      {
        regex: /Transferencia fue completada.*?Monto:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: RegExpMatchArray) => ({ amount: parseAmount(m[1]), currency: m[2], transactionId: m[3], date: m[4], operation: 'DB' as const, service: 'Transferencia', counterparty: 'Enviada' })
      },
      {
        regex: /le ha realizado una transferencia.*?de\s+([\d,.]+)\s*(\w+).*?Nro\. Transaccion\s+([A-Z0-9]+).*?Fecha:\s*(\d+\/\d+\/\d+)/i,
        map: (m: RegExpMatchArray) => {
            const phoneMatch = sms.content.match(/telefono\s+(\d+)/i);
            return {
                amount: parseAmount(m[1]),
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
        regex: /Recarga se realizo con exito.*?Monto Pagado:\s*([\d,.]+)\s*(\w+).*?Id transaccion:\s+([A-Z0-9]+)/i,
        map: (m: RegExpMatchArray) => ({ amount: parseAmount(m[1]), currency: m[2], transactionId: m[3], date: sms.date, operation: 'DB' as const, service: 'Recarga', counterparty: 'ETECSA' })
      },
      {
        regex: /Pago de la factura.*?fue completado.*?Importe Pagado:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion:\s+([A-Z0-9]+)/i,
        map: (m: RegExpMatchArray) => ({ amount: parseAmount(m[1]), currency: m[2], transactionId: m[3], date: sms.date, operation: 'DB' as const, service: 'Pago', counterparty: 'Servicio' })
      },
      {
        regex: /pago del impuesto.*?completado.*?Importe Pagado:\s*([\d,.]+)\s*(\w+).*?Nro\. Transaccion Banco:\s+([A-Z0-9]+)/i,
        map: (m: RegExpMatchArray) => ({ amount: parseAmount(m[1]), currency: m[2], transactionId: m[3], date: sms.date, operation: 'DB' as const, service: 'Impuesto', counterparty: 'ONAT' })
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
            card, // FIX-WALLET: incluir tarjeta
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
      category = 'Servicios';
    } else if (serviceLow.includes('impuesto') || serviceLow.includes('sello')) {
      typeOperation = 'Impuesto';
      category = 'Impuestos';
    } else if (tx.isAdjustment) {
      typeOperation = 'Ajuste';
      category = 'Ajuste';
      note = 'Ajuste automático para integridad contable';
    }

    return {
      id: `an-${idx}-${tx.transactionId}`,
      date: tx.date,
      bank: tx.bank,
      card: tx.card, // FIX-WALLET: incluir tarjeta
      typeOperation,
      nature: tx.operation,
      amount: tx.amount,
      currency: tx.currency,
      counterparty: contraparte,
      category,
      transactionId: tx.transactionId,
      channel: 'Transfermovil',
      note,
      isStatement: tx.isStatement
    };
  });
}

export function calculateLedger(raw: RawSms[], consolidated: ConsolidatedTransaction[]): ConsolidatedTransaction[] {
  const ledger: ConsolidatedTransaction[] = [...consolidated];
  const banks = Array.from(new Set(ledger.map(t => t.bank)));

  // FIX-DECIMAL (2026-07-05): parseAmount robusto que maneja:
  // - "223,743.87" (coma miles, punto decimal) → 223743.87
  // - "223.743,87" (punto miles, coma decimal) → 223743.87
  // - "223743.87" (sin separador miles) → 223743.87
  // - "223743,87" (coma decimal) → 223743.87
  const parseAmount = (str: string | undefined): number => {
    if (!str) return 0;
    let s = str.trim();
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      // Ambos: el último es el decimal, el otro es miles
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // Coma decimal: "223.743,87" → quitar puntos, coma→punto
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Punto decimal: "223,743.87" → quitar comas
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      // Solo coma: es decimal
      s = s.replace(',', '.');
    }
    try {
      return new Decimal(s || '0').toNumber();
    } catch {
      return 0;
    }
  };

  banks.forEach(bank => {
    const bankTxs = ledger.filter(t => t.bank === bank).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const balances: { date: string, amount: number }[] = [];

    raw.forEach(sms => {
      if (normalizeBank(sms.content) === bank) {
        const match = sms.content.match(/(Saldo Disponible|Saldo restante|Saldo Restante):\s*(CR|DB)?\s*([\d,.]+)\s*(CUP|USD)?/i);
        if (match) {
          balances.push({
            date: formatDateFromSms(sms.date),
            amount: parseAmount(match[3])
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
        if (t.operation === 'CR') theoreticalBalance = new Decimal(theoreticalBalance).plus(t.amount).toNumber();
        else theoreticalBalance = new Decimal(theoreticalBalance).minus(t.amount).toNumber();
      });

      if (new Decimal(theoreticalBalance ?? 0).minus(currentBalanceReport.amount ?? 0).abs().gt(0.01)) {
        const diff = currentBalanceReport.amount - theoreticalBalance;
        ledger.push({
          date: currentBalanceReport.date,
          service: 'AJUSTE',
          operation: diff > 0 ? 'CR' : 'DB',
          amount: new Decimal(diff).abs().toNumber(),
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
  const banks: Record<string, BankSummary> = {};
  const categories: Record<string, number> = {};
  const monthly: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(tx => {
    if (tx.nature === 'CR') summary.total_income = new Decimal(summary.total_income).plus(tx.amount).toNumber();
    else summary.total_expenses = new Decimal(summary.total_expenses).plus(tx.amount).toNumber();

    if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0, current_balance: 0, transaction_count: 0 };
    if (tx.nature === 'CR') banks[tx.bank].income = new Decimal(banks[tx.bank].income).plus(tx.amount).toNumber();
    else banks[tx.bank].expenses = new Decimal(banks[tx.bank].expenses).plus(tx.amount).toNumber();
    banks[tx.bank].transaction_count++;

    // FIX-WALLET: guardar tarjeta si existe
    if (tx.card && !banks[tx.bank].card) banks[tx.bank].card = tx.card;

    const month = tx.date.substring(0, 7);
    if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
    if (tx.nature === 'CR') monthly[month].income = new Decimal(monthly[month].income).plus(tx.amount).toNumber();
    else monthly[month].expenses = new Decimal(monthly[month].expenses).plus(tx.amount).toNumber();

    categories[tx.category] = new Decimal(categories[tx.category] || 0).plus(tx.amount).toNumber();
  });

  summary.balance = new Decimal(summary.total_income).minus(summary.total_expenses).toNumber();

  // FIX-WALLET (2026-07-05): calcular saldo REAL por banco usando el último
  // saldo reportado en los SMS (no el teórico calculado)
  let totalRealBalance = 0;
  const bankNames = Object.keys(banks);
  for (const bankName of bankNames) {
    const bankSms = rawSms.filter(sms => normalizeBank(sms.content) === bankName);
    let lastBalanceDate = '';
    let lastBalanceAmount = 0;
    let hasBalance = false;

    for (const sms of bankSms) {
      const match = sms.content.match(/(?:Saldo Disponible|Saldo restante|Saldo Restante):\s*(CR|DB)?\s*([\d,.]+)\s*(CUP|USD)?/i);
      if (match) {
        const balDate = formatDateFromSms(sms.date);
        const balAmount = parseAmount(match[2]);
        if (!hasBalance || balDate >= lastBalanceDate) {
          lastBalanceDate = balDate;
          lastBalanceAmount = balAmount;
          hasBalance = true;
        }
      }
    }

    if (hasBalance) {
      banks[bankName].current_balance = lastBalanceAmount;
      banks[bankName].last_balance_date = lastBalanceDate;
      totalRealBalance = new Decimal(totalRealBalance).plus(lastBalanceAmount).toNumber();
    }
  }

  return {
    summary,
    banks,
    monthly,
    categories,
    transactions,
    rawSms,
    consolidated,
    total_real_balance: totalRealBalance,
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  dateStr = dateStr.trim();

  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    // FIX-WALLET (2026-07-05): si day o month es "00", usar "01"
    if (day === '00') day = '01';
    if (month === '00') month = '01';
    return `${year}-${month}-${day}`;
  }

  const partsHyphen = dateStr.split('-');
  if (partsHyphen.length === 3) {
      let day = partsHyphen[0].padStart(2, '0');
      let month = partsHyphen[1].padStart(2, '0');
      const year = partsHyphen[2].length === 2 ? '20' + partsHyphen[2] : partsHyphen[2];
      if (day === '00') day = '01';
      if (month === '00') month = '01';
      return `${year}-${month}-${day}`;
  }

  const months: Record<string, string> = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
  };
  const partsSpace = dateStr.toLowerCase().replace('.', '').split(/\s+/);
  if (partsSpace.length >= 3) {
    const day = partsSpace[0].padStart(2, '0');
    const monthStr = partsSpace[1];
    const month = months[monthStr] || '01';
    const year = partsSpace[2].length === 2 ? '20' + partsSpace[2] : partsSpace[2];
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

function formatDateFromSms(dateStr: string): string {
  return formatDate(dateStr);
}
