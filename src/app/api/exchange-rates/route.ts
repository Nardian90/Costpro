import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * IC-AUDIT: API para gestión de tasas de cambio con segmentos BCC.
 *
 * GET /api/exchange-rates — devuelve tasas con filtros opcionales:
 *   ?currency=USD&source=BCC&segment=3&days=90
 *
 * Fuentes soportadas (misión IC-DIVIZA 2026-10-26):
 *   - source=BCC           → tasa oficial por segmento (1/2/3).
 *   - source=Diviza        → tasa informal capturada de cubadivisas.com.
 *   - source=elToque       → tasa informal histórica (serie congelada desde
 *                            2026-07-28; se conserva con su procedencia).
 *   - source=informal      → pseudo-fuente: la informal MÁS RECIENTE entre
 *                            Diviza y elToque (prioridad por frescura).
 *   - (sin source)         → BCC + Diviza + elToque.
 *
 * El carry-forward virtual se aplica POR FUENTE: si hoy falta la tasa de una
 * fuente, se arrastra su último valor real con capture_method='carry_forward'
 * y original_rate_date para que la UI muestre la antigüedad.
 */

const CURRENCIES = ['USD', 'EUR', 'MLC']; // MLC no está en BCC API, solo informal
/** Fuentes informales reales registradas en exchange_rates.source. */
const INFORMAL_SOURCES = ['Diviza', 'elToque'];

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
    const sourceParam = searchParams.get('source');
    const segment = searchParams.get('segment') || '3'; // Default: segmento 3 (MIPYMES)
    const days = parseInt(searchParams.get('days') || '90');

    // Resolución de fuentes a consultar.
    // 'informal' = pseudo-fuente: ambas informales, el consumidor/el propio
    // endpoint resuelven por frescura (rate_date DESC, captured_at DESC).
    const sources: string[] = sourceParam
      ? sourceParam === 'informal'
        ? INFORMAL_SOURCES
        : [sourceParam]
      : ['BCC', ...INFORMAL_SOURCES];

    let query = admin.from('exchange_rates').select('*').eq('segment', segment);

    if (currency) query = query.eq('currency', currency);
    // BCC consulta por segmento; las informales siempre son segmento '3'.
    if (sources.length === 1) {
      query = query.eq('source', sources[0]);
    } else {
      query = query.in('source', sources);
    }

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
    const todayStr = new Date().toISOString().split('T')[0];
    const currencies = currency ? [currency] : CURRENCIES;
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

    // Pseudo-fuente 'informal': además de devolver todas las filas de los
    // proveedores informales, se resuelve explícitamente la vigente (la más
    // fresca) para que el consumidor no tenga que duplicar la regla.
    let informalLatest: Record<string, any> | undefined;
    if (sourceParam === 'informal' && currency) {
      const informalRows = allRates
        .filter((r: any) => INFORMAL_SOURCES.includes(r.source) && r.currency === currency)
        .sort((a: any, b: any) => {
          if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
          return (b.captured_at || '').localeCompare(a.captured_at || '');
        });
      const latest = informalRows[0];
      if (latest) {
        informalLatest = {
          rate: latest.rate,
          rate_date: latest.rate_date,
          source: latest.source,
          capture_method: latest.capture_method,
          original_rate_date: latest.original_rate_date,
          is_carry_forward: latest.capture_method === 'carry_forward',
        };
      }
    }

    return NextResponse.json({
      rates: allRates,
      count: allRates.length,
      sources_queried: sources,
      informal_latest: informalLatest,
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
 *   POST /api/exchange-rates/refresh?days=7        → BCC + informal (Diviza)
 *   POST /api/exchange-rates/scrape-diviza         → informal puntual (Diviza)
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
