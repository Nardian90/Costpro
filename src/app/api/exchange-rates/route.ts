import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getOperativeDate, addDaysToDateString, byOperativeDateFirstThenFreshness } from '@/lib/operative-date';

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
 *   - source=informal      → pseudo-fuente: todas las informales reales +
 *                            resolución server-side de la vigente.
 *   - (sin source)         → BCC + Diviza + elToque.
 *
 * El carry-forward virtual se aplica POR FUENTE: si la fecha operativa no
 * tiene tasa de una fuente, se arrastra su último valor real con
 * capture_method='carry_forward' y original_rate_date para que la UI muestre
 * la antigüedad.
 *
 * IC-DIVIZA-002 (2026-10-26):
 *   - La fecha de vigencia es la FECHA OPERATIVA (civil de Cuba,
 *     America/Havana) — no la fecha UTC (misión §3). Se expone como
 *     `operative_date` para que cliente y servidor compartan UNA regla.
 *   - Las filas virtuales carry-forward CONSERVAN el captured_at ORIGINAL
 *     (antes se fabricaba «ahora» y la fila virtual de una fuente muerta
 *     desplazaba a la captura real de Diviza en los ordenamientos por
 *     frescura de la vista — caso de aceptación 6 de la misión).
 *   - informal_latest resuelve la vigente EXCLUYENDO filas virtuales: la
 *     regla inequívoca es «el registro REAL más reciente por (rate_date
 *     DESC, captured_at DESC)», idéntica a la que aplica la vista.
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
    // 'informal' = pseudo-fuente: ambas informales reales; la vigente se
    // resuelve server-side (informal_latest) con la MISMA regla de la vista.
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

    // Filtro por fecha (últimos N días) — anclado a la FECHA OPERATIVA
    // (civil de Cuba): la ventana de vigencia es cubana, no UTC.
    const operativeDate = getOperativeDate();
    const cutoff = addDaysToDateString(operativeDate, -days);
    query = query.gte('rate_date', cutoff);

    query = query.order('rate_date', { ascending: true });

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // FIX-CARRY-FORWARD: si la fecha operativa no tiene tasa para alguna
    // combinación source/currency/segment, buscar el último valor disponible
    // y crear un registro virtual carry-forward para que la UI no muestre
    // brincos. La fila virtual CONSERVA el captured_at original: su frescura
    // es la del dato real del que deriva (jamás «ahora») — así no desplaza a
    // capturas reales más frescas en los ordenamientos por captured_at.
    const currencies = currency ? [currency] : CURRENCIES;
    const segments = [segment];

    const carryForwardRecords: any[] = [];

    for (const src of sources) {
      for (const cur of currencies) {
        for (const seg of segments) {
          // Verificar si ya existe un registro para la fecha operativa
          const hasOperative = data?.some(
            (r: any) => r.rate_date === operativeDate && r.source === src && r.currency === cur && r.segment === seg
          );

          if (!hasOperative) {
            // Buscar el último valor real disponible ANTES de (o en) la
            // fecha operativa. Las filas con rate_date FUTURO (legado del bug
            // UTC anterior a IC-DIVIZA-002) no se arrastran hacia atrás: se
            // devuelven como filas reales tal cual, sin duplicar el punto.
            const lastReal = data
              ?.filter(
                (r: any) =>
                  r.source === src &&
                  r.currency === cur &&
                  r.segment === seg &&
                  r.rate_date <= operativeDate
              )
              .sort((a: any, b: any) => {
                if (a.rate_date !== b.rate_date) return b.rate_date.localeCompare(a.rate_date);
                return (b.captured_at || '').localeCompare(a.captured_at || '');
              })[0];

            if (lastReal) {
              // Crear registro carry-forward virtual — captured_at ORIGINAL
              // conservado (frescura del dato real, no del momento de consulta).
              carryForwardRecords.push({
                ...lastReal,
                rate_date: operativeDate,
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
    // proveedores informales, se resuelve explícitamente la vigente para que
    // el consumidor no tenga que duplicar la regla.
    //
    // REGLA (IC-DIVIZA-002, misión §5): la vigente = el registro REAL más
    // reciente (capture_method !== 'carry_forward'), PRIORIZANDO la fecha
    // operativa y luego la frescura de la captura (rate_date DESC,
    // captured_at DESC). Las filas virtuales de una fuente muerta (elToque
    // congelado desde 2026-07-28) NO desplazan a una captura Diviza real —
    // una virtual es una copia presentacional de un dato viejo, no un dato
    // más fresco. Las filas FUTURAS legado del bug UTC tampoco ganan a la
    // fila de la fecha operativa. Misma regla exacta en la vista.
    let informalLatest: Record<string, any> | undefined;
    if (sourceParam === 'informal' && currency) {
      const informalRows = allRates
        .filter(
          (r: any) =>
            INFORMAL_SOURCES.includes(r.source) &&
            r.currency === currency &&
            r.capture_method !== 'carry_forward',
        )
        .sort(byOperativeDateFirstThenFreshness(operativeDate));
      const latest = informalRows[0];
      if (latest) {
        informalLatest = {
          rate: latest.rate,
          rate_date: latest.rate_date,
          source: latest.source,
          capture_method: latest.capture_method,
          captured_at: latest.captured_at,
          source_updated_at: latest.source_updated_at ?? null,
        };
      }
    }

    return NextResponse.json({
      rates: allRates,
      count: allRates.length,
      sources_queried: sources,
      // Fecha operativa (civil de Cuba) que gobierna vigencia y carry-forward.
      // El cliente la usa como única fuente de verdad para etiquetas de
      // antigüedad (misión §3: sin divergencias cliente/servidor).
      operative_date: operativeDate,
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
