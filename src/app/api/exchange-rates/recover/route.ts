import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { isAdminLevel } from '@/lib/roles';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getOperativeDate, addDaysToDateString } from '@/lib/operative-date';
import {
  buildRecoveryPlan,
  parseCubaClaraJson,
  validatePlanSafety,
  CUBA_CLARA_SERIES_URL,
  CUBA_CLARA_CITATION,
  type RecoveryPlan,
  type ParsedCubaClara,
} from '@/lib/fx-recovery';

/**
 * CP-FX-001 — Recuperación histórica de la serie informal USD (admin only).
 *
 * POST /api/exchange-rates/recover
 *   Body JSON: { "apply": boolean }   (default false = DRY-RUN, sin escritura)
 *
 * Flujo (misión CP-FX-001 FASE 3/4/6/7):
 *   1. Descarga la serie pública «Dólar en la calle (Cuba Clara)»
 *      (cubaclara.org, CC BY 4.0) — única fuente recuperable verificada
 *      para la zona muerta 2026-07-29 → 2026-10-24 (elTOQUE exige token
 *      por solicitud: limitación documentada en el INFORME de la misión).
 *   2. Lee las filas informales existentes de exchange_rates.
 *   3. Construye el plan con la jerarquía de recuperación (fx-recovery.ts):
 *      recuperadas (Cuba Clara real) → estimadas (interpolación lineal
 *      identificada) → arrastre (ya existente en la capa de consulta).
 *   4. Guardas fail-closed (validatePlanSafety): nada toca observaciones
 *      reales, nada se crea ≥ fecha operativa.
 *   5. apply=false → devuelve el plan (simulación, misión §7.2/§7.3).
 *      apply=true → upserts idempotentes por clave natural
 *      (rate_date,currency,source,segment) en lotes + verificación final.
 *
 * IDEMPOTENCIA (misión §6): re-ejecutar con apply=true produce los mismos
 * valores (mismas anclas) sin duplicar filas; las filas previas del MISMO
 * mecanismo se refrescan. La reversión quirúrgica usa import_batch.
 *
 * NOTA DE CANAL: la carga inicial histórica se ejecutó por el canal gobernado
 * scripts/fx-apply-recovery.mjs (respaldo previo + doble guard de producción).
 * Esta ruta queda como mecanismo de MANTENIMIENTO idempotente re-ejecutable.
 */

const CUBA_CLARA_JSON_URL = 'https://cubaclara.org/datos/dolar-cuba-clara.json';
const CUBA_CLARA_TIMEOUT_MS = 20_000;
const UPSERT_BATCH_SIZE = 100;

// CP-TS-SEC: contrato del body con Zod (mismo patrón que bulk-upload).
// Solo se permite { apply?: boolean } — nada más, nada menos.
const RecoverBodySchema = z.object({ apply: z.boolean().optional() }).strict();

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminSafe>>;

async function fetchCubaClara(): Promise<{ parsed: ParsedCubaClara | null; error: string | null }> {
  try {
    const res = await fetch(CUBA_CLARA_JSON_URL, {
      signal: AbortSignal.timeout(CUBA_CLARA_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'Accept-Language': 'es-CU,es;q=0.9' },
    });
    if (!res.ok) return { parsed: null, error: `Cuba Clara HTTP ${res.status}` };
    const raw = await res.json();
    const parsed = parseCubaClaraJson(raw);
    if (parsed.rows.length === 0) {
      return { parsed, error: 'Cuba Clara: serie sin filas utilizables (fuente atrasada o vacía)' };
    }
    return { parsed, error: null };
  } catch (e: unknown) {
    return { parsed: null, error: `Cuba Clara: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function loadExistingInformalRows(admin: AdminClient): Promise<{
  rows: Array<Record<string, unknown>>;
  error: string | null;
}> {
  // Paginación PostgREST (1000 filas por página) — solo fuentes informales.
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from('exchange_rates')
      .select('rate_date,currency,source,segment,rate,capture_method')
      .neq('source', 'BCC')
      .order('rate_date', { ascending: true })
      .range(offset, offset + 999);
    if (error) return { rows: [], error: error.message };
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    all.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return { rows: all, error: null };
}

async function applyPlan(
  admin: AdminClient,
  plan: RecoveryPlan,
): Promise<{ applied: number; errors: string[] }> {
  let applied = 0;
  const errors: string[] = [];
  const payload = plan.entries.map(e => ({
    rate_date: e.rate_date,
    captured_at: e.imported_at,
    currency: e.currency,
    source: e.source,
    segment: e.segment,
    rate: e.rate,
    capture_method: e.capture_method,
    rate_source_url: e.rate_source_url,
    reconstruction_method: e.reconstruction_method,
    confidence_level: e.confidence_level,
    notes: e.notes,
    imported_at: e.imported_at,
    import_batch: e.import_batch,
  }));
  for (let i = 0; i < payload.length; i += UPSERT_BATCH_SIZE) {
    const batch = payload.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await admin
      .from('exchange_rates')
      .upsert(batch, { onConflict: 'rate_date,currency,source,segment' });
    if (error) {
      errors.push(`lote ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      applied += batch.length;
    }
  }
  return { applied, errors };
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // 1) Solo admin (defense in depth: el cliente ya oculta la acción).
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — solo admin puede ejecutar la recuperación' }, { status: 403 });
  }
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'CONFIG_ERROR — Supabase service role no configurado' }, { status: 500 });
  }

  let apply = false;
  try {
    const rawBody: unknown = await req.json();
    const parsedBody = RecoverBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Body inválido — se espera { "apply": boolean }',
          issues: parsedBody.error.issues.slice(0, 5).map(i => i.message),
        },
        { status: 400 },
      );
    }
    apply = parsedBody.data.apply === true;
  } catch {
    apply = false; // sin body → dry-run
  }

  try {
    const operativeDate = getOperativeDate();
    // 2) Fuente recuperable (Cuba Clara). Fallo honesto: sin fuente no hay plan.
    const { parsed: cubaClara, error: cubaError } = await fetchCubaClara();
    // 3) Filas existentes (pueden fallar independientemente de la fuente).
    const { rows: existingRows, error: rowsError } = await loadExistingInformalRows(admin);
    if (rowsError) {
      return NextResponse.json({ error: `exchange_rates: ${rowsError}` }, { status: 500 });
    }

    if (!cubaClara) {
      return NextResponse.json(
        {
          error: cubaError ?? 'Fuente Cuba Clara no disponible',
          hint: 'La recuperación requiere la serie pública de Cuba Clara (CC BY 4.0). Reintente más tarde; el arrastre y las estimaciones previas permanecen intactos.',
        },
        { status: 502 },
      );
    }

    // 4) Rango a procesar: primer dato informal real → día anterior al operativo.
    const realDates = existingRows
      .filter(r => (r.capture_method ?? '') === 'real')
      .map(r => String(r.rate_date))
      .sort();
    const rangeFrom = realDates[0] ?? addDaysToDateString(operativeDate, -30);
    const rangeTo = addDaysToDateString(operativeDate, -1);

    const plan = buildRecoveryPlan({
      existingRows: existingRows as unknown as Parameters<typeof buildRecoveryPlan>[0]['existingRows'],
      cubaClara,
      rangeFrom,
      rangeTo,
      operativeDate,
      importBatch: `CP-FX-001-${operativeDate.replace(/-/g, '')}`,
      importedAt: new Date().toISOString(),
    });

    // 5) Guardas fail-closed antes de cualquier escritura.
    const violations = validatePlanSafety(plan, operativeDate);
    if (violations.length > 0) {
      logger.error('DATABASE', 'FX_RECOVERY_PLAN_UNSAFE', { violations: violations.slice(0, 10) });
      return NextResponse.json(
        { error: 'Plan de recuperación inseguro — escritura bloqueada', violations: violations.slice(0, 20) },
        { status: 422 },
      );
    }

    const summary = {
      source: {
        name: 'Cuba Clara — Dólar en la calle',
        url: CUBA_CLARA_SERIES_URL,
        citation: CUBA_CLARA_CITATION,
        version: plan.cubaClara.version,
        license: plan.cubaClara.license,
        usableRows: plan.cubaClara.usableRows,
      },
      range: plan.range,
      operative_date: operativeDate,
      recovered: plan.recoveredDates.length,
      estimated: plan.estimatedDates.length,
      protected_real: plan.protectedRealDates.length,
      unrecoverable: plan.unrecoverableDates.length,
      classification: plan.classification,
      confidenceBreakdown: plan.entries.reduce<Record<string, number>>((acc, e) => {
        if (e.category === 'estimada' && e.confidence_level) {
          acc[e.confidence_level] = (acc[e.confidence_level] ?? 0) + 1;
        }
        return acc;
      }, {}),
      sampleRecovered: plan.entries.filter(e => e.category === 'recuperada').slice(0, 5),
      sampleEstimated: plan.entries.filter(e => e.category === 'estimada').slice(0, 5),
      unrecoverableDates: plan.unrecoverableDates.slice(0, 20),
    };

    if (!apply) {
      // DRY-RUN (misión §7.2): simulación sin escritura.
      logger.info('DATABASE', 'FX_RECOVERY_DRY_RUN', {
        recovered: summary.recovered,
        estimated: summary.estimated,
        protected_real: summary.protected_real,
      });
      return NextResponse.json({ dry_run: true, would_apply: plan.entries.length, ...summary });
    }

    // 6) APPLY idempotente.
    const { applied, errors } = await applyPlan(admin, plan);
    if (errors.length > 0) {
      logger.error('DATABASE', 'FX_RECOVERY_APPLY_PARTIAL', { applied, errors: errors.slice(0, 5) });
      return NextResponse.json(
        { error: 'Aplicación parcial — revise los errores', applied, errors: errors.slice(0, 10), ...summary },
        { status: 500 },
      );
    }

    logger.info('DATABASE', 'FX_RECOVERY_APPLY_OK', {
      applied,
      recovered: summary.recovered,
      estimated: summary.estimated,
      triggered_by: session.user.id,
    });
    return NextResponse.json({ dry_run: false, applied, ...summary });
  } catch (error: unknown) {
    logger.error('DATABASE', 'FX_RECOVERY_FATAL', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export const POST = withAuth(postHandler);
