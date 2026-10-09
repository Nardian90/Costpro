import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { publishProductToTelegram } from '@/lib/telegram/publish';

/**
 * POST /api/telegram/publish-product
 *
 * Publishes a product from the store's vitrina to the configured Telegram group.
 *
 * Body:
 *   - storeId: string (required)
 *   - publishType: 'manual' | 'automatic' (default: 'manual')
 *   - productId?: string (manual "publish THIS one")
 *   - showPriceOverride?: 'according_to_storefront' | 'show' | 'hide'
 *   - showPhysicalUnitsOverride?: boolean
 *
 * SEC-TS-02 · H5 — actor de auditoría no falsificable: el `published_by`
 * de telegram_product_posts se toma SIEMPRE de session.user.id (identidad
 * autenticada). El campo userId del body se ignora por completo — un
 * cliente no puede falsificar quién publicó.
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json().catch(() => ({}));

  // REM-COSTPRO4-CI: contrato del body con Zod (userId del body se IGNORA por
  // diseño — SEC-TS-02 H5; identidad siempre de la sesión).
  const TelegramPublishSchema = z.object({
    storeId: z.string().optional(),
    publishType: z.string().optional(),
    productId: z.string().nullable().optional(),
    showPriceOverride: z.unknown().optional(),
    showPhysicalUnitsOverride: z.unknown().optional(),
  }).passthrough();
  const parsedBody = TelegramPublishSchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }

  const { storeId, publishType = 'manual', productId, showPriceOverride, showPhysicalUnitsOverride } = body;

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
    const result = await publishProductToTelegram({
      storeId,
      publishType,
      // SEC-TS-02 · H5: identidad autenticada — nunca del body.
      userId: (session.user as any).id,
      productId,
      showPriceOverride,
      showPhysicalUnitsOverride,
      skipIdempotency: publishType === 'manual', // manual publish always proceeds
    });

    if (result.skipped) {
      return NextResponse.json({
        skipped: true,
        reason: result.reason,
        minutesSince: result.minutesSince,
        intervalMinutes: result.intervalMinutes,
      });
    }
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, product: result.product },
        { status: result.reason === 'not_configured' ? 404 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Producto publicado',
      product: result.product,
      telegram_message_id: result.telegram_message_id,
      chat_title: result.chat_title,
      text: result.text,
      imageUrl: result.imageUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(handler as any);
