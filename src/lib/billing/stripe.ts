/**
 * Iteración 13 — Stripe integration helper.
 *
 * NOTE: Stripe SDK is installed lazily. If STRIPE_SECRET_KEY is not set,
 * functions return null and the system falls back to manual plan management.
 *
 * To activate: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env
 * Then: bun add stripe
 */

import { logger } from '@/lib/logger';

let stripeInstance: any = null;

async function getStripe() {
  if (stripeInstance) return stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    logger.warn('BILLING', 'STRIPE_NOT_CONFIGURED', { message: 'STRIPE_SECRET_KEY not set — billing disabled' });
    return null;
  }

  try {
    // Dynamic import — stripe SDK is optional. If not installed, billing disabled.
    const Stripe = (await import('stripe')).default;
    stripeInstance = new Stripe(secretKey, { apiVersion: '2024-06-20' as any });
    return stripeInstance;
  } catch (err) {
    logger.warn('BILLING', 'STRIPE_SDK_NOT_INSTALLED', { message: 'Run: bun add stripe. Billing disabled until then.' });
    return null;
  }
}

export const PLAN_PRICES: Record<string, { priceId: string; amount: number }> = {
  pro: { priceId: process.env.STRIPE_PRICE_PRO || '', amount: 2900 }, // $29/mo
  enterprise: { priceId: process.env.STRIPE_PRICE_ENTERPRISE || '', amount: 9900 }, // $99/mo
};

export async function createCheckoutSession(
  customerId: string | undefined,
  tenantId: string,
  plan: 'pro' | 'enterprise',
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string } | null> {
  const stripe = await getStripe();
  if (!stripe) return null;

  const price = PLAN_PRICES[plan];
  if (!price?.priceId) {
    logger.error('BILLING', 'STRIPE_PRICE_NOT_CONFIGURED', { plan });
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId || undefined,
      customer_email: undefined, // Will be set from customer
      line_items: [{ price: price.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenant_id: tenantId, plan },
    });

    return { url: session.url };
  } catch (err) {
    logger.error('BILLING', 'STRIPE_CHECKOUT_FAILED', { error: String(err) });
    return null;
  }
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
): Promise<{ url: string } | null> {
  const stripe = await getStripe();
  if (!stripe) return null;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  } catch (err) {
    logger.error('BILLING', 'STRIPE_PORTAL_FAILED', { error: String(err) });
    return null;
  }
}

export async function createCustomer(email: string, tenantId: string): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe) return null;

  try {
    const customer = await stripe.customers.create({
      email,
      metadata: { tenant_id: tenantId },
    });
    return customer.id;
  } catch (err) {
    logger.error('BILLING', 'STRIPE_CREATE_CUSTOMER_FAILED', { error: String(err) });
    return null;
  }
}

export function verifyWebhookSignature(payload: string, signature: string): any | null {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('BILLING', 'WEBHOOK_SECRET_NOT_SET', {});
    return null;
  }

  try {
    // Dynamic require — stripe SDK is optional
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    const stripe = require('stripe')(secretKey);
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.error('BILLING', 'WEBHOOK_SIGNATURE_INVALID', { error: String(err) });
    return null;
  }
}
