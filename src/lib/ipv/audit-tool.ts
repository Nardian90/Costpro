import { db, ReconciliationLine } from '../dexie';

export interface AuditReport {
    orphans: ReconciliationLine[];
    invalid_format: ReconciliationLine[];
    goals_as_residual: ReconciliationLine[];
    total_audited: number;
}

export class CashFillerAuditor {
    private readonly ORIGIN_WHITELIST = /^(TRX|BANK)-[A-Z0-9\-_]+$/;

    async runAudit(): Promise<AuditReport> {
        const lines = await db.reconciliation_lines
            .filter(l => l.origen_dato === 'CASH_FILLER')
            .toArray();

        const report: AuditReport = {
            orphans: [],
            invalid_format: [],
            goals_as_residual: [],
            total_audited: lines.length
        };

        for (const line of lines) {
            if (!line.parent_transaction_id) {
                const isGoal = line.transaction_ref.startsWith('GOAL-');
                const isCashFillerRef = line.transaction_ref.includes('_EFECTIVO');

                if (isGoal) {
                    // Goals are handled separately now
                } else if (!isCashFillerRef && !this.ORIGIN_WHITELIST.test(line.transaction_ref)) {
                     report.invalid_format.push(line);
                } else {
                     report.orphans.push(line);
                }
            } else {
                if (!this.ORIGIN_WHITELIST.test(line.parent_transaction_id)) {
                    report.invalid_format.push(line);
                }
            }

            if (line.transaction_ref.startsWith('GOAL-') && line.origen_dato === 'CASH_FILLER') {
                 report.goals_as_residual.push(line);
            }
        }

        return report;
    }

    async remediate(): Promise<{ fixed: number; marked: number }> {
        const lines = await db.reconciliation_lines
            .filter(l => l.origen_dato === 'CASH_FILLER' || l.transaction_ref.startsWith('GOAL-'))
            .toArray();

        let fixed = 0;
        let marked = 0;

        for (const line of lines) {
            let updated = false;
            const updates: Partial<ReconciliationLine> = {};

            if (line.transaction_ref.startsWith('GOAL-')) {
                updates.source_type = 'REAL_CASH_GOAL';
                updates.status = 'VALID';
                updated = true;
            } else {
                if (!line.parent_transaction_id) {
                    const parts = line.transaction_ref.split('_EFECTIVO');
                    const potentialParent = parts[0];
                    if (this.ORIGIN_WHITELIST.test(potentialParent)) {
                        updates.parent_transaction_id = potentialParent;
                        updates.source_type = 'BANK_TRANSFER';
                        updates.status = 'VALID';
                        updated = true;
                        fixed++;
                    } else {
                        updates.status = 'INVALID_ORPHAN';
                        updated = true;
                        marked++;
                    }
                }
            }

            if (updated) {
                await db.reconciliation_lines.update(line.id, updates);
            }
        }

        return { fixed, marked };
    }
}
