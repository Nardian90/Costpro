import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { createCustomerPortalSession } from '@/lib/billing/stripe';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('tenant_id').eq('id', session.user.id).single();
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant found' }, { status: 404 });

  const { data: tenant } = await supabaseAdmin.from('tenants').select('stripe_customer_id, owner_id').eq('id', profile.tenant_id).single();
  if (!tenant?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });

  if (tenant.owner_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only tenant owner can manage billing' }, { status: 403 });
  }

  const origin = req.headers.get('origin') || 'http://localhost:3000';
  const result = await createCustomerPortalSession(tenant.stripe_customer_id, `${origin}/settings/billing`);
  if (!result) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  return NextResponse.json({ url: result.url });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/billing/portal'
);
