import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { createCheckoutSession, createCustomer } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'enterprise']),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, email')
    .eq('id', session.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, stripe_customer_id, owner_id')
    .eq('id', profile.tenant_id)
    .single();

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  if (tenant.owner_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only tenant owner can upgrade plan' }, { status: 403 });
  }

  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    customerId = await createCustomer(profile.email, tenant.id);
    if (customerId) {
      await supabaseAdmin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', tenant.id);
    }
  }

  const origin = req.headers.get('origin') || 'http://localhost:3000';
  const result = await createCheckoutSession(
    customerId || undefined,
    tenant.id,
    parsed.data.plan,
    `${origin}/settings/billing?status=success`,
    `${origin}/settings/billing?status=cancelled`
  );

  if (!result) {
    return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 503 });
  }

  logger.info('BILLING', 'CHECKOUT_SESSION_CREATED', { tenantId: tenant.id, plan: parsed.data.plan });
  return NextResponse.json({ url: result.url });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/billing/checkout'
);
