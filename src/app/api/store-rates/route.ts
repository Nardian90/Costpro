import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store-rates?storeId=X
 * POST /api/store-rates { storeId, rates: { USD: 680, EUR: 720, MLC: 600 } }
 *
 * Tasas de cambio manuales persistentes por tienda.
 */

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const storeId = req.nextUrl.searchParams.get('storeId');
    if (!storeId) return NextResponse.json({ error: 'storeId requerido' }, { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await admin
      .from('store_exchange_rates')
      .select('currency, rate, updated_at')
      .eq('store_id', storeId);

    if (error) {
      logger.error('WALLET', `Store rates fetch: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Convertir a objeto { USD: 680, EUR: 720, MLC: 600 }
    const rates: Record<string, number> = {};
    for (const r of data || []) {
      rates[r.currency] = parseFloat(r.rate);
    }

    return NextResponse.json({ rates });
  } catch (error: unknown) {
    logger.error('WALLET', `Store rates error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { storeId, rates } = body;
    if (!storeId || !rates) return NextResponse.json({ error: 'storeId y rates requeridos' }, { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Upsert cada tasa
    const rows = Object.entries(rates).map(([currency, rate]) => ({
      store_id: storeId,
      currency,
      rate: rate as number,
      updated_by: session.user.id,
    }));

    const { error } = await admin.from('store_exchange_rates')
      .upsert(rows, { onConflict: 'store_id,currency' });

    if (error) {
      logger.error('WALLET', `Store rates save: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    logger.info('WALLET', `Store rates saved by ${session.user.id} for store ${storeId}`);
    return NextResponse.json({ success: true, rates });
  } catch (error: unknown) {
    logger.error('WALLET', `Store rates save error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = getHandler;
export const POST = postHandler;
