import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * IC-AUDIT: API para gestión de tasas de cambio con segmentos BCC.
 *
 * GET /api/exchange-rates — devuelve tasas con filtros opcionales:
 *   ?currency=USD&source=BCC&segment=3&days=90
 *
 * POST /api/exchange-rates — captura tasas de BCC (3 segmentos) + elToque.
 *
 * BCC Segmentos:
 *   1 = tasaOficial (empresas estatales)
 *   2 = tasaPublica (CADECA)
 *   3 = tasaEspecial (MIPYMES y personas naturales) — DEFAULT
 *
 * BCC API: https://api.bc.gob.cu/v1/tasas-de-cambio
 *   - /activas — tasas del día actual
 *   - /historico?fechaInicio=...&fechaFin=...&codigoMoneda=USD — histórico
 *
 * elToque: No tiene API pública. Se captura diariamente y se acumula en BD.
 */

const BCC_API = 'https://api.bc.gob.cu/v1/tasas-de-cambio';
const CURRENCIES = ['USD', 'EUR']; // MLC no está en BCC API, solo elToque

// Mapeo BCC segmento → campo en la API
const BCC_SEGMENTS = [
  { segment: '1', field: 'tasaOficial' },
  { segment: '2', field: 'tasaPublica' },
  { segment: '3', field: 'tasaEspecial' }, // DEFAULT — MIPYMES
];

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // Parse query params
    const { searchParams } = new URL(req.url);
    const currency = searchParams.get('currency');
    const source = searchParams.get('source');
    const segment = searchParams.get('segment') || '3'; // Default: segmento 3 (MIPYMES)
    const days = parseInt(searchParams.get('days') || '90');

    let query = admin.from('exchange_rates').select('*').eq('segment', segment);

    if (currency) query = query.eq('currency', currency);
    if (source) query = query.eq('source', source);

    // Filtro por fecha (últimos N días)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    query = query.gte('rate_date', cutoff.toISOString().split('T')[0]);

    query = query.order('rate_date', { ascending: true });

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rates: data, count: data?.length || 0 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

/**
 * FIX M7: POST eliminado — era duplicado del cron route.
 *
 * Para captura manual (admin), usar:
 *   POST /api/exchange-rates/refresh?days=7
 *
 * Ese endpoint proxy usa withAuth + captureDateRange() (lib compartida
 * con el cron), eliminando la duplicación de lógica que existía antes.
 *
 * El GET sigue disponible para consulta de tasas con filtros.
 */
export const GET = withAuth(getHandler);

export const POST = async () =>
  NextResponse.json(
    {
      error: 'Endpoint deprecado — usa POST /api/exchange-rates/refresh?days=7',
      deprecated: true,
      replacement: '/api/exchange-rates/refresh',
    },
    { status: 410 },
  );

