/**
 * subscription.types.ts — Pick 3 Subscription & Monetization Types
 *
 * SPRINT 4 — Monetización (SPRINT-4-MONETIZATION)
 *
 * Define los 4 tiers de suscripción y toda la estructura de datos
 * para el sistema de monetización del módulo Pick 3 Intelligence.
 *
 * Tiers:
 *   - Free:    $0/mes   — 3 IA queries/mes, backtest 90 días, 1 lotería
 *   - Player:  $19/mes  — 20 IA queries/mes, backtest ilimitado, alertas
 *   - Quant:   $49/mes  — IA ilimitada, multi-lotería, API access, regime alerts
 *   - Desk:    $149/mes — Multi-usuario, dashboards compartidos, white-label
 *
 * Author: CostPro Sprint 4
 * Date: 2026-07-05
 */

// ============================================================================
// TIPOS
// ============================================================================

export type SubscriptionTier = 'free' | 'player' | 'quant' | 'desk';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'paused';

export interface TierLimits {
  /** Consultas IA por mes (-1 = ilimitado) */
  aiQueriesPerMonth: number;
  /** Días máximos de backtest (-1 = ilimitado) */
  backtestMaxDays: number;
  /** Número de loterías configurables */
  maxLotteries: number;
  /** API access (endpoint /api/pick3/external) */
  apiAccess: boolean;
  /** Regime alerts en tiempo real */
  regimeAlerts: boolean;
  /** Multi-usuario (hasta N usuarios) */
  maxUsers: number;
  /** White-label (marca personalizada) */
  whiteLabel: boolean;
  /** Soporte 1-on-1 */
  prioritySupport: boolean;
  /** Modelos personalizables */
  customModels: boolean;
}

export interface TierInfo {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number; // Ahorro 20% con anual
  limits: TierLimits;
  features: string[];
  cta: string;
  highlight?: boolean;
  color: string;
  icon: string; // emoji o nombre de lucide icon
  target: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  /** ISO date cuando empezó la suscripción */
  current_period_start: string;
  /** ISO date cuando renueva o expira */
  current_period_end: string;
  /** Si está en trial (14 días gratis) */
  trial_end?: string | null;
  /** ID de customer en Stripe (si aplica) */
  stripe_customer_id?: string | null;
  /** ID de subscription en Stripe (si aplica) */
  stripe_subscription_id?: string | null;
  /** ID del price en Stripe */
  stripe_price_id?: string | null;
  /** Cancelada al final del período */
  cancel_at_period_end: boolean;
  /** Metadata adicional */
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  /** Mes en formato YYYY-MM */
  period: string;
  /** Contador de queries IA en el período */
  ai_queries_count: number;
  /** Contador de backtests en el período */
  backtests_count: number;
  /** Contador de API calls externas */
  api_calls_count: number;
  /** Límite aplicado este período (snapshot) */
  ai_queries_limit: number;
  backtests_limit: number;
  /** Fecha del último reset (cuando reinicia el contador) */
  last_reset: string;
  created_at: string;
  updated_at: string;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: number; // -1 = ilimitado
  limit: number; // -1 = ilimitado
  used: number;
  /** Tier actual del usuario */
  tier: SubscriptionTier;
  /** ¿Está en trial? */
  isTrial: boolean;
  /** Días restantes de trial (si aplica) */
  trialDaysLeft?: number;
  /** ¿Debe hacer upgrade? */
  upgradeRequired: boolean;
  /** Tier sugerido para upgrade */
  suggestedTier?: SubscriptionTier;
}

export interface CheckoutSession {
  id: string;
  url: string;
  tier: SubscriptionTier;
  mode: 'subscription' | 'payment';
  status: 'open' | 'complete' | 'expired';
  customer_email?: string;
  expires_at: string;
}

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export const TIERS: Record<SubscriptionTier, TierInfo> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Para empezar y probar el módulo',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      aiQueriesPerMonth: 3,
      backtestMaxDays: 90,
      maxLotteries: 1,
      apiAccess: false,
      regimeAlerts: false,
      maxUsers: 1,
      whiteLabel: false,
      prioritySupport: false,
      customModels: false,
    },
    features: [
      '3 consultas IA por mes',
      'Backtest hasta 90 días',
      '1 lotería (Florida Pick 3)',
      '4 tests estadísticos básicos',
      'Análisis de frequencia y Markov',
      'Histórico completo (1325+ sorteos)',
    ],
    cta: 'Empezar gratis',
    color: '#6b7280',
    icon: 'Sparkles',
    target: 'Captura y prueba',
  },
  player: {
    id: 'player',
    name: 'Player',
    tagline: 'Para el jugador serio que quiere análisis real',
    priceMonthly: 19,
    priceYearly: 182, // 19 * 12 * 0.8 = 182.4 → 182
    limits: {
      aiQueriesPerMonth: 20,
      backtestMaxDays: -1, // ilimitado
      maxLotteries: 1,
      apiAccess: false,
      regimeAlerts: true,
      maxUsers: 1,
      whiteLabel: false,
      prioritySupport: false,
      customModels: false,
    },
    features: [
      '20 consultas IA por mes',
      'Backtest ilimitado',
      'Regime alerts en tiempo real',
      'Risk Layer completo (3 modos)',
      'Ensemble de 4 modelos',
      'Predicciones con explainability',
      'Histórico completo + sincronización diaria',
      'Soporte por email',
    ],
    cta: 'Empezar 14 días gratis',
    color: '#3b82f6',
    icon: 'TrendingUp',
    target: 'Casual serio',
    highlight: true,
  },
  quant: {
    id: 'quant',
    name: 'Quant',
    tagline: 'Power user — análisis profesional y API',
    priceMonthly: 49,
    priceYearly: 470, // 49 * 12 * 0.8 = 470.4 → 470
    limits: {
      aiQueriesPerMonth: -1, // ilimitado
      backtestMaxDays: -1,
      maxLotteries: 5,
      apiAccess: true,
      regimeAlerts: true,
      maxUsers: 1,
      whiteLabel: false,
      prioritySupport: true,
      customModels: true,
    },
    features: [
      'IA ilimitada',
      'Multi-lotería (hasta 5)',
      'API access (REST endpoints)',
      'Modelos personalizables',
      'Backtest ilimitado + walk-forward',
      'Drift detection avanzado',
      'Soporte prioritario 1-on-1',
      'Exportar datos (CSV, JSON)',
      'Webhooks personalizados',
    ],
    cta: 'Empezar 14 días gratis',
    color: '#8b5cf6',
    icon: 'Brain',
    target: 'Power user',
  },
  desk: {
    id: 'desk',
    name: 'Desk',
    tagline: 'Para sindicatos y pequeños equipos',
    priceMonthly: 149,
    priceYearly: 1430, // 149 * 12 * 0.8 = 1430.4 → 1430
    limits: {
      aiQueriesPerMonth: -1,
      backtestMaxDays: -1,
      maxLotteries: -1, // ilimitado
      apiAccess: true,
      regimeAlerts: true,
      maxUsers: 10,
      whiteLabel: true,
      prioritySupport: true,
      customModels: true,
    },
    features: [
      'Todo de Quant, más:',
      'Multi-usuario (hasta 10)',
      'Dashboards compartidos',
      'White-label (marca propia)',
      'Roles y permisos',
      'Audit log completo',
      'Onboarding personalizado',
      'SLA 99.9% uptime',
      'Account manager dedicado',
    ],
    cta: 'Contactar ventas',
    color: '#f59e0b',
    icon: 'Building2',
    target: 'Sindicatos, small biz',
  },
};

export const TIER_ORDER: SubscriptionTier[] = ['free', 'player', 'quant', 'desk'];

/**
 * Retorna el tier con más features (mayor jerarquía).
 */
export function getHigherTier(t1: SubscriptionTier, t2: SubscriptionTier): SubscriptionTier {
  return TIER_ORDER.indexOf(t1) >= TIER_ORDER.indexOf(t2) ? t1 : t2;
}

/**
 * Verifica si un tier tiene acceso a una feature específica.
 */
export function tierHasFeature(tier: SubscriptionTier, feature: keyof TierLimits): boolean {
  const limits = TIERS[tier].limits;
  const value = limits[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0; // 0 = no access, -1 = ilimitado, >0 = limit
  return false;
}

/**
 * Compara tiers: ¿tier1 es mayor o igual que tier2?
 */
export function tierGte(tier1: SubscriptionTier, tier2: SubscriptionTier): boolean {
  return TIER_ORDER.indexOf(tier1) >= TIER_ORDER.indexOf(tier2);
}

/**
 * Retorna el siguiente tier sugerido para upgrade.
 */
export function getNextTier(tier: SubscriptionTier): SubscriptionTier | null {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

/**
 * Duración del trial en días.
 */
export const TRIAL_DAYS = 14;

/**
 * Calcula los días restantes de trial.
 */
export function getTrialDaysLeft(trialEnd: string | null | undefined): number | undefined {
  if (!trialEnd) return undefined;
  const end = new Date(trialEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
