import { Pick3Result } from '@/types/pick3';
import { Pick3Storage } from './storage';
import { logger } from '@/lib/logger';
import { Pick3ExternalService } from './external';

export interface IntegrityError {
  timestamp: string;
  type: 'MISMATCH' | 'MISSING' | 'CORRUPT';
  official: number[] | null; // raw_value from SOT
  system: number[] | null;   // parsed_value in system
  date: string;
  drawTime: string;
  source: 'API' | 'DB' | 'UI';
  status: 'CRITICAL' | 'WARNING';
}

export class DataIntegrityService {
  /**
   * Generates a deterministic hash for a result to quickly identify changes.
   */
  static calculateHash(date: string, drawTime: string, result: number[]): string {
    return `${date}-${drawTime}-${result.join('')}`;
  }

  /**
   * Validates a batch of results against the official ground truth.
   * LEVEL 2: API vs DB
   */
  static async validateHistory(history: Pick3Result[]): Promise<IntegrityError[]> {
    const errors: IntegrityError[] = [];

    // For efficiency, we only validate the last 14 draws (approx 1 week)
    const recentHistory = history.slice(0, 14);

    for (const draw of recentHistory) {
      const official = await Pick3ExternalService.fetchOfficialResult(draw.date, draw.draw_time);

      if (official) {
        const isMatch = draw.result.every((val, i) => val === official[i]);
        if (!isMatch) {
          const error: IntegrityError = {
            timestamp: new Date().toISOString(),
            type: 'MISMATCH',
            official,
            system: draw.result,
            date: draw.date,
            drawTime: draw.draw_time,
            source: 'DB',
            status: 'CRITICAL'
          };
          errors.push(error);

          logger.error('PICK3', 'Data mismatch found in DB', {
            timestamp: error.timestamp,
            source: error.source,
            raw_value: error.official,
            parsed_value: error.system,
            status: error.status,
            date: draw.date,
            drawTime: draw.draw_time
          });
        }
      }
    }

    return errors;
  }

  /**
   * LEVEL 3: API vs Frontend State
   */
  static validateUIState(draw: Pick3Result, official: number[]): boolean {
    const isMatch = draw.result.every((val, i) => val === official[i]);
    if (!isMatch) {
      logger.error('PICK3', 'UI State mismatch', {
        timestamp: new Date().toISOString(),
        source: 'UI',
        raw_value: official,
        parsed_value: draw.result,
        status: 'CRITICAL'
      });
      return false;
    }
    return true;
  }

  /**
   * Performs a full audit and returns a report.
   */
  static async performFullAudit(): Promise<{
    status: 'CLEAN' | 'WARNING' | 'CRITICAL';
    errors: IntegrityError[];
    timestamp: string;
  }> {
    const history = await Pick3Storage.getHistory();
    const errors = await this.validateHistory(history);

    return {
      status: errors.length > 0 ? 'CRITICAL' : 'CLEAN',
      errors,
      timestamp: new Date().toISOString()
    };
  }
}
