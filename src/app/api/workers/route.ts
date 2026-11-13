import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';
import { parseCI, getBirthDateFromCI } from '@/lib/parse-ci';
import { withSecurity } from '@/lib/with-security';
import { isAdminLevel } from '@/lib/roles';

/**
 * GET /api/workers?store_id=...&status=...&q=...&include_rate=1&period_start=...&period_end=...
 *
 * Lista trabajadores de una tienda (filtrado por store_id obligatorio).
 *
 * NÓMINAS SC-4-06 (selector de trabajadores, 2026-11-13):
 *   - q           → búsqueda dinámica insensible a mayúsculas y ACENTOS sobre
 *                   nombre, apellidos, CI y expediente laboral (normalización
 *                   NFD — "josé" encuentra "José", "PEREZ" encuentra "Pérez").
 *   - period_start/period_end → cuando include_rate=1, la tarifa VIGENTE se
 *                   evalúa contra el PERÍODO de la nómina con la MISMA regla
 *                   del motor fn_payroll_validate_items (valid_from <= fin Y
 *                   (valid_to IS NULL OR valid_to >= inicio)), no contra el
 *                   día de hoy. Sin período, se evalúa contra hoy (compat.).
 *   - La respuesta expone rate_valid_from/rate_valid_to para que la UI pueda
 *     EXPLICAR la inelegibilidad (tarifa vencida / aún no vigente) sin
 *     ocultar al trabajador.
 */
function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const status = searchParams.get('status');
  const q = searchParams.get('q');
  // NÓMINAS SC-4-06: incluye la tarifa salarial VIGENTE por trabajador
  // (merge en JS — RLS de worker_salary_rates filtra por tienda del usuario).
  const includeRate = searchParams.get('include_rate') === '1';
  const periodStart = searchParams.get('period_start');
  const periodEnd = searchParams.get('period_end');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('workers')
    .select('*')
    .eq('store_id', storeId)
    .order('first_name', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let out = data || [];

  // Búsqueda dinámica (q): insensible a mayúsculas y acentos sobre nombre,
  // apellidos, CI y expediente. Filtrado EN JS — la consulta ya vino acotada
  // por tienda (RLS) y el volumen por tienda es operativo (decenas-cientos).
  if (q && q.trim()) {
    const needle = normalizeSearch(q);
    out = out.filter((w: Record<string, unknown>) => {
      const hay = normalizeSearch(
        `${String(w.first_name ?? '')} ${String(w.last_name ?? '')} ${String(w.ci ?? '')} ${String(w.expediente_laboral ?? '')}`,
      );
      return needle.split(/\s+/).every((token) => hay.includes(token));
    });
  }

  if (includeRate && out.length) {
    // Referencia de vigencia: MISMA regla que fn_payroll_validate_items —
    // con período, la tarifa aplicable al PERÍODO; sin período, hoy.
    const today = new Date().toISOString().slice(0, 10);
    const refEnd = periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : today;
    const refStart = periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart) ? periodStart : refEnd;
    const { data: rates } = await supabase
      .from('worker_salary_rates')
      .select('worker_id, rate_type, rate_amount, currency, valid_from, valid_to')
      .eq('store_id', storeId)
      .order('valid_from', { ascending: false });
    // Vigente para el período: valid_from <= refEnd AND (valid_to IS NULL OR valid_to >= refStart)
    const byWorker = new Map<string, { rate_type: string; rate_amount: number; currency: string; valid_from: string; valid_to: string | null }>();
    const withAnyRate = new Set<string>();
    for (const r of rates ?? []) {
      withAnyRate.add(r.worker_id);
      if (r.valid_from > refEnd) continue;
      if (r.valid_to !== null && r.valid_to < refStart) continue;
      if (!byWorker.has(r.worker_id)) {
        byWorker.set(r.worker_id, {
          rate_type: r.rate_type,
          rate_amount: Number(r.rate_amount),
          currency: r.currency,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
        });
      }
    }
    out = out.map((w: Record<string, unknown>) => {
      const rate = byWorker.get(String(w.id));
      return {
        ...w,
        rate_type: rate?.rate_type ?? null,
        rate_amount: rate?.rate_amount ?? null,
        rate_currency: rate?.currency ?? null,
        rate_valid_from: rate?.valid_from ?? null,
        rate_valid_to: rate?.valid_to ?? null,
        // El selector distingue «sin tarifa configurada» de «tarifa no
        // vigente para el período»: el trabajador no se oculta en ningún caso.
        has_any_rate: withAnyRate.has(String(w.id)),
      };
    });
  }

  // FIX TRABAJADORES↔NÓMINAS (2026-11-13): alias `worker_id` = `id` en la
  // respuesta. El selector de nóminas (y cualquier consumidor del dominio)
  // referencia a los trabajadores por worker_id; la tabla expone `id`.
  // Sin este alias, el <select> original del editor de nóminas recibía
  // worker_id=undefined para TODOS los trabajadores → options sin value →
  // era imposible incorporar a nadie (causa raíz nº2 del caso Dup Test).
  out = (out as Array<Record<string, unknown>>).map((w) => ({
    ...w,
    worker_id: String(w.id),
  }));

  return NextResponse.json({ workers: out, count: out.length });
}

/**
 * POST /api/workers
 * Body: { store_id, first_name, last_name, ci, gender?, address?, province?, ... }
 *
 * Valida CI cubano y deriva birth_date automáticamente.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();

  // REM-COSTPRO4-CI: contrato del body con Zod (tipos conocidos; la
  // requeridad y el formato del CI los aplican los checks de abajo con
  // mensajes específicos).
  const WorkerCreateSchema = z.object({
    store_id: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    ci: z.string().optional(),
    gender: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    province: z.string().nullable().optional(),
    municipality: z.string().nullable().optional(),
    shirt_size: z.string().nullable().optional(),
    shoe_size: z.string().nullable().optional(),
    waist_size: z.string().nullable().optional(),
  }).passthrough();
  const parsedBody = WorkerCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }

  const { store_id, first_name, last_name, ci, gender, address, province, municipality, shirt_size, shoe_size, waist_size } = body;

  // FIX-WORKER-NO-NAME (2026-07-13): trim() antes de validar para rechazar
  // nombres con solo espacios ("   "). Antes, `!first_name` solo verificaba
  // null/undefined/empty-string, pero NO rechazaba "   " → creaba trabajadores
  // sin nombre real (bug reportado por el usuario).
  const trimmedFirstName = typeof first_name === 'string' ? first_name.trim() : '';
  const trimmedLastName = typeof last_name === 'string' ? last_name.trim() : '';

  // Validaciones
  if (!store_id || !trimmedFirstName || !trimmedLastName || !ci) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, first_name, last_name, ci (no pueden ser solo espacios)' },
      { status: 400 },
    );
  }

  if (!isAdminLevel(session.user.role) && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  // Validar CI cubano
  const parsedCI = parseCI(ci);
  if (!parsedCI.isValid) {
    return NextResponse.json(
      { error: `CI inválido: ${parsedCI.error}` },
      { status: 400 },
    );
  }

  // Derivar birth_date del CI
  const birthDate = getBirthDateFromCI(ci);

  // Verificar que el usuario tiene acceso a la tienda
  const hasStoreAccess = session.user.memberships?.some(
    (m: any) => m.store_id === store_id && m.status === 'active'
  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  ) || isAdminLevel(session.user.role);

  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Sin acceso a esta tienda' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase
    .from('workers')
    .insert({
      store_id,
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      ci: String(ci).trim(),
      gender: gender || null,
      birth_date: birthDate,
      address: address || null,
      province: province || null,
      municipality: municipality || null,
      shirt_size: shirt_size || null,
      shoe_size: shoe_size || null,
      waist_size: waist_size || null,
      // FIX: created_by null si no es UUID válido (dev-bypass usa 'dev-admin-001')
      created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Ya existe un trabajador con CI ${ci} en esta tienda` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ worker: data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'workers:post',
  maxRequests: 10,
}));
