import { NextRequest, NextResponse } from 'next/server';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyWebhookSignature } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';

async function postHandler(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  const event = verifyWebhookSignature(body, signature);
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const eventId = event.id;
  const { data: existingLog } = await supabaseAdmin
    .from('audit_logs')
    .select('id')
    .filter('metadata->>stripe_event_id', 'eq', eventId)
    .limit(1);

  if (existingLog && existingLog.length > 0) {
    logger.info('BILLING', 'WEBHOOK_ALREADY_PROCESSED', { eventId });
    return NextResponse.json({ received: true, duplicate: true });
  }

  logger.info('BILLING', 'WEBHOOK_RECEIVED', { eventId, type: event.type });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan;
        const customerId = session.customer;
        if (tenantId && plan) {
          await supabaseAdmin.rpc('managed_update_tenant_plan', {
            p_tenant_id: tenantId, p_plan: plan, p_subscription_status: 'active', p_caller_id: null,
          });
          if (customerId) {
            await supabaseAdmin.from('tenants').update({ stripe_customer_id: customerId }).eq('id', tenantId);
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const { data: tenant } = await supabaseAdmin.from('tenants').select('id, plan').eq('stripe_customer_id', customerId).single();
        if (tenant) {
          const newStatus = subscription.status === 'active' ? 'active' : subscription.status === 'past_due' ? 'past_due' : 'cancelled';
          await supabaseAdmin.rpc('managed_update_tenant_plan', {
            p_tenant_id: tenant.id, p_plan: tenant.plan, p_subscription_status: newStatus, p_caller_id: null,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const { data: tenant } = await supabaseAdmin.from('tenants').select('id').eq('stripe_customer_id', subscription.customer).single();
        if (tenant) {
          await supabaseAdmin.rpc('managed_update_tenant_plan', {
            p_tenant_id: tenant.id, p_plan: 'free', p_subscription_status: 'cancelled', p_caller_id: null,
          });
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const { data: tenant } = await supabaseAdmin.from('tenants').select('id, plan').eq('stripe_customer_id', invoice.customer).single();
        if (tenant) {
          await supabaseAdmin.rpc('managed_update_tenant_plan', {
            p_tenant_id: tenant.id, p_plan: tenant.plan, p_subscription_status: 'active', p_caller_id: null,
          });
        }
        break;
      }
      default:
        logger.info('BILLING', 'WEBHOOK_EVENT_UNHANDLED', { type: event.type });
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'STRIPE_WEBHOOK',
      table_name: 'tenants',
      record_id: event.data?.object?.metadata?.tenant_id || 'unknown',
      metadata: { stripe_event_id: eventId, event_type: event.type, processed_at: new Date().toISOString() },
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error('BILLING', 'WEBHOOK_PROCESSING_FAILED', { eventId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

export const POST = withTracing(postHandler as Parameters<typeof withTracing>[0], 'POST /api/billing/webhook');
