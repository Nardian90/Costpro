import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { isAdminLevel } from '@/lib/roles';
import { captureInformalToday } from '@/lib/exchange-capture';
import { logger } from '@/lib/logger';

/**
 * POST /api/exchange-rates/scrape-diviza
 *
 * Captura la tasa informal de HOY desde el proveedor activo (Diviza —
 * cubadivisas.com) y la persiste con source='Diviza', capture_method='real',
 * segment='3' (MIPYMES).
 *
 * UNIFICACIÓN (misión 2026-10-26): este endpoint llama a
 * `captureInformalToday()` — la MISMA lógica compartida que usa el cron
 * (scripts/cron/exchange-rates-capture.ts vía captureForDate) y el proxy
 * /api/exchange-rates/refresh. No hay una segunda implementación de captura.
 *
 * Reemplaza a /api/exchange-rates/scrape-soluciones (solucionescuba.com CAÍDO:
 * el dominio sirve un panel de hosting con TLS de otro nombre; la última tasa
 * informal real guardada era del 2026-07-28).
 *
 * Respuesta con estados diferenciados:
 *   200: { success, captured, rates: {usd, eur, mlc}, sourceUpdatedAt, message }
 *        — eur/mlc null cuando Diviza no los publicó (nunca fabricados).
 *   502: { error, hint } — Diviza no devolvió cotización válida (red/HTTP/parseo).
 *   500: { error } — configuración Supabase o fallo total de persistencia.
 *
 * Auth: solo admin (withAuth + isAdminLevel; defense in depth con la UI).
 * Server-side: las credenciales (service key) nunca llegan al navegador.
 */
export const maxDuration = 30; // 1 fetch a Diviza + hasta 3 upserts

async function postHandler(_req: Request, session: AuthenticatedSession) {
  // Solo admin puede disparar la captura manual del proveedor
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json(
      { error: 'Forbidden — solo admin puede capturar la tasa del proveedor' },
      { status: 403 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    logger.error('DATABASE', 'EXCHANGE_RATES_DIVIZA_CONFIG_MISSING', {});
    return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });
  }

  // 1. Captura informal compartida (mismo adaptador que el cron)
  const result = await captureInformalToday(supabaseUrl, serviceKey);

  // 2. Sin cotización válida → 502 con mensaje claro (NO éxito falso).
  //    El histórico ya almacenado NO se toca: el carry-forward de la capa de
  //    consulta sigue entregando el último valor real con su fecha.
  if (!result.provider || result.captured.length === 0) {
    logger.warn('DATABASE', 'EXCHANGE_RATES_DIVIZA_CAPTURE_FAILED', {
      errors: result.errors,
      triggered_by: session.user.id,
    });
    return NextResponse.json(
      {
        error:
          'Diviza no devolvió una cotización válida (error de conexión o de extracción). ' +
          'No se guardó ningún valor: se conserva la última tasa real con su fecha.',
        hint: 'Reintenta en unos minutos o carga la tasa por Excel. El histórico ya almacenado sigue disponible.',
        errors: result.errors,
      },
      { status: 502 },
    );
  }

  const usd = result.captured.find(c => c.currency === 'USD')?.rate ?? null;
  const eur = result.captured.find(c => c.currency === 'EUR')?.rate ?? null;
  const mlc = result.captured.find(c => c.currency === 'MLC')?.rate ?? null;

  logger.info('DATABASE', 'EXCHANGE_RATES_DIVIZA_SAVED', {
    saved: result.captured.length,
    errors: result.errors.length,
    rates: { usd, eur, mlc },
    source_updated_at: result.sourceUpdatedAt,
    triggered_by: session.user.id,
  });

  const currenciesSaved = result.captured.map(c => c.currency).join(', ');
  return NextResponse.json({
    success: true,
    provider: 'Diviza',
    sourceUrl: 'https://cubadivisas.com/',
    captured: result.captured.length,
    rates: { usd, eur, mlc },
    // Momento en que DIVIZA actualizó la cotización (distinto de la captura)
    sourceUpdatedAt: result.sourceUpdatedAt,
    capturedAt: new Date().toISOString(),
    errors: result.errors.length > 0 ? result.errors : undefined,
    message:
      `Tasa informal capturada de Diviza (cubadivisas.com): ` +
      `USD${usd != null ? '=' + usd : ' sin cambio'}` +
      `${eur != null ? `, EUR=${eur}` : ''}` +
      `${mlc != null ? `, MLC=${mlc}` : ''} — guardadas: ${currenciesSaved}`,
  });
}

export const POST = withAuth(postHandler);
