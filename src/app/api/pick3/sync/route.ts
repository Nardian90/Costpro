import { NextResponse } from 'next/server';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';
import { Pick3Storage } from '@/services/pick3/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    logger.info('PICK3', 'Manual sync triggered via API');

    // 1. Get clean official results from real sources
    const results = await Pick3ScraperService.getCleanOfficialResults();

    if (!results || results.length === 0) {
      logger.warn('PICK3', 'Sync failed: No results found from sources');
      return NextResponse.json({
        success: false,
        message: 'No se encontraron resultados en las fuentes oficiales o de respaldo.'
      }, { status: 404 });
    }

    // 2. Save to Supabase (upsert logic handles deduplication)
    try {
      await Pick3Storage.saveHistory(results);
    } catch (dbError) {
      logger.error('PICK3', 'Database save failed during sync', { dbError });
      // We still return success if at least we fetched them, as they might be in localStorage fallback
      return NextResponse.json({
        success: true,
        partial: true,
        count: results.length,
        message: 'Resultados obtenidos pero hubo un error al guardar en la base de datos central.',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      count: results.length,
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
}
