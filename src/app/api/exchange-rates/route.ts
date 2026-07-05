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
 * elToque: No tiene API pública. Se estima como BCC segmento 3 × 1.15 (constante EL_TOQUE_SPREAD). No es captura de eltoque.com.
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

    // FIX-CARRY-FORWARD (2026-07-05): si hoy no hay tasa para alguna combinación
    // source/currency/segment, buscar el último valor disponible y crear un
    // registro virtual carry-forward para que la UI no muestre brincos.
    //
    // Esto resuelve el problema: si el BCC o elToque fallan hoy, la UI usa
    // automáticamente el último valor real disponible arrastrándolo hasta
    // que el servicio se restablezca.
    const todayStr = new Date().toISOString().split('T')[0];
    const sources = source ? [source] : ['BCC', 'elToque'];
    const currencies = currency ? [currency] : ['USD', 'EUR', 'MLC'];
    const segments = [segment];

    const carryForwardRecords: any[] = [];

    for (const src of sources) {
      for (const cur of currencies) {
        for (const seg of segments) {
          // Verificar si ya existe un registro para hoy
          const hasToday = data?.some(
            (r: any) => r.rate_date === todayStr && r.source === src && r.currency === cur && r.segment === seg
          );

          if (!hasToday) {
            // Buscar el último valor real disponible (más reciente antes de hoy)
            const lastReal = data
              ?.filter((r: any) => r.source === src && r.currency === cur && r.segment === seg)
              .sort((a: any, b: any) => b.rate_date.localeCompare(a.rate_date))[0];

            if (lastReal) {
              // Crear registro carry-forward virtual
              carryForwardRecords.push({
                ...lastReal,
                rate_date: todayStr,
                captured_at: new Date().toISOString(),
                capture_method: 'carry_forward',
                original_rate_date: lastReal.rate_date,
                id: `cf-${lastReal.id}`,
              });
            }
          }
        }
      }
    }

    // Combinar datos reales + carry-forward
    const allRates = [...(data || []), ...carryForwardRecords].sort(
      (a: any, b: any) => a.rate_date.localeCompare(b.rate_date)
    );

    return NextResponse.json({
      rates: allRates,
      count: allRates.length,
      carry_forward_count: carryForwardRecords.length,
      carry_forward_dates: carryForwardRecords.map((r: any) => ({
        source: r.source,
        currency: r.currency,
        original_date: r.original_rate_date,
      })),
    });
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

