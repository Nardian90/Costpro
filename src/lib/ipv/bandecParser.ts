import { v4 as uuidv4 } from 'uuid';
import { type BankTransaction } from '../dexie';
import { generateHash } from './engine';
import { extractCommission, standardizeDate } from './utils';
import { enrichTransactions } from './parser';

/**
 * Parses a BANDEC (Banco de Crédito y Comercio) TXT bank statement.
 * This format is a mix of fixed-width columns and XML-like blocks.
 */
export async function parseBandecTxt(text: string): Promise<BankTransaction[]> {
    const lines = text.split('\n');
    const transactions: BankTransaction[] = [];
    let currentDate = '';

    const dateHeaderRegex = /^(\d{2}\/\d{2}\/\d{2})\s*$/;
    const txLineRegex = /^\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+([0-9,.]+)\s+(Cr|Db)/;

    let currentTx: Partial<BankTransaction> | null = null;
    let observationsBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

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

        if (currentTx && trimmedLine) {
            if (!trimmedLine.startsWith('---') && !trimmedLine.includes('SALDO INICIAL')) {
                observationsBuffer.push(trimmedLine);
            }
        }
    }

    if (currentTx && currentTx.fecha && currentTx.referencia_origen) {
        transactions.push(await finalizeTx(currentTx as BankTransaction, observationsBuffer));
    }

    // Enriquecer con la nueva lógica de identidad de clientes
    return await enrichTransactions(transactions);
}

async function finalizeTx(tx: BankTransaction, buffer: string[]): Promise<BankTransaction> {
    const rawObs = buffer.join(' ');
    const cleanObs = rawObs
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    tx.observaciones = cleanObs;

    const commission = extractCommission(cleanObs);
    tx.comision_cents = commission;
    tx.importe_venta_cents = tx.importe_cents + commission;

    tx.ingestion_hash = await generateHash(`${tx.referencia_origen}-${tx.fecha}-${tx.importe_cents}`);

    return tx;
}
