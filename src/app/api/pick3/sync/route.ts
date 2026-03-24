import { NextResponse } from 'next/server';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';
import { Pick3Storage } from '@/services/pick3/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    logger.info('PICK3', 'Manual sync triggered via API');

    // 1. Get clean official results
    const officialResults = await Pick3ScraperService.getCleanOfficialResults();

    if (officialResults.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No results found from official sources'
      }, { status: 404 });
    }

    // 2. Save to Supabase (upsert logic handles deduplication)
    await Pick3Storage.saveHistory(officialResults);

    return NextResponse.json({
      success: true,
      count: officialResults.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('PICK3', 'Sync API failed', { error });
    return NextResponse.json({
      success: false,
      message: 'Internal server error during sync',
      error: String(error)
    }, { status: 500 });
  }
}
