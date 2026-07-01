import { NextRequest, NextResponse } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { createApiError } from '@/lib/api-errors';
import { recalculateSchema, zodError } from '@/validation/api-schemas';
import {
  recalculateOnPriceChange,
  batchRecalculateOnPriceChange,
  type PriceChangeRecord,
} from '@/lib/integration/recalculate-on-price-change';

export const runtime = 'nodejs';

/**
 * POST /api/product-cost-sheets/recalculate
 *
 * Evaluates whether price changes require FC recalculation and triggers
 * them if needed. Supports both single and batch operations.
 *
 * Security: validateOrigin (CSRF), recalculateSchema (Zod), withRole('encargado')
 *
 * Body:
 *   Single: { mode: 'single', productId, storeId, oldCostPrice, newCostPrice, changedBy?, forceRecalculation? }
 *   Batch:  { mode: 'batch', changes: PriceChangeRecord[] }
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // ── CSRF: Validate origin header ──
    const csrfError = validateOrigin(req);
    if (csrfError) {
      return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    }

    // ── Rate limit ──
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rlKey = `fc-recalculate:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // ── Zod validation ──
    const rawBody = await req.json();
    const parsed = recalculateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const body = parsed.data;

    // ── Execute recalculation ──
    if (body.mode === 'batch') {
      const changes: PriceChangeRecord[] = body.changes.map((c) => ({
        productId: c.productId,
        storeId: c.storeId,
        oldCostPrice: c.oldCostPrice,
        newCostPrice: c.newCostPrice,
        changedBy: c.changedBy || session.user.id,
        forceRecalculation: c.forceRecalculation,
      }));

      const results = await batchRecalculateOnPriceChange(changes);
      return NextResponse.json({ results });
    }

    // Single mode
    const change: PriceChangeRecord = {
      productId: body.productId,
      storeId: body.storeId,
      oldCostPrice: body.oldCostPrice,
      newCostPrice: body.newCostPrice,
      changedBy: body.changedBy || session.user.id,
      forceRecalculation: body.forceRecalculation,
    };

    const result = await recalculateOnPriceChange(change);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[FC Recalculate] Error:', err);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(
  withRole('encargado', postHandler) as Parameters<typeof withTracing>[0],
  'POST /api/product-cost-sheets/recalculate',
);
