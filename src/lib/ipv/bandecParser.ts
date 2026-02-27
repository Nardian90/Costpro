import { v4 as uuidv4 } from 'uuid';
import { type BankTransaction } from '../dexie';
import { generateHash } from './engine';
import { extractCommission, standardizeDate } from './utils';
import { parseObservations } from './parser';

/**
 * Parses a BANDEC (Banco de Crédito y Comercio) TXT bank statement.
 * This format is a mix of fixed-width columns and XML-like blocks.
 */
export async function parseBandecTxt(text: string): Promise<BankTransaction[]> {
    const lines = text.split('\n');
    const transactions: BankTransaction[] = [];
    let currentDate = '';

    // Regex for date header: DD/MM/YY
    const dateHeaderRegex = /^(\d{2}\/\d{2}\/\d{2})\s*$/;

    // Regex for transaction main line: RefCorriente  RefOriginal  Amount  Type
    // Example: "      YR60000008646   98025A6248224                                              1,330.00 Cr"
    const txLineRegex = /^\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+([0-9,.]+)\s+(Cr|Db)/;

    let currentTx: Partial<BankTransaction> | null = null;
    let observationsBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 1. Check for date header
        const dateMatch = line.match(dateHeaderRegex);
        if (dateMatch) {
            currentDate = standardizeDate(dateMatch[1]);
            continue;
        }

        // 2. Check for transaction start
        const txMatch = line.match(txLineRegex);
        if (txMatch) {
            // If there was a previous transaction, save it
            if (currentTx && currentTx.fecha && currentTx.referencia_origen) {
                transactions.push(await finalizeTx(currentTx as BankTransaction, observationsBuffer));
            }

            // Start new transaction
            const refCorriente = txMatch[1];
            const refOriginal = txMatch[2];
            const importeStr = txMatch[3].replace(/,/g, '');
            const importeCents = parseFloat(importeStr);
            const tipo = txMatch[4] as 'Cr' | 'Db';

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

        // 3. Collect observations / XML data
        if (currentTx && trimmedLine) {
            // Filter out purely decorative lines or headers
            if (!trimmedLine.startsWith('---') && !trimmedLine.includes('SALDO INICIAL')) {
                observationsBuffer.push(trimmedLine);
            }
        }
    }

    // Finalize last transaction
    if (currentTx && currentTx.fecha && currentTx.referencia_origen) {
        transactions.push(await finalizeTx(currentTx as BankTransaction, observationsBuffer));
    }

    return transactions;
}

async function finalizeTx(tx: BankTransaction, buffer: string[]): Promise<BankTransaction> {
    // Process observations buffer to make it cleaner
    const rawObs = buffer.join(' ');

    // Clean XML tags for better readability in the UI
    const cleanObs = rawObs
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    tx.observaciones = cleanObs;

    const parsed = parseObservations(rawObs); // Use raw for better extraction from XML if needed
    tx.comision_cents = parsed.commission || extractCommission(cleanObs);
    tx.importe_venta_cents = tx.importe_cents + tx.comision_cents;

    tx.payer_name = parsed.payer;
    tx.payer_ci = parsed.ci;
    tx.payer_phone = parsed.phone;

    tx.ingestion_hash = await generateHash(`${tx.referencia_origen}-${tx.fecha}-${tx.importe_cents}`);

    return tx;
}
