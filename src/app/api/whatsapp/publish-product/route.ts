import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { publishProductToWhatsApp } from '@/lib/whatsapp/publish';

/**
 * POST /api/whatsapp/publish-product
 *
 * Publishes a product from the store's vitrina to WhatsApp.
 *
 * Body:
 *   - storeId: string (required)
 *   - publishType: 'manual' | 'automatic' (default: 'manual')
 *   - userId?: string
 *   - productId?: string (manual "publish THIS one")
 *   - showPriceOverride?: 'according_to_storefront' | 'show' | 'hide'
 *   - showPhysicalUnitsOverride?: boolean
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json().catch(() => ({}));
  const { storeId, publishType = 'manual', userId, productId, showPriceOverride, showPhysicalUnitsOverride } = body;

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (publishType === 'manual') {
    const memberships = (session.user as any).memberships || [];
    const isAdmin = (session.user as any).role === 'admin';
    if (!isAdmin && !memberships.some((m: any) => m.store_id === storeId && m.status === 'active')) {
      return NextResponse.json({ error: 'Unauthorized for this store' }, { status: 403 });
    }
  }

  try {
    const result = await publishProductToWhatsApp({
      storeId,
      publishType,
      userId: userId || (session.user as any).id,
      productId,
      showPriceOverride,
      showPhysicalUnitsOverride,
      skipIdempotency: publishType === 'manual',
    });

    if (result.skipped) {
      return NextResponse.json({
        skipped: true,
        reason: result.reason,
        minutesSince: result.minutesSince,
        intervalMinutes: result.intervalMinutes,
        error: result.error,
      });
    }
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, product: result.product },
        { status: result.reason === 'not_configured' ? 404 : (result.reason === 'no_session' ? 503 : 500) },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Producto publicado',
      product: result.product,
      whatsapp_message_id: result.whatsapp_message_id,
      text: result.text,
      imageUrl: result.imageUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(handler as any);
