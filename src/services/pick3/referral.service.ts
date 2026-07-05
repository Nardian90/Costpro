/**
 * referral.service.ts — Pick 3 Referral Program Service
 *
 * SPRINT 5 — Growth Engine
 *
 * Author: CostPro Sprint 5
 */

import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { SubscriptionService } from './subscription.service';
import {
  Referral, ReferralStats, ReferralReward,
  REFERRAL_REWARDS, REFERRAL_EXPIRY_DAYS,
  generateReferralCode, isValidReferralCode, getReferralDaysLeft,
} from './referral.types';

export class ReferralService {
  /**
   * Obtiene o crea el código de referral del usuario.
   */
  static async getOrCreateReferralCode(userId: string, userName: string): Promise<string | null> {
    try {
      // Verificar si ya tiene un código
      const { data: existing } = await supabase
        .from('pick3_referrals')
        .select('referral_code')
        .eq('referrer_user_id', userId)
        .limit(1)
        .maybeSingle();

      if (existing?.referral_code) {
        return existing.referral_code;
      }

      // Generar nuevo código
      let code = generateReferralCode(userName, userId);
      // Verificar unicidad
      let attempts = 0;
      while (attempts < 5) {
        const { data: conflict } = await supabase
          .from('pick3_referrals')
          .select('id')
          .eq('referral_code', code)
          .maybeSingle();
        if (!conflict) break;
        code = generateReferralCode(userName, userId + Date.now() + attempts);
        attempts++;
      }

      // Crear registro de referral link (sin referred_user_id aún)
      const now = new Date();
      const expiresAt = new Date(now.getTime() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('pick3_referrals')
        .insert({
          referrer_user_id: userId,
          referral_code: code,
          referred_user_id: null,
          status: 'pending',
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        });

      if (error) {
        logger.error('PICK3', `Error creating referral code: ${error.message}`);
        return null;
      }

      return code;
    } catch (err) {
      logger.error('PICK3', `Unexpected error in getOrCreateReferralCode: ${err}`);
      return null;
    }
  }

  /**
   * Registra un nuevo referral cuando un usuario se registra con un código.
   */
  static async registerReferral(
    referredUserId: string,
    referralCode: string,
  ): Promise<{ success: boolean; error?: string; referral?: Referral }> {
    if (!isValidReferralCode(referralCode)) {
      return { success: false, error: 'Código de referido inválido' };
    }

    try {
      // Buscar el código
      const { data: referral, error } = await supabase
        .from('pick3_referrals')
        .select('*')
        .eq('referral_code', referralCode)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !referral) {
        return { success: false, error: 'Código no encontrado o ya utilizado' };
      }

      // Verificar que no se refiera a sí mismo
      if (referral.referrer_user_id === referredUserId) {
        return { success: false, error: 'No puedes usar tu propio código de referido' };
      }

      // Verificar que no haya expirado
      const daysLeft = getReferralDaysLeft(referral.expires_at);
      if (daysLeft === 0) {
        await supabase
          .from('pick3_referrals')
          .update({ status: 'expired' })
          .eq('id', referral.id);
        return { success: false, error: 'El código de referido ha expirado' };
      }

      // Actualizar el referral con el usuario referido
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('pick3_referrals')
        .update({
          referred_user_id: referredUserId,
          status: 'registered',
          registered_at: now,
        })
        .eq('id', referral.id)
        .select()
        .single();

      if (updateError) {
        return { success: false, error: 'Error al registrar el referido' };
      }

      // Aplicar recompensa al referido (trial extendido)
      await this.applyReward(referredUserId, REFERRAL_REWARDS.REFERRED, 'referred');

      return { success: true, referral: updated as Referral };
    } catch (err) {
      logger.error('PICK3', `Unexpected error in registerReferral: ${err}`);
      return { success: false, error: 'Error inesperado' };
    }
  }

  /**
   * Marca un referral como convertido (cuando el referido paga).
   * Aplica recompensa al referrer.
   */
  static async markAsConverted(
    referredUserId: string,
  ): Promise<{ success: boolean }> {
    try {
      const { data: referral } = await supabase
        .from('pick3_referrals')
        .select('*')
        .eq('referred_user_id', referredUserId)
        .eq('status', 'registered')
        .maybeSingle();

      if (!referral) return { success: false };

      const now = new Date().toISOString();
      await supabase
        .from('pick3_referrals')
        .update({
          status: 'converted',
          converted_at: now,
        })
        .eq('id', referral.id);

      // Aplicar recompensa al referrer (1 mes free Player)
      await this.applyReward(referral.referrer_user_id, REFERRAL_REWARDS.REFERRER, 'referrer');

      // Marcar como recompensado
      await supabase
        .from('pick3_referrals')
        .update({ status: 'rewarded' })
        .eq('id', referral.id);

      return { success: true };
    } catch (err) {
      logger.error('PICK3', `Error in markAsConverted: ${err}`);
      return { success: false };
    }
  }

  /**
   * Aplica una recompensa a un usuario.
   */
  static async applyReward(
    userId: string,
    reward: typeof REFERRAL_REWARDS.REFERRER | typeof REFERRAL_REWARDS.REFERRED,
    role: 'referrer' | 'referred',
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const rewardRecord: ReferralReward = {
        type: reward.type,
        tier: reward.tier,
        duration_days: reward.duration_days,
        value_usd: reward.value_usd,
        applied_at: now,
        is_active: true,
      };

      // Aplicar: cambiar tier del usuario por la duración de la recompensa
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + reward.duration_days);

      const subscription = await SubscriptionService.getSubscription(userId);
      if (subscription) {
        await SubscriptionService.updateSubscription(subscription.id, {
          tier: reward.tier,
          status: 'active',
          current_period_start: now,
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: true, // Al final vuelve a su tier anterior
          metadata: {
            ...subscription.metadata,
            referral_reward: rewardRecord,
            reward_role: role,
          },
        });
      }

      logger.info('PICK3', `Reward applied to ${userId}: ${reward.type} (${reward.duration_days} days, $${reward.value_usd})`);
    } catch (err) {
      logger.error('PICK3', `Error applying reward: ${err}`);
    }
  }

  /**
   * Obtiene estadísticas de referral del usuario.
   */
  static async getReferralStats(userId: string): Promise<ReferralStats | null> {
    try {
      const { data: referrals, error } = await supabase
        .from('pick3_referrals')
        .select('*')
        .eq('referrer_user_id', userId);

      if (error) throw error;

      const all = referrals || [];
      const pending = all.filter(r => r.status === 'pending').length;
      const registered = all.filter(r => r.status === 'registered').length;
      const converted = all.filter(r => r.status === 'converted' || r.status === 'rewarded').length;
      const rewarded = all.filter(r => r.status === 'rewarded').length;

      const totalRewardsValue = converted * REFERRAL_REWARDS.REFERRER.value_usd;
      const estimatedMonthlyRevenue = converted * 19; // Asumiendo tier Player

      return {
        total_referrals: all.length,
        pending,
        registered,
        converted,
        rewarded,
        conversion_rate: all.length > 0 ? (converted / all.length) * 100 : 0,
        total_rewards_value_usd: totalRewardsValue,
        estimated_monthly_revenue_usd: estimatedMonthlyRevenue,
      };
    } catch (err) {
      logger.error('PICK3', `Error in getReferralStats: ${err}`);
      return null;
    }
  }

  /**
   * Obtiene la lista de referrals del usuario (para el dashboard).
   */
  static async getReferrals(userId: string): Promise<Referral[]> {
    try {
      const { data, error } = await supabase
        .from('pick3_referrals')
        .select('*')
        .eq('referrer_user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Referral[];
    } catch (err) {
      logger.error('PICK3', `Error in getReferrals: ${err}`);
      return [];
    }
  }
}
