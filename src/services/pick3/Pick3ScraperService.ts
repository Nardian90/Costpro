import { Pick3Result, Pick3Source, Pick3SyncState } from '@/types/pick3';
import { logger } from '@/lib/logger';
import { Pick3Storage } from './storage';
import { MIAMI_PICK3_HISTORICAL } from "./seedData";

export class Pick3ScraperService {
  private static readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private static syncState: Pick3SyncState = {
    isSyncing: false,
    sources: [
      { id: 'official', name: 'Florida Lottery (Oficial)', url: 'https://floridalottery.com/games/draw-games/pick-3', status: 'pending', isOfficial: true },
      { id: 'lotteryusa', name: 'LotteryUSA', url: 'https://www.lotteryusa.com/florida/pick-3/', status: 'pending' },
      { id: 'lotterypost', name: 'Lottery Post', url: 'https://www.lotterypost.com/results/fl', status: 'pending' },
      { id: 'usatoday', name: 'USA Today', url: 'https://www.usatoday.com/lottery/results/florida/pick-3/', status: 'pending' }
    ]
  };

  static getSyncState(): Pick3SyncState {
    return { ...this.syncState };
  }

  static async scrapeLatestResults(): Promise<Pick3Result[]> {
    if (this.syncState.isSyncing) return [];

    this.syncState.isSyncing = true;
    try {
    this.syncState.lastGlobalSync = new Date().toISOString();

    // Reset statuses
    this.syncState.sources = this.syncState.sources.map(s => ({ ...s, status: 'pending', error: undefined }));

    let allResults: Pick3Result[] = [];

    for (const source of this.syncState.sources) {
      source.status = 'syncing';
      this.syncState.activeSourceId = source.id;

      logger.info('PICK3', `Attempting sync with source: ${source.name}`);

      try {
        let results: Pick3Result[] = [];

        if (source.id === 'official') {
          results = await this.scrapeOfficial();
        } else if (source.id === 'lotteryusa') {
          results = await this.scrapeLotteryUSA();
        } else if (source.id === 'lotterypost') {
          results = await this.scrapeLotteryPost();
        } else if (source.id === 'usatoday') {
          results = await this.scrapeUSAToday();
        }

        if (results.length > 0) {
          source.status = 'success';
          source.lastSync = new Date().toISOString();

          allResults = this.deduplicate([...allResults, ...results]);

          logger.info('PICK3', `Sync successful with ${source.name}. Found ${results.length} results.`);

          if (allResults.length >= 60) {
            break;
          }
        } else {
          throw new Error('No results found');
        }
      } catch (error: any) {
        source.status = 'error';
        source.error = error.message || 'Unknown error';
        logger.error('PICK3', `Failed sync with ${source.name}`, { error });
      }
    }

    if (allResults.length > 0) {
      try {
        await Pick3Storage.saveHistory(allResults);
      } catch (storageError: any) {
        logger.error('PICK3', 'Failed to save to Supabase, but keeping results', { error: storageError });
      }
    }

        } finally {
      this.syncState.isSyncing = false;
    this.syncState.activeSourceId = undefined;
    }

    if (allResults.length === 0) {
      logger.warn('PICK3', 'All sources failed, using local cache or seed data');
      const history = await Pick3Storage.getHistory();
      return history.length > 0 ? history : MIAMI_PICK3_HISTORICAL;
    }

    return allResults;
  }

  private static async scrapeOfficial(): Promise<Pick3Result[]> {
    try {
      const response = await fetch('https://floridalottery.com/content/flalottery-web/us/en/games/draw-games/pick-3.draw-games.json', {
        cache: 'no-store',
        headers: { 'User-Agent': this.USER_AGENT }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.draws)) {
          return data.draws.map((d: any) => ({
            date: this.normalizeDate(d.date),
            draw_time: d.time.toLowerCase().includes('midday') ? 'midday' : 'evening',
            result: d.numbers.split(',').map((n: string) => parseInt(n.trim())) as [number, number, number],
            source: 'official'
          }));
        }
      }

      const htmlResponse = await fetch('https://floridalottery.com/games/draw-games/pick-3', {
        headers: { 'User-Agent': this.USER_AGENT }
      });
      const html = await htmlResponse.text();
      return this.parseOfficial(html);
    } catch (e) {
      return [];
    }
  }

  private static parseOfficial(html: string): Pick3Result[] {
    const results: Pick3Result[] = [];
    const blockRegex = /<div class="winning-numbers-item"[^>]*>([\s\S]*?)<\/div>/g;
    const dateRegex = /<p class="draw-date"[^>]*>([^<]+)<\/p>/;
    const ballsRegex = /<span class="ball"[^>]*>(\d)<\/span>/g;
    const timeRegex = /<p class="draw-time"[^>]*>([^<]+)<\/p>/;

    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const content = match[1];
      const dateMatch = dateRegex.exec(content);
      if (!dateMatch) continue;

      const date = this.normalizeDate(dateMatch[1].trim());
      const timeMatch = timeRegex.exec(content);
      const draw_time = (timeMatch && timeMatch[1].toLowerCase().includes('midday')) ? 'midday' : 'evening';

      const balls: number[] = [];
      let bMatch;
      while ((bMatch = ballsRegex.exec(content)) !== null) {
        balls.push(parseInt(bMatch[1]));
      }

      if (balls.length >= 3) {
        results.push({
             date, draw_time, result: [balls[0], balls[1], balls[2]] as [number, number, number], source: 'official' });
      }
    }
    return results;
  }

  private static async scrapeLotteryUSA(): Promise<Pick3Result[]> {
    try {
      const [eveningResults, middayResults] = await Promise.all([
        this.fetchFromUrl('https://www.lotteryusa.com/florida/pick-3/', 'evening'),
        this.fetchFromUrl('https://www.lotteryusa.com/florida/midday-pick-3/', 'midday')
      ]);
      return [...eveningResults, ...middayResults];
    } catch {
      return [];
    }
  }

  private static async fetchFromUrl(url: string, drawTime: 'midday' | 'evening'): Promise<Pick3Result[]> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        }
      });
      if (!response.ok) return [];
      const html = await response.text();
      return this.parseLotteryUSA(html, drawTime);
    } catch {
      return [];
    }
  }

  private static parseLotteryUSA(html: string, drawTime: 'midday' | 'evening'): Pick3Result[] {
    const results: Pick3Result[] = [];
    const cardRegex = /<tr class="[^"]*c-draw-card[^"]*">([\s\S]*?)<\/tr>/g;
    const dateRegex = /<span class="c-draw-card__draw-date-sub">([^<]+)<\/span>/;
    const ballRegex = /<li class="c-ball[^>]*>(\d)<\/li>/g;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const content = match[1];
      const dateMatch = dateRegex.exec(content);
      if (!dateMatch) continue;

      const date = dateMatch[1].split('T')[0];
      const balls: number[] = [];
      let bMatch;
      while ((bMatch = ballRegex.exec(content)) !== null) {
        balls.push(parseInt(bMatch[1]));
      }

      if (balls.length >= 3) {
        results.push({
             date, draw_time: drawTime, result: [balls[0], balls[1], balls[2]] as [number, number, number], source: 'lotteryusa' });
      }
    }

    if (results.length === 0) {
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
      const tdDateRegex = /<td[^>]*class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/td>/;
      const tdBallsRegex = /<span class="[^"]*ball[^"]*"[^>]*>(\d)<\/span>/g;

      while ((match = trRegex.exec(html)) !== null) {
        const content = match[1];
        const dateMatch = tdDateRegex.exec(content);
        if (!dateMatch) continue;

        const dateText = dateMatch[1].replace(/<[^>]*>/g, '').trim();
        const date = this.normalizeDate(dateText);

        const balls: number[] = [];
        let bMatch;
        while ((bMatch = tdBallsRegex.exec(content)) !== null) {
          balls.push(parseInt(bMatch[1]));
        }

        if (balls.length >= 3) {
          results.push({
             date, draw_time: drawTime, result: [balls[0], balls[1], balls[2]] as [number, number, number], source: 'lotteryusa' });
        }
      }
    }

    return results;
  }

  private static async scrapeLotteryPost(): Promise<Pick3Result[]> {
    try {
      const response = await fetch('https://www.lotterypost.com/results/fl', {
        headers: { 'User-Agent': this.USER_AGENT }
      });
      if (!response.ok) return [];
      const html = await response.text();
      return this.parseLotteryPost(html);
    } catch {
      return [];
    }
  }

  private static parseLotteryPost(html: string): Pick3Result[] {
    const results: Pick3Result[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes('Pick 3')) {
        const dateMatch = /<time[^>]*datetime="([^"]+)"/.exec(content) || />([A-Z][a-z]+, [A-Z][a-z]+ \d+, \d{4})</.exec(content);
        const balls = content.match(/>(\d)</g)?.map(b => parseInt(b.replace(/[><]/g, ''))) || [];

        if (dateMatch && balls.length >= 3) {
           const date = dateMatch[1].includes('T') ? dateMatch[1].split('T')[0] : this.normalizeDate(dateMatch[1]);
           results.push({
             source: 'lotterypost',
             date,
             draw_time: content.toLowerCase().includes('midday') ? 'midday' : 'evening',
             result: [balls[0], balls[1], balls[2]] as [number, number, number]
           });
        }
      }
    }
    return results;
  }

  private static async scrapeUSAToday(): Promise<Pick3Result[]> {
    try {
      const response = await fetch('https://www.usatoday.com/lottery/results/florida/pick-3/', {
        headers: { 'User-Agent': this.USER_AGENT }
      });
      if (!response.ok) return [];
      const html = await response.text();
      return this.parseUSAToday(html);
    } catch {
      return [];
    }
  }

  private static parseUSAToday(html: string): Pick3Result[] {
    const results: Pick3Result[] = [];
    const blockRegex = /<div class="draw-result"[^>]*>([\s\S]*?)<\/div>/g;
    const dateRegex = /<span class="draw-date"[^>]*>([^<]+)<\/span>/;
    const ballRegex = /<span class="ball"[^>]*>(\d)<\/span>/g;

    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const content = match[1];
      const dateMatch = dateRegex.exec(content);
      if (!dateMatch) continue;

      const date = this.normalizeDate(dateMatch[1].trim());
      const balls: number[] = [];
      let bMatch;
      while ((bMatch = ballRegex.exec(content)) !== null) {
        balls.push(parseInt(bMatch[1]));
      }

      if (balls.length >= 3) {
        results.push({
             date, draw_time: 'evening', result: [balls[0], balls[1], balls[2]] as [number, number, number], source: 'usatoday' });
      }
    }
    return results;
  }

  private static deduplicate(results: Pick3Result[]): Pick3Result[] {
    const seen = new Set();
    const unique = results.filter(item => {
      const key = `${item.date}-${item.draw_time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.draw_time === 'evening' ? -1 : 1;
    });
    return unique;
  }

  private static normalizeDate(rawDate: string): string {
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) {
        const clean = rawDate.replace(/^[A-Za-z]+, /, '');
        const d2 = new Date(clean);
        if (isNaN(d2.getTime())) return rawDate;
        return d2.toISOString().split('T')[0];
      }
      return d.toISOString().split('T')[0];
    } catch {
      return rawDate;
    }
  }

  static async getCleanOfficialResults(): Promise<Pick3Result[]> {
    return this.scrapeLatestResults();
  }
}
