import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { ABTestingService, EXPERIMENTS, ExperimentId } from '@/services/pick3/abtesting.service';
import { withRole } from '@/lib/auth-middleware';

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

    // REM-COSTPRO4-CI: contrato del body con Zod (la validez de experimentId
    // y event la aplica la lógica de negocio con mensajes específicos).
    const AbtestEventSchema = z.object({
      experimentId: z.string().optional(),
      event: z.string().optional(),
    }).passthrough();
    const parsedBody = AbtestEventSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }

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

// COSTPRO 4 (fix/usuarios-en-desarrollo-admin): vista EN DESARROLLO — acceso admin-only.
export const GET = withRole('admin', getHandler);
export const POST = withRole('admin', postHandler);
