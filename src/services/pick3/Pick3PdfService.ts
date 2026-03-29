import { Pick3Result } from '@/types/pick3';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabaseClient';
// @ts-ignore
import pdf from 'pdf-parse';

export class Pick3PdfService {
  private static readonly PDF_URL = 'https://files.floridalottery.com/exptkt/p3.pdf';

  static async syncFromPdf(forceFull = false): Promise<Pick3Result[]> {
    try {
      logger.info('PICK3', 'Starting PDF sync process...');

      const pdfBuffer = await this.downloadPdf();

      const results = await this.parsePdf(pdfBuffer, forceFull);

      if (results.length === 0) {
        throw new Error('No se pudieron extraer resultados del PDF');
      }

      logger.info('PICK3', `Extracted ${results.length} results from PDF.`);

      await this.saveWithConflictResolution(results);

      return results.map(r => ({
          date: r.date,
          draw_time: r.draw_time as any,
          result: r.result as [number, number, number],
          source: r.source
      }));
    } catch (error: any) {
      logger.error('PICK3', 'Failed sync from PDF', { error: error.message });
      throw error;
    }
  }

  private static async downloadPdf(): Promise<Buffer> {
    logger.info('PICK3', `Downloading PDF from ${this.PDF_URL}`);
    const response = await fetch(this.PDF_URL);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public static async parsePdf(buffer: Buffer, forceFull = false): Promise<any[]> {
    const uint8Array = new Uint8Array(buffer);
    const parser = new pdf.PDFParse(uint8Array);
    await parser.load();
    const data = await parser.getText();

    let allResults: any[] = [];

    if (data && data.pages) {
      // If forceFull is false, only process the first 3 pages to be safe with Vercel timeouts.
      // Page 1 contains ~160 draws (approx 80 days).
      const pagesToProcess = forceFull ? data.pages : data.pages.slice(0, 3);

      for (const page of pagesToProcess) {
        const pageResults = this.parsePageText(page.text);
        allResults = [...allResults, ...pageResults];
      }
    }

    return allResults;
  }

  private static parsePageText(text: string): any[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const dates = lines.filter(l => /^\d{2}\/\d{2}\/\d{2}$/.test(l));
    const times = lines.filter(l => l === 'M' || l === 'E');
    const fbMarkers = lines.filter(l => l === 'FB');
    const digits = lines.filter(l => /^\d$/.test(l));

    const count = dates.length;
    if (count === 0 || times.length !== count || fbMarkers.length !== count || digits.length < count * 4) {
      return [];
    }

    const results: any[] = [];

    for (let i = 0; i < count; i++) {
      const dateRaw = dates[i];
      const timeRaw = times[i];
      const dateParts = dateRaw.split('/');
      const year = parseInt(dateParts[2]);
      // Normalize year: 00-49 -> 2000-2049, 50-99 -> 1950-1999
      const fullYear = year < 50 ? 2000 + year : 1900 + year;
      const date = `${fullYear}-${dateParts[0]}-${dateParts[1]}`;

      const draw_time = timeRaw === 'M' ? 'midday' : 'evening';

      const d1 = parseInt(digits[i]);
      const d2 = parseInt(digits[count + i]);
      const d3 = parseInt(digits[count * 2 + i]);
      const fb = parseInt(digits[count * 3 + i]);

      results.push({
        date,
        draw_time,
        result: [d1, d2, d3],
        fireball: fb,
        source: 'pdf',
        sync_method: 'pdf',
        raw_text: `${dateRaw} ${timeRaw} ${d1}-${d2}-${d3} FB ${fb}`
      });
    }

    return results;
  }

  private static async saveWithConflictResolution(results: any[]) {
    if (results.length === 0) return;

    const rows = results.map(r => ({
      draw_date: r.date,
      draw_time: r.draw_time,
      result: r.result,
      fireball: r.fireball,
      source: r.source,
      sync_method: r.sync_method,
      raw_text: r.raw_text
    }));

    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('pick3_history')
        .upsert(chunk, {
            onConflict: 'draw_date,draw_time'
        });

      if (error) {
        logger.error('PICK3', 'Error upserting PDF data', { error });
      }
    }

    logger.info('PICK3', 'PDF data saved successfully with priority.');
  }
}
