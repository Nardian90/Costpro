import crypto from 'crypto';
import { db, MatchingLog, MatchingTrace } from '@/lib/dexie';
import { PersistenceService } from '@/lib/persistenceService';

export class MatchingLogService {
  /**
   * Guardar resultado de matching en la BD
   */
  static async logMatchingResult(
    transactionRef: string,
    status: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE',
    trace: MatchingTrace[],
    appliedRules: string[],
    confidence: number,
    failReason?: string,
    linesCount?: number,
    durationMs?: number,
    activeRules?: string[]
  ): Promise<string> {
    const log: MatchingLog = {
      id: crypto.randomUUID(),
      transaction_ref: transactionRef,
      fecha_ejecucion: new Date().toISOString(),
      resultado_estado: status,
      trace,
      applied_rules: appliedRules,
      matching_confidence: confidence,
      fail_reason: failReason,
      reconciliation_lines_count: linesCount || 0,
      duration_ms: durationMs || 0,
      engine_version: '2.0', // Actualizar según versión
      reglas_activas: activeRules || [],
      created_at: new Date().toISOString()
    };

    await PersistenceService.writeSafe(db.matching_logs, log);
    return log.id;
  }

  /**
   * Obtener historial de matching para una transacción
   */
  static async getTransactionHistory(transactionRef: string): Promise<MatchingLog[]> {
    return PersistenceService.readSafe(() =>
        db.matching_logs
            .where('transaction_ref')
            .equals(transactionRef)
            .reverse()
            .sortBy('fecha_ejecucion')
    );
  }

  /**
   * Obtener logs por fecha y estado
   */
  static async getLogsByDateAndStatus(
    fecha: string,
    estado?: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE'
  ): Promise<MatchingLog[]> {
    return PersistenceService.readSafe(() => {
        let query = db.matching_logs.where('fecha_ejecucion').startsWith(fecha);
        if (estado) {
            query = query.filter(log => log.resultado_estado === estado);
        }
        return query.toArray();
    });
  }

  /**
   * Estadísticas de matching
   */
  static async getMatchingStats(fecha: string) {
    const logs = await this.getLogsByDateAndStatus(fecha);

    if (logs.length === 0) return {
      total: 0,
      completo: 0,
      parcial: 0,
      pendiente: 0,
      avgConfidence: 0,
      avgDuration: 0,
      rulesFrequency: {}
    };

    return {
      total: logs.length,
      completo: logs.filter(l => l.resultado_estado === 'COMPLETO').length,
      parcial: logs.filter(l => l.resultado_estado === 'PARCIAL').length,
      pendiente: logs.filter(l => l.resultado_estado === 'PENDIENTE').length,
      avgConfidence: logs.length > 0 ? logs.reduce((sum, l) => sum + (l.matching_confidence || 0), 0) / logs.length : 0,
      avgDuration: logs.length > 0 ? logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length : 0,
      rulesFrequency: this.calculateRuleFrequency(logs)
    };
  }

  private static calculateRuleFrequency(logs: MatchingLog[]) {
    const freq: Record<string, number> = {};
    logs.forEach(log => {
      log.applied_rules?.forEach(rule => {
        freq[rule] = (freq[rule] || 0) + 1;
      });
    });
    return freq;
  }
}
