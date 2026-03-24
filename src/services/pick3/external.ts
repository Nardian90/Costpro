import { Pick3Result, DrawTime } from '@/types/pick3';
import { Pick3Storage } from './storage';
import { logger } from '@/lib/logger';

/**
 * Service to handle external data extraction for Pick 3 results.
 * For Enterprise, this is the "Source of Truth" (SOT).
 */
export class Pick3ExternalService {
  /**
   * Fetches the "official" ground truth from the primary SOT.
   * In a production environment, this would call a real-world lottery API or a scraper.
   * Currently, we implement a mock logic that mimics the SOT behavior.
   */
  static async fetchOfficialResult(date: string, drawTime: DrawTime): Promise<number[] | null> {
    try {
      // Mocked simulation of official results
      const deterministicRes = (date: string, time: string) => {
        const seed = parseInt(date.replace(/-/g, '')) + (time === 'evening' ? 77 : 33);
        const r1 = seed % 10;
        const r2 = (seed * 7) % 10;
        const r3 = (seed * 13) % 10;
        return [r1, r2, r3];
      };

      return deterministicRes(date, drawTime);
    } catch (error) {
      logger.error('PICK3', 'Fetch failed', { date, drawTime, error });
      return null;
    }
  }

  static async syncLatestResults(): Promise<{ success: boolean; newCount: number; errors?: string[] }> {
    const syncErrors: string[] = [];
    try {
      const currentHistory = await Pick3Storage.getHistory();
      const today = new Date().toISOString().split('T')[0];

      const times: DrawTime[] = ['midday', 'evening'];
      const missingDraws: { date: string, time: DrawTime }[] = [];

      for (let i = 0; i < 2; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];

        for (const time of times) {
           const exists = currentHistory.some(h => h.date === dStr && h.draw_time === time);
           if (!exists) {
              missingDraws.push({ date: dStr, time });
           }
        }
      }

      const validatedResults: Pick3Result[] = [];
      for (const missing of missingDraws) {
        const official = await this.fetchOfficialResult(missing.date, missing.time);

        if (official) {
          validatedResults.push({
            date: missing.date,
            draw_time: missing.time,
            result: official as [number, number, number]
          });
        }
      }

      if (validatedResults.length > 0) {
        await Pick3Storage.saveHistory(validatedResults);
      }

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
