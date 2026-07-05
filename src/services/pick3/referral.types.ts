/**
 * referral.types.ts — Pick 3 Referral Program Types
 *
 * SPRINT 5 — Growth Engine (SPRINT-5-GROWTH)
 *
 * Sistema de referidos: cada usuario tiene un código único. Cuando un nuevo
 * usuario se registra con su código, ambos reciben recompensas.
 *
 * Recompensas:
 *   - Referrer: 1 mes free del tier Player (valor $19)
 *   - Referee: 1 mes free del tier Player + 30 días de trial extendido
 *
 * Author: CostPro Sprint 5
 * Date: 2026-07-05
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface Referral {
  id: string;
  /** Usuario que refiere */
  referrer_user_id: string;
  /** Código único del referrer (ej: 'DARIAN90') */
  referral_code: string;
  /** Usuario referido (null hasta que se registre) */
  referred_user_id: string | null;
  /** Email del referido (para tracking previo al registro) */
  referred_email: string | null;
  /** Estado del referral */
  status: 'pending' | 'registered' | 'converted' | 'expired' | 'rewarded';
  /** Fecha de creación del referral link */
  created_at: string;
  /** Fecha de registro del referido */
  registered_at: string | null;
  /** Fecha de conversión (primer pago) */
  converted_at: string | null;
  /** Fecha de expiración (90 días) */
  expires_at: string;
  /** Recompensa otorgada al referrer */
  referrer_reward: ReferralReward | null;
  /** Recompensa otorgada al referido */
  referred_reward: ReferralReward | null;
  /** Metadata adicional */
  metadata?: Record<string, any>;
}

export interface ReferralReward {
  /** Tipo de recompensa */
  type: 'free_month_player' | 'free_month_quant' | 'trial_extension' | 'credit';
  /** Tier aplicado */
  tier: 'player' | 'quant' | 'desk';
  /** Duración en días */
  duration_days: number;
  /** Valor monetario en USD */
  value_usd: number;
  /** Fecha de aplicación */
  applied_at: string;
  /** ¿Está activa? */
  is_active: boolean;
}

export interface ReferralStats {
  total_referrals: number;
  pending: number;
  registered: number;
  converted: number;
  rewarded: number;
  conversion_rate: number;
  total_rewards_value_usd: number;
  estimated_monthly_revenue_usd: number; // Por suscripciones de referidos
}

// ============================================================================
// CONSTANTES
// ============================================================================

export const REFERRAL_REWARDS = {
  REFERRER: {
    type: 'free_month_player' as const,
    tier: 'player' as const,
    duration_days: 30,
    value_usd: 19,
  },
  REFERRED: {
    type: 'trial_extension' as const,
    tier: 'player' as const,
    duration_days: 30, // +16 días extra sobre el trial de 14
    value_usd: 19,
  },
};

export const REFERRAL_EXPIRY_DAYS = 90;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera un código de referral único basado en el nombre del usuario.
 * Formato: 'NAME123' (primeras letras + número aleatorio).
 */
export function generateReferralCode(userName: string, userId: string): string {
  const cleanName = (userName || 'USER')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const randomSuffix = userId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${cleanName}${randomSuffix}`;
}

/**
 * Verifica si un código de referral es válido (formato).
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code);
}

/**
 * Calcula los días restantes antes de que expire un referral.
 */
export function getReferralDaysLeft(expiresAt: string): number {
  const end = new Date(expiresAt);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
