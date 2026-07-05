import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ReferralService } from '@/services/pick3/referral.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/pick3/referral → obtiene código de referral + stats del usuario
 * POST /api/pick3/referral → registra un referral (con código de otro usuario)
 *   body: { action: 'register' | 'get_code' | 'get_stats', referralCode?: string }
 */

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const [referralCode, stats, referrals] = await Promise.all([
      ReferralService.getOrCreateReferralCode(
        session.user.id,
        session.user.email || 'USER',
      ),
      ReferralService.getReferralStats(session.user.id),
      ReferralService.getReferrals(session.user.id),
    ]);

    return NextResponse.json({
      referralCode,
      stats,
      referrals: referrals.slice(0, 20),
      referralUrl: referralCode ? `${req.nextUrl.origin}/?ref=${referralCode}` : null,
    });
  } catch (error: unknown) {
    logger.error('PICK3', `Referral GET error: ${error instanceof Error ? error.message : String(error)}`);
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
    const { action, referralCode } = body;

    switch (action) {
      case 'register': {
        if (!referralCode) {
          return NextResponse.json({ error: 'Código de referido requerido' }, { status: 400 });
        }
        const result = await ReferralService.registerReferral(session.user.id, referralCode);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          referral: result.referral,
          message: '¡Código de referido aplicado! Has recibido 30 días extra de trial.',
        });
      }

      case 'get_code': {
        const code = await ReferralService.getOrCreateReferralCode(
          session.user.id,
          session.user.email || 'USER',
        );
        return NextResponse.json({
          referralCode: code,
          referralUrl: code ? `${req.nextUrl.origin}/?ref=${code}` : null,
        });
      }

      case 'get_stats': {
        const stats = await ReferralService.getReferralStats(session.user.id);
        return NextResponse.json({ stats });
      }

      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }
  } catch (error: unknown) {
    logger.error('PICK3', `Referral POST error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

export const GET = getHandler;
export const POST = postHandler;
