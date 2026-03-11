import { WalletTransaction, WalletTransactionType, WalletAnalytics, WalletSummary, RawImportMessage } from './types';

const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

const PATTERNS = {
  BALANCE: /Saldo Disponible:\s*CR\s*([\d.]+)\s*CUP/,
  TRANSFER_OUT: /Beneficiario:\s*(\d+X*)\s+.*Monto:\s*([\d.]+)\s*CUP/,
  TRANSFER_IN: /telefono\s+(\d+)\s+le ha realizado.*?cuenta\s+(\d+)\s+de\s+([\d.]+)\s+CUP/,
  ELECTRICITY: /factura de electricidad.*?Consumo mensual:\s*(\d+)\s*KW.*?Periodo Pagado:\s*(\d{2}\/\d{4})/i,
  RECHARGE: /Telefono:\s*(\d+).*?Monto Pagado:\s*([\d.]+).*?Saldo acreditado:\s*(\d+)/i,
  FAILED: /Fallo(.*?)(?:\. Fecha:|$)/i,
  LIMIT_CHANGE: /ATM:\s*([\d.]+);\s*POS:\s*([\d.]+);\s*TOTAL:\s*([\d.]+)/i,
  CASH_ATM: /Retiro de efectivo completado.*?Cajero:\s*(.*?)\.\s*Monto:\s*([\d.]+)/i,
  CASH_EXTRA: /Retiro en Caja Extra completado.*?Negocio:\s*(.*?)\.\s*Monto:\s*([\d.]+)/i,
  MITURNO: /Turno solicitado con exito.*?Servicio:\s*(.*?)\.\s*Numero:\s*(\d+)/i,
  SECURITY: /(Autenticacion exitosa|Fallo de autenticacion)/i,
  DATE: /Fecha:\s*(\d+\/\d+\/\d+)/,
  TRANS_ID: /Nro\. Transaccion\s+([A-Z0-9]+)/,
  GENERIC_BALANCE: /Saldo Disponible:\s*CR\s*([\d.]+)/
};

export function parseRawMessages(text: string): RawImportMessage[] {
  if (!text) return [];

  const blocks = text.split(/(?=Recibido\s)/);
  const rawMessages: RawImportMessage[] = [];

  blocks.forEach(block => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 1) return;

    let type = "Recibido";

    // Improved sender detection: search for known senders in any line
    const knownSenders = ['PAGOxMOVIL', 'BANDEC', 'BPA', 'Metropolitano', 'Banco Popular de Ahorro'];
    let senderIndex = -1;
    let senderName = "Desconocido";

    for (let i = 0; i < lines.length; i++) {
        const found = knownSenders.find(s => lines[i].includes(s));
        if (found) {
            senderIndex = i;
            // Extract the sender name exactly as found in the line
            senderName = found;
            break;
        }
    }

    // If no known sender, look for generic nameNumber indicator or just use line 1/2
    if (senderIndex === -1) {
      senderIndex = lines.length > 2 ? 2 : (lines.length > 1 ? 1 : 0);
      senderName = lines[senderIndex] || "Desconocido";
    }

    // Date is everything from the start up to the sender line (excluding sender name if it's on the same line)
    // Actually, usually date is before the sender.
    const datePartLines = lines.slice(0, senderIndex);
    let dateStr = datePartLines.join(" ").replace(/^Recibido\s*/, "").trim();

    // If the sender line also contains "Recibido", it might be a malformed split
    if (lines[senderIndex].startsWith("Recibido")) {
        dateStr = lines[senderIndex].replace(/^Recibido\s*/, "").trim();
    }

    const remainingLines = lines.slice(senderIndex);
    // Remove the sender name from the first remaining line to get content
    let firstContentLine = remainingLines[0].replace(senderName, "").trim();
    // Clean up colon if it was "PAGOxMOVIL: content"
    if (firstContentLine.startsWith(":")) firstContentLine = firstContentLine.substring(1).trim();

    const contentLines = [firstContentLine, ...remainingLines.slice(1)].filter(l => l);

    // Check if it's a multi-line report (contains ;)
    const isTable = contentLines.some(l => l.includes(';'));

    if (isTable) {
      const tableHeaderIndex = contentLines.findIndex(l => l.includes('Fecha;') || l.includes('Servicio;') || l.includes('Operacion;'));
      const dataStart = tableHeaderIndex !== -1 ? tableHeaderIndex + 1 : 0;

      const dataLines = contentLines.slice(dataStart);

      dataLines.forEach(line => {
        const cleanLine = line.replace(/\|$/, '').trim();
        if (!cleanLine || !cleanLine.includes(';')) return;

        rawMessages.push({
          id: generateId(),
          type,
          date: dateStr || "Sin fecha",
          nameNumber: senderName,
          content: cleanLine
        });
      });
    } else {
      rawMessages.push({
        id: generateId(),
        type,
        date: dateStr || "Sin fecha",
        nameNumber: senderName,
        content: contentLines.join("\n")
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

    const baseTx = {
      id: generateId(),
      date,
      bank: 'BANDEC',
      transaction_id: transId,
      description: trimmed,
      source: 'SMS' as const,
      balance_after,
      currency: 'CUP'
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
        transactions.push({ ...baseTx, type: 'TRANSFER_IN', direction: 'IN', amount: parseFloat(match[3]), counterparty: match[1], status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'TRANSFER_OUT') {
      const match = trimmed.match(PATTERNS.TRANSFER_OUT);
      if (match) {
        transactions.push({ ...baseTx, type: 'TRANSFER_OUT', direction: 'OUT', amount: parseFloat(match[2]), counterparty: match[1], status: 'SUCCESS' });
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
        transactions.push({ ...baseTx, type: 'PHONE_RECHARGE', direction: 'OUT', amount: parseFloat(match[2]), counterparty: match[1], service_category: 'RECHARGE', status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'FAILED_OPERATION') {
      const match = trimmed.match(PATTERNS.FAILED);
      if (match) {
        transactions.push({ ...baseTx, type: 'FAILED_OPERATION', direction: 'OUT', amount: 0, counterparty: 'Operación Fallida', status: 'FAILED', extra_data: { reason: match[1].trim().replace(/^[^a-zA-Z0-9]+/, '').replace(/\.\s*$/, '') } });
        continue;
      }
    }

    if (type === 'LIMIT_CHANGE') {
      const match = trimmed.match(PATTERNS.LIMIT_CHANGE);
      if (match) {
        transactions.push({ ...baseTx, type: 'LIMIT_CHANGE', direction: 'OUT', amount: 0, counterparty: 'Cambio de Límite', extra_data: { atm: match[1], pos: match[2], total: match[3].replace(/\.\s*$/, '') } });
        continue;
      }
    }

    if (type === 'CASH_ATM') {
      const match = trimmed.match(PATTERNS.CASH_ATM);
      if (match) {
        transactions.push({ ...baseTx, type: 'CASH_ATM', direction: 'OUT', amount: parseFloat(match[2]), counterparty: 'ATM: ' + match[1], status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'CASH_EXTRA') {
      const match = trimmed.match(PATTERNS.CASH_EXTRA);
      if (match) {
        transactions.push({ ...baseTx, type: 'CASH_EXTRA', direction: 'OUT', amount: parseFloat(match[2]), counterparty: 'Caja Extra: ' + match[1], status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'MITURNO') {
      const match = trimmed.match(PATTERNS.MITURNO);
      if (match) {
        transactions.push({ ...baseTx, type: 'MITURNO', direction: 'IN', amount: 0, counterparty: 'MiTurno: ' + match[1], extra_data: { turn_number: match[2] }, status: 'SUCCESS' });
        continue;
      }
    }

    if (type === 'SECURITY_EVENT') {
      const match = trimmed.match(PATTERNS.SECURITY);
      if (match) {
        transactions.push({ ...baseTx, type: 'SECURITY_EVENT', direction: 'IN', amount: 0, counterparty: 'Evento de Seguridad', extra_data: { event: match[0] }, status: 'SUCCESS' });
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
            bank: 'BANDEC',
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
  if (low.includes('retiro de efectivo') && low.includes('cajero')) return 'CASH_ATM';
  if (low.includes('retiro en caja extra')) return 'CASH_EXTRA';
  if (low.includes('turno solicitado')) return 'MITURNO';
  if (low.includes('autenticacion') || low.includes('login')) return 'SECURITY_EVENT';
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
