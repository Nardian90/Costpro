import { WalletTransaction, WalletTransactionType, RawImportMessage, WalletAnalytics, WalletSummary } from './types';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const PATTERNS = {
  DATE: /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  TRANS_ID: /No\.\s*Transaccion:\s*([A-Z0-9]+)/i,
  BALANCE: /Saldo(?: [Dd]isponible)?:?\s*[A-Z]+\s*([\d.]+)/i,
  TRANSFER_IN: /le ha realizado una transferencia por\s*([\d.]+)\s*CUP.*desde la cuenta\s*([\d*]+)/i,
  TRANSFER_OUT: /transferencia fue completada.*monto:\s*([\d.]+)\s*CUP/i,
  ELECTRICITY: /factura de electricidad.*consumo(?: mensual)?:\s*(\d+)\s*kW.*periodo(?: [Pp]agado)?:\s*([^. ]+)/i,
  RECHARGE: /Recarga de saldo.*monto:\s*([\d.]+)\s*CUP/i,
  FAILED: /Fallo(?:\s+(?:la\s+operacion|la\s+transferencia))?[:.\s]+([^.]+)/i,
  LIMIT_CHANGE: /Cambio de limite.*ATM:\s*([\d,.]+?)(?:;|\.|$)\s*POS:\s*([\d,.]+?)(?:;|\.|$)\s*TOTAL:\s*([\d,.]+?)(?:;|\.|$)/i,
  CASH_ATM: /Retiro de efectivo.*cajero:?\s*([^.]+)\.?\s*monto:\s*([\d.]+)\s*CUP/i,
  CASH_EXTRA: /Retiro en [Cc]aja [Ee]xtra.*(?:negocio:?|Id Negocio:?)\s*([^.]+)\.?\s*monto:\s*([\d.]+)\s*CUP/i,
  MITURNO: /Turno solicitado.*(?:servicio:?|Id:?)\s*([^.]+)\.?\s*(?:numero:?|Id:?)\s*(\d+)/i,
  SECURITY: /((?:Evento de seguridad:?|Autenticacion)\s+[^.]+)/i,
  GENERIC_BALANCE: /Saldo(?: [Dd]isponible)?:?\s*[A-Z]+\s*([\d.]+)/i
};

function detectBank(content: string): string {
  const low = content.toLowerCase();
  if (low.includes('banco popular de ahorro') || low.includes(' bpa ') || low.includes('bpa:')) return 'BPA';
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('metropolitano')) return 'METRO';
  return 'OTROS';
}

export function extractRawMessages(text: string): RawImportMessage[] {
  if (!text) return [];

  const rawMessages: RawImportMessage[] = [];
  const entries = text.split(/(?=Recibido\s+\d)/g).filter(e => e.trim());

  entries.forEach(entry => {
    const lines = entry.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 1) return;

    const type = lines[0].startsWith('Recibido') ? 'RECIBIDO' : 'OTRO';

    let senderIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if (/^\d{4}$/.test(l)) continue;
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/i.test(l)) continue;
        if (/^[ap]\.?\s*m\.?$/i.test(l)) continue;
        if (/^(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?$/i.test(l)) continue;
        if (/^\d+$/.test(l)) continue;

        senderIndex = i;
        break;
    }

    if (senderIndex === -1) senderIndex = 1;

    const datePartLines = lines.slice(0, senderIndex);
    const dateStr = datePartLines.join(" ").replace(/^Recibido\s*/, "").trim();

    const contentLines = lines.slice(senderIndex);
    const senderLine = contentLines[0] || "DESCONOCIDO";
    const senderName = senderLine.split(' ')[0].replace(':', '');

    const isTable = contentLines.some(l => l.includes(';'));

    if (isTable) {
      const tableHeaderIndex = contentLines.findIndex(l => l.includes('Fecha;') || l.includes('Servicio;') || l.includes('Operacion;'));
      const reportHeader = contentLines.slice(0, tableHeaderIndex !== -1 ? tableHeaderIndex : 0).join("\n");
      const columnHeader = tableHeaderIndex !== -1 ? contentLines[tableHeaderIndex] : "";
      const dataStart = tableHeaderIndex !== -1 ? tableHeaderIndex + 1 : 0;
      const dataLines = contentLines.slice(dataStart);

      dataLines.forEach(line => {
        const cleanLine = line.replace(/\|$/, '').trim();
        if (!cleanLine || !cleanLine.includes(';')) return;
        const fullContent = [reportHeader, columnHeader, cleanLine].filter(l => l).join("\n");
        rawMessages.push({
          id: generateId(),
          type,
          date: dateStr || "Sin fecha",
          nameNumber: senderName,
          content: fullContent,
          bank: detectBank(fullContent)
        });
      });
    } else {
      const fullContent = contentLines.join("\n");
      rawMessages.push({
        id: generateId(),
        type,
        date: dateStr || "Sin fecha",
        nameNumber: senderName,
        content: fullContent,
        bank: detectBank(fullContent)
      });
    }
  });

  return rawMessages;
}

export function parseSmsText(text: string): WalletTransaction[] {
  if (!text) return [];
  const lines = text.split('\n');
  const transactions: WalletTransaction[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const type = classify(trimmed);
    const dateMatch = trimmed.match(PATTERNS.DATE);
    const dateStr = dateMatch ? dateMatch[1] : "";
    const date = formatDate(dateStr) || new Date().toISOString().split('T')[0];
    const transIdMatch = trimmed.match(PATTERNS.TRANS_ID);
    const transId = transIdMatch ? transIdMatch[1] : generateId();
    const genBalanceMatch = trimmed.match(PATTERNS.GENERIC_BALANCE);
    const balance_after = genBalanceMatch ? parseFloat(genBalanceMatch[1]) : undefined;

    const bank = detectBank(trimmed);

    const baseTx: WalletTransaction = {
      id: generateId(),
      date,
      bank: bank === 'OTROS' ? 'BANDEC' : bank,
      transaction_id: transId,
      description: trimmed,
      source: 'SMS' as const,
      balance_after,
      currency: 'CUP',
      type: 'OTHER',
      direction: 'OUT',
      counterparty: 'Desconocido',
      amount: 0
    };

    if (type === 'BALANCE_QUERY') {
      const match = trimmed.match(PATTERNS.BALANCE);
      if (match) {
        transactions.push({ ...baseTx, type: 'BALANCE_QUERY', direction: 'IN', amount: 0, counterparty: 'Consulta de Saldo', status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'TRANSFER_IN') {
      const match = trimmed.match(PATTERNS.TRANSFER_IN);
      if (match) {
        transactions.push({ ...baseTx, type: 'TRANSFER_IN', direction: 'IN', amount: parseFloat(match[1]), counterparty: match[2], status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'TRANSFER_OUT') {
      const match = trimmed.match(PATTERNS.TRANSFER_OUT);
      if (match) {
        transactions.push({ ...baseTx, type: 'TRANSFER_OUT', direction: 'OUT', amount: parseFloat(match[1]), counterparty: 'Transferencia Enviada', status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'PAYMENT_SERVICE') {
      const elecMatch = trimmed.match(PATTERNS.ELECTRICITY);
      if (elecMatch) {
        transactions.push({ ...baseTx, type: 'PAYMENT_SERVICE', direction: 'OUT', amount: 0, counterparty: 'UNE (Electricidad)', service_category: 'ELECTRICITY', extra_data: { consumption_kwh: parseInt(elecMatch[1]), period: elecMatch[2] }, status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'PHONE_RECHARGE') {
      const match = trimmed.match(PATTERNS.RECHARGE);
      if (match) {
        transactions.push({ ...baseTx, type: 'PHONE_RECHARGE', direction: 'OUT', amount: parseFloat(match[1]), counterparty: 'Recarga ETECSA', service_category: 'RECHARGE', status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'FAILED_OPERATION') {
      const match = trimmed.match(PATTERNS.FAILED);
      if (match) {
        transactions.push({ ...baseTx, type: 'FAILED_OPERATION', direction: 'OUT', amount: 0, counterparty: 'Operación Fallida', status: 'FAILED', extra_data: { reason: match[1].trim() } });
        continue;
      }
    }

    if (type === 'LIMIT_CHANGE') {
      const match = trimmed.match(PATTERNS.LIMIT_CHANGE);
      if (match) {
        transactions.push({ ...baseTx, type: 'LIMIT_CHANGE', direction: 'OUT', amount: 0, counterparty: 'Cambio de Límite', extra_data: { atm: match[1], pos: match[2], total: match[3] } });
        continue;
      }
    }

    if (type === 'CASH_ATM') {
      const match = trimmed.match(PATTERNS.CASH_ATM);
      if (match) {
        transactions.push({ ...baseTx, type: 'CASH_ATM', direction: 'OUT', amount: parseFloat(match[2]), counterparty: 'ATM: ' + match[1].trim(), status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'CASH_EXTRA') {
      const match = trimmed.match(PATTERNS.CASH_EXTRA);
      if (match) {
        transactions.push({ ...baseTx, type: 'CASH_EXTRA', direction: 'OUT', amount: parseFloat(match[2]), counterparty: 'Caja Extra: ' + match[1].trim(), status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'MITURNO') {
      const match = trimmed.match(PATTERNS.MITURNO);
      if (match) {
        transactions.push({ ...baseTx, type: 'MITURNO', direction: 'IN', amount: 0, counterparty: 'MiTurno: ' + match[1].trim(), extra_data: { turn_number: match[2] }, status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'SECURITY_EVENT') {
      const match = trimmed.match(PATTERNS.SECURITY);
      if (match) {
        transactions.push({ ...baseTx, type: 'SECURITY_EVENT', direction: 'IN', amount: 0, counterparty: 'Evento de Seguridad', extra_data: { event: match[1].trim() }, status: 'SUCCESS' });
        continue;
      }
    }

    if (trimmed.includes(';')) {
      const parts = trimmed.split(';');
      if (parts.length >= 5) {
        const amount = parseFloat(parts[3]);
        if (!isNaN(amount)) {
          transactions.push({
            id: generateId(),
            date: formatDate(parts[0]) || new Date().toISOString().split('T')[0],
            bank: detectBank(trimmed) || 'BANDEC',
            type: parts[2] === 'Cr' ? 'TRANSFER_IN' : 'TRANSFER_OUT',
            direction: parts[2] === 'Cr' ? 'IN' : 'OUT',
            amount,
            currency: parts[4] || 'CUP',
            counterparty: parts[1] || 'Bank Statement',
            transaction_id: parts[5] || generateId(),
            description: trimmed,
            source: 'BANK_LOG' as const
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
  if (low.includes('retiro de efectivo')) return 'CASH_ATM';
  if (low.includes('retiro en caja extra')) return 'CASH_EXTRA';
  if (low.includes('turno solicitado')) return 'MITURNO';
  if (low.includes('autenticacion') || low.includes('login') || low.includes('evento de seguridad')) return 'SECURITY_EVENT';
  return 'OTHER';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
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
  const banks: Record<string, { income: number; expenses: number; current_balance: number }> = {};
  const categories: Record<string, number> = {};
  const monthly: Record<string, { income: number; expenses: number }> = {};

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sorted.forEach(tx => {
    if (tx.direction === 'IN') summary.total_income += tx.amount;
    else summary.total_expenses += tx.amount;

    if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0, current_balance: 0 };
    if (tx.direction === 'IN') banks[tx.bank].income += tx.amount;
    else banks[tx.bank].expenses += tx.amount;

    if (tx.balance_after !== undefined) {
      banks[tx.bank].current_balance = tx.balance_after;
    }

    const month = tx.date.substring(0, 7);
    if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
    if (tx.direction === 'IN') monthly[month].income += tx.amount;
    else monthly[month].expenses += tx.amount;

    const category = tx.service_category || tx.type;
    categories[category] = (categories[category] || 0) + tx.amount;
  });

  summary.balance = summary.total_income - summary.total_expenses;
  return { summary, banks, monthly, categories, transactions: sorted };
}
