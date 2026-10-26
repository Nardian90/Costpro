import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { captureDateRange } from '@/lib/exchange-capture';
// FIX R1: withUsageTracking eliminado — withAuth ya aplica withAutoTracking internamente

/**
 * POST /api/exchange-rates/refresh?days=7
 *
 * FIX C1+C2: Endpoint proxy server-side que el frontend puede llamar
 * sin tocar CRON_SECRET ni SUPABASE_SERVICE_ROLE_KEY.
 *
 * Auth: requiere sesión admin (withAuth + role check).
 * Internamente llama a captureDateRange() (lib compartida con el cron).
 *
 * Query params:
 *   ?days=7  → captura los últimos 7 días (default 7, max 30)
 *
 * IC-DIVIZA-002 (misión §4 — botón «Actualizar BD (7 días)» fiable):
 *   - El intervalo de fechas y el rate_date de HOY usan la FECHA OPERATIVA
 *     (civil de Cuba) — la captura informal de Diviza de la tarde/noche
 *     cubana ya no se fecha «mañana».
 *   - La respuesta distingue EXPLÍCITAMENTE el estado de cada fuente:
 *     bcc {ok, rows, errors} y diviza {ok, rows, rates, source_updated_at,
 *     errors}, más partial (éxito parcial) y operative_date. Un BCC correcto
 *     NUNCA oculta un fallo de Diviza bajo un «Captura completada» genérico.
 *   - Éxito completo (ambas fuentes) → 200 {success:true, partial:false}.
 *     Éxito parcial (una fuente falla) → 200 {success:true, partial:true}
 *     con el estado de cada fuente y sus errores.
 *     Fallo total (ambas fuentes sin filas) → 502 con el desglose — nunca
 *     éxito falso.
 *   - Campos legados (captured_count, details, dates_processed, errors)
 *     conservados para el cron y clientes existentes.
 *
 * Vercel config: maxDuration = 60s (Pro) — suficiente para 30 días
 * con concurrencia 3 (~12s para 30 días).
 */
export const maxDuration = 60;

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // Solo admin puede disparar captura manual
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — solo admin' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Config missing — requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  // Parse ?days=N (default 7, max 30 — limitado para respetar timeout)
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 30);

  const startTime = Date.now();

  try {
    const result = await captureDateRange(days, supabaseUrl, serviceKey, 3);
    const elapsedMs = Date.now() - startTime;

    // Desglose por fuente (misión §4): BCC y Diviza se reportan por
    // separado — el éxito de uno no diluye el fallo del otro.
    const divizaUsd = result.captured.find(
      c => c.date === result.operativeDate && c.source === 'Diviza' && c.currency === 'USD',
    );
    const divizaEur = result.captured.find(
      c => c.date === result.operativeDate && c.source === 'Diviza' && c.currency === 'EUR',
    );
    const divizaMlc = result.captured.find(
      c => c.date === result.operativeDate && c.source === 'Diviza' && c.currency === 'MLC',
    );

    const bccOk = result.bcc.ok;
    const divizaOk = result.diviza.ok;
    const partial = bccOk !== divizaOk;
    const anySuccess = bccOk || divizaOk;

    const payload = {
      // success = el proceso capturó ALGO y completó sin excepción. El
      // detalle por fuente (bcc/diviza/partial) es el estado real.
      success: anySuccess,
      // Éxito parcial: exactamente una fuente falló (misión §4).
      partial,
      // Fecha operativa (civil de Cuba) que gobernó la captura — la misma
      // que usa /api/exchange-rates para vigencia y carry-forward.
      operative_date: result.operativeDate,
      bcc: {
        ok: bccOk,
        rows: result.bcc.rows,
        errors: result.bcc.errors,
      },
      diviza: {
        ok: divizaOk,
        rows: result.diviza.rows,
        attempted: result.diviza.attempted,
        // Tasas vigentes capturadas para la fecha operativa (null si la
        // moneda no se publicó o la captura falló — JAMÁS fabricadas).
        rates: {
          usd: divizaUsd?.rate ?? null,
          eur: divizaEur?.rate ?? null,
          mlc: divizaMlc?.rate ?? null,
        },
        // Hora en que DIVIZA actualizó la cotización (sello del proveedor,
        // ISO con offset de Cuba). null si no se capturó o no la declaró.
        source_updated_at: result.divizaSourceUpdatedAt,
        errors: result.diviza.errors,
      },
      // Campos legados (cron + compatibilidad hacia atrás)
      mode: days === 1 ? 'today' : `backfill-${days}d`,
      dates_processed: result.datesProcessed,
      captured_count: result.captured.length,
      details: result.captured,
      errors: result.errors.length > 0 ? result.errors : undefined,
      elapsed_ms: elapsedMs,
      triggered_by: session.user.id,
    };

    // Fallo total: ambas fuentes sin filas → 502 honesto (éxito NUNCA falso).
    if (!anySuccess) {
      return NextResponse.json(
        {
          ...payload,
          success: false,
          partial: false,
          error:
            'Captura fallida: ni BCC ni Diviza aportaron filas. ' +
            'Revisa la conectividad con api.bc.gob.cu y cubadivisas.com.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(payload);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export const POST = withAuth(postHandler);
