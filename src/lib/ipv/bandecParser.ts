import { v4 as uuidv4 } from 'uuid';
import { type BankTransaction } from '../dexie';
import { generateHash } from './engine';
import { extractCommission, standardizeDate } from './utils';
import { enrichTransactions } from './parser';

/**
 * Parses a BANDEC (Banco de Crédito y Comercio) TXT bank statement.
 * Optimized for variable spacing and different branch formats.
 */
export async function parseBandecTxt(text: string): Promise<BankTransaction[]> {
    const lines = text.split('\n');
    const transactions: BankTransaction[] = [];
    let currentDate = '';

    // Robust date detection: DD/MM/YY or DD/MM/YYYY, potentially with surrounding whitespace
    const dateHeaderRegex = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/;

    // Improved transaction line regex:
    // 1. Optional leading space
    // 2. Short ref (alphanumeric, at least 4 chars)
    // 3. Long ref (alphanumeric, at least 8 chars)
    // 4. Amount with potential dots/commas
    // 5. Type (Cr/Db)
    const txLineRegex = /^\s*([A-Z0-9]{4,})\s+([A-Z0-9]{8,})\s+([0-9.,]+)\s+(Cr|Db)/i;

    let currentTx: Partial<BankTransaction> | null = null;
    let observationsBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const dateMatch = line.match(dateHeaderRegex);
        if (dateMatch) {
            currentDate = standardizeDate(dateMatch[1]);
            continue;
        }

        const txMatch = line.match(txLineRegex);
        if (txMatch) {
            if (currentTx && currentTx.fecha && currentTx.referencia_origen) {
                transactions.push(await finalizeTx(currentTx as BankTransaction, observationsBuffer));
            }

            const refCorriente = txMatch[1];
            const refOriginal = txMatch[2];
            const rawAmount = txMatch[3];
            const cleanAmount = rawAmount.replace(/\./g, '').replace(',', '.');
            const amount = parseFloat(cleanAmount);
            const importeCents = Math.round(amount * 100);
            const tipo = (txMatch[4].charAt(0).toUpperCase() + txMatch[4].slice(1).toLowerCase()) as 'Cr' | 'Db';

            currentTx = {
                id: uuidv4(),
                fecha: currentDate,
                referencia_corta: refCorriente,
                referencia_origen: refOriginal,
                importe_cents: importeCents,
                tipo: tipo,
                estado_conciliacion: 'PENDIENTE',
                excluido: false,
                created_at: new Date().toISOString(),
            };
            observationsBuffer = [];
            continue;
        }

        if (currentTx && line.trim()) {
            const trimmedLine = line.trim();
            // Ignore separators and balance lines
            if (!trimmedLine.startsWith('---') &&
                !trimmedLine.startsWith('===') &&
                !/SALDO\s+INICIAL/i.test(trimmedLine) &&
                !/SALDO\s+FINAL/i.test(trimmedLine)) {
                observationsBuffer.push(trimmedLine);
            }
        }
    }

    if (currentTx && currentTx.fecha && currentTx.referencia_origen) {
        transactions.push(await finalizeTx(currentTx as BankTransaction, observationsBuffer));
    }

    return await enrichTransactions(transactions);
}

async function finalizeTx(tx: BankTransaction, buffer: string[]): Promise<BankTransaction> {
    const rawObs = buffer.join(' ');
    const cleanObs = rawObs
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    tx.observaciones = cleanObs;
    const commissionCents = extractCommission(cleanObs);
    tx.comision_cents = commissionCents;
    tx.importe_venta_cents = tx.importe_cents + commissionCents;
    tx.ingestion_hash = await generateHash(`${tx.referencia_origen}-${tx.fecha}-${tx.importe_cents}`);

    return tx;
}
