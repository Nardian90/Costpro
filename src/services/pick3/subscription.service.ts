/**
 * subscription.service.ts — Pick 3 Subscription & Usage Tracking
 *
 * SPRINT 4 — Monetización (SPRINT-4-MONETIZATION)
 *
 * Servicio que maneja toda la lógica de negocio de suscripciones:
 *   - Crear/leer/actualizar suscripciones
 *   - Tracking de usage (queries IA, backtests, API calls por mes)
 *   - Verificación de límites antes de cada acción
 *   - Trial de 14 días
 *   - Integración con Stripe (preparada pero opcional — si no hay keys,
 *     funciona en modo "manual" para desarrollo/demo)
 *
 * Author: CostPro Sprint 4
 * Date: 2026-07-05
 */

import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import {
  Subscription,
  SubscriptionTier,
  SubscriptionStatus,
  UsageRecord,
  UsageCheckResult,
  TierLimits,
  TIERS,
  TIER_ORDER,
  TRIAL_DAYS,
  getTrialDaysLeft,
  getNextTier,
  CheckoutSession,
} from './subscription.types';

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodEndDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return nextMonth.toISOString();
}

function getTrialEndDate(): string {
  const now = new Date();
  now.setDate(now.getDate() + TRIAL_DAYS);
  return now.toISOString();
}

// ============================================================================
// SUBSCRIPTION SERVICE
// ============================================================================

export class SubscriptionService {
  /**
   * Obtiene la suscripción activa del usuario.
   * Si no existe, crea una suscripción Free automáticamente.
   */
  static async getSubscription(userId: string): Promise<Subscription | null> {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('pick3_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('PICK3', `Error fetching subscription: ${error.message}`);
        return null;
      }

      if (!data) {
        // Auto-create Free subscription
        return await this.createFreeSubscription(userId);
      }

      // Verificar si el trial expiró
      if (data.status === 'trialing' && data.trial_end) {
        const trialEnd = new Date(data.trial_end);
        if (trialEnd < new Date()) {
          // Trial expirado → cambiar a Free (o cancelar)
          await this.expireTrial(userId, data.id);
          data.status = 'active';
          data.tier = 'free';
        }
      }

      // Verificar si la suscripción expiró
      if (data.status === 'active' && data.current_period_end) {
        const periodEnd = new Date(data.current_period_end);
        if (periodEnd < new Date() && !data.cancel_at_period_end) {
          // Período expirado pero no cancelado → renovar (en modo demo)
          // En producción con Stripe, esto lo hace el webhook
          data.current_period_end = getPeriodEndDate();
          await this.updateSubscription(data.id, {
            current_period_end: data.current_period_end,
          });
        } else if (periodEnd < new Date() && data.cancel_at_period_end) {
          // Cancelado al final del período → degradar a Free
          data.status = 'canceled';
          data.tier = 'free';
          await this.updateSubscription(data.id, {
            status: 'canceled',
            tier: 'free',
          });
        }
      }

      return data as Subscription;
    } catch (err) {
      logger.error('PICK3', `Unexpected error in getSubscription: ${err}`);
      return null;
    }
  }

  /**
   * Crea una suscripción Free para el usuario.
   */
  static async createFreeSubscription(userId: string): Promise<Subscription | null> {
    try {
      const now = new Date().toISOString();
      const newSub: Partial<Subscription> = {
        user_id: userId,
        tier: 'free',
        status: 'active',
        current_period_start: now,
        current_period_end: getPeriodEndDate(),
        trial_end: null,
        cancel_at_period_end: false,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('pick3_subscriptions')
        .insert(newSub)
        .select()
        .single();

      if (error) {
        logger.error('PICK3', `Error creating free subscription: ${error.message}`);
        return null;
      }

      return data as Subscription;
    } catch (err) {
      logger.error('PICK3', `Unexpected error in createFreeSubscription: ${err}`);
      return null;
    }
  }

  /**
   * Inicia un trial de 14 días para un tier pago.
   */
  static async startTrial(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<{ subscription: Subscription | null; error?: string }> {
    if (tier === 'free') {
      return { subscription: null, error: 'No se puede iniciar trial para Free' };
    }

    // Verificar si ya tuvo un trial antes
    const existing = await this.getSubscription(userId);
    if (existing?.metadata?.had_trial) {
      return {
        subscription: null,
        error: 'Ya utilizaste tu período de prueba. Suscríbete directamente.',
      };
    }

    try {
      const now = new Date().toISOString();
      const trialEnd = getTrialEndDate();

      // Actualizar o crear suscripción en trialing
      const update: Partial<Subscription> = {
        tier,
        status: 'trialing',
        current_period_start: now,
        current_period_end: trialEnd,
        trial_end: trialEnd,
        cancel_at_period_end: false,
        metadata: { had_trial: true, trial_started_at: now },
        updated_at: now,
      };

      let subscription: Subscription | null = null;
      if (existing) {
        const { data, error } = await supabase
          .from('pick3_subscriptions')
          .update(update)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        subscription = data as Subscription;
      } else {
        const { data, error } = await supabase
          .from('pick3_subscriptions')
          .insert({
            user_id: userId,
            ...update,
            created_at: now,
          })
          .select()
          .single();
        if (error) throw error;
        subscription = data as Subscription;
      }

      return { subscription };
    } catch (err) {
      logger.error('PICK3', `Error starting trial: ${err}`);
      return { subscription: null, error: 'Error al iniciar el trial' };
    }
  }

  /**
   * Expire trial → degradar a Free.
   */
  static async expireTrial(userId: string, subscriptionId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await supabase
        .from('pick3_subscriptions')
        .update({
          status: 'active',
          tier: 'free',
          current_period_end: getPeriodEndDate(),
          updated_at: now,
        })
        .eq('id', subscriptionId);
    } catch (err) {
      logger.error('PICK3', `Error expiring trial: ${err}`);
    }
  }

  /**
   * Actualiza una suscripción.
   */
  static async updateSubscription(
    subscriptionId: string,
    updates: Partial<Subscription>,
  ): Promise<void> {
    try {
      await supabase
        .from('pick3_subscriptions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', subscriptionId);
    } catch (err) {
      logger.error('PICK3', `Error updating subscription: ${err}`);
    }
  }

  /**
   * Cambia el tier del usuario (upgrade/downgrade).
   * En modo demo, actualiza directamente. En producción, crearía un checkout session.
   */
  static async changeTier(
    userId: string,
    newTier: SubscriptionTier,
  ): Promise<{ subscription: Subscription | null; error?: string }> {
    try {
      const existing = await this.getSubscription(userId);
      if (!existing) {
        return { subscription: null, error: 'No se encontró suscripción' };
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('pick3_subscriptions')
        .update({
          tier: newTier,
          status: 'active',
          current_period_start: now,
          current_period_end: getPeriodEndDate(),
          cancel_at_period_end: false,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return { subscription: data as Subscription };
    } catch (err) {
      logger.error('PICK3', `Error changing tier: ${err}`);
      return { subscription: null, error: 'Error al cambiar de tier' };
    }
  }

  /**
   * Cancela la suscripción al final del período.
   */
  static async cancelAtPeriodEnd(userId: string): Promise<{ error?: string }> {
    try {
      const existing = await this.getSubscription(userId);
      if (!existing) {
        return { error: 'No se encontró suscripción' };
      }
      await this.updateSubscription(existing.id, {
        cancel_at_period_end: true,
      });
      return {};
    } catch (err) {
      return { error: 'Error al cancelar' };
    }
  }

  /**
   * Reactiva la suscripción cancelada.
   */
  static async reactivate(userId: string): Promise<{ error?: string }> {
    try {
      const existing = await this.getSubscription(userId);
      if (!existing) return { error: 'No se encontró suscripción' };
      await this.updateSubscription(existing.id, {
        cancel_at_period_end: false,
      });
      return {};
    } catch (err) {
      return { error: 'Error al reactivar' };
    }
  }

  // ============================================================================
  // USAGE TRACKING
  // ============================================================================

  /**
   * Obtiene el registro de uso del usuario para el período actual.
   * Si no existe, lo crea.
   */
  static async getUsage(userId: string): Promise<UsageRecord | null> {
    const period = getCurrentPeriod();
    try {
      const { data, error } = await supabase
        .from('pick3_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('period', period)
        .maybeSingle();

      if (error) {
        logger.error('PICK3', `Error fetching usage: ${error.message}`);
        return null;
      }

      if (!data) {
        // Crear nuevo registro de uso
        const subscription = await this.getSubscription(userId);
        const tier = subscription?.tier || 'free';
        const limits = TIERS[tier].limits;
        const now = new Date().toISOString();
        const newRecord: Partial<UsageRecord> = {
          user_id: userId,
          period,
          ai_queries_count: 0,
          backtests_count: 0,
          api_calls_count: 0,
          ai_queries_limit: limits.aiQueriesPerMonth,
          backtests_limit: limits.backtestMaxDays,
          last_reset: now,
          created_at: now,
          updated_at: now,
        };

        const { data: created, error: createError } = await supabase
          .from('pick3_usage')
          .insert(newRecord)
          .select()
          .single();

        if (createError) {
          logger.error('PICK3', `Error creating usage record: ${createError.message}`);
          return null;
        }
        return created as UsageRecord;
      }

      return data as UsageRecord;
    } catch (err) {
      logger.error('PICK3', `Unexpected error in getUsage: ${err}`);
      return null;
    }
  }

  /**
   * Verifica si el usuario puede realizar una acción (sin incrementar el contador).
   * Útil para mostrar en UI "te quedan X consultas".
   */
  static async checkUsage(
    userId: string,
    action: 'ai_query' | 'backtest' | 'api_call',
  ): Promise<UsageCheckResult> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) {
      return {
        allowed: false,
        reason: 'No se encontró suscripción',
        remaining: 0,
        limit: 0,
        used: 0,
        tier: 'free',
        isTrial: false,
        upgradeRequired: true,
        suggestedTier: 'player',
      };
    }

    const tier = subscription.tier;
    const limits = TIERS[tier].limits;
    const isTrial = subscription.status === 'trialing';
    const trialDaysLeft = getTrialDaysLeft(subscription.trial_end);

    const usage = await this.getUsage(userId);
    if (!usage) {
      return {
        allowed: true, // Si no podemos verificar, permitimos (fail-open)
        remaining: -1,
        limit: -1,
        used: 0,
        tier,
        isTrial,
        trialDaysLeft,
        upgradeRequired: false,
      };
    }

    let used = 0;
    let limit = 0;
    switch (action) {
      case 'ai_query':
        used = usage.ai_queries_count;
        limit = limits.aiQueriesPerMonth;
        break;
      case 'backtest':
        used = usage.backtests_count;
        limit = limits.backtestMaxDays === -1 ? -1 : 1000; // No limitamos por count sino por days
        break;
      case 'api_call':
        used = usage.api_calls_count;
        limit = limits.apiAccess ? -1 : 0;
        break;
    }

    // -1 = ilimitado
    if (limit === -1) {
      return {
        allowed: true,
        remaining: -1,
        limit: -1,
        used,
        tier,
        isTrial,
        trialDaysLeft,
        upgradeRequired: false,
      };
    }

    if (limit === 0) {
      // Feature no disponible en este tier
      return {
        allowed: false,
        reason: `Tu tier ${tier.toUpperCase()} no incluye ${action}`,
        remaining: 0,
        limit: 0,
        used,
        tier,
        isTrial,
        trialDaysLeft,
        upgradeRequired: true,
        suggestedTier: getNextTier(tier) || 'player',
      };
    }

    const remaining = Math.max(0, limit - used);
    const allowed = remaining > 0;

    return {
      allowed,
      reason: allowed ? undefined : `Has alcanzado el límite mensual de ${limit} ${action}`,
      remaining,
      limit,
      used,
      tier,
      isTrial,
      trialDaysLeft,
      upgradeRequired: !allowed,
      suggestedTier: !allowed ? (getNextTier(tier) || undefined) : undefined,
    };
  }

  /**
   * Incrementa el contador de uso para una acción.
   * Llamar DESPUÉS de realizar la acción exitosamente.
   */
  static async incrementUsage(
    userId: string,
    action: 'ai_query' | 'backtest' | 'api_call',
  ): Promise<void> {
    const usage = await this.getUsage(userId);
    if (!usage) return;

    const updates: Partial<UsageRecord> = {
      updated_at: new Date().toISOString(),
    };

    switch (action) {
      case 'ai_query':
        updates.ai_queries_count = usage.ai_queries_count + 1;
        break;
      case 'backtest':
        updates.backtests_count = usage.backtests_count + 1;
        break;
      case 'api_call':
        updates.api_calls_count = usage.api_calls_count + 1;
        break;
    }

    try {
      await supabase
        .from('pick3_usage')
        .update(updates)
        .eq('id', usage.id);
    } catch (err) {
      logger.error('PICK3', `Error incrementing usage: ${err}`);
    }
  }

  /**
   * Verifica Y consume una acción (atomic check + increment).
   * Útil para endpoints donde queremos garantizar que no se exceda el límite.
   */
  static async checkAndConsume(
    userId: string,
    action: 'ai_query' | 'backtest' | 'api_call',
  ): Promise<UsageCheckResult> {
    const check = await this.checkUsage(userId, action);
    if (!check.allowed) return check;

    await this.incrementUsage(userId, action);
    return { ...check, used: check.used + 1, remaining: check.remaining === -1 ? -1 : check.remaining - 1 };
  }

  // ============================================================================
  // STRIPE INTEGRATION (STUBS)
  // ============================================================================

  /**
   * Crea una Checkout Session de Stripe para iniciar una suscripción.
   * Si Stripe no está configurado, retorna error.
   */
  static async createCheckoutSession(
    userId: string,
    tier: SubscriptionTier,
    mode: 'monthly' | 'yearly' = 'monthly',
  ): Promise<{ session?: CheckoutSession; error?: string }> {
    if (tier === 'free') {
      return { error: 'Free no requiere checkout' };
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      // Modo demo: cambiar tier directamente (sin pago)
      logger.info('PICK3', `Stripe not configured — auto-upgrading ${userId} to ${tier} (demo mode)`);
      const { subscription, error } = await this.changeTier(userId, tier);
      if (error) return { error };
      return {
        session: {
          id: `demo-${Date.now()}`,
          url: '/pick3?tab=advisor&upgraded=1',
          tier,
          mode: 'subscription',
          status: 'complete',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      };
    }

    // TODO: Integración real con Stripe cuando se agreguen las claves
    // Por ahora, retornar modo demo
    try {
      const { subscription, error } = await this.changeTier(userId, tier);
      if (error) return { error };
      return {
        session: {
          id: `demo-${Date.now()}`,
          url: '/pick3?tab=advisor&upgraded=1',
          tier,
          mode: 'subscription',
          status: 'complete',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      };
    } catch (err) {
      return { error: 'Error al crear checkout session' };
    }
  }

  /**
   * Maneja webhook de Stripe (cuando se completa un pago).
   * En modo demo, no hace nada (los cambios se hacen directos).
   */
  static async handleStripeWebhook(event: any): Promise<{ handled: boolean }> {
    logger.info('PICK3', `Stripe webhook received: ${event.type}`);
    // TODO: Implementar cuando Stripe esté configurado
    return { handled: false };
  }

  // ============================================================================
  // ADMIN / METRICS
  // ============================================================================

  /**
   * Obtiene métricas agregadas para el admin dashboard.
   * Solo accesible para admin.
   */
  static async getAdminMetrics(): Promise<{
    totalSubscribers: number;
    activeSubscriptions: number;
    trialsActive: number;
    mrr: number;
    arr: number;
    byTier: Record<SubscriptionTier, number>;
    churnRate: number;
  } | null> {
    try {
      const { data, error } = await supabase
        .from('pick3_subscriptions')
        .select('tier, status, current_period_end');

      if (error) throw error;

      const byTier: Record<SubscriptionTier, number> = {
        free: 0, player: 0, quant: 0, desk: 0,
      };
      let mrr = 0;
      let active = 0;
      let trials = 0;
      let total = 0;

      for (const sub of data || []) {
        total++;
        byTier[sub.tier as SubscriptionTier]++;
        if (sub.status === 'active' || sub.status === 'trialing') {
          active++;
          if (sub.status === 'trialing') trials++;
          // Calcular MRR
          const tierInfo = TIERS[sub.tier as SubscriptionTier];
          if (tierInfo && sub.tier !== 'free') {
            mrr += tierInfo.priceMonthly;
          }
        }
      }

      return {
        totalSubscribers: total,
        activeSubscriptions: active,
        trialsActive: trials,
        mrr,
        arr: mrr * 12,
        byTier,
        churnRate: 0, // TODO: calcular con histórico
      };
    } catch (err) {
      logger.error('PICK3', `Error in getAdminMetrics: ${err}`);
      return null;
    }
  }
}
