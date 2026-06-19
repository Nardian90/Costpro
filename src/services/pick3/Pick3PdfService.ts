import { Pick3Result } from '@/types/pick3';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabaseClient';
import { execFile } from 'child_process'; // FIX-SEC-010
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(execFile); // FIX-SEC-010

export class Pick3PdfService {
  private static readonly PDF_URL = 'https://files.floridalottery.com/exptkt/p3.pdf';
  private static readonly PARSER_SCRIPT = 'scripts/pick3_pdf_parser.py';

  /**
   * Performs a robust sync from the official PDF using the Python coordinate-based pipeline.
   * This method replaces the legacy pdf-parse implementation.
   */
  static async syncFromPdf(): Promise<Pick3Result[]> {
    try {
      logger.info('PICK3', 'Starting Robust PDF sync process...');

      // Ensure the Python script exists
      if (!fs.existsSync(this.PARSER_SCRIPT)) {
        throw new Error(`Robust parser script not found: ${this.PARSER_SCRIPT}`);
      }

      // Execute the Python pipeline
      // We assume the Python environment is set up (pdfplumber, supabase installed)
      logger.info('PICK3', 'Executing Python robust parser...');

      const auditPath = '/tmp/PICK3_PDF_AUDIT.json';
      logger.info('PICK3', `Executing Python robust parser with URL: ${this.PDF_URL}`);
      const { stdout, stderr } = await execAsync('python3', [this.PARSER_SCRIPT, this.PDF_URL, auditPath]); // FIX-SEC-010


      if (stderr && !stderr.includes('UserWarning')) {
        logger.warn('PICK3', 'Python parser stderr output', { stderr });
      }

      // The Python script already handles the upsert to Supabase and saves a report
      const reportPath = fs.existsSync('/tmp/PICK3_PDF_AUDIT.json') ? '/tmp/PICK3_PDF_AUDIT.json' : 'PICK3_PDF_AUDIT.json';
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        logger.info('PICK3', `Sync completed. Extracted ${report.metrics.total_detected} records.`);

        // Return latest results for UI feedback
        const { data: latestRecords, error } = await supabase
          .from('pick3_history')
          .select('*')
          .order('draw_date', { ascending: false })
          .limit(20);

        if (error) throw error;

        return (latestRecords || []).map(r => ({
          date: r.draw_date,
          draw_time: r.draw_time as any,
          result: r.result as [number, number, number],
          source: r.source,
          fireball: r.fireball
        }));
      }

      throw new Error('Sync finished but no audit report was generated.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PICK3', 'Failed robust sync from PDF', { error: message });
      throw error;
    }
  }

  /**
   * Legacy parser method - now deprecated in favor of the Python coordinate pipeline.
   * Kept for internal reference during transition.
   */
  public static async parsePdf(buffer: Buffer): Promise<any[]> {
    logger.warn('PICK3', 'Legacy parsePdf called. Please use syncFromPdf() instead.');
    return [];
  }
}
