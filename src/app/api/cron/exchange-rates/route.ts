import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { captureDateRange } from '@/lib/exchange-capture';
// FIX M5: tracking de invocaciones de cron
// FIX R2: waitUntil para garantizar flush en serverless
import { usage, maybeFlush } from '@/lib/usage-tracker';
import { waitUntil } from '@vercel/functions';

/**
 * Cron job: captura diaria automática de tasas BCC + elToque.
 *
 * Schedule en vercel.json: "0 18 * * *" (diariamente a las 18:00 UTC = 14:00 Cuba)
 *
 * Auth (solo 2 modos — FIX C5+C6: sin dev mode ni service_role fallback):
 *   1. JWT x-vercel-signature — Vercel Cron automático (requiere VERCEL_PROJECT_ID)
 *   2. Bearer CRON_SECRET — para llamadas manuales con el token configurado
 *
 * Modos de operación:
 *   GET /api/cron/exchange-rates            → captura solo el día actual
 *   GET /api/cron/exchange-rates?days=7     → backfill: captura los últimos 7 días
 *   GET /api/cron/exchange-rates?days=30    → backfill: captura los últimos 30 días
 *
 * Vercel Hobby: maxDuration = 10s (suficiente para days=7 con concurrencia 3)
 * Vercel Pro: maxDuration = 60s (suficiente para days=30)
 */
export const maxDuration = 60;

const JWKS = createRemoteJWKSet(new URL('https://api.vercel.com/.well-known/jwks.json'));

/**
 * FIX C5+M6: Verificación JWT estricta.
 * - Requiere VERCEL_PROJECT_ID configurado (sin fallback a undefined)
 * - Valida audience contra el project ID
 * - Valida issuer = 'vercel'
 */
async function verifyVercelSignature(req: NextRequest): Promise<boolean> {
  const sig = req.headers.get('x-vercel-signature');
  if (!sig) return false;

  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) {
    // Sin project ID no podemos validar audience — fail closed
    console.error('[cron/exchange-rates] VERCEL_PROJECT_ID not configured — rejecting JWT');
    return false;
  }

  try {
    const { payload } = await jwtVerify(sig, JWKS, {
      issuer: 'vercel',
      audience: projectId,
    });
    return !!payload;
  } catch (e: any) {
    console.error('[cron/exchange-rates] JWT verification failed:', e.message);
    return false;
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // ── Autenticación: solo 2 modos (FIX C5+C6) ──
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isCronAuthorized = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const isVercelCron = await verifyVercelSignature(req);

  if (!isCronAuthorized && !isVercelCron) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        hint: 'Incluye Authorization: Bearer <CRON_SECRET>, o usa x-vercel-signature JWT (con VERCEL_PROJECT_ID configurado)',
      },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Config missing — requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  // Parse ?days=N (default 1 = solo hoy, max 30)
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '1', 10) || 1, 1), 30);

  const cronStart = Date.now();
  let cronError = false;
  try {
    // FIX C4: usa captureDateRange con concurrencia 3 (Promise.allSettled interno)
    const result = await captureDateRange(days, supabaseUrl, serviceKey, 3);
    const elapsedMs = Date.now() - startTime;

    // FIX M5+R2: track invocación exitosa con waitUntil para flush garantizado
    usage.cronInvocation('/api/cron/exchange-rates', Date.now() - cronStart, false);
    maybeFlush(waitUntil);

    return NextResponse.json({
      success: true,
      mode: days === 1 ? 'today' : `backfill-${days}d`,
      auth_method: isVercelCron ? 'vercel-jwt' : 'cron-secret',
      dates_processed: result.datesProcessed,
      captured_count: result.captured.length,
      details: result.captured,
      errors: result.errors.length > 0 ? result.errors : undefined,
      elapsed_ms: elapsedMs,
    });
  } catch (error) {
    cronError = true;
    usage.cronInvocation('/api/cron/exchange-rates', Date.now() - cronStart, true);
    maybeFlush(waitUntil);
    throw error;
  }
}
