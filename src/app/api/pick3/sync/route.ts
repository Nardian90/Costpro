import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';
import { Pick3PdfService } from '@/services/pick3/Pick3PdfService';
import { Pick3Storage } from '@/services/pick3/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const handler = withAuth(async (req, session) => {

  try {
    const url = new URL(req.url);
    const forceFull = url.searchParams.get('full') === 'true';
    const authHeader = req.headers.get('Authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    logger.info('PICK3', `Sync triggered. Source: ${isCron ? 'Cron' : 'Manual'}, Full: ${forceFull}`);

    // 1. Fetch from Web Sources (Fast)
    let webResults: import('@/types/pick3').Pick3Result[] = [];
    try {
        webResults = await Pick3ScraperService.getCleanOfficialResults();
        if (webResults.length > 0) {
            await Pick3Storage.saveHistory(webResults);
        }
    } catch (webError) {
        logger.error('PICK3', 'Web sync failed, continuing to PDF', { error: webError });
    }

    // 2. Fetch from PDF (Source of Truth)
    let pdfResults: import('@/types/pick3').Pick3Result[] = [];
    try {
        pdfResults = await Pick3PdfService.syncFromPdf();
    } catch (pdfError) {
        const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
        logger.error('PICK3', 'PDF sync failed', { error: errorMsg });

        if (webResults.length === 0) {
            return NextResponse.json({
                success: false,
                message: `Error crítico: Fallaron todas las fuentes de sincronización. PDF Error: ${errorMsg}`
            }, { status: 500 });
        }
    }

    return NextResponse.json({
      success: true,
      web_count: webResults.length,
      pdf_count: pdfResults.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('PICK3', 'Sync API failed with critical error', { error });
    return NextResponse.json({
      success: false,
      message: 'Error interno del servidor durante la sincronización.',
      error: String(error)
    }, { status: 500 });
  }

});

export async function POST(req: NextRequest) {
  return handler(req);
}
