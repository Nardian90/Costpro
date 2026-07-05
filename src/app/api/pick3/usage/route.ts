import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/services/pick3/subscription.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SPRINT-4-USAGE
 *
 * GET  /api/pick3/usage          → obtiene usage actual + checks
 * POST /api/pick3/usage          → check and consume una acción
 *   body: { action: 'ai_query' | 'backtest' | 'api_call', mode: 'check' | 'consume' }
 *
 * El endpoint /api/pick3/advisor ya hace check+consume internamente,
 * pero este endpoint está disponible para que el frontend pueda verificar
 * límites antes de mostrar UI (e.g. "te quedan 3 consultas").
 */

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const usage = await SubscriptionService.getUsage(session.user.id);
    const aiCheck = await SubscriptionService.checkUsage(session.user.id, 'ai_query');
    const backtestCheck = await SubscriptionService.checkUsage(session.user.id, 'backtest');
    const apiCheck = await SubscriptionService.checkUsage(session.user.id, 'api_call');

    return NextResponse.json({
      usage,
      checks: {
        ai_query: aiCheck,
        backtest: backtestCheck,
        api_call: apiCheck,
      },
    });
  } catch (error: unknown) {
    logger.error('PICK3', `Usage GET error: ${error instanceof Error ? error.message : String(error)}`);
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
    const { action, mode } = body;

    if (!action || !['ai_query', 'backtest', 'api_call'].includes(action)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    if (mode === 'consume') {
      // Verificar Y consumir atómicamente
      const result = await SubscriptionService.checkAndConsume(
        session.user.id,
        action,
      );
      return NextResponse.json({ result });
    } else {
      // Solo verificar (sin consumir)
      const result = await SubscriptionService.checkUsage(
        session.user.id,
        action,
      );
      return NextResponse.json({ result });
    }
  } catch (error: unknown) {
    logger.error('PICK3', `Usage POST error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

export const GET = getHandler;
export const POST = postHandler;
