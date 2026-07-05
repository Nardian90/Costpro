import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/services/pick3/subscription.service';
import { SubscriptionTier, TIERS } from '@/services/pick3/subscription.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SPRINT-4-SUBSCRIPTION
 *
 * GET  /api/pick3/subscription          → obtiene suscripción + usage actual
 * POST /api/pick3/subscription          → cambia tier o inicia trial
 *   body: { action: 'change_tier' | 'start_trial' | 'cancel' | 'reactivate', tier?: SubscriptionTier }
 */

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const subscription = await SubscriptionService.getSubscription(session.user.id);
    const usage = await SubscriptionService.getUsage(session.user.id);

    // Verificar límites actuales
    const aiCheck = await SubscriptionService.checkUsage(session.user.id, 'ai_query');
    const backtestCheck = await SubscriptionService.checkUsage(session.user.id, 'backtest');

    return NextResponse.json({
      subscription,
      usage,
      checks: {
        ai_query: aiCheck,
        backtest: backtestCheck,
      },
      tiers: TIERS,
    });
  } catch (error: unknown) {
    logger.error('PICK3', `Subscription GET error: ${error instanceof Error ? error.message : String(error)}`);
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
    const { action, tier, mode } = body;

    if (!action) {
      return NextResponse.json({ error: 'Acción requerida' }, { status: 400 });
    }

    switch (action) {
      case 'change_tier': {
        if (!tier || !TIERS[tier as SubscriptionTier]) {
          return NextResponse.json({ error: 'Tier inválido' }, { status: 400 });
        }
        // Crear checkout session (demo o Stripe)
        const result = await SubscriptionService.createCheckoutSession(
          session.user.id,
          tier as SubscriptionTier,
          mode || 'monthly',
        );
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          session: result.session,
          message: 'Checkout creado',
        });
      }

      case 'start_trial': {
        if (!tier || !TIERS[tier as SubscriptionTier]) {
          return NextResponse.json({ error: 'Tier inválido' }, { status: 400 });
        }
        if (tier === 'free') {
          return NextResponse.json({ error: 'No se puede iniciar trial para Free' }, { status: 400 });
        }
        const result = await SubscriptionService.startTrial(session.user.id, tier as SubscriptionTier);
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          subscription: result.subscription,
          message: 'Trial iniciado',
        });
      }

      case 'cancel': {
        const result = await SubscriptionService.cancelAtPeriodEnd(session.user.id);
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ message: 'Suscripción cancelada al final del período' });
      }

      case 'reactivate': {
        const result = await SubscriptionService.reactivate(session.user.id);
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ message: 'Suscripción reactivada' });
      }

      case 'admin_metrics': {
        // Solo admin puede ver métricas
        if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }
        const metrics = await SubscriptionService.getAdminMetrics();
        return NextResponse.json({ metrics });
      }

      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }
  } catch (error: unknown) {
    logger.error('PICK3', `Subscription POST error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

export const GET = getHandler;
export const POST = postHandler;
