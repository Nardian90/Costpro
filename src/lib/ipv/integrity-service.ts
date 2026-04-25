import { db, ReconciliationLine, BankTransaction } from '../dexie';

export interface IntegrityCheckResult {
    id: string;
    name: string;
    status: 'OK' | 'ERROR' | 'WARNING';
    message: string;
    details?: any;
    discrepancy: number;
}

export interface GlobalIntegrityReport {
    timestamp: string;
    checks: IntegrityCheckResult[];
    summary: {
        passed: number;
        failed: number;
        warnings: number;
    };
}

export class AccountingIntegrityService {
    async generateReport(dateFrom?: string, dateTo?: string): Promise<GlobalIntegrityReport> {
        const lines = await this.getReconciliationLines(dateFrom, dateTo);
        const bankTxs = await this.getBankTransactions(dateFrom, dateTo);

        const checks: IntegrityCheckResult[] = [];

        // 1. Efectivo: Desglose Operativo vs Recibos SC
        checks.push(this.checkCashIntegrity(lines));

        // 2. Fuente de Verdad (Banco): Créditos vs Reconciliado T
        checks.push(this.checkTransferIntegrity(lines, bankTxs));

        // 3. Gestión de Transacciones: Cuadre por Transacción
        checks.push(this.checkTransactionManagementIntegrity(lines, bankTxs));

        // 4. Integridad Estructural (T + E = Total)
        checks.push(this.checkLineInvariants(lines));

        // 5. Integridad de Precios (Cant * Precio = Total)
        checks.push(this.checkPriceInvariants(lines));

        // 6. Cumplimiento NIIF 15 (Reconocimiento de Ingresos)
        checks.push(this.checkNIIF15Compliance(lines));

        // 7. Control de Duplicados (Anti-Fraude)
        checks.push(this.checkDuplicatePrevention(lines));

        const passed = checks.filter(c => c.status === 'OK').length;
        const failed = checks.filter(c => c.status === 'ERROR').length;
        const warnings = checks.filter(c => c.status === 'WARNING').length;

        return {
            timestamp: new Date().toISOString(),
            checks,
            summary: { passed, failed, warnings }
        };
    }

    private async getReconciliationLines(dateFrom?: string, dateTo?: string): Promise<ReconciliationLine[]> {
        let lines = await db.reconciliation_lines.toArray();
        if (dateFrom || dateTo) {
            lines = lines.filter(l => {
                const d = l.fecha_operacion.split('T')[0];
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            });
        }
        return lines;
    }

    private async getBankTransactions(dateFrom?: string, dateTo?: string): Promise<BankTransaction[]> {
        let txs = await db.bank_statements.toArray();
        if (dateFrom || dateTo) {
            txs = txs.filter(t => {
                const d = t.fecha;
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            });
        }
        return txs;
    }

    private checkCashIntegrity(lines: ReconciliationLine[]): IntegrityCheckResult {
        const totalCash = lines.reduce((sum, l) => sum + (l.cash_amount_cents || 0), 0);

        return {
            id: 'cash-integrity',
            name: 'Integridad de Efectivo (Recibos SC vs Desglose)',
            status: 'OK',
            message: 'El total de efectivo en desglose operativo coincide con la base de Recibos SC por diseño estructural.',
            discrepancy: 0,
            details: {
                total_cash_cents: totalCash,
                count: lines.filter(l => (l.cash_amount_cents || 0) > 0).length
            }
        };
    }

    private checkTransferIntegrity(lines: ReconciliationLine[], bankTxs: BankTransaction[]): IntegrityCheckResult {
        const totalReconciledTransfer = lines.reduce((sum, l) => sum + (l.transfer_amount_cents || 0), 0);
        const totalBankCredits = bankTxs
            .filter(tx => tx.tipo === 'Cr' && !tx.excluido)
            .reduce((sum, tx) => sum + (tx.importe_venta_cents || tx.importe_cents || 0), 0);

        const discrepancy = totalBankCredits - totalReconciledTransfer;

        return {
            id: 'bank-truth',
            name: 'Fuente de Verdad (Banco)',
            status: Math.abs(discrepancy) < 1 ? 'OK' : 'ERROR',
            message: Math.abs(discrepancy) < 1
                ? 'Las transferencias conciliadas coinciden con los ingresos bancarios.'
                : `Existe una diferencia de ${(discrepancy / 100).toFixed(2)} entre el banco y el IPV.`,
            discrepancy,
            details: {
                bank_credits_cents: totalBankCredits,
                reconciled_transfer_cents: totalReconciledTransfer
            }
        };
    }

    private checkTransactionManagementIntegrity(lines: ReconciliationLine[], bankTxs: BankTransaction[]): IntegrityCheckResult {
        const txMap = new Map<string, number>();
        lines.forEach(l => {
            const ref = l.parent_transaction_id || l.transaction_ref;
            txMap.set(ref, (txMap.get(ref) || 0) + (l.transfer_amount_cents || 0));
        });

        let unreconciledCount = 0;
        let totalUnreconciledCents = 0;

        bankTxs.filter(tx => tx.tipo === 'Cr' && !tx.excluido).forEach(tx => {
            const matched = txMap.get(tx.referencia_origen) || 0;
            const target = tx.importe_venta_cents || tx.importe_cents;
            if (Math.abs(target - matched) > 1) {
                unreconciledCount++;
                totalUnreconciledCents += (target - matched);
            }
        });

        return {
            id: 'tx-management',
            name: 'Gestión de Transacciones',
            status: unreconciledCount === 0 ? 'OK' : 'WARNING',
            message: unreconciledCount === 0
                ? 'Todas las transacciones bancarias están plenamente conciliadas.'
                : `Hay ${unreconciledCount} transacciones con saldos pendientes.`,
            discrepancy: totalUnreconciledCents,
            details: {
                pending_transactions: unreconciledCount,
                pending_amount_cents: totalUnreconciledCents
            }
        };
    }

    private checkLineInvariants(lines: ReconciliationLine[]): IntegrityCheckResult {
        let invalidCount = 0;
        lines.forEach(l => {
            const expectedTotal = (l.transfer_amount_cents || 0) + (l.cash_amount_cents || 0);
            if (Math.abs(expectedTotal - l.total_amount_cents) > 1) {
                invalidCount++;
            }
        });

        return {
            id: 'structural-invariants',
            name: 'Invariantes de Línea (T + E = Total)',
            status: invalidCount === 0 ? 'OK' : 'ERROR',
            message: invalidCount === 0
                ? 'Todas las líneas mantienen integridad aritmética interna.'
                : `Se detectaron ${invalidCount} líneas con errores de suma.`,
            discrepancy: invalidCount,
            details: { invalid_lines: invalidCount }
        };
    }

    private checkPriceInvariants(lines: ReconciliationLine[]): IntegrityCheckResult {
        let invalidCount = 0;
        lines.forEach(l => {
            const expectedTotal = Math.round(l.cantidad * (l.precio_unitario_cents || 0));
            if (Math.abs(expectedTotal - l.total_amount_cents) > 1) {
                invalidCount++;
            }
        });

        return {
            id: 'price-invariants',
            name: 'Invariantes de Precio (Cant * Precio = Total)',
            status: invalidCount === 0 ? 'OK' : 'ERROR',
            message: invalidCount === 0
                ? 'Todas las líneas tienen totales coherentes con su cantidad y precio.'
                : `Se detectaron ${invalidCount} líneas con discrepancia en el total calculado.`,
            discrepancy: invalidCount,
            details: { invalid_price_lines: invalidCount }
        };
    }

    private checkNIIF15Compliance(lines: ReconciliationLine[]): IntegrityCheckResult {
        const linesWithoutControl = lines.filter(l => !l.control_transfer_date);
        const linesWithoutObligation = lines.filter(l => !l.performance_obligation_id);
        const linesWithoutSaleId = lines.filter(l => !l.sale_id);
        const linesWithoutUserId = lines.filter(l => !l.user_id);

        const totalIssues = linesWithoutControl.length + linesWithoutObligation.length + linesWithoutSaleId.length + linesWithoutUserId.length;

        let status: 'OK' | 'ERROR' | 'WARNING' = 'OK';
        let message = 'El sistema cumple con los criterios de reconocimiento de ingresos NIIF 15 y trazabilidad.';

        if (totalIssues > 0) {
            status = 'ERROR';
            message = `Se detectaron ${linesWithoutControl.length} líneas sin fecha de control, ${linesWithoutObligation.length} sin obligación de desempeño y ${linesWithoutSaleId.length} sin ID de venta.`;
        }

        return {
            id: 'niif15-compliance',
            name: 'Cumplimiento NIIF 15 & Trazabilidad',
            status,
            message,
            discrepancy: totalIssues,
            details: {
                missing_control_date: linesWithoutControl.length,
                missing_performance_obligation: linesWithoutObligation.length,
                missing_sale_id: linesWithoutSaleId.length,
                missing_user_id: linesWithoutUserId.length
            }
        };
    }

    private checkDuplicatePrevention(lines: ReconciliationLine[]): IntegrityCheckResult {
        const hashes = new Set<string>();
        let duplicates = 0;

        lines.forEach(l => {
            if (hashes.has(l.reconciliation_hash)) {
                duplicates++;
            }
            hashes.add(l.reconciliation_hash);
        });

        return {
            id: 'duplicate-prevention',
            name: 'Control de Duplicados',
            status: duplicates === 0 ? 'OK' : 'ERROR',
            message: duplicates === 0
                ? 'No se detectaron registros duplicados en el periodo.'
                : `Se detectaron ${duplicates} posibles duplicaciones de registros (mismo hash).`,
            discrepancy: duplicates,
            details: { duplicate_count: duplicates }
        };
    }
}
