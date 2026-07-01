import { v4 as uuidv4 } from 'uuid';
import { type BankTransaction } from '../dexie';
import { generateHash } from '../utils';
import { extractCommission, standardizeDate } from './utils';
import { enrichTransactions } from './parser';

/**
 * Parses a BANDEC (Banco de Crédito y Comercio) TXT bank statement.
 * This format is a mix of fixed-width columns and XML-like blocks.
 */
export async function parseBandecTxt(text: string): Promise<{
    transactions: BankTransaction[],
    openingBalance?: number,
    closingBalance?: number,
    period?: string,
    accountNumber?: string
}> {
    const lines = text.split('\n');
    const transactions: BankTransaction[] = [];
    let currentDate = '';
    let openingBalance: number | undefined;
    let closingBalance: number | undefined;
    let period: string | undefined;
    let accountNumber: string | undefined;

    // Regex to match the date header: 16/03/26 or 16/03/2026
    const dateHeaderRegex = /^(\d{2}\/\d{2}\/\d{2,4})\s*$/;
    // Regex to match a transaction line.
    const txLineRegex = /^\s*([A-Z0-9]+)\s+([A-Z0-9]+)\s+([0-9,.]+)\s+(Cr|Db)/;

    // Regex for balances and period
    const openingBalanceRegex = /SALDO INICIAL:\s+([0-9,.]+)\s+(?:Cr|Db)/;
    const closingBalanceRegex = /SALDO FINAL:\s+([0-9,.]+)\s+(?:Cr|Db)/;
    const periodRegex = /DESDE:\s+(\d{2}\/\d{2}\/\d{4})\s+HASTA:\s+(\d{2}\/\d{2}\/\d{4})/;
    const accountRegex = /CUENTA:\s+(\d+)/;

    let currentTx: Partial<BankTransaction> | null = null;
    let observationsBuffer: string[] = [];

    const parseAmount = (raw: string): number => {
        const clean = raw.replace(/,/g, '');
        return parseFloat(clean);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        const periodMatch = line.match(periodRegex);
        if (periodMatch) {
            const hasta = periodMatch[2];
            const parts = hasta.split('/');
            period = `${parts[2]}-${parts[1]}`;
        }

        const accountMatch = line.match(accountRegex);
        if (accountMatch) {
            accountNumber = accountMatch[1];
        }

        const openMatch = line.match(openingBalanceRegex);
        if (openMatch) {
            openingBalance = parseAmount(openMatch[1]);
        }

        const closeMatch = line.match(closingBalanceRegex);
        if (closeMatch) {
            closingBalance = parseAmount(closeMatch[1]);
        }

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
            const amount = parseAmount(rawAmount);
            const importeCents = Math.round(amount * 100);
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

    const enriched = await enrichTransactions(transactions);

    return {
        transactions: enriched,
        openingBalance,
        closingBalance,
        period,
        accountNumber
    };
}

async function finalizeTx(tx: BankTransaction, buffer: string[]): Promise<BankTransaction> {
    const rawObs = buffer.join(' ');
    const cleanObs = rawObs.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    tx.observaciones = cleanObs;
    const commissionCents = extractCommission(cleanObs);
    tx.comision_cents = commissionCents;
    tx.importe_venta_cents = tx.importe_cents + commissionCents;
    tx.ingestion_hash = await generateHash(`${tx.referencia_origen}-${tx.fecha}-${tx.importe_cents}`);
    return tx;
}
