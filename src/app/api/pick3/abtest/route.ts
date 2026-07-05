import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ABTestingService, EXPERIMENTS, ExperimentId } from '@/services/pick3/abtesting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/pick3/abtest → obtiene todas las asignaciones del usuario
 * POST /api/pick3/abtest → trackea un evento de conversión
 *   body: { experimentId, event: 'view' | 'click_cta' | 'start_trial' | 'convert_paid' }
 */

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const assignments = ABTestingService.assignAllExperiments(session.user.id);

    return NextResponse.json({
      assignments,
      experiments: EXPERIMENTS,
    });
  } catch (error: unknown) {
    logger.error('PICK3', `ABTest GET error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { experimentId, event } = body;

    if (!experimentId || !EXPERIMENTS[experimentId as ExperimentId]) {
      return NextResponse.json({ error: 'Experiment ID inválido' }, { status: 400 });
    }

    if (!['view', 'click_cta', 'start_trial', 'convert_paid'].includes(event)) {
      return NextResponse.json({ error: 'Event inválido' }, { status: 400 });
    }

    ABTestingService.trackConversion(
      session.user.id,
      experimentId as ExperimentId,
      event,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('PICK3', `ABTest POST error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

export const GET = getHandler;
export const POST = postHandler;
