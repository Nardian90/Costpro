import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { canManageStore } from '@/lib/roles';
import { previewProductMessage } from '@/lib/telegram/publish';
import { isValidShowPrice, type TelegramShowPrice } from '@/lib/storefront/product-presentation';

/**
 * POST /api/telegram/preview-product
 *
 * Builds the EXACT message that would be sent by /api/telegram/publish-product
 * WITHOUT actually sending it. Used by the live preview in TelegramConfigView.
 *
 * Body:
 *   - storeId: string (required)
 *   - productId: string (required)
 *   - showPrice?: 'according_to_storefront' | 'show' | 'hide'
 *   - showPhysicalUnits?: boolean
 *
 * Returns:
 *   { text, imageUrl, product: {id, name}, presentation }
 *
 * Critical: the preview is built with the SAME buildTelegramProductMessage()
 * as the real publish endpoint, so they cannot disagree.
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json().catch(() => ({}));

  // REM-COSTPRO4-CI: contrato del body con Zod (la requeridad de storeId/
  // productId la aplica el check de abajo y showPrice su validador propio).
  const TelegramPreviewSchema = z.object({
    storeId: z.string().optional(),
    productId: z.string().optional(),
    showPrice: z.unknown().optional(),
    showPhysicalUnits: z.unknown().optional(),
    text: z.string().optional(),
    imageUrl: z.string().optional(),
    product: z.unknown().optional(),
    presentation: z.unknown().optional(),
  }).passthrough();
  const parsedBody = TelegramPreviewSchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }

  const { storeId, productId, showPrice, showPhysicalUnits } = body;

  if (!storeId || !productId) {
    return NextResponse.json(
      { error: 'storeId y productId son obligatorios' },
      { status: 400 },
    );
  }

  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate showPrice if provided
  let validatedShowPrice: TelegramShowPrice | undefined;
  if (showPrice !== undefined) {
    if (!isValidShowPrice(showPrice)) {
      return NextResponse.json(
        { error: `showPrice inválido. Valores: according_to_storefront | show | hide` },
        { status: 400 },
      );
    }
    validatedShowPrice = showPrice;
  }

  try {
    const result = await previewProductMessage(storeId, productId, {
      showPrice: validatedShowPrice,
      showPhysicalUnits:
        typeof showPhysicalUnits === 'boolean' ? showPhysicalUnits : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const POST = withAuth(handler as any);
