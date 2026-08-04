import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, owner_id, plan, subscription_status, stripe_customer_id, custom_domain, branding, is_active, trial_ends_at, created_at')
    .eq('id', profile.tenant_id)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, tenant });
}

const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  custom_domain: z.string().url().optional().nullable(),
  branding: z.object({
    logo_url: z.string().url().optional().nullable(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    font_family: z.string().optional(),
  }).optional(),
});

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('owner_id')
    .eq('id', profile.tenant_id)
    .single();

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // Only owner or admin can update
  if (tenant.owner_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only tenant owner can update' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', profile.tenant_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/tenants/[id]'
);

export const PATCH = withTracing(
  withAuth(patchHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'PATCH /api/tenants/[id]'
);
