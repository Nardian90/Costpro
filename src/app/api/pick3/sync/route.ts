import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { withTracing } from '@/lib/observability';
import { scraper } from '@/lib/pick3/scraper';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV === 'development';

async function postHandler(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const forceFull = searchParams.get('full') === 'true';
  const authHeader = req.headers.get('Authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // BUG-030: Authorization guard for full sync
  if (forceFull && !isCron) {
    return NextResponse.json(
      { error: 'La sincronización completa solo puede ser iniciada por el sistema' },
      { status: 403 }
    );
  }

  logger.info('PICK3', `Sync triggered. Source: ${isCron ? 'Cron' : 'Manual'}, Full: ${forceFull}`);

  try {
    const results = await scraper.sync({ full: forceFull });

    return NextResponse.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('PICK3', 'Sync failed', error);

    // BUG-025: Environment guard for error details
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
