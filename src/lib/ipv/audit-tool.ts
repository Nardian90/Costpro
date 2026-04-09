import { db, ReconciliationLine } from '../dexie';

export interface AuditReport {
    inconsistencies: ReconciliationLine[];
    legacy_cash_fillers: ReconciliationLine[];
    invalid_cash_products: ReconciliationLine[];
    total_audited: number;
}

export class CashFillerAuditor {
    async runAudit(): Promise<AuditReport> {
        const lines = await db.reconciliation_lines.toArray();

        const report: AuditReport = {
            inconsistencies: [],
            legacy_cash_fillers: [],
            invalid_cash_products: [],
            total_audited: lines.length
        };

        for (const line of lines) {
            // 1. Inconsistency Check: transfer + cash === total
            const totalCents = Math.round(line.total_amount_cents);
            const sumCents = Math.round(line.transfer_amount_cents + line.cash_amount_cents);

            if (totalCents !== sumCents) {
                report.inconsistencies.push(line);
            }

            // 2. Legacy Check: origen_dato = 'CASH_FILLER' (forbidden)
            if ((line as any).origen_dato === 'CASH_FILLER') {
                report.legacy_cash_fillers.push(line);
            }

            // 3. Invalid Product Check: product_cod = 'CASH' (forbidden)
            if (line.product_cod === 'CASH') {
                report.invalid_cash_products.push(line);
            }
        }

        return report;
    }

    async remediate(): Promise<{ fixed: number; removed: number }> {
        const report = await this.runAudit();
        let fixed = 0;
        let removed = 0;

        // Note: For a definitive structural correction, legacy/invalid lines should ideally be consolidated
        // but since the migration logic in dexie.ts handles that, the auditor's remediation
        // will focus on correcting minor inconsistencies in the new model.

        for (const line of report.inconsistencies) {
            // Fix minor rounding issues if they exist
            if (Math.abs(line.total_amount_cents - (line.transfer_amount_cents + line.cash_amount_cents)) < 2) {
                await db.reconciliation_lines.update(line.id, {
                    total_amount_cents: line.transfer_amount_cents + line.cash_amount_cents
                });
                fixed++;
            }
        }

        return { fixed, removed };
    }
}
