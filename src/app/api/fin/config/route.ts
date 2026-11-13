/**
 * API CP-FIN — Configuración de Documentos.
 *
 * GET  /api/fin/config?store_id=...
 *      Catálogo completo: tipos documentales con estado de configuración
 *      (RPC fin_get_document_types_status), categorías económicas, catálogo
 *      de métricas y versiones de reglas del ámbito (global + tienda).
 *
 * POST /api/fin/config
 *      Crea una versión de regla NUEVA en borrador (status='draft').
 *      La activación es una acción explícita posterior (rule-action).
 *      TRUST BOUNDARY: created_by del JWT; store_id del perfil activo
 *      (o global solo para admin/superadmin de plataforma).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

const conditionSchema = z.object({
  campo: z.string().min(1).max(60),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'existe', 'en']),
  valor: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

const movementTemplateSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  evento: z.enum(['reconocimiento', 'pago']),
  categoria: z.string().min(2).max(40),
  sentido: z.enum(['debito', 'credito']),
  origen: z.union([
    z.object({ tipo: z.literal('metrica'), metrica: z.string().min(2).max(60) }),
    z.object({ tipo: z.literal('constante'), valor: z.number().positive() }),
  ]),
  condicion: z.union([conditionSchema, z.array(conditionSchema).min(1)]).nullable().optional(),
  orden: z.number().int().min(1).max(99).optional(),
});

const createRuleSchema = z.object({
  document_type: z.string().min(2).max(30),
  scope: z.enum(['store', 'global']),
  movements: z.array(movementTemplateSchema).max(40),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const [categories, metrics, rules, doctypes] = await Promise.all([
    supabase
      .from('fin_categories')
      .select('code, name, description, clase, grupo, is_system, is_active, sort_order, store_id')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('fin_metric_catalog')
      .select('document_type, metric, label, unit, for_event')
      .order('document_type'),
    supabase
      .from('fin_rule_versions')
      .select(
        'id, document_type, store_id, version, status, movements, effective_from, notes, '
        + 'created_by, created_at, activated_by, activated_at, deactivated_at',
      )
      .or(`store_id.is.null,store_id.eq.${storeId}`)
      .order('created_at', { ascending: false }),
    supabase.rpc('fin_get_document_types_status', { p_store_id: storeId, p_user_id: session.user.id }),
  ]);

  if (doctypes.error) {
    return NextResponse.json({ error: doctypes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    document_types: doctypes.data ?? [],
    categories: categories.data ?? [],
    metrics: metrics.data ?? [],
    rules: rules.data ?? [],
  });
}

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación fallida', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });
  }

  // TRUST BOUNDARY: scope global solo para admin/superadmin de plataforma.
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('active_store_id, role')
    .eq('id', session.user.id)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Perfil no disponible' }, { status: 400 });
  }
  if (b.scope === 'global' && !['admin', 'superadmin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Solo un administrador de plataforma puede crear reglas globales' },
      { status: 403 },
    );
  }
  if (b.scope === 'store' && !profile.active_store_id) {
    return NextResponse.json({ error: 'Usuario sin tienda activa configurada' }, { status: 400 });
  }
  const ruleStoreId = b.scope === 'store' ? profile.active_store_id : null;

  // Validación estructural temprana (motor, vía service_role).
  const { data: valRaw } = await admin
    .rpc('fin_validate_rule_movements', { p_movements: b.movements })
    .maybeSingle();
  const val = valRaw as { ok?: boolean; errores?: string[] } | null;
  if (val && val.ok === false) {
    return NextResponse.json(
      { error: 'Regla estructuralmente inválida', detalles: val.errores },
      { status: 422 },
    );
  }

  // Siguiente versión del ámbito
  const { data: existing } = await admin
    .from('fin_rule_versions')
    .select('version')
    .eq('document_type', b.document_type)
    .is('store_id', ruleStoreId)
    .order('version', { ascending: false })
    .limit(1);
  const nextVersion = (existing?.[0]?.version ?? 0) + 1;

  const { data: created, error: insertErr } = await admin
    .from('fin_rule_versions')
    .insert({
      document_type: b.document_type,
      store_id: ruleStoreId,
      version: nextVersion,
      status: 'draft',
      movements: b.movements,
      effective_from: b.effective_from ?? new Date().toISOString().slice(0, 10),
      notes: b.notes ?? null,
      created_by: session.user.id,
    })
    .select('id, document_type, store_id, version, status')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  return NextResponse.json({ rule_version: created }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'fin-config:post',
  maxRequests: 20,
}));
