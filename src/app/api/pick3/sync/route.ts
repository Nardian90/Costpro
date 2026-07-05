import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { withTracing } from '@/lib/observability';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV === 'development';

async function postHandler(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const forceFull = searchParams.get('full') === 'true';
  const days = parseInt(searchParams.get('days') || '0', 10); // FIX-SYNC-7DIAS: días a sincronizar
  const authHeader = req.headers.get('Authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (forceFull && !isCron) {
    return NextResponse.json(
      { error: 'La sincronización completa solo puede ser iniciada por el sistema' },
      { status: 403 }
    );
  }

  logger.info('PICK3', `Sync triggered. Source: ${isCron ? 'Cron' : 'Manual'}, Full: ${forceFull}, Days: ${days}`);

  try {
    let results;
    if (days > 0) {
      // FIX-SYNC-7DIAS (2026-07-04): sincronización parcial de N días
      // Solo obtiene resultados recientes de LotteryUSA
      results = await Pick3ScraperService.scrapeLatestResults();

      // Filtrar solo los últimos N días (incluyendo hoy)
      // FIX-FILTER (2026-07-05): el cutoff debe incluir el día de hoy correctamente
      if (days > 0 && results.length > 0) {
        const cutoff = new Date();
        // Empezar desde hoy (no restar un día extra)
        cutoff.setHours(0, 0, 0, 0); // Inicio de hoy
        cutoff.setDate(cutoff.getDate() - (days - 1)); // Incluir hoy + (days-1) hacia atrás
        const cutoffStr = cutoff.toISOString().split('T')[0];

        logger.info('PICK3', `Filtering last ${days} days (cutoff: ${cutoffStr}), total before filter: ${results.length}`);
        results = results.filter(r => r.date >= cutoffStr);
        logger.info('PICK3', `After filter: ${results.length} results`);

        // Log de las fechas que se van a guardar
        if (results.length > 0) {
          const dates = [...new Set(results.map(r => r.date))].sort().reverse();
          logger.info('PICK3', `Dates to sync: ${dates.join(', ')}`);
        }
      }
    } else {
      results = await Pick3ScraperService.scrapeLatestResults();
    }

    return NextResponse.json({
      success: true,
      data: results
    });
  } catch (error: unknown) {
    logger.error("PICK3", "Sync failed", { error: String((error instanceof Error ? error.message : null) || error) } as Record<string, any>);

    return NextResponse.json({
      success: false,
      message: isDev
        ? `Error interno del servidor durante la sincronización: ${error instanceof Error ? error.message : String(error)}`
        : 'Error interno del servidor durante la sincronización.',
      ...(isDev && { error: String(error) })
    }, { status: 500 });
  }
}

export const POST = withTracing(postHandler, 'POST /api/pick3/sync');
