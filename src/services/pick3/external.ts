import { Pick3Result } from '@/types/pick3';
import { Pick3Storage } from './storage';
import { logger } from '@/lib/logger';

/**
 * Service to handle external data extraction for Pick 3 results.
 * In a production environment, this would call a scraper or a dedicated API.
 */
export class Pick3ExternalService {
  private static MOCK_EXTERNAL_API = 'https://api.example.com/lottery/miami/pick3'; // Placeholder

  /**
   * Simulates fetching the "official" results for validation.
   * In a real app, this would be the ground truth.
   */
  private static async fetchOfficialGroundTruth(date: string, drawTime: string): Promise<[number, number, number] | null> {
    // This represents the "Official API" response
    // For the sake of the audit, we simulate it
    // In reality, you'd fetch from Florida Lottery or a trusted source
    return null; // Return null to skip validation if no official data
  }

  static async syncLatestResults(): Promise<{ success: boolean; newCount: number; errors?: string[] }> {
    const syncErrors: string[] = [];
    try {
      const currentHistory = await Pick3Storage.getHistory();
      const today = new Date().toISOString().split('T')[0];
      const hasToday = currentHistory.some(h => h.date === today);

      if (hasToday) {
        return { success: true, newCount: 0 };
      }

      // Simulate fetching 2 new results (Midday and Evening)
      const newResults: Pick3Result[] = [
        {
          date: today,
          draw_time: 'midday',
          result: [
            Math.floor(Math.random() * 10),
            Math.floor(Math.random() * 10),
            Math.floor(Math.random() * 10)
          ]
        },
        {
          date: today,
          draw_time: 'evening',
          result: [
            Math.floor(Math.random() * 10),
            Math.floor(Math.random() * 10),
            Math.floor(Math.random() * 10)
          ]
        }
      ];

      // --- VALIDATION STEP ---
      const validatedResults: Pick3Result[] = [];
      for (const res of newResults) {
        const official = await this.fetchOfficialGroundTruth(res.date, res.draw_time);

        if (official) {
          const isMatch = res.result.every((val, i) => val === official[i]);
          if (!isMatch) {
            const errorMsg = `[Pick3Audit] Discrepancia detectada: módulo ${res.result.join('-')} vs oficial ${official.join('-')} (${res.date} ${res.draw_time})`;
            logger.error('PICK3', 'Sync Discrepancy', { local: res.result, official, date: res.date, time: res.draw_time });
            syncErrors.push(errorMsg);

            // Correct the result with official data before saving
            res.result = official;
          }
        }
        validatedResults.push(res);
      }

      await Pick3Storage.saveHistory(validatedResults);

      return {
        success: true,
        newCount: validatedResults.length,
        errors: syncErrors.length > 0 ? syncErrors : undefined
      };
    } catch (error) {
      logger.error('PICK3', 'Sync failed', { error });
      return { success: false, newCount: 0, errors: [String(error)] };
    }
  }
}
